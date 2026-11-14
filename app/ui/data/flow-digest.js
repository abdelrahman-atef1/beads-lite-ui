/**
 * Experiment and weekly digest adapter (beads-lite-1bo5.6.66.7). One read-only call:
 *   flow-digest {} -> { digest: { week, lines[5], findings, built_at } | null, exps: [] }
 * The server reads the verdict files of scripts/flow/flow-exp.mjs and the head of the newest
 * weekly file of flow-weekly.mjs. Verdicts are computed there; nothing in the board computes,
 * changes or adopts one. Fetched when the screen opens, never polled. A server without the
 * handler, or no files, gives the empty answer; the board still loads. Fixture mode (the same
 * `timefx=1` as the Time screens) serves generated data and touches no server.
 */
import { fixtureOn } from './time.js';

export const T_DIGEST = 'flow-digest';

/** @typedef {{ digest: { week: string, lines: string[], findings: boolean, built_at: string | null } | null, exps: any[], fixture?: boolean }} FlowDigest */

/** @type {FlowDigest} */
const EMPTY = { digest: null, exps: [] };

/**
 * @param {{ send: (type: string, payload?: any) => Promise<any> } | undefined} client
 * @returns {Promise<FlowDigest>}
 */
export async function loadDigest(client) {
  if (fixtureOn()) {
    const m = await import('./flow-digest-fixture.js');
    return { ...m.fixtureDigest(Date.now()), fixture: true };
  }
  if (!client || typeof client.send !== 'function') return EMPTY;
  try {
    const r = await client.send(T_DIGEST, {});
    return {
      digest: r && r.digest && Array.isArray(r.digest.lines) ? r.digest : null,
      exps: r && Array.isArray(r.exps) ? r.exps : []
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Which verdict the pill shows. The script's verdict stands; two cases are named
 * apart: a run in which something else changed (confounded) and a run that is
 * still too small to judge (the script's own words: "too few to tell").
 *
 * @param {any} e
 * @returns {'adopt'|'rollback'|'extend'|'confounded'|'few'|'inconclusive'}
 */
export function verdictKey(e) {
  if (e.confounded === true) return 'confounded';
  switch (e.verdict) {
    case 'ADOPT':
      return 'adopt';
    case 'ROLL BACK':
      return 'rollback';
    case 'INCONCLUSIVE':
      return 'inconclusive';
    default:
      return /^too few to tell/i.test(String(e.reason || ''))
        ? 'few'
        : 'extend';
  }
}
