/**
 * Board filters (design/README.md 5.2 and 5.6, beads-lite-1bo5.13.16.1): every
 * dimension is a set of values, plus a search string. Pure matching plus the
 * URL form, so the board and the top bar share one source. Everything runs on
 * the already-loaded slice: typing never waits on the server.
 */

/** Dimensions that are sets: OR inside one dimension, AND across them. */
export const DIMS = [
  'status',
  'assignee',
  'prio',
  'type',
  'label',
  'epic',
  'project'
];
/** Status value (URL and filter) -> the board column that shows it. */
export const STATUS_COL = /** @type {Record<string, string>} */ ({
  owner_decision: 'owner',
  in_progress: 'progress',
  waiting_for_test: 'test',
  waiting_for_merge: 'merge',
  open: 'ready',
  blocked: 'blocked',
  deferred: 'deferred'
});
/** Board column id -> status value. */
export const COL_STATUS = /** @type {Record<string, string>} */ (
  Object.fromEntries(Object.entries(STATUS_COL).map(([k, v]) => [v, k]))
);
const MAX_VALUES = 50;

/**
 * assignee and epic use "-" for "none"; status holds STATUS_COL keys.
 *
 * @typedef {{
 *   status: string[], assignee: string[], prio: string[], type: string[],
 *   label: string[], epic: string[], project: string[], search: string
 * }} BoardFilter
 * @typedef {{
 *   epic?: (it: any) => string,
 *   project?: (it: any) => string,
 *   status?: (it: any) => string
 * }} Ctx
 */

/** @returns {BoardFilter} */
export function emptyFilter() {
  return {
    status: [],
    assignee: [],
    prio: [],
    type: [],
    label: [],
    epic: [],
    project: [],
    search: ''
  };
}

/** @param {BoardFilter} f */
export function isFiltering(f) {
  return Boolean(
    DIMS.some((d) => /** @type {any} */ (f)[d].length) || f.search.trim()
  );
}

/**
 * Values one issue has in a dimension (what a selection is compared with).
 * Assignees compare case-insensitively (lower case here).
 *
 * @param {any} it
 * @param {string} dim
 * @param {Ctx} [ctx]
 * @returns {string[]}
 */
export function valuesOf(it, dim, ctx = {}) {
  switch (dim) {
    case 'assignee':
      return [
        String(it.assignee || '')
          .trim()
          .toLowerCase() || '-'
      ];
    case 'prio':
      return typeof it.priority === 'number' ? [String(it.priority)] : [];
    case 'type':
      return it.issue_type ? [String(it.issue_type)] : [];
    case 'label':
      return Array.isArray(it.labels) ? it.labels.map(String) : [];
    case 'epic':
      return [(ctx.epic && ctx.epic(it)) || '-'];
    case 'project':
      return ctx.project ? [ctx.project(it)] : [];
    case 'status':
      return ctx.status ? [ctx.status(it)] : [];
    default:
      return [];
  }
}

/**
 * Does one issue pass the filter? Search matches id (substring, case
 * insensitive), title and title_ar. `skip` leaves one dimension out (to count
 * the options of that dimension). Status is applied only when `ctx.status` is
 * given: the board applies it to its columns instead.
 *
 * @param {any} it
 * @param {BoardFilter} f
 * @param {Ctx} [ctx]
 * @param {string} [skip]
 */
