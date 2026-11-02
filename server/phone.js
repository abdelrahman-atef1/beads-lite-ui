/**
 * Phone door rules (ADR 0001 section 2; SEC B3, B4).
 *
 * FULL CONTROL (owner 2026-11-02, company-1bo5.6.38): the phone door does
 * everything the PC door does. The request allowlist, the desk gate and desk
 * redaction are retired. What stays: the owner-identity/Host/Origin/token
 * checks in guard.js, and error scrubbing (no paths or bd output) on outbound
 * frames. The text below describes the retired rules; the helpers remain
 * exported (isDeskIssue is still used by the notifier push titles).
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

/** Feature types that registered with {phone:true} (informational only: the phone door allows all). */
const PHONE_FEATURE_TYPES = new Set();

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
  return issue;
}

/**
 * The retired desk redaction, kept for reference and tests.
 *
 * @param {any} issue
 * @returns {any}
 */
export function redactIssueDesk(issue) {
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

/**
 * The one redact chokepoint (B4). Returns the string to send, or null to drop.
 *
 * @param {string} raw  JSON text of the frame.
 * @returns {string | null}
 */
export function redactFrame(raw) {
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
    // Errors keep their code and a short message, but never a path, stack or
    // bd output (those stay in the server log).
    const raw_code = msg.error?.code;
    const code =
      typeof raw_code === 'string' && /^[a-z_]{1,32}$/.test(raw_code)
        ? raw_code
        : 'bd_error';
    const raw_msg = msg.error?.message;
    const safe =
      typeof raw_msg === 'string' &&
      raw_msg.length <= 160 &&
      !/[\\/\n]|[A-Za-z]:/.test(raw_msg);
    return JSON.stringify({
      id,
      ok: false,
      type,
      error: {
        code,
        message: safe
          ? raw_msg
          : ERROR_TEXT[/** @type {keyof typeof ERROR_TEXT} */ (code)] ||
            ERROR_TEXT.bd_error
      }
    });
  }
  // Full control: every other frame (snapshots, upserts, comments, feature
  // replies and pushed events) passes unchanged.
  return JSON.stringify(msg);
}

/**
 * Wrap a socket's send() so everything leaving it is redacted (B4).
 *
 * @param {any} ws
 */
export function installPhoneSocket(ws) {
  const raw_send = ws.send.bind(ws);
  ws.door = 'phone';
  ws.send = (/** @type {any} */ data, /** @type {any[]} */ ...rest) => {
    const out = redactFrame(String(data));
    if (out !== null) {
      raw_send(out, ...rest);
    }
  };
}
