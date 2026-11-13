import { describe, expect, test } from 'vitest';
import { parseRoute } from './routes.js';

describe('v3 routes keep the legacy hash grammar', () => {
  test.each([
    ['', 'desk'],
    ['#', 'desk'],
    ['#/', 'desk'],
    ['#/decisions', 'desk'],
    ['#/board', 'tasks'],
    ['#/issues', 'tasks'],
    ['#/epics', 'tasks'],
    ['#/releases', 'releases'],
    ['#/time', 'time'],
    ['#/projects', 'projects'],
    ['#/settings', 'settings'],
    ['#/ui-kit', 'ui-kit']
  ])('%s -> %s', (hash, name) => {
    expect(parseRoute(hash).name).toBe(name);
  });

  test('owner bead links open the task and carry the target', () => {
    const r = parseRoute('#/issues?issue=beads-lite-1bo5.6.59.2&at=c-last');
    expect(r).toMatchObject({
      name: 'task',
      id: 'beads-lite-1bo5.6.59.2',
      at: 'c-last'
    });
    expect(parseRoute('#/decisions?issue=x-1&at=card').name).toBe('task');
    expect(parseRoute('#/board?issue=x-1&at=c-3a9f0c1d').at).toBe('c-3a9f0c1d');
  });

  test('old #/issue/<id> form opens the task', () => {
    expect(parseRoute('#/issue/abc-1')).toMatchObject({
      name: 'task',
      id: 'abc-1'
    });
  });

  test('board mode is kept for the tasks screen', () => {
    expect(parseRoute('#/board').mode).toBe('board');
    expect(parseRoute('#/epics').mode).toBe('epics');
  });
});
