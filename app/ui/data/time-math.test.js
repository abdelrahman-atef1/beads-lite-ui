import { describe, expect, test } from 'vitest';
import {
  compareKey,
  fmtDur,
  median,
  pct,
  roleReport,
  summarize
} from './time-math.js';

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const row = (
  /** @type {string} */ role,
  /** @type {number} */ activeMin,
  /** @type {number} */ closedAt,
  /** @type {any} */ q = {}
) => ({
  id: role + activeMin + closedAt,
  role,
  closed: closedAt,
  active_ms: activeMin * MIN,
  waiting_ms: 10 * MIN,
  quality: { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0, ...q }
});

describe('summarize', () => {
  const iv = (
    /** @type {string} */ bucket,
    /** @type {string} */ role,
    /** @type {number} */ from,
    /** @type {number | null} */ to
  ) => ({
    status: 'x',
    bucket,
    role,
    from,
    to,
    min: 0,
    running: to === null
  });
  test('intervals to the minute; wall = active + waiting; role of each interval', () => {
    const t0 = NOW - 300 * MIN;
    const r = {
      running: false,
      active_ms: 1,
      intervals: [
        iv('queue', 'swe', t0, t0 + 10 * MIN),
        iv('active', 'swe', t0 + 10 * MIN, t0 + 130 * MIN),
        iv('test', 'qa', t0 + 130 * MIN, t0 + 160 * MIN),
        iv('active', 'swe', t0 + 160 * MIN, t0 + 190 * MIN)
      ]
    };
    const s = summarize(r, NOW);
    expect(s.active / MIN).toBe(150);
    expect(s.waiting / MIN).toBe(40);
    expect(s.wall).toBe(s.active + s.waiting);
    expect(s.wall / MIN).toBe(190);
    expect(s.roles.swe / MIN).toBe(160);
    expect(s.roles.qa / MIN).toBe(30);
    expect(s.buckets.owner).toBeNull(); // unknown, not 0
  });
  test('a running interval counts up to now', () => {
    const r = {
      running: true,
      active_ms: 1,
      intervals: [iv('active', 'swe', NOW - 95 * MIN, null)]
    };
    const s = summarize(r, NOW);
    expect(s.active / MIN).toBe(95);
    expect(summarize(r, NOW + 5 * MIN).active / MIN).toBe(100);
    expect(s.running).toBe(true);
  });
  test('no history is unknown, never 0', () => {
    const s = summarize({ running: true, active_ms: null, intervals: [] }, NOW);
    expect(s.known).toBe(false);
    expect(s.wall).toBeNull();
    expect(s.active).toBeNull();
  });
});

describe('fmtDur', () => {
  test('western digits, both languages', () => {
    expect(fmtDur(130 * MIN, 'en')).toBe('2h 10m');
    expect(fmtDur(130 * MIN, 'ar')).toBe('2س 10د');
    expect(fmtDur(20_000, 'en')).toBe('<1m');
    expect(fmtDur(27 * 60 * MIN, 'en')).toBe('1d 3h');
    expect(fmtDur(null, 'en')).toBe('');
  });
});

describe('roleReport against a hand-computed fixture (21 beads, 3 roles)', () => {
  const day = 86_400_000;
  const at = (/** @type {number} */ d) => NOW - d * day;
  // qa: 7 beads 10..70 min; sre: 7 beads 20,20,20,40,40,60,200; swe: 7 beads 30..90 step 10 with 2 fails 1 reopen 1 owner
  const rows = [
    ...[10, 20, 30, 40, 50, 60, 70].map((m, i) => row('qa', m, at(1 + i))),
    ...[20, 20, 20, 40, 40, 60, 200].map((m, i) => row('sre', m, at(1 + i))),
    ...[30, 40, 50, 60, 70, 80, 90].map((m, i) =>
      row(
        'swe',
        m,
        at(1 + i),
        i === 0
          ? { qaFail: 2, rework: 2 }
          : i === 1
            ? { reopen: 1, ownerReject: 1, rework: 1 }
            : {}
      )
    ),
    row('swe', 5, at(40)) // outside the window
  ];
  const rep = roleReport(rows, { from: at(30), to: NOW + 1 });
  test('listed A to Z, one entry per role', () => {
    expect(rep.map((r) => r.role)).toEqual(['qa', 'sre', 'swe']);
  });
  test('closed, median, p90, waiting', () => {
    const qa = rep[0];
    expect(qa.closed).toBe(7);
    expect(qa.active_median_ms / MIN).toBe(40);
    expect(qa.active_p90_ms / MIN).toBe(70);
    expect(qa.waiting_median_ms / MIN).toBe(10);
    const sre = rep[1];
    expect(sre.active_median_ms / MIN).toBe(40);
    expect(sre.active_p90_ms / MIN).toBe(200);
  });
  test('quality counters sit with the role; fail rate = (qa + reopen + owner) / closed', () => {
    const swe = rep[2];
    expect(swe).toMatchObject({
      closed: 7,
      qaFail: 2,
      reopen: 1,
      ownerReject: 1,
      rework: 3,
      enough: false
    });
    expect(swe.fail_rate).toBeCloseTo(4 / 7);
  });
});

describe('compareKey', () => {
  const stat = (
    /** @type {number} */ closed,
    /** @type {number} */ med,
    /** @type {number} */ fails
  ) => ({
    closed,
    active_median_ms: med * MIN,
    fail_rate: fails / closed
  });
  test('halved time with doubled fail rate is "faster_worse"', () => {
    expect(compareKey(stat(10, 100, 1), stat(10, 50, 3))).toBe('faster_worse');
  });
  test('halved time, same quality is "faster_held"', () => {
    expect(compareKey(stat(10, 100, 1), stat(10, 50, 1))).toBe('faster_held');
  });
  test('slower but fewer fails', () => {
    expect(compareKey(stat(10, 100, 4), stat(10, 140, 1))).toBe(
      'slower_better'
    );
  });
  test('under 8 closed in either period is "few"', () => {
    expect(compareKey(stat(5, 100, 1), stat(10, 50, 3))).toBe('few');
    expect(compareKey(undefined, stat(10, 50, 3))).toBe('few');
  });
});

describe('percentiles', () => {
  test('empty is null, not 0', () => {
    expect(median([])).toBeNull();
    expect(pct([], 0.9)).toBeNull();
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
});
