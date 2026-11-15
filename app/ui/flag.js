/**
 * The ?ui=3 flag (board v3). v3 is the default; ?ui=3 clears any stored
 * choice (old links keep working), ?ui=2 gives the legacy board for that visit only; with neither, the stored value wins
 * and the default is v3 (cutover, 59.17). Pure: callers pass search+storage.
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
    if (q === '2') {
      storage?.removeItem(UI_KEY);
      return 2;
    }
    if (q === '3') {
      storage?.removeItem(UI_KEY);
      return 3;
    }
    return 3;
  } catch {
    return q === '2' ? 2 : 3;
  }
}
