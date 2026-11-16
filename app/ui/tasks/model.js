/**
 * Pure model of the v3 tasks board: same column split, filter and sort as the
 * legacy board (utils/board-model.js, board-filter.js), so counts and card
 * placement stay equal. No DOM here.
 */
import { cmpClosedDesc, cmpPriorityThenCreated } from '../../data/sort.js';
import { matchesFilter } from '../../utils/board-filter.js';
import { splitColumns } from '../../utils/board-model.js';
import { epicOf, projectOf } from './lanes.js';

export const CLOSED_PAGE = 50;
/** Cards drawn in the first paint; the rest follows on the next tick. */
export const FIRST_PAINT_CARDS = 30;

/**
 * How the filter reads an issue's epic and project (status is applied to the
 * columns by the screen, not here).
 *
 * @param {any[]} all - every issue, to walk the parent chain to its epic
 */
export function filterCtx(all) {
  const by_id = new Map(all.map((i) => [i.id, i]));
  return {
    epic: (/** @type {any} */ it) => epicOf(it, by_id)?.id || '',
    project: (/** @type {any} */ it) => projectOf(it.id)
  };
}

/**
 * Split, filter and sort the four lists into board columns.
 *
 * @param {{ all: any[], ready: any[], blocked: any[], closed: any[] }} src
 * @param {any} filter
 * @returns {{ columns: Record<string, any[]>, other: any[], closed: any[], facetItems: any[] }}
 */
export function buildBoard(src, filter) {
  const ready_ids = new Set(src.ready.map((i) => i.id));
  const blocked_ids = new Set(src.blocked.map((i) => i.id));
  const ctx = filterCtx(src.all);
  const keep = (/** @type {any} */ it) => matchesFilter(it, filter, ctx);
  const split = splitColumns(src.all.filter(keep), ready_ids, blocked_ids);
  for (const id of Object.keys(split.columns)) {
    split.columns[id].sort(/** @type {any} */ (cmpPriorityThenCreated));
  }
  split.other.sort(/** @type {any} */ (cmpPriorityThenCreated));
  // Oldest first in the owner's column: the longest-waiting question first.
  split.columns.owner.sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0));
  const closed = src.closed
    .filter(keep)
    .sort(/** @type {any} */ (cmpClosedDesc));
  return {
    columns: split.columns,
    other: split.other,
    closed,
    facetItems: src.all
  };
}

/**
 * Split one lane's issues into columns (used per lane when lanes are on).
 *
 * @param {any[]} issues
 * @param {Set<string>} ready_ids
 * @param {Set<string>} blocked_ids
 */
export function columnsOf(issues, ready_ids, blocked_ids) {
  const s = splitColumns(issues, ready_ids, blocked_ids);
  for (const id of Object.keys(s.columns)) {
    s.columns[id].sort(/** @type {any} */ (cmpPriorityThenCreated));
  }
  s.other.sort(/** @type {any} */ (cmpPriorityThenCreated));
  s.columns.owner.sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0));
  return s;
}
