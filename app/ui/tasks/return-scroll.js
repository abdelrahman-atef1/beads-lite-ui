/**
 * Where the Tasks list was scrolled when a task was opened from it, so Back
 * puts the reader in the same place (beads-lite-1bo5.13.31). One number in
 * memory: boot.js sets it on leaving the list for a task, the list takes it
 * (and clears it) on its next mount. Any other way into the list starts at 0.
 */
let y = 0;

/** @param {number} v */
export function setTasksReturn(v) {
  y = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** Read once and clear. */
export function takeTasksReturn() {
  const v = y;
  y = 0;
  return v;
}
