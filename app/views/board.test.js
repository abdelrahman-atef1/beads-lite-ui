import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStores } from '../data/subscription-issue-stores.js';
import { createFilterState } from '../utils/board-filter.js';
import { createBoardView } from './board.js';

const EMPTY = {
  'tab:board:ready': [],
  'tab:board:blocked': [],
  'tab:board:closed': []
};

/**
 * @param {Record<string, any[]>} lists - client id -> issues (snapshot rev 1)
 */
function setup(lists, filter = /** @type {any} */ (undefined)) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const stores = createSubscriptionIssueStores();
  for (const id of [
    'tab:all',
    'tab:board:ready',
    'tab:board:blocked',
    'tab:board:closed'
  ]) {
    stores.register(id, { type: 'list-' + id });
  }
  const clicked = /** @type {string[]} */ ([]);
  const view = createBoardView(
    mount,
    null,
    (id) => clicked.push(id),
    undefined,
    undefined,
    /** @type {any} */ (stores),
    filter
  );
  /**
   * @param {string} id
   * @param {any[]} issues
   * @param {number} [revision]
   */
  const push = (id, issues, revision = 1) =>
    /** @type {any} */ (stores.getStore(id)).applyPush({
      type: 'snapshot',
      id,
      revision,
      issues
    });
  for (const [id, issues] of Object.entries(lists)) {
    push(id, issues);
  }
  return { mount, view, clicked, push };
}

/**
 * @param {HTMLElement} mount
 * @param {string} col
 */
function ids(mount, col) {
  return Array.from(mount.querySelectorAll(`#${col}-col .card`)).map((el) =>
    el.getAttribute('data-issue-id')
  );
}

const flush = () => new Promise((r) => setTimeout(r, 60));