export function matchesFilter(it, f, ctx = {}, skip = '') {
  if (!it) {
    return false;
  }
  for (const d of DIMS) {
    const want = /** @type {string[]} */ (/** @type {any} */ (f)[d]);
    if (!want.length || d === skip) continue;
    if (d === 'status' && !ctx.status) continue;
    const w = d === 'assignee' ? want.map((v) => v.toLowerCase()) : want;
    if (!valuesOf(it, d, ctx).some((v) => w.includes(v))) return false;
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
 * Distinct types, labels and assignees in a slice, for the filter menus.
 *
 * @param {any[]} items
 */
export function facets(items) {
  const types = new Set();
  const labels = new Set();
  /** @type {Map<string, string>} */
  const assignees = new Map();
  for (const it of items) {
    if (it && it.issue_type) {
      types.add(String(it.issue_type));
    }
    if (it && it.assignee) {
      const a = String(it.assignee).trim();
      if (a && !assignees.has(a.toLowerCase())) {
        assignees.set(a.toLowerCase(), a);
      }
    }
    for (const l of (it && it.labels) || []) {
      labels.add(String(l));
    }
  }
  return {
    types: [...types].sort(),
    labels: [...labels].sort(),
    assignees: [...assignees.values()].sort()
  };
}

/** @param {string} v */
const enc = (v) => v.replace(/,/g, '%2C');
/** @param {string} v */
const dec = (v) => v.replace(/%2C/gi, ',');

/**
 * Keep known, bounded, distinct values of one dimension (URL and saved copy).
 *
 * @param {string} dim
 * @param {unknown} list
 * @returns {string[]}
 */
export function cleanValues(dim, list) {
  if (!Array.isArray(list)) return [];
  /** @type {string[]} */
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    let v = raw.trim().slice(0, 80);
    if (dim === 'assignee') v = v.toLowerCase();
    if (!v || out.includes(v)) continue;
    if (dim === 'prio' && !/^[0-4]$/.test(v)) continue;
    if (dim === 'status' && !Object.hasOwn(STATUS_COL, v)) continue;
    out.push(v);
    if (out.length >= MAX_VALUES) break;
  }
  return out;
}

/**
 * Read filters from a query string. Each key is a comma-separated list, so an
 * old single-value link (`?assignee=swe&prio=1`) is a list of one:
 * `?status=owner_decision,blocked&assignee=swe,-`. Unknown values are dropped.
 *
 * @param {string} search
 * @returns {Partial<BoardFilter>}
 */
export function filterFromQuery(search) {
  const q = new URLSearchParams(search);
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const d of DIMS) {
    const raw = q.get(d);
    if (!raw) continue;
    const vals = cleanValues(d, raw.split(',').map(dec));
    if (vals.length) out[d] = vals;
  }
  return out;
}

/**
 * Write the filters into a query string, keeping any other parameter
 * untouched. A dimension with no values is removed from the URL.
 *
 * @param {string} search
 * @param {BoardFilter} f
 * @returns {string} new query string, with a leading "?" or empty
 */
export function filterToQuery(search, f) {
  const q = new URLSearchParams(search);
  for (const d of DIMS) {
    const v = cleanValues(d, /** @type {any} */ (f)[d]);
    if (v.length) q.set(d, v.map(enc).join(','));
    else q.delete(d);
  }
  const out = q.toString().replace(/%2C/gi, ',');
  return out ? '?' + out : '';
}

/** Stall threshold in hours: `?stall=N` in the URL, else the server's default. */
/** @param {string} search @param {number} [fallback] */
export function stallHoursFromQuery(search, fallback = 24) {
  const n = Number.parseFloat(new URLSearchParams(search).get('stall') || '');
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Filter state shared by the top bar search and the board. `initial` (the
 * saved device copy) is overridden as a whole when the page URL carries any
 * filter key, so a shared link reproduces the same view and a cleared filter
 * never comes back from an older copy. Every change is written to the URL;
 * subscribers save the device copy. The search text is never saved.
 *
 * @param {Partial<BoardFilter>} [initial]
 * @param {{ url?: boolean }} [opts] url:false keeps the filters off the
 *   address bar (Desk keeps its own set)
 */
export function createFilterState(initial = {}, opts = {}) {
  const use_url = opts.url !== false;
  /** @type {BoardFilter} */
  let state = { ...emptyFilter(), ...initial, search: '' };
  if (use_url) {
    try {
      const from_url = filterFromQuery(window.location.search);
      if (Object.keys(from_url).length) {
        state = { ...emptyFilter(), ...from_url };
      }
    } catch {
      // no window (tests)
    }
  }
  /** @type {Set<() => void>} */
  const subs = new Set();
  return {
    get: () => state,
    /** @param {Partial<BoardFilter>} patch */
    set(patch) {
      const next = { ...state, ...patch };
      for (const d of DIMS) {
        /** @type {any} */ (next)[d] = cleanValues(
          d,
          /** @type {any} */ (next)[d]
        );
      }
      next.search = String(next.search || '').slice(0, 200);
      if (JSON.stringify(next) === JSON.stringify(state)) {
        return;
      }
      state = next;
      if (use_url)
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
      subs.forEach((fn) => fn());
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };
}

/** Who "Mine" means. The owner by default; override in localStorage. */
export function currentUser() {
  try {
    return window.localStorage.getItem('beads-ui.me') || 'abdelrahman';
  } catch {
    return 'abdelrahman';
  }
}
