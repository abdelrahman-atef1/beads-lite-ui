/**
 * Bulk change of many tasks at once (beads-lite-1bo5.6.63.1; UI = .59.11).
 *
 *   bulk-apply {action, ids, params, take_over?} -> {batch, results:[{id, ok, reason?}]}
 *   bulk-undo  {batch}                           -> {restored}
 *
 * action / params:
 *   close  {reason}              one reason line for all
 *   move   {status}              any settable status except closed / owner_decision
 *   defer  {until}               YYYY-MM-DD, or '' = until someone reopens it
 *   label  {add?: [], remove?: []}
 *   assign {assignee}            '' clears
 *
 * Applied one by one through `bd` (no transaction): each task gets its own
 * result. Refusal reasons: decision, already_closed, children, blockers, live,
 * same, missing, failed. Guards:
 *  - at most MAX_BULK ids, whole call refused above that, nothing written;
 *  - owner_decision beads are never touched (one decision per bead, answered
 *    on its card);
 *  - a task claimed in_progress by someone with an unexpired lease is skipped
 *    unless take_over (then bd gets --force);
 *  - close respects bd's own refusals (open children, unmet blockers).
 * Marker: every task's change carries `bulk:<batch>` (close reason prefix, or
 * metadata bulk=<batch> in the same update event for the other actions) so
 * history and the time view can find it. One bd process per action group.
 * Undo: the state before the change is kept in memory for UNDO_KEEP_MS (no
 * timer; stale batches are dropped when the next call arrives) and restored
 * with bd; an unknown or expired batch restores 0. Zero cost when idle.
 */
import { randomBytes } from 'node:crypto';
import { runBd } from '../bd.js';
import { debug } from '../logging.js';

const log = debug('bulk');

export const MAX_BULK = 50;
/** Longer than the UI's 10 s so a slow click still works. */
export const UNDO_KEEP_MS = 15000;
const MAX_BATCHES = 20;
const ACTIONS = ['close', 'move', 'defer', 'label', 'assign'];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const LABEL_RE = /^[^\s,]{1,60}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOVE_TARGETS = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'waiting_for_test',
  'waiting_for_merge'
];

/**
 * @typedef {{ status: string, labels: string[], assignee: string, deferred: boolean }} Before
 * @type {Map<string, { root: string|undefined, at: number, rows: Array<{ id: string } & Before> }>}
 */
const batches = new Map();

/** @param {string} code @param {string} message */
function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

/** @param {number} now */
function prune(now) {
  for (const [k, b] of batches) {
    if (now - b.at > UNDO_KEEP_MS) batches.delete(k);
  }
  while (batches.size > MAX_BATCHES) {
    batches.delete(/** @type {string} */ (batches.keys().next().value));
  }
}

/**
 * @param {string[]} args
 * @param {string|undefined} cwd
 */
async function bd(args, cwd) {
  const r = await runBd(args, { cwd });
  return r;
}

/**
 * @param {string} text
 * @returns {any[]}
 */
function parseJsonArray(text) {
  const i = text.indexOf('[');
  if (i < 0) return [];
  try {
    const v = JSON.parse(text.slice(i));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Validate the request; returns the clean form or throws bad_request.
 *
 * @param {any} p
 */
export function validate(p) {
  const action = p && p.action;
  if (!ACTIONS.includes(action)) throw fail('bad_request', 'bad action');
  const ids = p.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw fail('bad_request', 'ids required');
  }
  if (ids.length > MAX_BULK) {
    throw fail('too_many', `at most ${MAX_BULK} tasks per action`);
  }
  const uniq = [...new Set(ids)];
  for (const id of uniq) {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      throw fail('bad_request', 'bad id');
    }
  }
  const params = p.params && typeof p.params === 'object' ? p.params : {};
  /** @type {any} */
  const clean = {};
  if (action === 'close') {
    const reason = String(params.reason ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!reason || reason.length > 500) {
      throw fail('bad_request', 'close needs a reason (max 500 chars)');
    }
    clean.reason = reason;
  } else if (action === 'move') {
    if (!MOVE_TARGETS.includes(params.status)) {
      throw fail('bad_request', 'bad status');
    }
    clean.status = params.status;
  } else if (action === 'defer') {
    const until = String(params.until ?? '');
    if (until !== '' && !DATE_RE.test(until)) {
      throw fail('bad_request', 'until must be YYYY-MM-DD or empty');
    }
    clean.until = until;
  } else if (action === 'label') {
    for (const k of ['add', 'remove']) {
      const v = params[k] ?? [];
      if (
        !Array.isArray(v) ||
        v.length > 10 ||
        v.some((x) => typeof x !== 'string' || !LABEL_RE.test(x.trim()))
      ) {
        throw fail('bad_request', `bad ${k} labels`);
      }
      clean[k] = v.map((x) => x.trim());
    }
    if (!clean.add.length && !clean.remove.length) {
      throw fail('bad_request', 'nothing to add or remove');
    }
  } else {
    const a = String(params.assignee ?? '').trim();
    if (a.length > 100 || /[\r\n]/.test(a)) {
      throw fail('bad_request', 'bad assignee');
    }
    clean.assignee = a;
  }
  return { action, ids: uniq, params: clean, take_over: p.take_over === true };
}

