import { describe, expect, test } from 'vitest';
import { createListSelectors } from '../../data/list-selectors.js';
import { createSubscriptionIssueStores } from '../../data/subscription-issue-stores.js';
import { mount as mountTasks } from './tasks.js';

const IDS = {
  'tab:all': { type: 'all-issues' },
  'tab:board:ready': { type: 'ready-issues' },
  'tab:board:blocked': { type: 'blocked-issues' },
  'tab:board:closed': { type: 'closed-issues' }
};
const STATUSES = [
  'owner_decision',
  'in_progress',
  'waiting_for_test',
  'waiting_for_merge',
  'open',
  'blocked',
  'weird'
];
const flush = () => new Promise((r) => setTimeout(r, 80));
/**
 * Wait (bounded) until the rest-of-cards paint has landed.
 *
 * @param {HTMLElement} a
 * @param {number} n
 */
async function until(a, n) {
  for (let i = 0; i < 100; i++) {
    if (a.querySelectorAll('.u3t-board .u3t-card').length >= n) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** @param {number} n */
function fixture(n) {
  const all = [];
  /** @type {any[]} */
  const ready = [];
  /** @type {any[]} */
  const blocked = [];
  for (let i = 0; i < n; i++) {
    const st = STATUSES[i % STATUSES.length];
    const it = {
      id: `x-${i}`,
      title: `Task ${i}`,
      status: st,
      priority: i % 5,
      issue_type: i % 3 ? 'task' : 'bug',
      assignee: ['swe', 'qa', ''][i % 3],
      labels: i % 4 ? ['a'] : ['b'],
      created_at: 1000 + i,
      updated_at: 2000 + i
    };
    all.push(it);
    if (st === 'open') (i % 2 ? ready : blocked).push(it);
  }
  const closed = Array.from({ length: 120 }, (_, i) => ({
    id: `c-${i}`,
    title: `Closed ${i}`,
    status: 'closed',
    priority: 2,
    closed_at: 5000 + i,
    created_at: 1,
    updated_at: 5000 + i
  }));
  return { all, ready, blocked, closed };
}

/** @param {number} [n] @param {any} [extra] */
function setup(n = 200, extra = {}) {
  document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  const stores = createSubscriptionIssueStores();
  for (const [id, spec] of Object.entries(IDS)) stores.register(id, spec);
  const f = fixture(n);
  const lists = {
    'tab:all': f.all,
    'tab:board:ready': f.ready,
    'tab:board:blocked': f.blocked,
    'tab:board:closed': f.closed
  };
  for (const [id, issues] of Object.entries(lists)) {
    /** @type {any} */ (stores.getStore(id)).applyPush({
      type: 'snapshot',
      id,
      revision: 1,
      issues
    });
  }
  const subs = { subscribeList: async () => async () => {} };
  const a = /** @type {HTMLElement} */ (document.getElementById('a'));
  const h = mountTasks(a, {
    sub_issue_stores: stores,
    subscriptions: subs,
    listSelectors: createListSelectors(/** @type {any} */ (stores)),
    ...extra
  });
  return { a, h };
}

/**
 * @param {HTMLElement} root
 * @param {string} sel
 */
function col(root, sel) {
  return Array.from(root.querySelectorAll(sel)).map((e) =>
    e.getAttribute('data-issue-id')
  );
}

const MAP = {
  owner: 'owner',
  progress: 'progress',
  test: 'test',
  merge: 'merge',
  ready: 'ready',
  blocked: 'blocked',
  other: 'other'
};

describe('ui/views/tasks (v3)', () => {
  test('every issue lands in exactly one lane', async () => {
    const { a } = setup(200);
    await until(a, 200);
    await flush();
    const seen = [];
    for (const id of Object.keys(MAP)) {
      seen.push(...col(a, `#u3t-${id} .u3t-card`));
    }
    expect(seen.length).toBe(200);
    expect(new Set(seen).size).toBe(200);
    expect(a.querySelectorAll('.u3t-board .u3t-card').length).toBe(200);
  });

  test('filters and search narrow the board', async () => {
    const { a } = setup(120);
    await flush();
    const sel = /** @type {HTMLElement} */ (a.querySelector('.u3t-menu'));
    expect(sel).toBeTruthy();
    const mineBtn = /** @type {HTMLElement} */ (a.querySelector('.u3t-fchip'));
    mineBtn.click(); // Mine: nothing is assigned to the owner
    await flush();
    expect(a.querySelectorAll('.u3t-board .u3t-card').length).toBe(0);
    const input = /** @type {HTMLInputElement} */ (
      a.querySelector('.u3t-search')
    );
    mineBtn.click(); // off
    await flush();
    input.value = 'x-7';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 400));
    const got = col(a, '.u3t-board .u3t-card');
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((id) => String(id).includes('x-7'))).toBe(true);
  });

  test('closed rail opens and shows 50 at a time', async () => {
    const { a } = setup(10);
    await flush();
    /** @type {HTMLElement} */ (a.querySelector('#u3t-closed-rail')).click();
    expect(a.querySelectorAll('#u3t-closed .u3t-card').length).toBe(50);
    /** @type {HTMLElement} */ (a.querySelector('#u3t-closed-more')).click();
    expect(a.querySelectorAll('#u3t-closed .u3t-card').length).toBe(100);
  });

  test('seams are wired and inert: no lanes, no bulk bar', async () => {
    const { a, h } = setup(30);
    await flush();
    expect(a.querySelector('.u3t-lane')).toBeNull();
    expect(a.querySelector('.u3t')?.getAttribute('data-group')).toBe('none');
    h.unmount();
  });

  test('the project filter lists every registered project', async () => {
    const sent = /** @type {any[]} */ ([]);
    const { a, h } = setup(30, {
      store: {
        getState: () => ({
          workspace: {
            current: { path: 'E:/p/x' },
            available: [
              { path: 'E:/p/x', prefix: 'x' },
              { path: 'E:/p/rayeh' },
              { path: 'E:/p/company', prefix: 'company' }
            ]
          }
        })
      },
      client: {
        send: async (/** @type {any} */ t, /** @type {any} */ p) => (
          sent.push([t, p]),
          {}
        )
      }
    });
    await flush();
    /** @type {HTMLElement} */ (
      a.querySelector('.u3t-menu[data-name="project"]')
    ).click();
    const vals = Array.from(a.querySelectorAll('.u3t-opt')).map((e) =>
      e.getAttribute('data-v')
    );
    expect(vals).toEqual(expect.arrayContaining(['x', 'rayeh', 'company']));
    /** @type {HTMLElement} */ (
      a.querySelector('.u3t-opt[data-v="company"]')
    ).click();
    await flush();
    expect(sent).toEqual([['set-workspace', { path: 'E:/p/company' }]]);
    h.unmount();
  });

  test('after the saved project is restored, the lists are subscribed again from empty stores', async () => {
    let state = { workspace: { current: { path: 'E:/p/a' }, available: [] } };
    /** @type {Array<() => void>} */
    const fns = [];
    const calls = /** @type {string[]} */ ([]);
    const { a, h } = setup(10, {
      store: {
        getState: () => state,
        subscribe: (/** @type {() => void} */ f) => (fns.push(f), () => {})
      },
      subscriptions: {
        subscribeList: async (/** @type {string} */ id) => (
          calls.push(id),
          async () => {}
        )
      }
    });
    await flush();
    const first = calls.length;
    expect(first).toBe(4);
    state = { workspace: { current: { path: 'E:/p/b' }, available: [] } };
    fns.forEach((f) => f());
    await flush();
    expect(calls.length).toBe(first * 2);
    expect(a.querySelectorAll('.u3t-card').length).toBe(0);
    h.unmount();
  });

  test('tapping the active status chip again clears the column focus', async () => {
    const { a, h } = setup(30);
    await flush();
    const chips = () => Array.from(a.querySelectorAll('.u3t-stat__chip'));
    const second = /** @type {HTMLElement} */ (chips()[1]);
    second.click();
    await flush();
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    /** @type {HTMLElement} */ (chips()[1]).click();
    await flush();
    expect(chips()[1].getAttribute('aria-pressed')).toBe('false');
    h.unmount();
  });

  describe('filter popover', () => {
    const chip = (/** @type {HTMLElement} */ a, /** @type {string} */ n) =>
      /** @type {HTMLElement} */ (
        a.querySelector(`.u3t-menu[data-name="${n}"]`)
      );
    const key = (/** @type {string} */ k) =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true })
      );

    test('arrow keys move between options and focus returns to the chip', async () => {
      const { a, h } = setup(30);
      await flush();
      chip(a, 'type').click();
      const opts = () => [...a.querySelectorAll('.u3t-opt')];
      expect(document.activeElement).toBe(opts()[0]); // "Any" is the chosen one
      key('ArrowDown');
      expect(document.activeElement).toBe(opts()[1]);
      key('End');
      expect(document.activeElement).toBe(opts().at(-1));
      key('ArrowDown'); // stops at the end
      expect(document.activeElement).toBe(opts().at(-1));
      key('Home');
      expect(document.activeElement).toBe(opts()[0]);
      /** @type {HTMLElement} */ (opts()[1]).click();
      await flush();
      expect(a.querySelector('.u3t-pop')).toBeNull();
      expect(document.activeElement).toBe(chip(a, 'type'));
      chip(a, 'type').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(a.querySelector('.u3t-pop')).toBeNull();
      expect(document.activeElement).toBe(chip(a, 'type'));
      h.unmount();
    });

    test('a popover opened near the edge is pulled back inside the screen', async () => {
      const { a, h } = setup(30);
      await flush();
      const c = chip(a, 'project');
      c.getBoundingClientRect = () =>
        /** @type {any} */ ({ left: 5000, bottom: 40, width: 80 });
      c.click();
      const pop = /** @type {HTMLElement} */ (a.querySelector('.u3t-pop'));
      expect(parseFloat(pop.style.left)).toBeLessThanOrEqual(
        window.innerWidth - 8
      );
      h.unmount();
    });
  });
});
