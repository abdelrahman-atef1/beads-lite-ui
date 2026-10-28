/**
 * Derived board fields (company-1bo5.6 P1), computed from the snapshot the
 * board already loads: no extra bd call, no state, nothing runs when idle.
 *
 * Added to every issue:
 * - `claimed_at`   : ISO time the item was claimed (bd `started_at`), or null.
 * - `stalled`      : in_progress and no update for more than `stall_hours`.
 * - `blocked_by_detail`: [{ id, assignee, status, title }] for each open
 *   blocker (from `bd blocked`'s `blocked_by` ids), empty if none.
 * - `unblocks`     : how many open issues list this one as a blocker.
 */

export const DEFAULT_STALL_HOURS = 24;

/** @returns {number} hours, from BDUI_STALL_HOURS, else the default */
export function stallHours() {
  const n = Number.parseFloat(String(process.env.BDUI_STALL_HOURS || ''));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALL_HOURS;
}

/**
 * @param {any} it
 * @param {number} now - ms
 * @param {number} hours
 * @returns {boolean}
 */
export function isStalled(it, now, hours) {
  if (!it || it.status !== 'in_progress') {
    return false;
  }
  const t = Date.parse(String(it.updated_at || ''));
  return Number.isFinite(t) && now - t > hours * 3_600_000;
}

/**
 * Index of blockers built once per snapshot.
 *
 * @param {unknown[]} open - `bd list` items
 * @param {unknown[]} blocked - `bd blocked` items (carry `blocked_by` ids)
 */
export function buildIndex(open, blocked) {
  /** @type {Map<string, any>} */
  const by_id = new Map();
  for (const it of open) {
    if (it && typeof it === 'object')
      by_id.set(String(/** @type {any} */ (it).id), it);
  }
  /** @type {Map<string, string[]>} */
  const blockers = new Map();
  /** @type {Map<string, number>} */
  const unblocks = new Map();
  for (const b of blocked) {
    const id = String(/** @type {any} */ (b)?.id || '');
    const ids = /** @type {any} */ (b)?.blocked_by;
    if (!id || !Array.isArray(ids)) continue;
    const list = ids.map(String);
    blockers.set(id, list);
    for (const x of list) unblocks.set(x, (unblocks.get(x) || 0) + 1);
  }
  return { by_id, blockers, unblocks };
}

/**
 * @param {any[]} items
 * @param {ReturnType<typeof buildIndex>} index
 * @param {number} now
 * @param {number} hours
 * @returns {any[]}
 */
export function deriveItems(items, index, now, hours) {
  return items.map((it) => {
    if (!it || typeof it !== 'object') return it;
    const ids = index.blockers.get(String(it.id)) || [];
    return {
      ...it,
      claimed_at: it.started_at || null,
      stalled: isStalled(it, now, hours),
      blocked_by_detail: ids.map((id) => {
        const b = index.by_id.get(id);
        return {
          id,
          assignee: (b && b.assignee) || '',
          status: (b && b.status) || '',
          title: (b && b.title) || ''
        };
      }),
      unblocks: index.unblocks.get(String(it.id)) || 0
    };
  });
}