/**
 * Why this task cannot take the action ('' = it can).
 *
 * @param {string} action
 * @param {any} it - bd show row (or undefined)
 * @param {Set<string>} withOpenChild
 * @param {any} params
 * @param {boolean} take_over
 * @param {number} now
 */
export function refusal(action, it, withOpenChild, params, take_over, now) {
  if (!it) return 'missing';
  if (it.status === 'owner_decision') return 'decision';
  if (it.status === 'closed' && (action === 'close' || action === 'defer')) {
    return 'already_closed';
  }
  if (action === 'move' && it.status === params.status) return 'same';
  if (action === 'close') {
    if (withOpenChild.has(it.id)) return 'children';
    const deps = Array.isArray(it.dependencies) ? it.dependencies : [];
    if (
      deps.some(
        (d) =>
          d.dependency_type === 'blocks' &&
          d.status !== 'closed' &&
          d.id !== it.parent
      )
    ) {
      return 'blockers';
    }
  }
  if (action !== 'label' && isLive(it, now) && !take_over) return 'live';
  return '';
}

/** @param {any} it @param {number} now */
export function isLive(it, now) {
  if (it.status !== 'in_progress' || !String(it.assignee || '').trim()) {
    return false;
  }
  const exp = Date.parse(it.lease_expires_at || '');
  return Number.isNaN(exp) || exp > now;
}

/** @param {string} stderr */
function reasonFromBdError(stderr) {
  const s = String(stderr || '').toLowerCase();
  if (/open child|children|sub-?task/.test(s)) return 'children';
  if (/block/.test(s)) return 'blockers';
  if (/assignee|reclaim|claim/.test(s)) return 'live';
  return 'failed';
}

/**
 * The bd command for the action over a list of ids (one process for all: a
 * bd start costs ~0.2 s, so 20 tasks one by one would be several seconds).
 *
 * @param {string} action
 * @param {string[]} ids
 * @param {any} p
 * @param {boolean} force
 * @param {string} batch
 */
function commandFor(action, ids, p, force, batch) {
  const f = force ? ['--force'] : [];
  const mark = ['--set-metadata', `bulk=${batch}`];
  if (action === 'close') {
    return ['close', ...ids, '-r', `[bulk:${batch}] ${p.reason}`, ...f];
  }
  if (action === 'move') {
    return ['update', ...ids, '--status', p.status, ...mark, ...f];
  }
  if (action === 'defer') {
    return [
      'update',
      ...ids,
      ...(p.until ? ['--defer', p.until] : ['--status', 'deferred']),
      ...mark,
      ...f
    ];
  }
  if (action === 'label') {
    const a = [];
    for (const l of p.add) a.push('--add-label', l);
    for (const l of p.remove) a.push('--remove-label', l);
    return ['update', ...ids, ...a, ...mark];
  }
  return ['update', ...ids, '--assignee', p.assignee, ...mark, ...f];
}

/** Has the task reached the state the action asks for? @param {string} action @param {any} it @param {any} p */
function reached(action, it, p) {
  if (!it) return false;
  if (action === 'close') return it.status === 'closed';
  if (action === 'move') return it.status === p.status;
  if (action === 'defer') return it.status === 'deferred';
  if (action === 'label') {
    const l = Array.isArray(it.labels) ? it.labels : [];
    return (
      p.add.every((x) => l.includes(x)) && !p.remove.some((x) => l.includes(x))
    );
  }
  return String(it.assignee || '') === p.assignee;
}

/**
 * Apply the action to the allowed tasks. One bd call for the whole group; if
 * it fails (one task bd refuses, a half-applied group) each task is retried
 * alone and judged by what is in the database afterwards. Returns id -> ''
 * (done) or a reason code.
 *
 * @param {string} action
 * @param {Array<{ id: string, force: boolean }>} items
 * @param {any} p
 * @param {string} batch
 * @param {string|undefined} cwd
 * @returns {Promise<Map<string, string>>}
 */
