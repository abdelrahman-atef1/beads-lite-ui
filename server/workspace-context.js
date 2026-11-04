/**
 * Per-connection workspace (beads-lite-1bo5.6.34).
 *
 * Each socket has its own current project, so a phone and a PC tab on
 * different projects never move each other. A socket that never chose one
 * (or is not tracked) uses the server default. Pure bookkeeping: no timers,
 * no fs, nothing runs when nobody is connected.
 *
 * @typedef {{ root_dir: string, db_path: string }} WorkspaceCtx
 */

/** @type {WeakMap<object, WorkspaceCtx>} */
const SOCKET_CTX = new WeakMap();

/** @type {WorkspaceCtx | null} */
let DEFAULT_CTX = null;

/** @param {WorkspaceCtx} ctx the project NEW sockets start on */
export function setDefaultWorkspace(ctx) {
  DEFAULT_CTX = ctx;
}

/** @returns {WorkspaceCtx | null} */
export function getDefaultWorkspace() {
  return DEFAULT_CTX;
}

/**
 * @param {object} ws
 * @returns {WorkspaceCtx | null}
 */
export function ctxFor(ws) {
  return SOCKET_CTX.get(ws) || DEFAULT_CTX;
}

/**
 * @param {object} ws
 * @param {WorkspaceCtx} ctx
 */
export function setCtx(ws, ctx) {
  SOCKET_CTX.set(ws, ctx);
}
