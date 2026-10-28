/**
 * Phone door rules (ADR 0001 section 2; SEC B3, B4).
 *
 * B3: the phone door accepts an allowlist of request types; anything else is
 *     refused. Types that read or write ONE bead (get-comments, add-comment)
 *     first look the bead up and are refused when it is a desk bead.
 * B4: every outbound frame on a phone socket goes through redactFrame(), the
 *     single chokepoint. It is an allowlist too: an unknown frame type is
 *     dropped, an error loses its details, a desk bead becomes a pointer.
 *
 * "Desk" = the owner must answer at the PC (decision-card.md R18 and N7):
 * one of the R18 labels, card_class=desk, or created by / assigned to sec or
 * legal. Fail closed: an unreadable bead is treated as desk.
 */
import { runBdJson } from './bd.js';

/** R18 label names, matched exactly (knowledge/decision-card.md). */
export const DESK_LABELS = new Set([
  'owner-pc-only',
  'security',
  'spend',
  'secret',
  'publish',
  'deploy',
  'film-gate',
  'film-approval',
  'hearing',
  'rights-clear',
  'publishable'
]);
const DESK_ACTORS = new Set(['sec', 'legal']);
const POINTER_TITLE = 'قرار ينتظرك';
const POINTER_NOTE = 'جاوب من الكمبيوتر';
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;

/** Request types a phone socket may send (B3). */
export const PHONE_REQUEST_TYPES = new Set([
  'ping',
  'subscribe-list',
  'unsubscribe-list',
  'get-comments',
  'add-comment',
  'create-issue',
  'list-workspaces',
  'get-workspace'
]);
/** Feature-seam types that opted in with registerHandler(..., {phone:true}). */
const PHONE_FEATURE_TYPES = new Set();
/** Request types that name one bead and are refused on a desk bead. */
const PER_BEAD_TYPES = new Set(['get-comments', 'add-comment']);

/** @param {string} type */
export function allowPhoneFeatureType(type) {
  PHONE_FEATURE_TYPES.add(type);
}

/**
 * @param {any} issue
 * @returns {boolean}
 */
export function isDeskIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return true;
  }
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  if (
    labels.some(
      (/** @type {any} */ l) => typeof l === 'string' && DESK_LABELS.has(l)
    )
  ) {
    return true;
  }
  if (issue.metadata && issue.metadata.card_class === 'desk') {
    return true;
  }
  for (const k of ['created_by', 'assignee', 'owner_role']) {
    if (typeof issue[k] === 'string' && DESK_ACTORS.has(issue[k])) {
      return true;
    }
  }
  return false;
}

/** Fields a pointer keeps: ids, state and counts, never text. */
const POINTER_KEEP = [
  'id',
  'status',
  'priority',
  'issue_type',
  'labels',
  'assignee',
  'created_at',
  'updated_at',
  'closed_at',
  'dependency_count',
  'dependent_count',
  'claimed_at',
  'stalled'
];

/**
 * @param {any} issue
 * @returns {Record<string, unknown>}
 */
export function toPointer(issue) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of POINTER_KEEP) {
    if (issue[k] !== undefined) {
      out[k] = issue[k];
    }
  }
  const ct = issue.metadata?.card_title;
  const title =
    typeof ct === 'string' && ct.length > 0 && ct.length <= 60
      ? ct
      : POINTER_TITLE;
  out.title = title;
  out.metadata = { card_title: title, card_class: 'desk' };
  out.pointer = true;
  out.pointer_note = POINTER_NOTE;
  return out;
}

// Arrays inside an issue that embed other issues (title, description, ...).
const NESTED_ISSUE_KEYS = [
  'dependencies',
  'dependents',
  'blocked_by_detail',
  'children',
  'blocked_by',
  'blocks'
];

const NESTED_TEXT = [
  'title',
  'title_ar',
  'description',
  'design',
  'notes',
  'acceptance_criteria'
];

/**
 * A nested entry (blocker, dependency, child). If it carries labels it is a
 * full issue and is judged like one; if it does not (e.g. blocked_by_detail
 * is {id, assignee, status, title}) we cannot prove it is not a desk bead, so
 * its text is dropped and only ids and state remain.
 *
 * @param {any} x
 * @returns {any}
 */
function redactNested(x) {
  if (Array.isArray(x.labels)) {
    return redactIssue(x);
  }
  if (isDeskIssue(x)) {
    return toPointer(x);
  }
  const out = { ...x };
  for (const k of NESTED_TEXT) {
    if (k in out) {
      out[k] = '';
    }
  }
  if (out.metadata !== undefined) {
    delete out.metadata;
  }
  return out;
}

/**
 * @param {any} issue
 * @returns {any}
 */
