import { describe, expect, test } from 'vitest';
import {
  createFilterState,
  emptyFilter,
  facets,
  isFiltering,
  matchesFilter
} from './board-filter.js';

const a = {
  id: 'co-12',
  title: 'Fast board',
  title_ar: 'لوحة سريعة',
  priority: 1,
  assignee: 'Abdelrahman',
  issue_type: 'epic',
  labels: ['ui']
};
const b = {
  id: 'co-99',
  title: 'Other',
  priority: 3,
  assignee: 'swe',
  issue_type: 'task',
  labels: []
};

describe('board-filter', () => {
  test('empty filter passes everything', () => {
    expect(matchesFilter(a, emptyFilter(), 'x')).toBe(true);
    expect(isFiltering(emptyFilter())).toBe(false);
  });
  test('chips', () => {
    expect(matchesFilter(a, { ...emptyFilter(), chip: 'p01' }, 'x')).toBe(true);
    expect(matchesFilter(b, { ...emptyFilter(), chip: 'p01' }, 'x')).toBe(
      false
    );
    expect(
      matchesFilter(a, { ...emptyFilter(), chip: 'mine' }, 'abdelrahman')
    ).toBe(true);
    expect(
      matchesFilter(b, { ...emptyFilter(), chip: 'mine' }, 'abdelrahman')
    ).toBe(false);
  });
  test('type, label and search over id, title and Arabic title', () => {
    expect(matchesFilter(a, { ...emptyFilter(), type: 'epic' }, '')).toBe(true);
    expect(matchesFilter(b, { ...emptyFilter(), type: 'epic' }, '')).toBe(
      false
    );
    expect(matchesFilter(b, { ...emptyFilter(), label: 'ui' }, '')).toBe(false);
    expect(matchesFilter(a, { ...emptyFilter(), search: 'CO-1' }, '')).toBe(
      true
    );
    expect(matchesFilter(a, { ...emptyFilter(), search: 'سريعة' }, '')).toBe(
      true
    );
    expect(matchesFilter(b, { ...emptyFilter(), search: 'سريعة' }, '')).toBe(
      false
    );
  });
  test('facets', () => {
    expect(facets([a, b])).toEqual({ types: ['epic', 'task'], labels: ['ui'] });
  });
  test('state persists chips but not the search text', () => {
    /** @type {Map<string, string>} */
    const mem = new Map();
    const storage = /** @type {any} */ ({
      getItem: (/** @type {string} */ k) => mem.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) =>
        void mem.set(k, v)
    });
    const s = createFilterState(storage);
    let n = 0;
    s.subscribe(() => n++);
    s.set({ chip: 'mine', search: 'abc' });
    expect(n).toBe(1);
    s.set({ chip: 'mine' });
    expect(n).toBe(1);
    const s2 = createFilterState(storage);
    expect(s2.get()).toEqual({ ...emptyFilter(), chip: 'mine' });
  });
});
