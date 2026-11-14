import { render } from 'lit-html';
import { afterEach, describe, expect, test } from 'vitest';
import { fixtureFor, fixtureRows } from '../data/time-fixture.js';
import { loadRollup } from '../data/time.js';
import { mount } from './time-screen.js';
import { footer, timeBody } from './time-section.js';

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (/** @type {Element} */ el) =>
  (el.textContent || '').replace(/\s+/g, ' ');

const iv = (
  /** @type {string} */ status,
  /** @type {string} */ bucket,
  /** @type {string} */ role,
  /** @type {number} */ from,
  /** @type {number | null} */ min
) => ({
  status,
  bucket,
  role,
  from,
  to: min === null ? null : from + min * MIN,
  min: min ?? 0,
  running: min === null
});
const zeroQ = { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0 };
const t0 = NOW - 400 * MIN;
/** Acceptance bead: queued 10, work 120, waiting for test 30, work 30. */
const fx1 = {
  id: 'fx-1',
  running: false,
  active_ms: 150 * MIN,
  waiting_ms: 40 * MIN,
  intervals: [
    iv('open', 'queue', 'swe', t0, 10),
    iv('in_progress', 'active', 'swe', t0 + 10 * MIN, 120),
    iv('waiting_for_test', 'test', 'swe', t0 + 130 * MIN, 30),
    iv('in_progress', 'active', 'swe', t0 + 160 * MIN, 30)
  ],
  quality: { qaFail: 1, reopen: 1, ownerReject: 1, rework: 1 },
  tokens: null
};

/** @param {any} row */
function show(row) {
  const el = document.createElement('div');
  render(timeBody(row, { now: NOW }), el);
  return el;
}

describe('task Time section', () => {
  test('interval durations, wall = active + waiting, quality chips in the head row', () => {
    const el = show(fx1);
    const t = text(el);
    expect(t).toContain('3h 10m');
    expect(t).toContain('wall 3h 10m = active 2h 30m + waiting 40m');
    const items = Array.from(el.querySelectorAll('.u3-tm__ivs li')).map((li) =>
      text(li)
    );
    expect(items).toHaveLength(4);
    expect(items[1]).toContain('2h');
    const head = /** @type {Element} */ (el.querySelector('.u3-tm__head'));
    expect(
      Array.from(head.querySelectorAll('.u3-tm__q b')).map((b) => b.textContent)
    ).toEqual(['1', '1', '1', '1']);
  });
  test('stages that never happened say unknown; tokens without a tie say unknown', () => {
    const t = text(show(fx1));
    expect(t).toContain('unknown');
    expect(t).toContain('Not tied to this task, not zero');
  });
  test('a running bead shows "running" and counts up to now', () => {
    const run = {
      running: true,
      active_ms: 1,
      waiting_ms: 0,
      intervals: [iv('in_progress', 'active', 'swe', NOW - 95 * MIN, null)],
      quality: zeroQ,
      tokens: null
    };
    const el = show(run);
    expect(text(el)).toContain('running');
    expect(text(el)).toContain('1h 35m');
  });
  test('no history: unknown total, never 0', () => {
    const el = show({
      running: true,
      active_ms: null,
      intervals: [],
      quality: zeroQ,
      tokens: null
    });
    expect(text(el)).toContain('unknown');
    expect(el.querySelector('.u3-tm__total .u3-tm__num')).toBeNull();
  });
  test('no row for the task: unknown', () => {
    expect(text(show(null))).toContain('unknown');
  });
  test('no timer, hours field or log-work button', () => {
    expect(show(fx1).querySelector('input, button, [type=number]')).toBeNull();
  });
  test('footer notes the rollup build time; sample marker only in fixture mode', () => {
    const el = document.createElement('div');
    render(footer({ built_at: '2026-11-14T10:00:00Z' }), el);
    expect(text(el)).not.toContain('Sample');
  });
});

describe('adapter', () => {
  test('no handler, or no file: empty state, not an error', async () => {
    const r1 = await loadRollup(
      {
        send: async () => {
          throw new Error('unknown_type');
        }
      },
      {}
    );
    expect(r1).toEqual({ present: false, built_at: null, rows: [] });
    const r2 = await loadRollup(
      { send: async () => ({ present: false, rows: [] }) },
      {}
    );
    expect(r2.present).toBe(false);
    expect((await loadRollup(undefined)).present).toBe(false);
  });
  test('fixture rows are well formed', () => {
    expect(fixtureRows(NOW).length).toBe(49);
    expect(fixtureFor('abc', NOW).id).toBe('abc');
  });
});

