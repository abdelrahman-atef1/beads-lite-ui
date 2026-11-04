import { describe, expect, test } from 'vitest';
import { deriveActors, parseSteps, progress, weightOf } from './progress.js';

describe('weightOf', () => {
  test('default by priority', () => {
    expect([0, 1, 2, 3, 4].map((p) => weightOf(p))).toEqual([8, 5, 3, 2, 1]);
    expect(weightOf(undefined)).toBe(3);
  });
  test('explicit wins (number or numeric string)', () => {
    expect(weightOf(4, 13)).toBe(13);
    expect(weightOf(0, '2')).toBe(2);
  });
  test('invalid falls back to the priority default, never throws', () => {
    for (const bad of [0, -1, 22, 2.5, 'abc', NaN, null, {}, [], true]) {
      expect(weightOf(1, bad)).toBe(5);
    }
  });
});

describe('progress', () => {
  const kids = [
    { id: 'a', status: 'closed', priority: 0 },
    { id: 'b', status: 'open', priority: 2 },
    { id: 'c', status: 'in_progress', priority: 1 },
    { id: 'd', status: 'deferred', priority: 0 }
  ];
  test('closed weight / total, in-progress 0, deferred out', () => {
    expect(progress(kids, [])).toEqual({ done: 8, total: 16, pct: 50 });
  });
  test('explicit weights by id', () => {
    expect(progress(kids, [], { a: 1, b: 21 })).toEqual({
      done: 1,
      total: 27,
      pct: 4
    });
  });
  test('empty is 0/0', () => {
    expect(progress([], [])).toEqual({ done: 0, total: 0, pct: 0 });
  });
  test('children and steps share one bar; children capped at 200', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      id: `k${i}`,
      status: 'open',
      priority: 4
    }));
    expect(progress(many, []).total).toBe(200);
    expect(progress([], parseSteps('- [x] (3) a\n- [ ] b'))).toEqual({
      done: 3,
      total: 4,
      pct: 75
    });
  });
});

describe('parseSteps', () => {
  test('parses weights, defaults to 1, ignores bad weights', () => {
    expect(parseSteps('- [ ] one\n* [x] (5) two\n- [ ] (99) three')).toEqual([
      { weight: 1, done: false },
      { weight: 5, done: true },
      { weight: 1, done: false }
    ]);
  });
  test('only the texts passed in (design is never passed)', () => {
    expect(parseSteps('plain', undefined, null)).toEqual([]);
    expect(parseSteps('x', '- [x] ok')).toHaveLength(1);
  });
});

describe('deriveActors', () => {
  const role = (/** @type {string} */ a) => ['swe', 'cos', 'cto'].includes(a);
  test('assignee first, then newest commenter; created_by only if a role', () => {
    const out = deriveActors(
      { assignee: 'cto', created_by: 'cos', owner: 'x@y.com' },
      [{ author: 'swe' }, { author: 'cos' }, { author: 'swe' }],
      role
    );
    expect(out).toEqual(['cto', 'swe', 'cos']);
  });
  test('no data gives empty', () => {
    expect(deriveActors({}, [], role)).toEqual([]);
  });
});
