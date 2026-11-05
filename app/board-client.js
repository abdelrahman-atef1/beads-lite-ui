/**
 * The board's main socket. The project is chosen per socket (set-workspace),
 * so a panel that needs the selected project must send on THIS socket; a
 * socket of its own starts on the server's start folder (beads-lite-1bo5.6.51).
 * Own module so tests that mock ws.js keep working.
 */

/** @type {any} */
let board_client = null;

/**
 * @param {any} [client] set by main.js; omit to read
 */
export function boardClient(client) {
  if (client) board_client = client;
  return board_client;
}