describe('views/board', () => {
  test('shows a skeleton and no count until the first snapshot (never a false 0)', async () => {
    const { mount, view } = setup({});
    await view.load();
    expect(mount.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(mount.querySelector('.col__count')?.textContent?.trim()).toBe('');
    expect(mount.querySelectorAll('.card').length).toBe(0);
  });

  test('splits issues into the seven columns, owner column first', async () => {
    const { mount, view } = setup({
      'tab:all': [
        { id: 'O-1', title: 'o', status: 'owner_decision', updated_at: 5 },
        { id: 'P-1', title: 'p', status: 'in_progress' },
        { id: 'T-1', title: 't', status: 'waiting_for_test' },
        { id: 'M-1', title: 'm', status: 'waiting_for_merge' },
        { id: 'R-1', title: 'r', status: 'open' },
        { id: 'B-1', title: 'dep blocked', status: 'open' },
        { id: 'B-2', title: 'status blocked', status: 'blocked' },
        { id: 'X-1', title: 'custom', status: 'weird_status' }
      ],
      'tab:board:ready': [{ id: 'R-1', title: 'r', status: 'open' }],
      'tab:board:blocked': [{ id: 'B-1', title: 'b', status: 'open' }],
      'tab:board:closed': []
    });
    await view.load();
    const order = Array.from(mount.querySelectorAll('section.col')).map(
      (el) => el.id
    );
    expect(order.slice(0, 6)).toEqual([
      'owner-col',
      'progress-col',
      'test-col',
      'merge-col',
      'ready-col',
      'blocked-col'
    ]);
    expect(ids(mount, 'owner')).toEqual(['O-1']);
    expect(ids(mount, 'progress')).toEqual(['P-1']);
    expect(ids(mount, 'test')).toEqual(['T-1']);
    expect(ids(mount, 'merge')).toEqual(['M-1']);
    expect(ids(mount, 'ready')).toEqual(['R-1']);
    expect(ids(mount, 'blocked').sort()).toEqual(['B-1', 'B-2']);
    expect(ids(mount, 'other')).toEqual(['X-1']);
    expect(mount.querySelector('#owner-col')?.classList).toContain('col--attn');
    expect(mount.querySelector('.skeleton')).toBeNull();
  });

  test('prefers the Arabic title and keeps English as a second line', async () => {
    const { mount, view } = setup({
      'tab:all': [
        {
          id: 'A-1',
          title: 'Fast tracker',
          status: 'in_progress',
          metadata: { title_ar: 'المتتبع السريع' }
        }
      ],
      ...EMPTY
    });
    await view.load();
    const card = /** @type {HTMLElement} */ (
      mount.querySelector('#progress-col .card')
    );
    expect(card.querySelector('.card__title')?.textContent).toContain(
      'المتتبع السريع'
    );
    expect(card.querySelector('.card__title2')?.textContent).toBe(
      'Fast tracker'
    );
  });

  test('a desk decision shows only its neutral title', async () => {
    const { mount, view } = setup({
      'tab:all': [
        {
          id: 'D-1',
          title: 'Accept the licence risk on voice X',
          status: 'owner_decision',
          metadata: { card_class: 'desk', card_title: 'قرار قانوني' }
        }
      ],
      ...EMPTY
    });
    await view.load();
    const text = mount.querySelector('#owner-col')?.textContent || '';
    expect(text).toContain('قرار قانوني');
    expect(text).not.toContain('licence risk');
  });

  test('card links to the deep link and a plain click navigates in the app', async () => {
    const { mount, view, clicked } = setup({
      'tab:all': [{ id: 'C-1', title: 'c', status: 'in_progress' }],
      ...EMPTY
    });
    await view.load();
    const a = /** @type {HTMLAnchorElement} */ (
      mount.querySelector('#progress-col a.card')
    );
    expect(a.getAttribute('href')).toBe('#/issues?issue=C-1');
    a.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(clicked).toEqual(['C-1']);
  });

  test('closed is a collapsed rail; expanding shows 50 newest and "Show 50 more"', async () => {
    const closed = Array.from({ length: 120 }, (_, i) => ({
      id: `Z-${i}`,
      title: 'z' + i,
      status: 'closed',
      closed_at: 1_000 + i
    }));
    const { mount, view } = setup({
      'tab:all': [],
      'tab:board:ready': [],
      'tab:board:blocked': [],
      'tab:board:closed': closed
    });
    await view.load();
    expect(mount.querySelector('#closed-rail')).not.toBeNull();
    expect(mount.querySelectorAll('#closed-col .card').length).toBe(0);
    /** @type {HTMLButtonElement} */ (
      mount.querySelector('#closed-rail')
    ).click();
    await flush();
    const first = mount.querySelectorAll('#closed-col .card');
    expect(first.length).toBe(50);
    expect(first[0].getAttribute('data-issue-id')).toBe('Z-119');
    /** @type {HTMLButtonElement} */ (
      mount.querySelector('#closed-more')
    ).click();
    await flush();
    expect(mount.querySelectorAll('#closed-col .card').length).toBe(100);
  });

  test('a live push moves a card between columns', async () => {
    const { mount, view, push } = setup({
      'tab:all': [{ id: 'L-1', title: 'l', status: 'in_progress' }],
      ...EMPTY
    });
    await view.load();
    expect(ids(mount, 'progress')).toEqual(['L-1']);
    push('tab:all', [{ id: 'L-1', title: 'l', status: 'waiting_for_test' }], 2);
    await flush();
    expect(ids(mount, 'progress')).toEqual([]);
    expect(ids(mount, 'test')).toEqual(['L-1']);
  });

  test('chips and search narrow the cards; empty columns collapse', async () => {
    const mem = /** @type {Map<string, string>} */ (new Map());
    const filter = createFilterState(
      /** @type {any} */ ({
        getItem: (/** @type {string} */ k) => mem.get(k) ?? null,
        setItem: (/** @type {string} */ k, /** @type {string} */ v) =>
          void mem.set(k, v)
      })
    );
    const { mount, view } = setup(
      {
        'tab:all': [
          { id: 'P-1', title: 'alpha', status: 'in_progress', priority: 0 },
          {
            id: 'P-2',
            title: 'beta',
            title_ar: 'لوحة',
            status: 'in_progress',
            priority: 3
          },
          { id: 'T-1', title: 'gamma', status: 'waiting_for_test', priority: 3 }
        ],
        ...EMPTY
      },
      filter
    );
    await view.load();
    expect(ids(mount, 'progress')).toEqual(['P-1', 'P-2']);
    filter.set({ chip: 'p01' });
    expect(ids(mount, 'progress')).toEqual(['P-1']);
    expect(ids(mount, 'test')).toEqual([]);
    expect(mount.querySelector('#test-col')?.classList).toContain(
      'col--collapsed'
    );
    filter.set({ chip: 'all', search: 'لوح' });
    expect(ids(mount, 'progress')).toEqual(['P-2']);
    filter.set({ search: 't-1' });
    expect(ids(mount, 'test')).toEqual(['T-1']);
    expect(mount.querySelectorAll('.chips .chip').length).toBeGreaterThan(3);
  });
});
