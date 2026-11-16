import { beforeEach, describe, expect, test } from 'vitest';
import {
  COL_STATUS,
  STATUS_COL,
  createFilterState,
  emptyFilter,
  facets,
  filterFromQuery,
  filterToQuery,
  isFiltering,
  matchesFilter,
  stallHoursFromQuery
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
/** @param {Record<string, string[]>} p */
const F = (p) => ({ ...emptyFilter(), ...p });

describe('filter sets', () => {
  test('empty filter passes everything', () => {
    expect(matchesFilter(a, emptyFilter())).toBe(true);
    expect(isFiltering(emptyFilter())).toBe(false);
    expect(isFiltering(F({ prio: ['1'] }))).toBe(true);
  });
  test('OR inside a dimension, AND across dimensions', () => {
    expect(matchesFilter(a, F({ prio: ['0', '1'] }))).toBe(true);
    expect(matchesFilter(b, F({ prio: ['0', '1'] }))).toBe(false);
    expect(matchesFilter(b, F({ prio: ['1', '3'] }))).toBe(true);
    expect(matchesFilter(b, F({ prio: ['1', '3'], assignee: ['qa'] }))).toBe(
      false
    );
    expect(
      matchesFilter(b, F({ assignee: ['qa', 'SWE'], type: ['task'] }))
    ).toBe(true);
  });
  test('"-" means none for assignee and epic', () => {
    const none = { id: 'x', priority: 2 };
    expect(matchesFilter(none, F({ assignee: ['-'] }))).toBe(true);
    expect(matchesFilter(b, F({ assignee: ['-'] }))).toBe(false);
    expect(matchesFilter(b, F({ assignee: ['-', 'swe'] }))).toBe(true);
    expect(matchesFilter(b, F({ epic: ['-'] }))).toBe(true);
    expect(matchesFilter(b, F({ epic: ['e-1'] }), { epic: () => 'e-1' })).toBe(
      true
    );
  });
  test('label, type and project sets; search over id, title, Arabic title', () => {
    expect(matchesFilter(a, F({ type: ['epic', 'bug'] }))).toBe(true);
    expect(matchesFilter(b, F({ label: ['ui'] }))).toBe(false);
    expect(
      matchesFilter(b, F({ project: ['co', 'x'] }), { project: () => 'co' })
    ).toBe(true);
    expect(matchesFilter(a, { ...emptyFilter(), search: 'CO-1' })).toBe(true);
    expect(matchesFilter(a, { ...emptyFilter(), search: 'سريعة' })).toBe(true);
    expect(matchesFilter(b, { ...emptyFilter(), search: 'سريعة' })).toBe(false);
  });
  test('skip leaves one dimension out; status only applies with a status reader', () => {
    expect(matchesFilter(b, F({ prio: ['0'] }), {}, 'prio')).toBe(true);
    expect(matchesFilter(b, F({ status: ['blocked'] }))).toBe(true);
    expect(
      matchesFilter(b, F({ status: ['blocked'] }), { status: () => 'open' })
    ).toBe(false);
  });
  test('facets', () => {
    expect(facets([a, b])).toMatchObject({
      types: ['epic', 'task'],
      labels: ['ui']
    });
  });
});

describe('URL round trip and migration', () => {
  test('lists, "-" and commas inside a value survive', () => {
    const f = F({
      status: ['owner_decision', 'blocked'],
      assignee: ['swe', '-'],
      label: ['a,b', 'goal:x']
    });
    const qs = filterToQuery('?stall=12&keep=1', f);
    const q = new URLSearchParams(qs);
    expect(q.get('status')).toBe('owner_decision,blocked');
    expect(q.get('assignee')).toBe('swe,-');
    expect(q.get('stall')).toBe('12');
    expect(filterFromQuery(qs)).toEqual({
      status: ['owner_decision', 'blocked'],
      assignee: ['swe', '-'],
      label: ['a,b', 'goal:x']
    });
  });
  test('old single-value links stay valid; junk is dropped and bounded', () => {
    expect(filterFromQuery('?assignee=Swe&prio=1&type=task')).toEqual({
      assignee: ['swe'],
      prio: ['1'],
      type: ['task']
    });
    expect(filterFromQuery('?prio=9&status=nope')).toEqual({});
    expect(
      filterFromQuery('?label=' + Array(200).fill('x').join(',')).label
    ).toEqual(['x']);
  });
  test('a cleared dimension leaves the URL', () => {
    expect(filterToQuery('?prio=1&assignee=swe', F({ prio: [] }))).toBe('');
    expect(stallHoursFromQuery('?stall=12')).toBe(12);
    expect(stallHoursFromQuery('?stall=-3')).toBe(24);
  });
  test('status values map to board columns and back', () => {
    for (const [st, col] of Object.entries(STATUS_COL)) {
      expect(COL_STATUS[col]).toBe(st);
    }
  });
});

describe('filter state', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  test('set writes the URL, notifies once, ignores no-ops, drops the search from nothing', () => {
    const s = createFilterState();
    let n = 0;
    s.subscribe(() => n++);
    s.set({ status: ['blocked', 'owner_decision'], search: 'abc' });
    expect(n).toBe(1);
    expect(window.location.search).toBe('?status=blocked,owner_decision');
    s.set({ status: ['blocked', 'owner_decision'] });
    expect(n).toBe(1);
    s.set({ status: ['blocked'] });
    s.set({ status: [] });
    expect(window.location.search).toBe('');
  });
  test('a reload with the URL reproduces the view (URL wins as a whole)', () => {
    window.history.replaceState(null, '', '/?status=blocked,owner_decision');
    const s = createFilterState({ prio: ['1'], assignee: ['swe'] });
    expect(s.get()).toEqual(F({ status: ['blocked', 'owner_decision'] }));
  });
  test('no URL keys: the saved copy seeds it; the search is never seeded', () => {
    const s = createFilterState({ prio: ['1'], search: 'zzz' });
    expect(s.get().prio).toEqual(['1']);
    expect(s.get().search).toBe('');
  });
});