async function applyGroup(action, items, p, batch, cwd) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const force of [false, true]) {
    const ids = items.filter((x) => x.force === force).map((x) => x.id);
    if (!ids.length) continue;
    const r = await bd(commandFor(action, ids, p, force, batch), cwd);
    if (r.code === 0) {
      for (const id of ids) out.set(id, '');
      continue;
    }
    log('%s group failed, retrying one by one: %s', action, r.stderr);
    for (const id of ids) {
      const one = await bd(commandFor(action, [id], p, force, batch), cwd);
      if (one.code === 0) {
        out.set(id, '');
        continue;
      }
      const now = await bd(['show', id, '--json'], cwd);
      out.set(
        id,
        reached(action, parseJsonArray(now.stdout)[0], p)
          ? ''
          : reasonFromBdError(one.stderr)
      );
    }
  }
  return out;
}

/**
 * @param {any} payload
 * @param {{ root_dir?: string }} ctx
 */
export async function bulkApply(payload, ctx) {
  const req = validate(payload);
  const cwd = ctx.root_dir;
  const now = Date.now();
  prune(now);

  // One read for the selected tasks, one for "has an open child".
  const shown = await bd(['show', ...req.ids, '--json'], cwd);
  const rows = new Map(parseJsonArray(shown.stdout).map((x) => [x.id, x]));
  const withOpenChild = new Set();
  if (req.action === 'close') {
    const listed = await bd(['list', '--json', '-n', '0'], cwd);
    for (const x of parseJsonArray(listed.stdout)) {
      if (x.parent && x.status !== 'closed') withOpenChild.add(x.parent);
    }
  }

  const batch = randomBytes(5).toString('hex');
  /** @type {Map<string, { id: string, ok: boolean, reason?: string }>} */
  const results = new Map();
  /** @type {Array<{ id: string } & Before>} */
  const undoRows = [];
  /** @type {Array<{ id: string, force: boolean }>} */
  const allowed = [];
  for (const id of req.ids) {
    const it = rows.get(id);
    const why = refusal(
      req.action,
      it,
      withOpenChild,
      req.params,
      req.take_over,
      now
    );
    if (why) results.set(id, { id, ok: false, reason: why });
    else allowed.push({ id, force: req.take_over && isLive(it, now) });
  }
  const done = await applyGroup(req.action, allowed, req.params, batch, cwd);
  for (const { id } of allowed) {
    const failed = done.get(id) || '';
    if (failed) {
      results.set(id, { id, ok: false, reason: failed });
      continue;
    }
    results.set(id, { id, ok: true });
    const it = rows.get(id);
    undoRows.push({
      id,
      status: String(it.status),
      labels: Array.isArray(it.labels) ? it.labels.map(String) : [],
      assignee: String(it.assignee || ''),
      deferred: it.status === 'deferred'
    });
  }
  if (undoRows.length) {
    batches.set(batch, { root: cwd, at: Date.now(), rows: undoRows });
  }
  return { batch, results: req.ids.map((id) => results.get(id)) };
}

/**
 * @param {any} payload
 * @param {{ root_dir?: string }} ctx
 */
export async function bulkUndo(payload, ctx) {
  const batch = String(payload?.batch || '');
  prune(Date.now());
  const b = batches.get(batch);
  if (!b || b.root !== ctx.root_dir) return { restored: 0 };
  batches.delete(batch);
  const cwd = ctx.root_dir;
  let restored = 0;
  for (const row of b.rows) {
    const now = await bd(['show', row.id, '--json'], cwd);
    const cur = parseJsonArray(now.stdout)[0];
    if (!cur) continue;
    const curLabels = Array.isArray(cur.labels) ? cur.labels.map(String) : [];
    /** @type {string[]} */
    const a = ['update', row.id];
    // Re-open first: a closed task cannot take other changes in one call.
    if (cur.status !== row.status) a.push('--status', row.status);
    if (cur.status === 'deferred' && row.status !== 'deferred') {
      a.push('--defer', '');
    }
    for (const l of row.labels)
      if (!curLabels.includes(l)) a.push('--add-label', l);
    for (const l of curLabels)
      if (!row.labels.includes(l)) a.push('--remove-label', l);
    if (String(cur.assignee || '') !== row.assignee) {
      a.push('--assignee', row.assignee);
    }
    a.push('--set-metadata', `bulk=undo:${batch}`);
    if (a.length === 4) {
      restored += 1; // nothing differs; already as before
      continue;
    }
    let r = await bd(a, cwd);
    if (r.code !== 0 && cur.status === 'closed') {
      await bd(['reopen', row.id], cwd);
      r = await bd(a, cwd);
    }
    if (r.code === 0) {
      restored += 1;
    } else {
      log('undo %s failed: %s', row.id, r.stderr);
    }
  }
  return { restored };
}

/** @param {{ registerHandler: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'bulk-apply',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      bulkApply(req.payload, ctx),
    { mutating: true }
  );
  seam.registerHandler(
    'bulk-undo',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      bulkUndo(req.payload, ctx),
    { mutating: true }
  );
}
