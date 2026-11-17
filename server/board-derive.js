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

/**
 * bd's blocked list also holds a child back while its parent is open. A parent
 * (epic/story) is only the container, so such a link is not a blocker: drop it,
 * and drop the item when nothing else blocks it (beads-lite-1bo5.13.30). The
 * parent is the `parent` field of the open list, else the dotted-id prefix.
 *
 * @param {any[]} blocked - `bd blocked` items (carry `blocked_by` ids)
 * @param {any[]} open - `bd list` items
 * @returns {any[]}
 */
export function dropContainerBlockers(blocked, open) {
  const parent_of = new Map();
  for (const it of open || []) {
    if (it && it.id && it.parent)
      parent_of.set(String(it.id), String(it.parent));
  }
  const out = [];
  for (const b of blocked || []) {
    const id = String(b?.id || '');
    const ids = Array.isArray(b?.blocked_by) ? b.blocked_by.map(String) : null;
    if (!id || !ids) {
      out.push(b);
      continue;
    }
    const dot = id.lastIndexOf('.');
    const parent = parent_of.get(id) || (dot > 0 ? id.slice(0, dot) : '');
    const real = ids.filter((x) => x !== parent);
    if (!real.length) continue;
    out.push(
      real.length === ids.length
        ? b
        : { ...b, blocked_by: real, blocked_by_count: real.length }
    );
  }
  return out;
}
