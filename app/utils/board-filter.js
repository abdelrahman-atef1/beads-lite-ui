/**
 * Board filters (design/README.md 5.2 and 5.6): quick chip, type, label and a
 * search string. Pure matching plus a tiny persisted state, so the board and
 * the top bar share one source. Everything runs on the already-loaded slice:
 * typing never waits on the server.
 */

const KEY = 'beads-ui.board-filter';

/** @typedef {{ chip: 'all'|'mine'|'p01', type: string, label: string, search: string }} BoardFilter */

/** @returns {BoardFilter} */
export function emptyFilter() {
  return { chip: 'all', type: '', label: '', search: '' };
}

/** @param {BoardFilter} f */
export function isFiltering(f) {
  return Boolean(f.chip !== 'all' || f.type || f.label || f.search.trim());
}

/**
 * Does one issue pass the filter? Search matches id (substring, case
 * insensitive), title and title_ar.
 *
 * @param {any} it
 * @param {BoardFilter} f
 * @param {string} me - assignee name for the "Mine" chip
 */
export function matchesFilter(it, f, me) {
  if (!it) {
    return false;
  }
  if (f.chip === 'mine') {
    if (String(it.assignee || '').toLowerCase() !== me.toLowerCase()) {
      return false;
    }
  } else if (f.chip === 'p01') {
    if (typeof it.priority !== 'number' || it.priority > 1) {
      return false;
    }
  }
  if (f.type && String(it.issue_type || '') !== f.type) {
    return false;
  }
  if (f.label) {
    const labels = Array.isArray(it.labels) ? it.labels : [];
    if (!labels.includes(f.label)) {
      return false;
    }
  }
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [it.id, it.title, it.title_ar]
      .map((v) => String(v || '').toLowerCase())
      .join('\n');
    if (!hay.includes(q)) {
      return false;
    }
  }
  return true;
}

/**
 * Distinct types and labels in a slice, for the Type and Label menus.
 *
 * @param {any[]} items
 */
export function facets(items) {
  const types = new Set();
  const labels = new Set();
  for (const it of items) {
    if (it && it.issue_type) {
      types.add(String(it.issue_type));
    }
    for (const l of (it && it.labels) || []) {
      labels.add(String(l));
    }
  }
  return { types: [...types].sort(), labels: [...labels].sort() };
}

/**
 * Persisted filter state shared by the top bar search and the board chips.
 *
 * @param {Storage | null} [storage]
 */
export function createFilterState(storage = safeStorage()) {
  /** @type {BoardFilter} */
  let state = emptyFilter();
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      state = {
        chip: o.chip === 'mine' || o.chip === 'p01' ? o.chip : 'all',
        type: typeof o.type === 'string' ? o.type.slice(0, 40) : '',
        label: typeof o.label === 'string' ? o.label.slice(0, 80) : '',
        // The search box starts empty after a reload (Esc-to-clear friendly).
        search: ''
      };
    }
  } catch {
    // ignore corrupt storage
  }
  /** @type {Set<() => void>} */
  const subs = new Set();
  return {
    get: () => state,
    /** @param {Partial<BoardFilter>} patch */
    set(patch) {
      const next = { ...state, ...patch };
      next.search = String(next.search || '').slice(0, 200);
      if (JSON.stringify(next) === JSON.stringify(state)) {
        return;
      }
      state = next;
      try {
        storage?.setItem(KEY, JSON.stringify({ ...state, search: '' }));
      } catch {
        // ignore storage errors
      }
      subs.forEach((fn) => fn());
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Who "Mine" means. The owner by default; override in localStorage. */
export function currentUser() {
  try {
    return window.localStorage.getItem('beads-ui.me') || 'abdelrahman';
  } catch {
    return 'abdelrahman';
  }
}
