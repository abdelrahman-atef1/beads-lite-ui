// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { mount, projectOf, splitFeed, todayMoves } from './desk.js';
import { setCardClient } from '../card/common.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('desk helpers', () => {
  test('splitFeed separates steps from decisions', () => {
    const r = splitFeed([
      { id: 'a', kind: 'decision' },
      { id: 'b', kind: 'steps' },
      { id: 'c' }
    ]);
    expect(r.decisions.map((i) => i.id)).toEqual(['a', 'c']);
    expect(r.steps.map((i) => i.id)).toEqual(['b']);
    expect(splitFeed(/** @type {any} */ (null))).toEqual({
      decisions: [],
      steps: []
    });
  });
  test('todayMoves keeps only today, newest first', () => {
    const now = new Date(2026, 10, 14, 15, 0).getTime();
    const out = todayMoves(
      [
        { id: 'old', updated_at: now - 2 * 86400000 },
        { id: 'a', updated_at: now - 3600000 },
        { id: 'b', updated_at: now - 60000 }
      ],
      now
    );
    expect(out.map((i) => i.id)).toEqual(['b', 'a']);
  });
  test('projectOf drops the task suffix', () => {
    expect(projectOf('beads-lite-1bo5.6.59')).toBe('beads-lite');
    expect(projectOf('fatura-juh.405.17')).toBe('fatura');
  });
});

describe('desk view', () => {
  test('draws decisions, steps and moves; push removes an answered card', async () => {
    const handlers = new Map();
    const client = {
      /** @param {string} type */
      async send(type) {
        if (type === 'list-decisions-all') {
          return {
            items: [
              {
                id: 'p-1',
                kind: 'decision',
                title: 'Q?',
                metadata: { card_q: 'Q?' },
                project: { key: 'p', name: 'p' }
              },
              {
                id: 'p-2',
                kind: 'steps',
                title: 'S',
                project: { key: 'p', name: 'p' },
                steps: { comment: 'c-abcd1234', title: 'Do it', n: 2, at: '' }
              }
            ]
          };
        }
        return { state: 'waiting', card: { q: 'Q?', opts: [] }, thread: [] };
      },
      /** @param {string} t @param {Function} fn */
      on(t, fn) {
        handlers.set(t, fn);
        return () => handlers.delete(t);
      }
    };
    setCardClient(client);
    const base = {
      client,
      subscriptions: null,
      sub_issue_stores: null
    };
    const el = document.createElement('div');
    const h = mount(el, base);
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(2);
    expect(el.querySelector('[data-kind=steps]')).toBeTruthy();
    expect(el.querySelector('.dk3-steps a[href*="at=c-abcd1234"]')).toBeTruthy();
    expect(el.querySelector('.dk3-moves .dk3-empty')).toBeTruthy();
    handlers.get('decisions-all')({ items: [] });
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(0);
    expect(el.querySelector('.dk3-main .dk3-empty')).toBeTruthy();
    h.unmount();
    expect(handlers.size).toBe(0);
  });
});
