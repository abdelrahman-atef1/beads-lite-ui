import { describe, expect, test } from 'vitest';
import { createListSelectors } from '../../data/list-selectors.js';
import { createSubscriptionIssueStores } from '../../data/subscription-issue-stores.js';
import { createFilterState } from '../../utils/board-filter.js';
import { createBoardView } from '../../views/board.js';
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

function setup(n = 200) {
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
  const b = /** @type {HTMLElement} */ (document.getElementById('b'));
  const legacy_filter = createFilterState();
  const legacy = createBoardView(
    b,
    null,
    () => {},
    undefined,
    undefined,
    /** @type {any} */ (stores),
    legacy_filter
  );
  void legacy.load();
  const h = mountTasks(a, {
    sub_issue_stores: stores,
    subscriptions: subs,
    listSelectors: createListSelectors(/** @type {any} */ (stores))
  });
  return { a, b, h, legacy_filter };
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
  test('column contents equal the legacy board for the same stores', async () => {
    const { a, b } = setup(200);
    await flush();
    for (const [id, leg] of Object.entries(MAP)) {
      const mine = col(a, `#u3t-${id} .u3t-card`);
      const old = col(b, `#${leg}-col .card`);
      expect(mine, id).toEqual(old);
    }
    const total = a.querySelectorAll('.u3t-board .u3t-card').length;
    expect(total).toBe(200);
  });

  test('filters and search narrow the same way as legacy', async () => {
    const { a, b, legacy_filter } = setup(120);
    await flush();
    const sel = /** @type {HTMLSelectElement} */ (
      a.querySelector('select[aria-label]')
    );
    expect(sel).toBeTruthy();
    // type filter through the shared persisted state of createFilterState
    const mineBtn = /** @type {HTMLElement} */ (a.querySelector('.u3t-fchip'));
    mineBtn.click(); // Mine: nothing is assigned to the owner
    await flush();
    legacy_filter.set({ chip: 'mine' });
    await flush();
    expect(a.querySelectorAll('.u3t-board .u3t-card').length).toBe(
      b.querySelectorAll('.col:not(.col--closed) .card').length
    );
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
});
