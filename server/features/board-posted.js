/**
 * Comment ids the board server itself posted (beads-lite-1bo5.6.64.1, sec M1).
 * Only these count as the owner for @mentions: the author name alone cannot
 * tell the owner from an agent that posts under the same git name. In memory,
 * 10 minutes, bounded; a restart forgets them (the mention is then refused
 * with a visible "no-actor" chip, never guessed).
 */
const TTL_MS = 10 * 60_000;
const MAX = 200;
/** @type {Map<string, number>} */
const ids = new Map();

/** @param {string} id @param {number} [now] */
export function markBoardPosted(id, now = Date.now()) {
  if (typeof id !== 'string' || !id) return;
  for (const [k, t] of ids) {
    if (now - t > TTL_MS) ids.delete(k);
  }
  ids.set(id, now);
  while (ids.size > MAX)
    ids.delete(/** @type {string} */ (ids.keys().next().value));
}

/** @param {string} id @param {number} [now] */
export function isBoardPosted(id, now = Date.now()) {
  const t = ids.get(id);
  return t !== undefined && now - t <= TTL_MS;
}

/** Tests only. */
export function clearBoardPosted() {
  ids.clear();
}
