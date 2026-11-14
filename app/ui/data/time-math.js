/**
 * Time math for the v3 Time screens (beads-lite-1bo5.6.59.12). Pure functions
 * over rollup rows (the company repo's scripts/flow/rollup.mjs output, task
 * .66.2). The rollup already did the interval math; here we only (1) count a
 * running interval up to now, (2) group closed beads by role for a period,
 * (3) say in words whether a role got faster/slower and better/worse.
 * Same rules as scripts/flow/core.mjs: unknown is null (never 0), nothing is
 * ranked by time, a time number always travels with its quality counters.
 */

export const MIN = 60_000;
/** A role with fewer closed beads than this in a period is "too few to tell". */
export const MIN_N = 8;
export const BUCKETS = ['active', 'test', 'owner', 'merge', 'blocked', 'queue'];

/**
 * Nearest-rank percentile; null for an empty list (unknown, not 0).
 *
 * @param {number[]} a
 * @param {number} p - 0..1
 */
export function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

/** @param {number[]} a */
export const median = (a) => pct(a, 0.5);

/**
 * Compact duration, Western digits. null = unknown (caller prints its own word).
 *
 * @param {number | null} ms
 * @param {'ar'|'en'} lang
 */
export function fmtDur(ms, lang) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '';
  const u =
    lang === 'ar' ? { d: 'ي', h: 'س', m: 'د' } : { d: 'd', h: 'h', m: 'm' };
  const total = Math.round(ms / MIN);
  if (total < 1) return '<1' + u.m;
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  /** @type {string[]} */
  const out = [];
  if (d) out.push(d + u.d);
  if (h) out.push(h + u.h);
  // minutes drop out once the figure is days wide: 2d 3h is enough
  if (m && !d) out.push(m + u.m);
  return out.join(' ');
}

/**
 * One bead's numbers at `now`. A running interval counts up to now (the
 * rollup's own figure is as old as its build). Buckets with no interval stay
 * null = unknown.
 *
 * @param {any} row - rollup row
 * @param {number} now
 * @returns {any}
 */
export function summarize(row, now) {
  const iv = Array.isArray(row?.intervals) ? row.intervals : [];
  /** @type {Record<string, number | null>} */
  const buckets = Object.fromEntries(BUCKETS.map((k) => [k, null]));
  /** @type {Record<string, number>} */
  const roles = {};
  // a zero-length stretch (created, then claimed in the same second) has no duration to show
  const list = iv
    .filter((/** @type {any} */ i) => i.running || i.to > i.from)
    .map((/** @type {any} */ i) => {
      const ms = i.running
        ? Math.max(0, now - i.from)
        : Math.max(0, i.to - i.from);
      buckets[i.bucket] = (buckets[i.bucket] || 0) + ms;
      roles[i.role] = (roles[i.role] || 0) + ms;
      return { ...i, ms };
    });
  const known = list.length > 0 && row.active_ms !== null;
  const active = known ? buckets.active || 0 : null;
  const waiting = known
    ? BUCKETS.filter((k) => k !== 'active').reduce(
        (s, k) => s + (buckets[k] || 0),
        0
      )
    : null;
  return {
    known,
    running: row.running === true,
    intervals: list,
    buckets,
    roles,
    active,
    waiting,
    wall: known ? (active || 0) + (waiting || 0) : null
  };
}

/** @param {any} s - role stats */
const failRate = (s) =>
  s.closed ? (s.qaFail + s.reopen + s.ownerReject) / s.closed : null;

/**
 * Closed beads in [from, to) grouped by role, listed A to Z (never ranked by
 * time). Same fields as scripts/flow/core.mjs roleReport.
 *
 * @param {any[]} rows
 * @param {{ from?: number, to?: number }} [win]
 * @returns {any[]}
 */
export function roleReport(rows, win = {}) {
  const from = win.from ?? 0;
  const to = win.to ?? Infinity;
  /** @type {Record<string, any>} */
  const by = {};
  for (const r of rows) {
    if (
      r.closed === null ||
      r.closed === undefined ||
      r.closed < from ||
      r.closed >= to
    )
      continue;
    const k = r.role || 'unknown';
    const s = (by[k] ||= {
      role: k,
      closed: 0,
      active: [],
      waiting: [],
      qaFail: 0,
      reopen: 0,
      ownerReject: 0,
      rework: 0
    });
    s.closed++;
    if (r.active_ms !== null) s.active.push(r.active_ms);
    if (r.waiting_ms !== null) s.waiting.push(r.waiting_ms);
    for (const q of ['qaFail', 'reopen', 'ownerReject', 'rework'])
      s[q] += r.quality?.[q] || 0;
  }
  return Object.keys(by)
    .sort()
    .map((k) => {
      const s = by[k];
      return {
        role: s.role,
        closed: s.closed,
        unknown: s.closed - s.active.length,
        active_median_ms: median(s.active),
        active_p90_ms: pct(s.active, 0.9),
        waiting_median_ms: median(s.waiting),
        qaFail: s.qaFail,
        reopen: s.reopen,
        ownerReject: s.ownerReject,
        rework: s.rework,
        fail_rate: failRate(s),
        enough: s.closed >= MIN_N
      };
    });
}

/**
 * Verdict key for one role across two periods. Time is never judged without
 * the fail rate beside it. Returns a string key the screen translates.
 *
 * @param {any} prev
 * @param {any} cur
 */
export function compareKey(prev, cur) {
  if (!prev || !cur || prev.closed < MIN_N || cur.closed < MIN_N) return 'few';
  if (
    prev.active_median_ms === null ||
    cur.active_median_ms === null ||
    prev.active_median_ms === 0
  )
    return 'few';
  const t = cur.active_median_ms / prev.active_median_ms;
  const q =
    prev.fail_rate > 0
      ? cur.fail_rate / prev.fail_rate
      : cur.fail_rate > 0
        ? Infinity
        : 1;
  const faster = t <= 0.8;
  const slower = t >= 1.25;
  const worse = q >= 1.25 && cur.fail_rate - prev.fail_rate >= 0.05;
  const better = q <= 0.8;
  if (faster && worse) return 'faster_worse';
  if (slower && worse) return 'slower_worse';
  if (faster && !worse) return 'faster_held';
  if (slower && better) return 'slower_better';
  if (worse) return 'worse_same';
  return 'same';
}
