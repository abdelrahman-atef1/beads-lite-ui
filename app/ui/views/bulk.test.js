import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createListSelectors } from '../../data/list-selectors.js';
import { createSubscriptionIssueStores } from '../../data/subscription-issue-stores.js';
import { MAX_BULK, createBulkApi, refusal } from '../data/bulk.js';
import { mount as mountTasks } from './tasks.js';

// Same specs as the Tasks screen: every list spans all projects.
const ALL = { scope: 'all' };
const IDS = {
  'tab:all': { type: 'all-issues', params: ALL },
  'tab:board:ready': { type: 'ready-issues', params: ALL },
  'tab:board:blocked': { type: 'blocked-issues', params: ALL },
  'tab:board:closed': { type: 'closed-issues', params: ALL }
};
const mk = (/** @type {string} */ id, /** @type {any} */ extra = {}) => ({
  id,
  title: 'T ' + id,
  status: 'open',
  priority: 2,
  issue_type: 'task',
  assignee: '',
  labels: [],
  created_at: 1,
  updated_at: 2,
  ...extra
});

/** @param {any[]} all */
function setup(all) {
  document.body.innerHTML = '<div class="u3"><div id="a"></div></div>';
  window.localStorage.clear();
  const stores = createSubscriptionIssueStores();
  for (const [id, spec] of Object.entries(IDS)) stores.register(id, spec);
  const lists = {
    'tab:all': all,
    'tab:board:ready': all.filter((i) => i.status === 'open'),
    'tab:board:blocked': [],
    'tab:board:closed': []
  };
  for (const [id, issues] of Object.entries(lists)) {
    /** @type {any} */ (stores.getStore(id)).applyPush({
      type: 'snapshot',
      id,
      revision: 1,
      issues
    });
  }
  const a = /** @type {HTMLElement} */ (document.getElementById('a'));
  const h = mountTasks(a, {
    sub_issue_stores: stores,
    subscriptions: { subscribeList: async () => async () => {} },
    listSelectors: createListSelectors(/** @type {any} */ (stores))
  });
  return { a, h };
}
const q = (/** @type {string} */ s) => document.querySelector(s);
const card = (/** @type {string} */ id) =>
  /** @type {HTMLElement} */ (q(`.u3t-card[data-issue-id="${id}"]`));
const tid = (/** @type {string} */ t) =>
  /** @type {HTMLElement} */ (q(`[data-testid="${t}"]`));
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('bulk select (v3 tasks)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('long-press enters, taps toggle, back leaves with nothing changed', async () => {
    const { h } = setup([mk('y-1'), mk('y-2'), mk('y-3'), mk('y-4')]);
    await tick(10);
    card('y-1').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })
    );
    await tick(500);
    expect(tid('bulk-count').textContent).toContain('1');
    card('y-1').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    card('y-1').click(); // the click that ends the long press is swallowed
    card('y-2').click();
    card('y-3').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('3');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick(10);
    expect(q('[data-testid="bulk-bar"]')).toBeNull();
    expect(document.querySelectorAll('.u3t-card.is-selected').length).toBe(0);
    h.unmount();
  });

  test('label and assign sheets: one label add/remove, pick a role, result + undo', async () => {
    const { h } = setup([
      mk('y-1'),
      mk('y-2'),
      mk('y-3', { status: 'owner_decision' })
    ]);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    for (const id of ['y-1', 'y-2', 'y-3']) card(id).click();
    await tick(10);
    tid('bulk-label').click();
    await tick(10);
    expect(/** @type {HTMLButtonElement} */ (tid('bulk-apply')).disabled).toBe(
      true
    );
    const lab = /** @type {HTMLInputElement} */ (tid('bulk-label-input'));
    lab.value = 'urgent';
    lab.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(10);
    expect(tid('bulk-confirm').textContent).toContain('urgent');
    tid('bulk-apply').closest('form')?.requestSubmit();
    await tick(10);
    expect(tid('bulk-result').textContent).toContain('2');
    expect(q('[data-testid="bulk-undo"]')).not.toBeNull();
    h.unmount();
  });

  test('mixed batch: per-task refusals, then 10 s undo that disappears', async () => {
    const { h } = setup([
      mk('y-1'),
      mk('y-1.1'),
      mk('y-2'),
      mk('y-3'),
      mk('y-4'),
      mk('y-5', { status: 'owner_decision' }),
      mk('y-6', { status: 'in_progress', assignee: 'swe' })
    ]);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    for (const id of ['y-1', 'y-2', 'y-3', 'y-4', 'y-5', 'y-6']) {
      card(id).click();
    }
    await tick(10);
    tid('bulk-close').click();
    await tick(10);
    const input = /** @type {HTMLInputElement} */ (tid('bulk-reason'));
    expect(/** @type {HTMLButtonElement} */ (tid('bulk-apply')).disabled).toBe(
      true
    );
    input.value = 'finished';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(10);
    expect(tid('bulk-confirm').textContent).toContain('6');
    expect(tid('bulk-confirm').textContent).toContain('finished');
    tid('bulk-apply').closest('form')?.requestSubmit();
    await tick(10);
    const res = tid('bulk-result');
    expect(res.textContent).toContain('3'); // y-2,3,4 done
    const lis = [...res.querySelectorAll('li')].map((l) => l.textContent);
    expect(lis.length).toBe(3);
    expect(lis.join('|')).toContain('y-1');
    expect(lis.join('|')).toContain('y-5');
    expect(lis.join('|')).toContain('y-6');
    expect(q('[data-testid="bulk-undo"]')).not.toBeNull();
    await tick(10500);
    expect(q('[data-testid="bulk-undo"]')).toBeNull();
    h.unmount();
  });

  test('more than 50 selected is blocked with a message', async () => {
    const all = Array.from({ length: MAX_BULK + 5 }, (_, i) => mk('z-' + i));
    const { h } = setup(all);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    for (const c of document.querySelectorAll('.u3t-card')) {
      /** @type {HTMLElement} */ (c).click();
    }
    await tick(10);
    expect(q('.u3bk-note--bad')).not.toBeNull();
    tid('bulk-close').click();
    await tick(10);
    expect(q('[data-testid="bulk-reason"]')).toBeNull(); // no sheet opened
    h.unmount();
  });
});