describe('role Time screen', () => {
  const closedRow = (
    /** @type {string} */ role,
    /** @type {number} */ act,
    /** @type {number} */ ageDays,
    /** @type {number} */ fail
  ) => ({
    id: role + act + ageDays + fail,
    role,
    running: false,
    closed: Date.now() - ageDays * 86_400_000,
    active_ms: act * MIN,
    waiting_ms: 10 * MIN,
    intervals: [],
    quality: { qaFail: fail, reopen: 0, ownerReject: 0, rework: fail }
  });
  /** @param {any[]} rows */
  const client = (rows) => ({
    send: async () => ({ present: true, built_at: null, rows })
  });

  test('halved time and doubled fail rate: "faster but worse", with the quality counters in the card', async () => {
    const rows = [];
    for (let i = 0; i < 10; i++)
      rows.push(closedRow('swe', 100, 40 + i, i < 2 ? 1 : 0));
    for (let i = 0; i < 10; i++)
      rows.push(closedRow('swe', 50, 1 + i, i < 4 ? 1 : 0));
    const el = document.createElement('div');
    const h = mount(el, { client: client(rows) });
    await tick();
    const card = /** @type {Element} */ (
      el.querySelector('.u3-tmr[data-role=swe]')
    );
    expect(text(card)).toContain('faster but worse');
    expect(text(card)).toContain('50m');
    expect(card.querySelectorAll('.u3-tm__q').length).toBe(5);
    expect(text(card)).toContain('40%');
    h.unmount();
  });
  test('5 closed beads: too few to tell', async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(closedRow('qa', 30, 1 + i, 0));
    const el = document.createElement('div');
    const h = mount(el, { client: client(rows) });
    await tick();
    expect(text(el)).toContain('too few to tell');
    h.unmount();
  });
  test('roles A to Z, never sorted by time; no inputs; period buttons only', async () => {
    const rows = [
      closedRow('swe', 5, 1, 0),
      closedRow('qa', 500, 1, 0),
      closedRow('cto', 50, 1, 0)
    ];
    const el = document.createElement('div');
    const h = mount(el, { client: client(rows) });
    await tick();
    expect(
      Array.from(el.querySelectorAll('.u3-tmr')).map((c) =>
        c.getAttribute('data-role')
      )
    ).toEqual(['cto', 'qa', 'swe']);
    expect(el.querySelector('input, [type=number]')).toBeNull();
    expect(el.querySelectorAll('.u3-tms__p').length).toBe(3);
    h.unmount();
  });
  test('missing rollup file: empty state, the screen still renders', async () => {
    const el = document.createElement('div');
    const h = mount(el, {
      client: { send: async () => ({ present: false, rows: [] }) }
    });
    await tick();
    expect(text(el)).toContain('No time data yet');
    expect(el.querySelector('.u3-tms__title')).not.toBeNull();
    h.unmount();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });
});

describe('running now count (.59 low: not every open bead)', () => {
  const row = (
    /** @type {string} */ id,
    /** @type {string} */ status,
    /** @type {any} */ extra = {}
  ) => ({
    id,
    role: 'swe',
    status,
    running: status !== 'closed',
    closed: null,
    active_ms: 0,
    waiting_ms: 0,
    intervals: [],
    quality: { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0 },
    ...extra
  });
  const shown = async (/** @type {any[]} */ rows) => {
    const el = document.createElement('div');
    const h = mount(el, {
      client: { send: async () => ({ present: true, built_at: null, rows }) }
    });
    await tick();
    const p = el.querySelector('[data-testid=tm-running]');
    h.unmount();
    return p ? text(p) : '';
  };
  test('no lease data: counts in_progress only, labelled "in progress"', async () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row('o' + i, 'open')),
      row('t1', 'waiting_for_test'),
      row('p1', 'in_progress'),
      row('p2', 'in_progress')
    ];
    const s = await shown(rows);
    expect(s).toContain('2 in progress');
    expect(s).not.toContain('running now');
  });
  test('lease data: only in_progress beads with a live lease count', async () => {
    const rows = [
      row('p1', 'in_progress', { lease: true }),
      row('p2', 'in_progress', { lease: false }),
      row('o1', 'open', { lease: true })
    ];
    expect(await shown(rows)).toContain('1 running now');
  });
  test('nothing in progress: no line', async () => {
    expect(await shown([row('o1', 'open')])).toBe('');
  });
});
