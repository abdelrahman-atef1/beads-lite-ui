/**
 * Board filters (design/README.md 5.2 and 5.6): quick chip, type, label and a
 * search string. Pure matching plus a tiny persisted state, so the board and
 * the top bar share one source. Everything runs on the already-loaded slice:
 * typing never waits on the server.
 */

const KEY = 'beads-ui.board-filter';

/** @typedef {{ chip: 'all'|'mine'|'p01', type: string, label: string, search: string, assignee: string, prio: string }} BoardFilter */

/** @returns {BoardFilter} */
export function emptyFilter() {
  return {
    chip: 'all',
    type: '',
    label: '',
    search: '',
    assignee: '',
    prio: ''
  };
}

/** @param {BoardFilter} f */
export function isFiltering(f) {
  return Boolean(
    f.chip !== 'all' ||
    f.type ||
    f.label ||
    f.assignee ||
    f.prio ||
    f.search.trim()
  );
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
  if (f.assignee) {
    const who = String(it.assignee || '').toLowerCase();
    if (f.assignee === '-' ? who !== '' : who !== f.assignee.toLowerCase()) {
      return false;
    }
  }
  if (f.prio !== '' && String(it.priority) !== f.prio) {
    return false;
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
  const assignees = new Set();
  for (const it of items) {
    if (it && it.issue_type) {
      types.add(String(it.issue_type));
    }
    if (it && it.assignee) {
      assignees.add(String(it.assignee));
    }
    for (const l of (it && it.labels) || []) {
      labels.add(String(l));
    }
  }
  return {
    types: [...types].sort(),
    labels: [...labels].sort(),
    assignees: [...assignees].sort()
  };
}

/** URL query keys for the shareable filter state. */
const URL_KEYS = /** @type {const} */ ({
  assignee: 'assignee',
  type: 'type',
  prio: 'prio',
  label: 'label'
});

/**
 * Read filters from a query string (`?assignee=swe&type=task&prio=1&label=goal:x`).
 * Values are bounded; anything unknown is ignored.
 *
 * @param {string} search
 * @returns {Partial<BoardFilter>}
 */
export function filterFromQuery(search) {
  const q = new URLSearchParams(search);
  /** @type {Partial<BoardFilter>} */
  const out = {};
  const a = q.get('assignee');
  if (a) out.assignee = a.slice(0, 60);
  const ty = q.get('type');
  if (ty) out.type = ty.slice(0, 40);
  const l = q.get('label');
  if (l) out.label = l.slice(0, 80);
  const p = q.get('prio');
  if (p && /^[0-4]$/.test(p)) out.prio = p;
  return out;
}

/**
 * Write the four URL-backed filters into a query string, keeping any other
 * parameter untouched.
 *
 * @param {string} search
 * @param {BoardFilter} f
 * @returns {string} new query string, with a leading "?" or empty
 */
export function filterToQuery(search, f) {
  const q = new URLSearchParams(search);
  for (const k of Object.keys(URL_KEYS)) {
    const v = String(/** @type {any} */ (f)[k] || '');
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const out = q.toString();
  return out ? '?' + out : '';
}

/** Stall threshold in hours: `?stall=N` in the URL, else the server's default. */
export function stallHoursFromQuery(search, fallback = 24) {
  const n = Number.parseFloat(new URLSearchParams(search).get('stall') || '');
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
        assignee: '',
        prio: '',
        // The search box starts empty after a reload (Esc-to-clear friendly).
        search: ''
      };
    }
  } catch {
    // ignore corrupt storage
  }
  // The URL wins over storage: a shared link reproduces the same view.
  try {
    state = { ...state, ...filterFromQuery(window.location.search) };
  } catch {
    // no window (tests)
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
        const qs = filterToQuery(window.location.search, state);
        if (qs !== window.location.search) {
          window.history.replaceState(
            window.history.state,
            '',
            window.location.pathname + qs + window.location.hash
          );
        }
      } catch {
        // no window (tests)
      }
      try {
        storage?.setItem(
          KEY,
          JSON.stringify({ ...state, search: '', assignee: '', prio: '' })
        );
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