describe('select all takes exactly what is shown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-ignore test stub
    delete window.matchMedia;
  });

  test('more than 50 shown: first 50, count and cap note, never trapped', async () => {
    const all = [
      ...Array.from({ length: 60 }, (_, i) => mk('r-' + i)),
      ...Array.from({ length: 5 }, (_, i) =>
        mk('p-' + i, { status: 'in_progress' })
      )
    ];
    const { h } = setup(all);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    expect(q('[data-testid="bulk-cap"]')).not.toBeNull();
    expect(tid('bulk-all').textContent).toContain('65');
    tid('bulk-all').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('50');
    expect(q('.u3bk-note--bad')).toBeNull();
    tid('bulk-close').click();
    await tick(10);
    expect(q('[data-testid="bulk-reason"]')).not.toBeNull(); // not blocked
    h.unmount();
  });

  test('over 50 by hand: Keep first 50 gets out', async () => {
    const all = Array.from({ length: 55 }, (_, i) => mk('k-' + i));
    const { h } = setup(all);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    for (const c of document.querySelectorAll('.u3t-card')) {
      /** @type {HTMLElement} */ (c).click();
    }
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('55');
    tid('bulk-keep').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('50');
    h.unmount();
  });

  test('a search narrows what select all takes', async () => {
    const all = [
      mk('s-1', { title: 'alpha' }),
      mk('s-2', { title: 'alpha 2' }),
      mk('s-3', { title: 'beta' })
    ];
    const { h } = setup(all);
    await tick(10);
    tid('bulk-enter').click();
    const input = /** @type {HTMLInputElement} */ (q('.u3t-search'));
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    await tick(400);
    tid('bulk-all').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('2');
    h.unmount();
  });

  test('phone: one column, label names it, Other has a tab', async () => {
    window.matchMedia = /** @type {any} */ (
      (/** @type {string} */ m) => ({
        matches: m.includes('max-width: 760px'),
        addEventListener() {},
        removeEventListener() {}
      })
    );
    const all = [
      ...Array.from({ length: 4 }, (_, i) => mk('a-' + i)),
      mk('b-1', { status: 'in_progress' }),
      mk('d-1', { status: 'deferred' })
    ];
    const { h } = setup(all);
    await tick(10);
    const other = /** @type {HTMLElement} */ (q('.u3t-stat__chip--deferred'));
    expect(other).not.toBeNull();
    tid('bulk-enter').click();
    await tick(10);
    // first column with cards is In progress (1 card)
    expect(tid('bulk-all').textContent).toContain('(1)');
    /** @type {HTMLElement} */ (q('.u3t-stat__chip--ready')).click();
    await tick(10);
    expect(tid('bulk-all').textContent).toContain('(4)');
    tid('bulk-all').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('4');
    other.click();
    await tick(10);
    expect(card('d-1')).not.toBeNull();
    h.unmount();
  });
});

describe('bulk data adapter (fixture)', () => {
  test('refusal reasons', () => {
    const all = [
      mk('a'),
      mk('a.1'),
      mk('b', { status: 'closed' }),
      mk('c', { status: 'owner_decision' }),
      mk('d', { blocked_by_detail: [{ id: 'a' }] })
    ];
    const r = (/** @type {string} */ id) =>
      refusal(
        'close',
        all.find((i) => i.id === id),
        all,
        {},
        false
      );
    expect(r('a')).toBe('children');
    expect(r('b')).toBe('already_closed');
    expect(r('c')).toBe('decision');
    expect(r('d')).toBe('blockers');
    expect(r('a.1')).toBe('');
  });

  test('apply rejects over 50 and undo restores', async () => {
    const api = createBulkApi();
    const ids = Array.from({ length: 51 }, (_, i) => 'k' + i);
    await expect(
      api.apply({ action: 'close', ids, params: {} }, [])
    ).rejects.toThrow();
    const r = await api.apply({ action: 'close', ids: ['a'], params: {} }, [
      mk('a')
    ]);
    expect(r.ok).toEqual(['a']);
    expect(await api.undo(r.batch)).toBe(1);
  });
});

describe('over-50 alert goes with the over-50 selection (.59 low)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  test('Keep first 50 clears the red alert', async () => {
    const all = Array.from({ length: 55 }, (_, i) => mk('n-' + i));
    const { h } = setup(all);
    await tick(10);
    tid('bulk-enter').click();
    await tick(10);
    for (const c of document.querySelectorAll('.u3t-card')) {
      /** @type {HTMLElement} */ (c).click();
    }
    await tick(10);
    tid('bulk-close').click(); // blocked: sets the notice
    await tick(10);
    expect(q('.u3bk-note--bad')).not.toBeNull();
    tid('bulk-keep').click();
    await tick(10);
    expect(tid('bulk-count').textContent).toContain('50');
    expect(q('.u3bk-note--bad')).toBeNull();
    h.unmount();
  });
});
