/**
 * Resolve which workspace an issue id belongs to, by id prefix
 * (`abduu-tasks-q79.43` -> project folder `abduu-tasks`).
 */

/**
 * @param {string} path
 * @returns {string}
 */
function base(path) {
  const parts = String(path || '')
    .split('\\')
    .join('/')
    .split('/')
    .filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

/**
 * Longest workspace folder name that is a prefix of the id (followed by "-").
 *
 * @param {string} id
 * @param {Array<{ path: string }>} workspaces
 * @returns {{ path: string } | null}
 */
export function matchWorkspace(id, workspaces) {
  const lower = String(id || '').toLowerCase();
  let best = null;
  let best_len = 0;
  for (const ws of workspaces || []) {
    const name = base(ws.path);
    if (name && lower.startsWith(name + '-') && name.length > best_len) {
      best = ws;
      best_len = name.length;
    }
  }
  return best;
}

/**
 * Decide what to do for an opened issue id.
 *
 * @param {string} id
 * @param {{ path: string } | null} current
 * @param {Array<{ path: string }>} available
 * @returns {{ action: 'stay' } | { action: 'switch', path: string } | { action: 'none' }}
 */
export function resolveIssueWorkspace(id, current, available) {
  if (!id) return { action: 'stay' };
  if (current && matchWorkspace(id, [current])) return { action: 'stay' };
  const hit = matchWorkspace(id, available);
  if (hit) {
    return current && hit.path === current.path
      ? { action: 'stay' }
      : { action: 'switch', path: hit.path };
  }
  return { action: 'none' };
}
