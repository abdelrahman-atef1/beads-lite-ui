import { describe, expect, test } from 'vitest';
import { createBoardData } from './board-data.js';

/** @param {unknown} value */
const ok = (value) => ({ ok: /** @type {const} */ (true), value });

function issues() {
  return [
    { id: 'A', status: 'open' },
    { id: 'B', status: 'in_progress' },
    { id: 'C', status: 'owner_decision' },
    { id: 'D', status: 'waiting_for_test' },
    { id: 'E', status: 'waiting_for_merge' },
    { id: 'F', status: 'blocked' },
    { id: 'G', status: 'in_review' }
  ];
}

function makeLoad() {
  const state = { calls: 0, gate: /** @type {null | Promise<void>} */ (null) };
  const load = async () => {
    state.calls += 1;
    if (state.gate) {
      await state.gate;
    }
    return {
      open: ok(issues()),
      closed: ok([{ id: 'Z', status: 'closed' }]),
      ready: ok([{ id: 'A', status: 'open' }]),
      blocked: ok([{ id: 'F', status: 'blocked' }])
    };
  };
  return { state, load };
}

/** @param {any} col */
const ids = (col) => col.raw.map((/** @type {any} */ i) => i.id);

describe('board data layer', () => {
  test('all columns share one load and are split by status', async () => {
    const { state, load } = makeLoad();
    const bd = createBoardData({ load });
    const types = [
      'in-progress-issues',
      'owner-decision-issues',
      'waiting-for-test-issues',
      'waiting-for-merge-issues',
      'status-blocked-issues',
      'closed-issues',
      'ready-issues',
      'blocked-issues',
      'all-issues'
    ];
    const cols = await Promise.all(types.map((type) => bd.getColumn({ type })));
    expect(state.calls).toBe(1);
    expect(cols.map(ids)).toEqual([
      ['B'],
      ['C'],
      ['D'],
      ['E'],
      ['F'],
      ['Z'],
      ['A'],
      ['F'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    ]);
  });

  test('custom status column via status-issues', async () => {
    const { load } = makeLoad();
    const bd = createBoardData({ load });
    const col = await bd.getColumn({
      type: 'status-issues',
      params: { status: 'in_review' }
    });
    expect(ids(col)).toEqual(['G']);
    const bad = await bd.getColumn({
      type: 'status-issues',
      params: { status: 'x; rm -rf' }
    });
    expect(bad.ok).toBe(false);
  });

  test('concurrent callers during a load share it; reuse within the ttl', async () => {
    const { state, load } = makeLoad();
    /** @type {() => void} */
    let release = () => {};
    state.gate = new Promise((r) => (release = r));
    let t = 0;
    const bd = createBoardData({ load, ttl_ms: 1000, now: () => t });
    const a = bd.getColumn({ type: 'ready-issues' });
    const b = bd.getColumn({ type: 'closed-issues' });
    release();
    await Promise.all([a, b]);
    expect(state.calls).toBe(1);
    t = 500;
    await bd.getColumn({ type: 'ready-issues' });
    expect(state.calls).toBe(1);
    t = 1500;
    await bd.getColumn({ type: 'ready-issues' });
    expect(state.calls).toBe(2);
  });

  test('a change during a load gives exactly one more load, never two at once', async () => {
    const { state, load } = makeLoad();
    /** @type {() => void} */
    let release = () => {};
    state.gate = new Promise((r) => (release = r));
    let running = 0;
    let max_running = 0;
    const counted = async () => {
      running += 1;
      max_running = Math.max(max_running, running);
      try {
        return await load();
      } finally {
        running -= 1;
      }
    };
    const bd = createBoardData({ load: counted, ttl_ms: 60000 });
    const first = bd.getColumn({ type: 'ready-issues' });
    bd.invalidate();
    bd.invalidate();
    const second = bd.getColumn({ type: 'ready-issues' });
    const third = bd.getColumn({ type: 'closed-issues' });
    state.gate = null;
    release();
    await Promise.all([first, second, third]);
    expect(state.calls).toBe(2);
    expect(max_running).toBe(1);
  });

  test('a load that started before a change is not cached', async () => {
    const { state, load } = makeLoad();
    /** @type {() => void} */
    let release = () => {};
    state.gate = new Promise((r) => (release = r));
    const bd = createBoardData({ load, ttl_ms: 60000 });
    const first = bd.getColumn({ type: 'ready-issues' });
    bd.invalidate();
    state.gate = null;
    release();
    await first;
    await bd.getColumn({ type: 'ready-issues' });
    expect(state.calls).toBe(2);
  });

  test('one failing call degrades only its own column', async () => {
    const bd = createBoardData({
      load: async () => ({
        open: ok(issues()),
        closed: ok([]),
        ready: { ok: false, code: 1, stderr: 'boom' },
        blocked: ok([])
      })
    });
    const ready = await bd.getColumn({ type: 'ready-issues' });
    expect(ready.ok).toBe(false);
    const prog = await bd.getColumn({ type: 'in-progress-issues' });
    expect(prog.ok).toBe(true);
  });

  test('watched workspace is served from memory until invalidated; others use the short ttl', async () => {
    const { state, load } = makeLoad();
    let t = 0;
    const bd = createBoardData({ load, now: () => t, ttl_ms: 1000 });
    bd.watch('/w');
    await bd.getSnapshot({ cwd: '/w' });
    t = 60_000;
    await bd.getSnapshot({ cwd: '/w' });
    expect(state.calls).toBe(1);
    bd.invalidate();
    await bd.getSnapshot({ cwd: '/w' });
    expect(state.calls).toBe(2);
    await bd.getSnapshot({ cwd: '/other' });
    t = 70_000;
    await bd.getSnapshot({ cwd: '/other' });
    expect(state.calls).toBe(4);
  });

  test('allow_stale answers at once from the last snapshot and revalidates once', async () => {
    const { state, load } = makeLoad();
    const bd = createBoardData({ load });
    let revalidated = 0;
    bd.onRevalidated = () => {
      revalidated += 1;
    };
    await bd.getColumn({ type: 'ready-issues' }, {});
    expect(state.calls).toBe(1);
    bd.invalidate();
    let release = () => {};
    state.gate = new Promise((r) => (release = () => r()));
    const a = await bd.getColumn(
      { type: 'ready-issues' },
      { allow_stale: true }
    );
    const b = await bd.getColumn(
      { type: 'closed-issues' },
      { allow_stale: true }
    );
    expect(ids(a)).toEqual(['A']);
    expect(ids(b)).toEqual(['Z']);
    expect(state.calls).toBe(2);
    expect(revalidated).toBe(0);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(revalidated).toBe(1);
    expect(state.calls).toBe(2);
    // without allow_stale a stale snapshot is never returned
    bd.invalidate();
    state.gate = null;
    await bd.getColumn({ type: 'ready-issues' }, {});
    expect(state.calls).toBe(3);
  });
});
