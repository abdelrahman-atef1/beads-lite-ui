import { beforeEach, describe, expect, test } from 'vitest';
import {
  groupIssues,
  loadCollapsed,
  loadGroup,
  projectOf,
  saveCollapsed,
  saveGroup
} from './lanes.js';

/** @type {(id: string, extra?: any) => any} */
const mk = (id, extra = {}) => ({
  id,
  title: id,
  status: 'open',
  issue_type: 'task',
  ...extra
});

describe('lanes', () => {
  beforeEach(() => window.localStorage.clear());

  test('none = one plain lane', () => {
    const g = groupIssues([mk('a-1'), mk('a-2')], 'none');
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('');
  });

  test('assignee: unassigned last, flagged first, totals equal', () => {
    const items = [
      mk('a-1', { assignee: 'swe', status: 'in_progress' }),
      mk('a-2', { assignee: 'qa', status: 'owner_decision' }),
      mk('a-3', { assignee: 'swe' }),
      mk('a-4')
    ];
    const g = groupIssues(items, 'assignee', {
      ready_ids: new Set(['a-3', 'a-4']),
      blocked_ids: new Set()
    });
    expect(g.map((l) => l.key)).toEqual(['qa', 'swe', '~unassigned']);
    expect(g[0].owner).toBe(1);
    expect(g.reduce((n, l) => n + l.issues.length, 0)).toBe(4);
  });

  test('project from id prefix', () => {
    expect(projectOf('rayeh-3au7.4')).toBe('rayeh');
    expect(projectOf('beads-lite-1bo5.6.59.10')).toBe('beads-lite');
  });

  test('epic: task under story under epic lands in the epic lane', () => {
    const e = mk('p-e', { issue_type: 'epic', title: 'Epic' });
    const s = mk('p-s', { issue_type: 'story', parent: 'p-e' });
    const t = mk('p-t', { parent: 'p-s' });
    const n = mk('p-n');
    const g = groupIssues([t, n], 'epic', { all: [e, s, t, n] });
    expect(g.map((l) => l.key)).toEqual(['p-e', '~noepic']);
    expect(g[0].label).toBe('Epic');
  });

  test('more than 20 lanes merge the rest into Others', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      mk('p' + i + '-1', { assignee: 'u' + i })
    );
    const g = groupIssues(items, 'assignee');
    expect(g).toHaveLength(21);
    expect(g[20].key).toBe('~others');
    expect(g[20].issues).toHaveLength(10);
  });

  test('grouping and collapsed lanes persist', () => {
    saveGroup('epic');
    saveCollapsed(new Set(['epic:p-e']));
    expect(loadGroup()).toBe('epic');
    expect([...loadCollapsed()]).toEqual(['epic:p-e']);
    window.localStorage.setItem('beads-ui.u3.tasks.group', 'zzz');
    expect(loadGroup()).toBe('none');
  });
});

describe('lane counts add up (beads-lite-1bo5.13.23)', () => {
  test('every issue is counted once: lane chips = column cards + unknown', () => {
    const statuses = [
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'owner_decision',
      'waiting_for_test',
      'waiting_for_merge',
      'weird_x'
    ];
    const items = statuses.flatMap((st, k) =>
      [0, 1, 2].map((n) =>
        mk('p' + (k % 3) + '-' + k + n, {
          status: st,
          assignee: n === 2 ? '' : 'swe'
        })
      )
    );
    items.push(mk('p0-dep', { status: 'open' }));
    const blocked = new Set(['p0-dep']);
    for (const by of /** @type {const} */ (['none', 'project', 'assignee'])) {
      const lanes = groupIssues(items, by, { blocked_ids: blocked });
      const chips = lanes.reduce((n, l) => n + l.issues.length, 0);
      const cards = lanes.reduce((n, l) => {
        const s = /** @type {any} */ (l.s);
        const cols = Object.values(s.columns).reduce(
          (a, c) => a + /** @type {any[]} */ (c).length,
          0
        );
        return n + cols + s.unknown.length;
      }, 0);
      expect(chips).toBe(items.length);
      expect(cards).toBe(items.length);
    }
  });
});
