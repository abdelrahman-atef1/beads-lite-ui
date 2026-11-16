/**
 * The registered projects as the screens see them (beads-lite-1bo5.13.24.1):
 * the id prefix (else the folder name, lower case) is the Project filter value
 * and the key of a task id; the path is the workspace the server writes to.
 * Pure: reads the list the boot already loaded (store.workspace.available).
 */

/**
 * @param {any} store
 * @returns {{ key: string, path: string }[]}
 */
export function registeredProjects(store) {
  const ws = (store && store.getState && store.getState().workspace) || {};
  return (ws.available || [])
    .map((/** @type {any} */ w) => {
      const parts = String(w.path || '')
        .split(/[\\/]/)
        .filter(Boolean);
      return {
        key: String(w.prefix || parts[parts.length - 1] || '').toLowerCase(),
        path: String(w.path || '')
      };
    })
    .filter((/** @type {{ key: string }} */ w) => w.key);
}
