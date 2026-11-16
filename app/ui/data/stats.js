/**
 * Stats home adapter (beads-lite-1bo5.6.68.4). One read-only call:
 *   flow-stats {days, project?} -> the numbers of the whole screen (about 3 KB), computed on the server
 * from the rollup and tokens files when the screen opens, never polled. A server without the
 * handler, or without the files, gives { present: false }: the screen shows its empty state and
 * the board still loads.
 */
export const T_STATS = 'flow-stats';
export const PERIODS = [7, 30, 60];

/**
 * @param {{ send: (type: string, payload?: any) => Promise<any> } | undefined} client
 * @param {number} days
 * @param {string} [project] - one project key, '' = all projects
 * @returns {Promise<any>}
 */
export async function loadStats(client, days, project = '') {
  if (!client || typeof client.send !== 'function') return { present: false };
  try {
    const r = await client.send(
      T_STATS,
      project ? { days, project } : { days }
    );
    return r && r.present === true ? r : { present: false };
  } catch {
    return { present: false };
  }
}
