/**
 * Swimlanes (task 10, .65): group the tasks board by project, assignee or
 * epic. Display only: nothing here writes to an issue. Pure grouping plus the
 * two remembered settings (grouping, collapsed lanes) kept in localStorage.
 */
import { columnsOf } from './model.js';

export const GROUPS = ['none', 'project', 'assignee', 'epic'];
export const MAX_LANES = 20;
const GROUP_KEY = 'beads-ui.u3.tasks.group';
const COLLAPSED_KEY = 'beads-ui.u3.tasks.lanes-collapsed';

/** @typedef {'none'|'project'|'assignee'|'epic'} GroupBy */
/**
 * @typedef {{
 *   key: string, label: string|null, kind: ''|'unassigned'|'noepic'|'others',
 *   issues: any[], s: ReturnType<typeof columnsOf>|null,
 *   progress: number, blocked: number, owner: number
 * }} Lane
 */

/** @returns {GroupBy} */
export function loadGroup() {
  try {
    const v = window.localStorage.getItem(GROUP_KEY) || '';
    return /** @type {GroupBy} */ (GROUPS.includes(v) ? v : 'none');
  } catch {
    return 'none';
  }
}

/** @param {GroupBy} by */
export function saveGroup(by) {
  try {
    window.localStorage.setItem(GROUP_KEY, by);
  } catch {
    // private mode: not remembered, still works
  }
}

/** @returns {Set<string>} entries look like "assignee:swe" */
export function loadCollapsed() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String).slice(0, 500) : []);
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} set */
export function saveCollapsed(set) {
  try {
    window.localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify([...set].slice(0, 500))
    );
  } catch {
    // not remembered
  }
}

/**
 * Project of an issue = its id prefix ("rayeh-3au7.4" -> "rayeh").
 *
 * @param {string} id
 */
export function projectOf(id) {
  const base = String(id || '').split('.')[0];
  const i = base.lastIndexOf('-');
  return i > 0 ? base.slice(0, i) : base;
}

/**
 * Nearest epic at or above the issue (parent chain, depth bounded).
 *
 * @param {any} it
 * @param {Map<string, any>} by_id
 * @returns {any|null}
 */
function epicOf(it, by_id) {
  let cur = it;
  for (let d = 0; cur && d < 8; d++) {
    if (cur.issue_type === 'epic') return cur;
    cur = cur.parent ? by_id.get(String(cur.parent)) : null;
  }
  return null;
}

/**
 * Group issues into lanes. "none" gives one unlabelled lane (the plain board).
 *
 * @param {any[]} issues
 * @param {GroupBy} [by]
 * @param {{ all?: any[], ready_ids?: Set<string>, blocked_ids?: Set<string> }} [opts]
 * all = every issue (to find epics); ready/blocked ids split lane columns.
 * @returns {Lane[]}
 */
export function groupIssues(issues, by = 'none', opts = {}) {
  if (by === 'none' || !GROUPS.includes(by)) {
    return [lane('', null, '', issues, opts)];
  }
  const by_id = new Map((opts.all || issues).map((i) => [i.id, i]));
  /** @type {Map<string, { label: string|null, kind: ''|'unassigned'|'noepic', issues: any[] }>} */
  const m = new Map();
  for (const it of issues) {
    /** @type {string} */ let key;
    /** @type {string|null} */ let label = null;
    /** @type {''|'unassigned'|'noepic'} */ let kind = '';
    if (by === 'assignee') {
      key = String(it.assignee || '').trim();
      if (!key) kind = 'unassigned';
      label = key || null;
    } else if (by === 'project') {
      key = projectOf(it.id);
      label = key;
    } else {
      const e = epicOf(it, by_id);
      key = e ? e.id : '';
      if (e) label = String(e.title || e.id);
      else kind = 'noepic';
    }
    const slot = kind ? '\u0000' + kind : key;
    let g = m.get(slot);
    if (!g) m.set(slot, (g = { label, kind, issues: [] }));
    g.issues.push(it);
  }
  /** @type {Lane[]} */
  const all = [...m.entries()].map(([slot, g]) =>
    lane(g.kind ? '~' + g.kind : slot, g.label, g.kind, g.issues, opts)
  );
  const flagged = (/** @type {Lane} */ l) => (l.blocked || l.owner ? 1 : 0);
  const normal = all
    .filter((l) => !l.kind)
    .sort(
      (a, b) =>
        flagged(b) - flagged(a) ||
        b.issues.length - a.issues.length ||
        String(a.label).localeCompare(String(b.label))
    );
  const special = all.find((l) => l.kind) || null;
  const room = MAX_LANES - (special ? 1 : 0);
  const out = normal.slice(0, room);
  const rest = normal.slice(room);
  if (rest.length) {
    out.push(
      lane(
        '~others',
        null,
        'others',
        rest.flatMap((l) => l.issues),
        opts
      )
    );
  }
  if (special) out.push(special);
  return out;
}

/**
 * @param {string} key
 * @param {string|null} label
 * @param {Lane['kind']} kind
 * @param {any[]} issues
 * @param {{ ready_ids?: Set<string>, blocked_ids?: Set<string> }} opts
 * @returns {Lane}
 */
function lane(key, label, kind, issues, opts) {
  const s = columnsOf(
    issues,
    opts.ready_ids || new Set(),
    opts.blocked_ids || new Set()
  );
  return {
    key,
    label,
    kind,
    issues,
    s,
    progress: s.columns.progress.length,
    blocked: s.columns.blocked.length,
    owner: s.columns.owner.length
  };
}
