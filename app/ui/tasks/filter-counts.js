/**
 * Option counts for the Filters sheet (beads-lite-1bo5.13.16.1). An option's
 * count is the number of issues that pass every OTHER filter, so counts stay
 * honest while filtering. Pure, runs on the loaded slice only.
 */
import {
  COL_STATUS,
  DIMS,
  matchesFilter,
  valuesOf
} from '../../utils/board-filter.js';
import { COLUMNS, splitColumns } from '../../utils/board-model.js';

/** Order of the Status options: the board's column order, then Other. */
export const STATUS_ORDER = [...COLUMNS.map((c) => COL_STATUS[c.id]), 'other'];

/**
 * Status value (STATUS_COL key) of every open issue, by the column it is in.
 *
 * @param {any[]} items
 * @param {Set<string>} ready_ids
 * @param {Set<string>} blocked_ids
 * @returns {Map<string, string>} id -> status value
 */
export function statusMap(items, ready_ids, blocked_ids) {
  const s = splitColumns(items, ready_ids, blocked_ids);
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const c of COLUMNS) {
    for (const it of s.columns[c.id]) m.set(it.id, COL_STATUS[c.id]);
  }
  for (const it of s.other) m.set(it.id, 'other');
  return m;
}

/**
 * Values and counts of one dimension.
 *
 * @param {any[]} items - open issues of the loaded slice
 * @param {import('../../utils/board-filter.js').BoardFilter} f
 * @param {string} dim
 * @param {import('../../utils/board-filter.js').Ctx} ctx - must carry status
 * @returns {{ value: string, count: number }[]} selected values stay listed at 0
 */
export function dimCounts(items, f, dim, ctx) {
  /** @type {Map<string, number>} */
  const n = new Map();
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const it of items) {
    const vals = valuesOf(it, dim, ctx);
    const pass = matchesFilter(it, f, ctx, dim);
    for (const v of vals) {
      seen.set(v, 0);
      if (pass) n.set(v, (n.get(v) || 0) + 1);
    }
  }
  for (const v of /** @type {string[]} */ (/** @type {any} */ (f)[dim])) {
    const key = dim === 'assignee' ? v.toLowerCase() : v;
    if (!seen.has(key)) seen.set(key, 0);
  }
  const out = [...seen.keys()].map((value) => ({
    value,
    count: n.get(value) || 0
  }));
  if (dim === 'status') {
    for (const v of STATUS_ORDER) {
      if (!seen.has(v)) out.push({ value: v, count: 0 });
    }
    out.sort(
      (a, b) => STATUS_ORDER.indexOf(a.value) - STATUS_ORDER.indexOf(b.value)
    );
  } else {
    // "-" (none) last, the rest by value
    out.sort((a, b) =>
      a.value === '-'
        ? 1
        : b.value === '-'
          ? -1
          : a.value.localeCompare(b.value)
    );
  }
  return out;
}

export { DIMS };
