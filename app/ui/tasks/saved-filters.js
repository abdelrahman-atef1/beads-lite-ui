/**
 * The Tasks filters the owner set last, remembered per device (localStorage)
 * and restored when the screen opens, on the phone too. A link with filters in
 * the URL wins over this copy; the search box is never remembered.
 */
const KEY = 'u3.tasks.filters';
const CHIPS = ['mine', 'p01', 'decision', 'blocked'];

/** @typedef {{ chip: string, type: string, label: string, assignee: string, prio: string, projects: string[] }} Saved */

/** @returns {Storage | null} */
function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @param {unknown} v @param {number} n */
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/** @returns {Saved} */
export function loadSaved() {
  /** @type {Saved} */
  const out = {
    chip: 'all',
    type: '',
    label: '',
    assignee: '',
    prio: '',
    projects: []
  };
  try {
    const o = JSON.parse(store()?.getItem(KEY) || 'null');
    if (!o || typeof o !== 'object') return out;
    out.chip = CHIPS.includes(o.chip) ? o.chip : 'all';
    out.type = str(o.type, 40);
    out.label = str(o.label, 80);
    out.assignee = str(o.assignee, 60);
    out.prio = /^[0-4]$/.test(o.prio) ? o.prio : '';
    out.projects = Array.isArray(o.projects)
      ? o.projects
          .filter((/** @type {unknown} */ p) => typeof p === 'string')
          .slice(0, 50)
          .map((/** @type {string} */ p) => p.slice(0, 60))
      : [];
  } catch {
    // corrupt storage: start clean
  }
  return out;
}

/** @param {Saved} s */
export function save(s) {
  try {
    store()?.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: the filters just are not remembered
  }
}
