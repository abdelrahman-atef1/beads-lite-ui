import { describe, expect, test } from 'vitest';
import { createListSelectors } from '../../data/list-selectors.js';
import { createSubscriptionIssueStores } from '../../data/subscription-issue-stores.js';
import { mount as mountTasks } from './tasks.js';

// Same specs as the screen: every list spans all projects.
const ALL = { scope: 'all' };
const IDS = {
  'tab:all': { type: 'all-issues', params: ALL },
  'tab:board:ready': { type: 'ready-issues', params: ALL },
  'tab:board:blocked': { type: 'blocked-issues', params: ALL },
  'tab:board:closed': { type: 'closed-issues', params: ALL }
};
const STATUSES = [
  'owner_decision',
  'in_progress',
  'waiting_for_test',
  'waiting_for_merge',
  'open',
  'blocked',
  'deferred'
];
let WEIRD = false;
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
  if (WEIRD) {
    all.push({ id: 'x-weird', title: 'W', status: 'in_review', priority: 2 });
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
  deferred: 'deferred'
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

  test('an unknown status is a visible error row, never a column', async () => {
    WEIRD = true;
    try {
      const { a, h } = setup(14);
      await flush();
      const row = a.querySelector('[data-testid="unknown-status"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('x-weird');
      expect(row?.textContent).toContain('in_review');
      expect(a.querySelector('#u3t-other')).toBeNull();
      expect(a.querySelector('.u3t-stat__chip--other')).toBeNull();
      expect(a.querySelector('#u3t-deferred')).not.toBeNull();
      expect(a.querySelector('.u3t-stat__chip--deferred')).not.toBeNull();
      h.unmount();
    } finally {
      WEIRD = false;
    }
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
    // All lists hold every project: picking one narrows on the device and
    // never moves the connection to another workspace.
    expect(sent).toEqual([]);
    h.unmount();
  });

  test('after the saved project is restored, the lists are subscribed again and the cards stay', async () => {
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
    // every list spans all projects: no empty flash while re-attaching
    expect(a.querySelectorAll('.u3t-card').length).toBeGreaterThan(0);
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
      chip(a, 'project').click();
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
      expect(a.querySelector('.u3t-pop')).not.toBeNull(); // several allowed: stays open
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(a.querySelector('.u3t-pop')).toBeNull();
      expect(document.activeElement).toBe(chip(a, 'project'));
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

describe('filters as sets (beads-lite-1bo5.13.16.1)', () => {
  const stat = (/** @type {HTMLElement} */ a, /** @type {string} */ c) =>
    /** @type {HTMLElement} */ (a.querySelector(`.u3t-stat__chip--${c}`));
  const cols = (/** @type {HTMLElement} */ a) =>
    [...a.querySelectorAll('.u3t-col')].map((e) => e.id);
  const search = () => new URLSearchParams(window.location.search);

  test('owner decision and blocked together; remove one, then clear all; URL follows', async () => {
    const { a, h } = setup(60);
    await flush();
    stat(a, 'owner').click();
    await flush();
    stat(a, 'blocked').click();
    await flush();
    expect(stat(a, 'owner').getAttribute('aria-pressed')).toBe('true');
    expect(stat(a, 'blocked').getAttribute('aria-pressed')).toBe('true');
    expect(cols(a)).toEqual(['u3t-owner', 'u3t-blocked']);
    expect(search().get('status')).toBe('owner_decision,blocked');
    const chip = /** @type {HTMLElement} */ (
      a.querySelector('.u3t-ac[data-dim="status"]')
    );
    expect(chip.textContent).toContain('+1');
    // one tap on a counter removes that status
    stat(a, 'owner').click();
    await flush();
    expect(cols(a)).toEqual(['u3t-blocked']);
    expect(search().get('status')).toBe('blocked');
    // the chip x clears the whole dimension
    /** @type {HTMLElement} */ (
      a.querySelector('[data-remove="status"]')
    ).click();
    await flush();
    expect(search().get('status')).toBe(null);
    expect(a.querySelector('.u3t-active')).toBeNull();
    // clear all
    stat(a, 'owner').click();
    stat(a, 'test').click();
    await flush();
    /** @type {HTMLElement} */ (
      a.querySelector('[data-testid="chips-clear-all"]')
    ).click();
    await flush();
    expect(window.location.search).toBe('');
    expect(
      JSON.parse(window.localStorage.getItem('u3.tasks.filters') || '{}').status
    ).toEqual([]);
    h.unmount();
  });

  test('Filters sheet: checkbox rows with counts, Mine toggles the assignee set, Esc closes', async () => {
    const { a, h } = setup(60);
    await flush();
    const btn = () =>
      /** @type {HTMLElement} */ (
        a.querySelector('[data-testid="filters-btn"]')
      );
    btn().click();
    expect(a.querySelector('.u3t-sh[role="dialog"]')).not.toBeNull();
    /** @type {HTMLElement} */ (
      a.querySelector('.u3t-sh__sec[data-dim="assignee"] .u3t-sh__hb')
    ).click();
    const opt = (/** @type {string} */ v) =>
      /** @type {HTMLElement} */ (
        a.querySelector(`.u3t-sh__sec[data-dim="assignee"] [data-v="${v}"]`)
      );
    expect(opt('swe').querySelector('.u3t-sh__n')?.textContent).toBe('20');
    opt('swe').click();
    opt('qa').click();
    expect(search().get('assignee')).toBe('swe,qa');
    expect(opt('swe').getAttribute('aria-checked')).toBe('true');
    // counts of the other options honour the filter just set
    /** @type {HTMLElement} */ (
      a.querySelector('.u3t-sh__sec[data-dim="prio"] .u3t-sh__hb')
    ).click();
    expect(
      a.querySelector('.u3t-sh__sec[data-dim="prio"] [data-v="0"] .u3t-sh__n')
        ?.textContent
    ).toBe('8');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a.querySelector('.u3t-sh')).toBeNull();
    expect(document.activeElement).toBe(btn());
    expect(btn().querySelector('.u3t-fbtn__n')?.textContent).toBe('1');
    h.unmount();
  });

  test('Mine and Urgent read and write the sets; empty state clears', async () => {
    const { a, h } = setup(60);
    await flush();
    const q = (/** @type {string} */ k) =>
      /** @type {HTMLElement} */ (a.querySelector(`[data-quick="${k}"]`));
    q('u3_tk_p01').click();
    await flush();
    expect(search().get('prio')).toBe('0,1');
    expect(q('u3_tk_p01').getAttribute('aria-pressed')).toBe('true');
    q('u3_tk_mine').click(); // nothing is assigned to the owner
    await flush();
    expect(search().get('assignee')).toBe('abdelrahman');
    expect(a.querySelector('[data-testid="no-match"]')).not.toBeNull();
    /** @type {HTMLElement} */ (
      a.querySelector('[data-testid="no-match-clear"]')
    ).click();
    await flush();
    expect(a.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(window.location.search).toBe('');
    expect(a.querySelectorAll('.u3t-board .u3t-card').length).toBeGreaterThan(
      0
    );
    h.unmount();
  });

  test('a lane header count opens that status in the lane', async () => {
    window.localStorage.setItem('u3.tasks.group', 'project');
    const { a, h } = setup(60);
    await flush();
    /** @type {HTMLElement} */ (
      a.querySelector('.u3t-group__b[data-group-by="project"]')
    ).click();
    await flush();
    const b = /** @type {HTMLElement | null} */ (
      a.querySelector('.u3t-lane__stat[data-lane-status="blocked"]')
    );
    expect(b).not.toBeNull();
    b?.click();
    await flush();
    expect(search().get('status')).toBe('blocked');
    expect(cols(a).every((id) => id === 'u3t-blocked')).toBe(true);
    h.unmount();
  });
});
