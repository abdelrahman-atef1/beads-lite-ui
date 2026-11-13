/**
 * The ?ui=3 flag (board v3). ?ui=3 stores bl.ui=3 and turns v3 on, ?ui=2
 * clears it and gives the legacy board; with neither, the stored value wins
 * and the default is legacy until cutover. Pure: callers pass search+storage.
 */
export const UI_KEY = 'bl.ui';

/**
 * @param {string} search - window.location.search
 * @param {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void } | null} storage
 * @returns {2 | 3}
 */
export function resolveUi(search, storage) {
  let q = null;
  try {
    q = new URLSearchParams(String(search || '')).get('ui');
  } catch {
    q = null;
  }
  try {
    if (q === '3') {
      storage?.setItem(UI_KEY, '3');
      return 3;
    }
    if (q === '2') {
      storage?.removeItem(UI_KEY);
      return 2;
    }
    return storage?.getItem(UI_KEY) === '3' ? 3 : 2;
  } catch {
    return q === '3' ? 3 : 2;
  }
}
