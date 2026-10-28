import { describe, expect, test } from 'vitest';
import { createBoardData } from './board-data.js';
import { buildIndex, deriveItems, isStalled } from './board-derive.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const H = 3_600_000;
const iso = (/** @type {number} */ hoursAgo) =>
  new Date(NOW - hoursAgo * H).toISOString();

const open = [
  {
    id: 'a',
    status: 'in_progress',
    assignee: 'swe',
    started_at: iso(30),
    updated_at: iso(25),
    title: 'A'
  },
  {
    id: 'b',
    status: 'in_progress',
    assignee: 'qa',
    started_at: iso(3),
    updated_at: iso(1),
    title: 'B'
  },
  { id: 'c', status: 'open', assignee: 'pm', updated_at: iso(100), title: 'C' },
  { id: 'd', status: 'open', updated_at: iso(1), title: 'D' }
];
const blocked = [
  { id: 'c', blocked_by: ['a'] },
  { id: 'd', blocked_by: ['a', 'zzz'] }
];

describe('board-derive', () => {
  test('stalled only for in_progress past the threshold', () => {
    expect(isStalled(open[0], NOW, 24)).toBe(true);
    expect(isStalled(open[0], NOW, 48)).toBe(false);
    expect(isStalled(open[1], NOW, 24)).toBe(false);
    expect(isStalled(open[2], NOW, 24)).toBe(false);
    expect(isStalled({ status: 'in_progress' }, NOW, 24)).toBe(false);
  });

  test('blocked chains and unblock counts', () => {
    const out = deriveItems(open, buildIndex(open, blocked), NOW, 24);
    const by = Object.fromEntries(out.map((i) => [i.id, i]));
    expect(by.a.unblocks).toBe(2);
    expect(by.a.claimed_at).toBe(open[0].started_at);
    expect(by.a.stalled).toBe(true);
    expect(by.c.blocked_by_detail).toEqual([
      { id: 'a', assignee: 'swe', status: 'in_progress', title: 'A' }
    ]);
    // unknown blocker (not in the open list) still named, no crash
    expect(by.d.blocked_by_detail[1]).toEqual({
      id: 'zzz',
      assignee: '',
      status: '',
      title: ''
    });
    expect(by.b.blocked_by_detail).toEqual([]);
    expect(by.b.unblocks).toBe(0);
  });

  test('getColumn returns derived fields from the shared snapshot', async () => {
    const ok = (/** @type {unknown} */ value) => ({
      ok: /** @type {const} */ (true),
      value
    });
    const bd = createBoardData({
      now: () => NOW,
      load: async () => ({
        open: ok(open),
        closed: ok([]),
        ready: ok([]),
        blocked: ok(blocked)
      })
    });
    const col = await bd.getColumn({ type: 'in-progress-issues' });
    expect(col.ok).toBe(true);
    const items = /** @type {any[]} */ (col.ok ? col.raw : []);
    expect(items.map((i) => [i.id, i.stalled, i.unblocks])).toEqual([
      ['a', true, 2],
      ['b', false, 0]
    ]);
  });
});
