/**
 * v3 routes. Same hash grammar as legacy (owner bead links depend on it):
 *   #/issues?issue=<id>&at=<target>  -> task page (any view name + issue=)
 *   #/, empty                        -> stats (home, 68.4)
 *   #/decisions                      -> desk
 *   #/board, #/issues, #/epics       -> tasks (mode = board|issues|epics)
 *   #/releases, #/time, #/projects, #/settings, #/ui-kit
 * `at` = c-last | c-<n> | c-<hex> | description | design | notes |
 * acceptance | card.
 */

/** @typedef {{ name: string, id: string|null, at: string|null, mode: string, params: URLSearchParams }} Route */

export const NAV = [
  { name: 'stats', hash: '#/' },
  { name: 'desk', hash: '#/decisions' },
  { name: 'tasks', hash: '#/issues' },
  { name: 'releases', hash: '#/releases' },
  { name: 'projects', hash: '#/projects' }
  // Settings has no content yet: no nav entry (route kept), 1bo5.6.59.33
];

/**
 * @param {string} hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const h = String(hash || '');
  const frag = h.startsWith('#') ? h.slice(1) : h;
  const q = frag.indexOf('?');
  const path = q >= 0 ? frag.slice(0, q) : frag;
  const params = new URLSearchParams(q >= 0 ? frag.slice(q + 1) : '');
  let id = params.get('issue');
  const old = /^\/issue\/([^\s?#]+)/.exec(path);
  if (!id && old) id = decodeURIComponent(old[1]);
  const at = params.get('at');
  const seg = (path.split('/')[1] || '').toLowerCase();
  /** @type {Route} */
  const r = {
    name: 'stats',
    id: id || null,
    at: at || null,
    mode: 'issues',
    params
  };
  if (id) {
    r.name = 'task';
    return r;
  }
  switch (seg) {
    case '':
      r.name = 'stats';
      break;
    case 'decisions':
      r.name = 'desk';
      break;
    case 'issues':
    case 'epics':
    case 'board':
      r.name = 'tasks';
      r.mode = seg;
      break;
    case 'stats':
    case 'releases':
    case 'time':
    case 'projects':
    case 'settings':
    case 'ui-kit':
      r.name = seg;
      break;
    default:
      r.name = 'tasks';
  }
  return r;
}

/**
 * Which sidebar/tab item is lit for a route.
 *
 * @param {{ name: string }} route
 */
export function navFor(route) {
  if (route.name === 'task') return 'tasks';
  if (route.name === 'time' || route.name === 'ui-kit') return 'settings';
  return route.name;
}
