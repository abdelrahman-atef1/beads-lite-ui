/**
 * Where the Tasks list was scrolled when a task was opened from it, so Back
 * puts the reader in the same place (beads-lite-1bo5.13.31). One number in
 * memory: boot.js sets it on leaving the list for a task, the list applies it
 * (and clears it) once it is drawn. Any other way into the list starts at 0.
 */
let y = 0;

/** @param {number} v */
export function setTasksReturn(v) {
  y = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/**
 * Read without clearing. The list can be mounted and dropped again before it is
 * whole (the saved project is restored right after a page load), so the place
 * is cleared only once it was applied (clearTasksReturn) or the reader went
 * somewhere else.
 */
export function peekTasksReturn() {
  return y;
}

export function clearTasksReturn() {
  y = 0;
}
