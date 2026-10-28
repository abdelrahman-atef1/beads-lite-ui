import { describe, expect, test, vi } from 'vitest';
import { fetchListForSubscription, slimBoardItems } from './list-adapters.js';
import { runBdJson } from './bd.js';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn() }));

function fat(i) {
  return {
    id: `x-${i}`,
    title: `Title ${i}`,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    labels: ['a'],
    assignee: 'swe',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    dependency_count: 1,
    dependent_count: 0,
    description: 'd'.repeat(1500),
    design: 'g'.repeat(3000),
    notes: 'n'.repeat(800),
    acceptance_criteria: 'a'.repeat(300),
    comments: Array.from({ length: 5 }, () => ({ text: 'c'.repeat(400) })),
    metadata: { card_q: 'Q?', title_ar: 'عنوان', big: 'z'.repeat(2000) }
  };
}

describe('board payload', () => {
  test('keeps card fields, drops detail-only fields', () => {
    const [it] = slimBoardItems([fat(1)]);
    expect(it.title).toBe('Title 1');
    expect(it.dependency_count).toBe(1);
    expect(it.metadata).toEqual({ card_q: 'Q?', title_ar: 'عنوان' });
    for (const k of ['description', 'design', 'notes', 'comments', 'acceptance_criteria']) {
      expect(k in it).toBe(false);
    }
  });

  test('600 fat beads serialise under 250 KB', async () => {
    const raw = Array.from({ length: 600 }, (_, i) => fat(i));
    vi.mocked(runBdJson).mockResolvedValue({ code: 0, stdoutJson: raw });
    const before = JSON.stringify(raw).length;
    const res = await fetchListForSubscription({ type: 'ready-issues' }, {});
    expect(res.ok).toBe(true);
    const after = JSON.stringify(res.items).length;
    expect(before).toBeGreaterThan(5_000_000);
    expect(after).toBeLessThan(250_000);
  });

  test('keeps the derived card fields', () => {
    const [it] = slimBoardItems([
      {
        ...fat(1),
        claimed_at: '2026-10-01T00:00:00Z',
        stalled: true,
        blocked_by_detail: [{ id: 'x-2', assignee: 'a', status: 'open', title: 't' }],
        unblocks: 3
      }
    ]);
    expect(it.claimed_at).toBe('2026-10-01T00:00:00Z');
    expect(it.stalled).toBe(true);
    expect(it.blocked_by_detail).toHaveLength(1);
    expect(it.unblocks).toBe(3);
  });

  test('derived fields survive the full path (fetchListForSubscription)', async () => {
    const a = {
      ...fat(1),
      id: 'A',
      status: 'in_progress',
      updated_at: '2020-01-01T00:00:00Z',
      started_at: '2020-01-01T00:00:00Z',
      blocked_by: ['B']
    };
    const b = { ...fat(2), id: 'B', status: 'open', assignee: 'qa' };
    vi.mocked(runBdJson).mockResolvedValue({ code: 0, stdoutJson: [a, b] });
    const res = await fetchListForSubscription(
      { type: 'in-progress-issues' },
      { cwd: 'derive-test' }
    );
    expect(res.ok).toBe(true);
    const it = res.items.find((x) => x.id === 'A');
    expect(it.claimed_at).toBe('2020-01-01T00:00:00Z');
    expect(it.stalled).toBe(true);
    expect(it.blocked_by_detail).toEqual([
      { id: 'B', assignee: 'qa', status: 'open', title: 'Title 2' }
    ]);
    expect(it.unblocks).toBe(0);
    const bb = res.items.find((x) => x.id === 'B');
    expect(bb).toBeUndefined();
  });
});
