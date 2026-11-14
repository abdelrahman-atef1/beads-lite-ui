/**
 * Time data adapter (beads-lite-1bo5.6.59.12). One read-only call to the server:
 *   flow-rollup {ids?, days?} -> { present, built_at, heavy_recorded, rows }
 * Reads the rollup file of .66 (scripts/flow/rollup.mjs). Fetched when a screen
 * opens, never polled. If the server has no such handler, or the file is
 * missing, the answer is the empty state { present: false, rows: [] }; the
 * board still loads. Fixture mode (`timefx=1` in the URL) serves generated rows
 * and touches no server.
 */
export const T_ROLLUP = 'flow-rollup';
/** Periods the role screen offers (days). The server serves up to 200. */
export const PERIODS = [7, 30, 60];

/** @typedef {{ present: boolean, built_at: string | null, rows: any[], fixture?: boolean }} Rollup */

export function fixtureOn() {
  try {
    return (
      new URLSearchParams(globalThis.location?.search || '').get('timefx') ===
      '1'
    );
  } catch {
    return false;
  }
}

/** @type {Rollup} */
const EMPTY = { present: false, built_at: null, rows: [] };

/**
 * @param {{ send: (type: string, payload?: any) => Promise<any> } | undefined} client
 * @param {{ ids?: string[], days?: number }} [q]
 * @returns {Promise<Rollup>}
 */
export async function loadRollup(client, q = {}) {
  if (fixtureOn()) {
    const m = await import('./time-fixture.js');
    const now = Date.now();
    const rows = q.ids
      ? q.ids.map((id) => m.fixtureFor(id, now))
      : m.fixtureRows(now);
    return {
      present: true,
      built_at: new Date(now - 5 * 60_000).toISOString(),
      rows,
      fixture: true
    };
  }
  if (!client || typeof client.send !== 'function') return EMPTY;
  try {
    const res = await client.send(T_ROLLUP, q);
    if (!res || res.present !== true || !Array.isArray(res.rows)) return EMPTY;
    return { present: true, built_at: res.built_at ?? null, rows: res.rows };
  } catch {
    return EMPTY;
  }
}
