import { beforeEach, describe, expect, test } from 'vitest';
import { emptyFilter } from '../../utils/board-filter.js';
import { buildBoard } from './model.js';
import { loadSaved, save } from './saved-filters.js';

const KEY = 'u3.tasks.filters';

describe('saved filters', () => {
  beforeEach(() => window.localStorage.clear());

  test('round trip, bounded and sanitised', () => {
    save({
      status: ['blocked', 'owner_decision', 'bogus'],
      assignee: ['Swe'],
      prio: ['1', '9'],
      project: ['a', 'b']
    });
    expect(loadSaved()).toMatchObject({
      status: ['blocked', 'owner_decision'],
      assignee: ['swe'],
      prio: ['1'],
      project: ['a', 'b']
    });
    window.localStorage.setItem(KEY, '{bad');
    expect(loadSaved().project).toEqual([]);
  });

  test('an old copy migrates: strings to lists, chip to a set', () => {
    /** @param {object} o */
    const old = (o) => {
      window.localStorage.setItem(KEY, JSON.stringify(o));
      return loadSaved();
    };
    expect(old({ type: 'bug', prio: '1', projects: ['x'] })).toMatchObject({
      type: ['bug'],
      prio: ['1'],
      project: ['x']
    });
    expect(old({ chip: 'mine' }).assignee).toEqual(['abdelrahman']);
    expect(old({ chip: 'p01' }).prio).toEqual(['0', '1']);
    expect(old({ chip: 'decision' }).status).toEqual(['owner_decision']);
    expect(old({ chip: 'blocked' }).status).toEqual(['blocked']);
    expect(old({ chip: 'zzz', prio: '9' })).toMatchObject({
      status: [],
      prio: []
    });
  });

  test('a cleared filter saves empty and does not come back', () => {
    save({ status: ['blocked'] });
    save({ status: [] });
    expect(loadSaved().status).toEqual([]);
  });

  test('project filter keeps only the chosen projects', () => {
    /** @param {string} id */
    const mk = (id) => ({ id, status: 'open', priority: 2, labels: [] });
    const all = [mk('a-1'), mk('b-2'), mk('b-3.1'), mk('c-4')];
    const src = { all, ready: all, blocked: [], closed: [] };
    /** @param {string[]} project */
    const count = (project) => {
      const m = buildBoard(src, { ...emptyFilter(), project });
      return Object.values(m.columns).flat().length + m.unknown.length;
    };
    expect(count([])).toBe(4);
    expect(count(['b'])).toBe(2);
    expect(count(['a', 'c'])).toBe(2);
  });

  test('epic filter keeps an epic and its children', () => {
    const items = [
      { id: 'x-1', issue_type: 'epic', status: 'open', priority: 2 },
      { id: 'x-1.1', parent: 'x-1', status: 'open', priority: 2 },
      { id: 'x-2', status: 'open', priority: 2 }
    ];
    const src = { all: items, ready: items, blocked: [], closed: [] };
    const m = buildBoard(src, { ...emptyFilter(), epic: ['x-1'] });
    expect(m.columns.ready.map((i) => i.id).sort()).toEqual(['x-1', 'x-1.1']);
    const none = buildBoard(src, { ...emptyFilter(), epic: ['-'] });
    expect(none.columns.ready.map((i) => i.id)).toEqual(['x-2']);
  });
});
