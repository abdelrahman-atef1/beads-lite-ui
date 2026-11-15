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
