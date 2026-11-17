/**
 * One load state for one data source (beads-lite-1bo5.13.36).
 *
 * A screen asks `view(count)` and gets what to draw:
 *   'loading'  first load has not finished: draw a loading line, never "empty"
 *   'error'    first load failed and there is no old data: draw the error + retry
 *   'empty'    loaded and truly empty
 *   'data'     there is something to show (old data stays visible while a
 *              refresh runs or after a refresh fails)
 * `begin()` on every (re)load, `ok()` when data arrived, `fail()` when it did not.
 * Only the first load can be 'loading'; a refresh keeps the old answer.
 */
export function createLoadState() {
  let loaded = false;
  let failed = false;
  let busy = true;
  return {
    begin() {
      busy = true;
    },
    ok() {
      loaded = true;
      failed = false;
      busy = false;
    },
    fail() {
      failed = true;
      busy = false;
    },
    /** @returns {boolean} true once any load has succeeded */
    loaded: () => loaded,
    /** @returns {boolean} a load is running */
    busy: () => busy,
    /** @param {number} count what the screen has to show now */
    view(count) {
      if (count > 0) return 'data';
      if (loaded) return 'empty';
      return failed ? 'error' : 'loading';
    }
  };
}
