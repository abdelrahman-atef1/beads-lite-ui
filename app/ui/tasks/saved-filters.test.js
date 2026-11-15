import { beforeEach, describe, expect, test } from 'vitest';
import { emptyFilter } from '../../utils/board-filter.js';
import { buildBoard } from './model.js';
import { loadSaved, save } from './saved-filters.js';

describe('saved filters', () => {
  beforeEach(() => window.localStorage.clear());

  test('round trip, bounded and sanitised', () => {
    save({
      chip: 'mine',
      type: 'bug',
      label: 'x',
      assignee: 'swe',
      prio: '1',
      projects: ['a', 'b']
    });
    expect(loadSaved()).toMatchObject({
      chip: 'mine',
      prio: '1',
      projects: ['a', 'b']
    });
    window.localStorage.setItem(
      'u3.tasks.filters',
      JSON.stringify({ chip: 'zzz', prio: '9', projects: [1, 'ok'] })
    );
    const s = loadSaved();
    expect(s.chip).toBe('all');
    expect(s.prio).toBe('');
    expect(s.projects).toEqual(['ok']);
    window.localStorage.setItem('u3.tasks.filters', '{bad');
    expect(loadSaved().projects).toEqual([]);
  });

  test('project filter keeps only the chosen projects', () => {
    const mk = (id) => ({ id, status: 'open', priority: 2, labels: [] });
    const all = [mk('a-1'), mk('b-2'), mk('b-3.1'), mk('c-4')];
    const src = { all, ready: all, blocked: [], closed: [] };
    const count = (projects) => {
      const m = buildBoard(src, { ...emptyFilter(), projects }, 'me');
      return Object.values(m.columns).flat().length + m.other.length;
    };
    expect(count([])).toBe(4);
    expect(count(['b'])).toBe(2);
    expect(count(['a', 'c'])).toBe(2);
  });
});
