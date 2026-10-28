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
});
