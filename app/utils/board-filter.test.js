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
    expect(facets([a, b])).toMatchObject({
      types: ['epic', 'task'],
      labels: ['ui']
    });
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

describe('P1 filters: assignee, priority, URL state', () => {
  const base = {
    chip: 'all',
    type: '',
    label: '',
    search: '',
    assignee: '',
    prio: ''
  };
  test('assignee, priority and "-" (any assigned) match', async () => {
    const { matchesFilter } = await import('./board-filter.js');
    const it = { id: 'x', assignee: 'Swe', priority: 1 };
    expect(matchesFilter(it, { ...base, assignee: 'swe' }, 'me')).toBe(true);
    expect(matchesFilter(it, { ...base, assignee: 'qa' }, 'me')).toBe(false);
    expect(matchesFilter(it, { ...base, prio: '1' }, 'me')).toBe(true);
    expect(
      matchesFilter({ ...it, priority: 0 }, { ...base, prio: '0' }, 'me')
    ).toBe(true);
    expect(matchesFilter(it, { ...base, prio: '2' }, 'me')).toBe(false);
  });
  test('query round trip keeps other params and bounds values', async () => {
    const { filterFromQuery, filterToQuery, stallHoursFromQuery } =
      await import('./board-filter.js');
    expect(
      filterFromQuery('?assignee=swe&type=task&prio=1&label=goal:x&prio=9')
    ).toMatchObject({
      assignee: 'swe',
      type: 'task',
      prio: '1',
      label: 'goal:x'
    });
    expect(filterFromQuery('?prio=9')).toEqual({});
    const qs = filterToQuery('?stall=12&type=bug', {
      ...base,
      assignee: 'swe',
      prio: '0'
    });
    expect(new URLSearchParams(qs).get('stall')).toBe('12');
    expect(new URLSearchParams(qs).get('type')).toBe(null);
    expect(new URLSearchParams(qs).get('assignee')).toBe('swe');
    expect(new URLSearchParams(qs).get('prio')).toBe('0');
    expect(stallHoursFromQuery('?stall=12')).toBe(12);
    expect(stallHoursFromQuery('?stall=-3')).toBe(24);
  });
});

describe('needs-decision and blocked chips', () => {
  const dec = { id: 'D-1', status: 'owner_decision', priority: 2 };
  const blk = { id: 'B-1', status: 'blocked', priority: 2 };
  const dep = { id: 'B-2', status: 'open', priority: 2 };
  const waiting = {
    id: 'B-3',
    status: 'open',
    blocked_by_detail: [{ id: 'X-1' }]
  };
  const open = { id: 'O-1', status: 'open', priority: 2 };

  test('decision chip keeps only owner_decision', () => {
    const f = { ...emptyFilter(), chip: /** @type {const} */ ('decision') };
    expect(matchesFilter(dec, f, 'x')).toBe(true);
    expect(matchesFilter(open, f, 'x')).toBe(false);
    expect(matchesFilter(blk, f, 'x')).toBe(false);
  });

  test('blocked chip keeps status blocked, dependency-blocked and listed ids', () => {
    const f = { ...emptyFilter(), chip: /** @type {const} */ ('blocked') };
    expect(matchesFilter(blk, f, 'x')).toBe(true);
    expect(matchesFilter(waiting, f, 'x')).toBe(true);
    expect(matchesFilter(dep, f, 'x', new Set(['B-2']))).toBe(true);
    expect(matchesFilter(dep, f, 'x')).toBe(false);
    expect(matchesFilter(open, f, 'x', new Set(['B-2']))).toBe(false);
  });

  test('both chips persist across a reload', () => {
    const mem = new Map();
    const storage = /** @type {any} */ ({
      getItem: (/** @type {string} */ k) => mem.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) =>
        mem.set(k, v)
    });
    for (const chip of /** @type {const} */ (['decision', 'blocked'])) {
      createFilterState(storage).set({ chip });
      expect(createFilterState(storage).get().chip).toBe(chip);
    }
  });
});