export function redactIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return issue;
  }
  if (isDeskIssue(issue)) {
    return toPointer(issue);
  }
  let out = issue;
  for (const k of NESTED_ISSUE_KEYS) {
    if (Array.isArray(issue[k])) {
      if (out === issue) {
        out = { ...issue };
      }
      out[k] = issue[k].map((/** @type {any} */ x) =>
        x && typeof x === 'object' ? redactNested(x) : x
      );
    }
  }
  return out;
}

const ERROR_TEXT = {
  forbidden: 'Not allowed on the phone',
  bad_request: 'Bad request',
  bd_error: 'Could not complete',
  not_found: 'Not found',
  unknown_type: 'Unknown request',
  pc_only: 'Answer at the PC'
};

// Reply/event types a phone socket may receive, with how each is scrubbed.
const OK_PASS = new Set([
  'ping',
  'subscribe-list',
  'unsubscribe-list',
  'add-comment',
  'create-issue',
  'list-workspaces',
  'get-workspace',
  'delete' // subscription delete envelope: ids only
]);
const PHONE_FEATURE_REPLY_TYPES = PHONE_FEATURE_TYPES;

/**
 * The one redact chokepoint (B4). Returns the string to send, or null to drop.
 * `clean_comment_ids` holds request ids whose bead the gate proved non-desk.
 *
 * @param {string} raw  JSON text of the frame.
 * @param {Set<string>} clean_comment_ids
 * @returns {string | null}
 */
export function redactFrame(raw, clean_comment_ids) {
  /** @type {any} */
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') {
    return null;
  }
  const { id, type } = msg;
  if (msg.ok === false) {
    const code =
      typeof msg.error?.code === 'string' && msg.error.code in ERROR_TEXT
        ? msg.error.code
        : 'bd_error';
    return JSON.stringify({
      id,
      ok: false,
      type,
      error: {
        code,
        message: ERROR_TEXT[/** @type {keyof typeof ERROR_TEXT} */ (code)]
      }
    });
  }
  if (type === 'snapshot' && Array.isArray(msg.payload?.issues)) {
    return JSON.stringify({
      ...msg,
      payload: { ...msg.payload, issues: msg.payload.issues.map(redactIssue) }
    });
  }
  if (type === 'upsert' && msg.payload?.issue) {
    return JSON.stringify({
      ...msg,
      payload: { ...msg.payload, issue: redactIssue(msg.payload.issue) }
    });
  }
  if (type === 'get-comments') {
    // Comments carry no labels: pass only when the gate looked the bead up.
    if (!clean_comment_ids.delete(id)) {
      return null;
    }
    return JSON.stringify(msg);
  }
  if (OK_PASS.has(type) || PHONE_FEATURE_REPLY_TYPES.has(type)) {
    return JSON.stringify(msg);
  }
  return null;
}

/**
 * Wrap a socket's send() so everything leaving it is redacted (B4).
 *
 * @param {any} ws
 */
export function installPhoneSocket(ws) {
  const raw_send = ws.send.bind(ws);
  ws.door = 'phone';
  ws.cleanComments = new Set();
  ws.send = (/** @type {any} */ data, /** @type {any[]} */ ...rest) => {
    const out = redactFrame(String(data), ws.cleanComments);
    if (out !== null) {
      raw_send(out, ...rest);
    }
  };
}

/**
 * Gate a request on a phone socket. Returns null when allowed, else an error
 * code to reply with.
 *
 * @param {any} ws
 * @param {{ id: string, type: string, payload?: any }} req
 * @param {{ cwd?: string }} bd_options
 * @returns {Promise<string | null>}
 */
export async function phoneGate(ws, req, bd_options) {
  if (
    !PHONE_REQUEST_TYPES.has(req.type) &&
    !PHONE_FEATURE_TYPES.has(req.type)
  ) {
    return 'forbidden';
  }
  if (req.type === 'create-issue') {
    // The phone files plain tasks only; no labels or assignee are passed on.
    return null;
  }
  if (PER_BEAD_TYPES.has(req.type)) {
    const bead = req.payload?.id;
    if (
      typeof bead !== 'string' ||
      !BEAD_ID_RE.test(bead) ||
      bead.length > 64
    ) {
      return 'bad_request';
    }
    const desk = await beadIsDesk(bead, bd_options);
    if (desk) {
      return 'pc_only';
    }
    if (req.type === 'get-comments') {
      ws.cleanComments.add(req.id);
    }
  }
  return null;
}

/**
 * True unless the bead was read and is not desk (fail closed).
 *
 * @param {string} bead
 * @param {{ cwd?: string }} bd_options
 * @returns {Promise<boolean>}
 */
export async function beadIsDesk(bead, bd_options) {
  try {
    const r = await runBdJson(['show', bead, '--json'], bd_options);
    if (r.code !== 0) {
      return true;
    }
    const j = /** @type {any} */ (r.stdoutJson);
    const issue = Array.isArray(j) ? j[0] : j;
    return !issue || issue.id !== bead || isDeskIssue(issue);
  } catch {
    return true;
  }
}
