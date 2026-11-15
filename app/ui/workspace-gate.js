/**
 * A task link opens in the project its id belongs to (beads-lite-1bo5.6.59.23).
 *
 * The task screen subscribes and loads comments against the CURRENT workspace,
 * so a link to a bead of another project sat on "loading" (the legacy board
 * holds the detail until the workspace is right). Before the task screen
 * mounts, this asks the server for the workspace list, and if the id belongs
 * to another one, switches and reloads, exactly as the Projects screen does
 * (same `set-workspace` call, same saved key). The hash survives the reload,
 * so the link opens on the second load. It never throws: any failure lets the
 * task screen mount, which then shows its normal states.
 */
import { resolveIssueWorkspace } from '../issue-workspace.js';

const WS_KEY = 'beads-ui.workspace';
const TRIED_KEY = 'bl.ws-switch';

/** Page reload, swappable in tests (jsdom cannot reload). */
export const hooks = { reload: () => window.location.reload() };

/**
 * @param {{ client: any }} base
 * @param {string} id
 * @returns {Promise<boolean>} true when the page is reloading into the right project
 */
export async function switchForIssue(base, id) {
  try {
    const res = await base.client.send('list-workspaces', {});
    const list = res && Array.isArray(res.workspaces) ? res.workspaces : [];
    if (list.length === 0) return false;
    const current = res.current
      ? { path: res.current.root_dir || res.current.path }
      : null;
    const r = resolveIssueWorkspace(id, current, list);
    if (r.action !== 'switch') return false;
    const out = await base.client.send('set-workspace', { path: r.path });
    if (!out || !out.workspace) return false;
    window.localStorage.setItem(WS_KEY, r.path);
    // Reload even when the server says "unchanged": the main script's own
    // load-time switch may have got there first and then cleared this page's
    // subscriptions, which is what left the screen on loading. One reload per
    // id (the flag) so a server that never moves cannot loop.
    if (window.sessionStorage.getItem(TRIED_KEY) === id) return false;
    window.sessionStorage.setItem(TRIED_KEY, id);
    hooks.reload();
    return true;
  } catch {
    return false;
  }
}

const MOVED_KEY = 'bl.moved';

/**
 * An old id of a bead that moved to another project (company-8ce8.14, alias
 * table in the server). Same lookup as the legacy board's redirect, through
 * the same `resolve-moved-id` call. Returns the new id, or null (not moved,
 * or any failure: the link then opens as before).
 *
 * @param {{ client: any }} base
 * @param {string} id
 * @returns {Promise<string | null>}
 */
export async function resolveMoved(base, id) {
  try {
    const res = await base.client.send('resolve-moved-id', { id });
    const to = res && res.moved && res.moved.id;
    return typeof to === 'string' && to && to !== id ? to : null;
  } catch {
    return null;
  }
}

/**
 * Replace the old id in the address bar with the new one (Back must not land
 * on the dead id) and remember the old id so the task screen can say it moved.
 * The note survives the workspace reload (sessionStorage).
 *
 * @param {string} from - old id
 * @param {string} to
 */
export function applyMoved(from, to) {
  const h = window.location.hash;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search + h.split(from).join(to)
  );
  try {
    window.sessionStorage.setItem(MOVED_KEY, JSON.stringify({ from, to }));
  } catch {
    // ignore storage errors
  }
}

/**
 * @param {string | null} id - the task now open
 * @returns {string | null} the old id it moved from, if this is that task
 */
export function movedNote(id) {
  try {
    const n = JSON.parse(window.sessionStorage.getItem(MOVED_KEY) || 'null');
    if (n && id && n.to === id) return n.from;
    window.sessionStorage.removeItem(MOVED_KEY);
  } catch {
    // ignore
  }
  return null;
}
