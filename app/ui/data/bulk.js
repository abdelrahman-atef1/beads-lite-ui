/**
 * Bulk-select data adapter (beads-lite-1bo5.6.59.11, UI side of .63).
 *
 * The server bulk API does not exist yet. Contract this adapter is written
 * against (one call per action, applied one by one, per-task result):
 *   bulk-apply { action: 'close'|'move'|'defer'|'label'|'assign', ids: string[], params, take_over }
 *     -> { batch: string, results: [{ id, ok: boolean, reason?: string }] }
 *   bulk-undo  { batch } -> { restored: number }
 * Until it lands the adapter runs in FIXTURE mode: it decides per task from the
 * board snapshot (same refusal rules as the spec) and writes NOTHING. The result
 * carries `preview: true` so the UI can say so. Switch = pass a `transport`.
 */

export const MAX_BULK = 50;
export const UNDO_MS = 10000;

/** Reason codes (the UI maps each to a plain sentence). */
export const REASONS = [
  'decision',
  'already_closed',
  'children',
  'blockers',
  'live',
  'same',
  'missing',
  'failed'
];

/**
 * @param {string} id
 * @param {any[]} all
 */
function hasOpenChild(id, all) {
  const p = id + '.';
  return all.some((i) => i.status !== 'closed' && String(i.id).startsWith(p));
}

/**
 * Why one task cannot take the action, or '' when it can.
 *
 * @param {'close'|'move'|'defer'|'label'|'assign'} action
 * @param {any} it
 * @param {any[]} all
 * @param {{ status?: string }} params
 * @param {boolean} take_over
 */
export function refusal(action, it, all, params, take_over) {
  if (!it) return 'missing';
  if (it.status === 'owner_decision') return 'decision';
  if (it.status === 'closed' && (action === 'close' || action === 'defer'))
    return 'already_closed';
  if (action === 'move' && it.status === params.status) return 'same';
  if (action === 'close') {
    if (hasOpenChild(it.id, all)) return 'children';
    if (Array.isArray(it.blocked_by_detail) && it.blocked_by_detail.length) {
      return 'blockers';
    }
  }
  if (it.status === 'in_progress' && String(it.assignee || '').trim()) {
    if (!take_over && action !== 'label') return 'live';
  }
  return '';
}

/**
 * @param {{ transport?: (type: string, payload: any) => Promise<any> }} [opt]
 */
export function createBulkApi(opt = {}) {
  /** @type {Map<string, Array<{ id: string, status: string }>>} */
  const fixtureLog = new Map();
  let seq = 0;
  return {
    live: typeof opt.transport === 'function',
    /**
     * @param {{ action: 'close'|'move'|'defer'|'label'|'assign', ids: string[], params: any, take_over?: boolean }} req
     * @param {any[]} all - board snapshot (fixture mode decides from it)
     * @returns {Promise<{ batch: string, preview: boolean, ok: string[], refused: Array<{ id: string, reason: string }> }>}
     */
    async apply(req, all) {
      if (req.ids.length > MAX_BULK) throw new Error('too_many');
      if (opt.transport) {
        const r = await opt.transport('bulk-apply', req);
        const rows = Array.isArray(r?.results) ? r.results : [];
        return {
          batch: String(r?.batch || ''),
          preview: false,
          ok: rows.filter((x) => x.ok).map((x) => x.id),
          refused: rows
            .filter((x) => !x.ok)
            .map((x) => ({ id: x.id, reason: String(x.reason || 'missing') }))
        };
      }
      const byId = new Map(all.map((i) => [i.id, i]));
      /** @type {string[]} */
      const ok = [];
      /** @type {Array<{ id: string, reason: string }>} */
      const refused = [];
      for (const id of req.ids) {
        const why = refusal(
          req.action,
          byId.get(id),
          all,
          req.params || {},
          Boolean(req.take_over)
        );
        if (why) refused.push({ id, reason: why });
        else ok.push(id);
      }
      const batch = 'fx-' + ++seq;
      fixtureLog.set(
        batch,
        ok.map((id) => ({ id, status: String(byId.get(id)?.status || '') }))
      );
      return { batch, preview: true, ok, refused };
    },
    /** @param {string} batch */
    async undo(batch) {
      if (opt.transport) {
        const r = await opt.transport('bulk-undo', { batch });
        return Number(r?.restored || 0);
      }
      const rows = fixtureLog.get(batch) || [];
      fixtureLog.delete(batch);
      return rows.length;
    }
  };
}
