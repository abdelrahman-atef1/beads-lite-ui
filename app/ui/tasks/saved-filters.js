/**
 * The Tasks filters the owner set last, remembered per device (localStorage)
 * and restored when the screen opens, on the phone too. A link with filters in
 * the URL wins over this copy as a whole; the search box is never remembered.
 *
 * Every dimension is a list (beads-lite-1bo5.13.16.1). Older copies stored one
 * string per dimension plus an exclusive `chip` and a `projects` list: they are
 * migrated here (mine -> assignee me, p01 -> prio 0,1, decision -> status
 * owner_decision, blocked -> status blocked).
 */
import { DIMS, cleanValues, currentUser } from '../../utils/board-filter.js';

const KEY = 'u3.tasks.filters';
/** Desk keeps its own copy, so a Tasks Status filter never empties the Desk. */
export const DESK_KEY = 'u3.desk.filters';

/** @typedef {Record<string, string[]>} Saved one list per dimension (DIMS) */

/** @returns {Storage | null} */
function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @returns {Saved} */
export function emptySaved() {
  return Object.fromEntries(DIMS.map((d) => [d, []]));
}

/** @param {unknown} v @returns {unknown[]} */
const list = (v) =>
  Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];

/** @returns {Saved} */
export function loadSaved(key = KEY) {
  const out = emptySaved();
  try {
    const o = JSON.parse(store()?.getItem(key) || 'null');
    if (!o || typeof o !== 'object') return out;
    for (const d of DIMS) out[d] = cleanValues(d, list(o[d]));
    // old copy: `projects` was the project list
    if (!out.project.length) out.project = cleanValues('project', o.projects);
    // old copy: one exclusive chip
    if (o.chip === 'mine' && !out.assignee.length) {
      out.assignee = cleanValues('assignee', [currentUser()]);
    } else if (o.chip === 'p01' && !out.prio.length) {
      out.prio = ['0', '1'];
    } else if (o.chip === 'decision' && !out.status.length) {
      out.status = ['owner_decision'];
    } else if (o.chip === 'blocked' && !out.status.length) {
      out.status = ['blocked'];
    }
  } catch {
    // corrupt storage: start clean
  }
  return out;
}

/** @param {Record<string, any>} s */
export function save(s, key = KEY) {
  try {
    const out = emptySaved();
    for (const d of DIMS) out[d] = cleanValues(d, s[d]);
    store()?.setItem(key, JSON.stringify(out));
  } catch {
    // storage full or blocked: the filters just are not remembered
  }
}
