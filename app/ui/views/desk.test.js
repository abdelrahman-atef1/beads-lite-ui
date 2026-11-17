// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { setCardClient } from '../card/common.js';
import { mount, projectOf, splitFeed, todayMoves } from './desk.js';

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
    expect(
      el.querySelector('.dk3-steps a[href*="at=c-abcd1234"]')
    ).toBeTruthy();
    expect(el.querySelector('.dk3-moves .dk3-empty')).toBeTruthy();
    // a decision with no readable card is a link, and counted in the header
    handlers.get('decisions-all')({
      items: [],
      unanswerable: [
        { id: 'q-9', project: { key: 'q', name: 'q' }, why: 'no_card' }
      ]
    });
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(0);
    expect(el.querySelector('.dk3-main a[href*="issue=q-9"]')).toBeTruthy();
    expect(el.querySelector('.dk3-main .dk3-empty')).toBeTruthy();
    handlers.get('decisions-all')({ items: [] });
    await tick();
    expect(el.querySelector('.dk3-main a[href*="issue=q-9"]')).toBeFalsy();
    expect(el.querySelector('.dk3-main .dk3-empty')).toBeTruthy();
    h.unmount();
    expect(handlers.size).toBe(0);
  });
});

describe('desk filters', () => {
  test('Project filter narrows the cards; Status is ignored; own saved set', async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'u3.desk.filters',
      JSON.stringify({ project: ['p'], status: ['blocked'] })
    );
    // a Tasks filter never reaches the Desk
    window.localStorage.setItem(
      'u3.tasks.filters',
      JSON.stringify({ project: ['q'] })
    );
    const client = {
      /** @param {string} type */
      async send(type) {
        if (type === 'list-decisions-all') {
          return {
            items: [
              {
                id: 'p-1',
                kind: 'decision',
                title: 'A',
                metadata: {},
                priority: 1,
                project: { key: 'p' }
              },
              {
                id: 'q-1',
                kind: 'decision',
                title: 'B',
                metadata: {},
                priority: 2,
                project: { key: 'q' }
              }
            ]
          };
        }
        return { state: 'waiting', card: { q: 'Q?', opts: [] }, thread: [] };
      },
      on: () => () => {}
    };
    setCardClient(client);
    const el = /** @type {any} */ (document.createElement('div'));
    document.body.appendChild(el);
    const h = mount(el, {
      client,
      subscriptions: null,
      sub_issue_stores: null
    });
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(1);
    expect(el.querySelector('.u3t-ac[data-dim=project]')).toBeTruthy();
    expect(el.querySelector('.u3t-ac[data-dim=status]')).toBeNull();
    // remove the chip: both cards, and the saved copy is empty
    el.querySelector('[data-remove=project]').click();
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(2);
    expect(
      JSON.parse(window.localStorage.getItem('u3.desk.filters') || '{}').project
    ).toEqual([]);
    expect(window.location.search).not.toContain('project');
    // urgent chip: only priority 0/1
    el.querySelector('[data-quick="u3_tk_p01"]').click();
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(1);
    // nothing matches: say so, one tap to clear
    el.querySelector('.u3t-search').value = 'zzz';
    el.querySelector('.u3t-search').dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 200));
    expect(el.querySelector('[data-testid=no-match]')).toBeTruthy();
    el.querySelector('[data-testid=no-match-clear]').click();
    await tick();
    expect(el.querySelectorAll('.u3-cd').length).toBe(2);
    h.unmount();
  });
});

describe('desk project chip after a late feed', () => {
  test('the Project menu appears when the feed arrives after the first paint', async () => {
    window.localStorage.clear();
    /** @type {Map<string, any>} */
    const handlers = new Map();
    const feed = {
      items: ['p-1', 'q-1'].map((id) => ({
        id,
        kind: 'decision',
        title: id,
        metadata: {},
        priority: 1,
        project: { key: id[0] }
      }))
    };
    const client = {
      send: () => new Promise(() => {}), // the first fetch never answers
      on: (/** @type {string} */ t, /** @type {any} */ fn) => {
        handlers.set(t, fn);
        return () => {};
      }
    };
    setCardClient(client);
    const el = /** @type {any} */ (document.createElement('div'));
    document.body.appendChild(el);
    const h = mount(el, {
      client,
      subscriptions: null,
      sub_issue_stores: null
    });
    await tick();
    expect(
      el.querySelector('[data-menu=project], [data-dim=project]')
    ).toBeNull();
    handlers.get('decisions-all')(feed);
    await tick();
    expect(el.querySelector('.u3t-filters')?.textContent).toContain('Project');
    h.unmount();
  });
});
