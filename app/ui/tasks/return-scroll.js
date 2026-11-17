/**
 * Where the Tasks list was scrolled when a task was opened from it, so Back
 * puts the reader in the same place (beads-lite-1bo5.13.31). boot.js sets it on
 * leaving the list for a task; the list applies it (and clears it) once drawn.
 * Any other way into the list starts at 0.
 *
 * Kept in sessionStorage, not in memory: a task of another project switches the
 * workspace and reloads the page, which wiped a memory copy, so the first Back
 * after a page load landed at the top while later ones worked. It expires after
 * 30 minutes so an old place never surprises a later visit.
 */
const KEY = 'u3.tasks.return';
const TTL_MS = 30 * 60_000;
/** @type {{ y: number, at: number } | null} */
let mem = null;

/** @param {number} v @param {number} [now] */
export function setTasksReturn(v, now = Date.now()) {
  mem = Number.isFinite(v) && v > 0 ? { y: Math.round(v), at: now } : null;
  try {
    if (mem) window.sessionStorage.setItem(KEY, JSON.stringify(mem));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the in-memory copy still serves a Back without a reload
  }
}

/**
 * Read without clearing. The list can be mounted and dropped again before it is
 * whole (the saved project is restored right after a page load), so the place
 * is cleared only once it was applied (clearTasksReturn) or the reader went
 * somewhere else.
 *
 * @param {number} [now]
 */
export function peekTasksReturn(now = Date.now()) {
  let v = mem;
  if (!v) {
    try {
      v = JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
    } catch {
      v = null;
    }
  }
  return v && Number(v.y) > 0 && now - Number(v.at) <= TTL_MS ? Number(v.y) : 0;
}

export function clearTasksReturn() {
  setTasksReturn(0);
}
