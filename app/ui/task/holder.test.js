// @ts-nocheck -- fixture-heavy view test
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mount } from '../views/task.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ISSUE = {
  id: 'p-1',
  title: 'a title',
  status: 'open',
  priority: 2,
  assignee: 'qa',
  labels: [],
  description: 'd'
};

function setup(fail) {
  document.body.innerHTML = '<div class="u3"><div id="v"></div></div>';
  window.localStorage.setItem('beads-ui.lang', 'en');
  window.location.hash = '#/issues?issue=p-1';
  const send = vi.fn(async (type) => {
    if (type === 'get-comments') return [];
    if (fail && type === fail) throw new Error('bd said no');
    return { id: 'p-1' };
  });
  const ctx = {
    route: { name: 'task', id: 'p-1', at: null },
    send,
    client: { send },
    sub_issue_stores: {
      register() {},
      subscribeFor: () => () => {},
      isLoaded: () => true,
      snapshotFor: () => [structuredClone(ISSUE)]
    },
    subscriptions: { subscribeList: async () => async () => {} }
  };
  const el = document.getElementById('v');
  Element.prototype.scrollIntoView = vi.fn();
  mount(el, ctx);
  return { el, send };
}
const top = (el) => el.querySelector('.u3-hd--top');

describe('task header holder row', () => {
  beforeEach(() => window.localStorage.clear());

  test('header order: chips, holder with full name, then time; no Edit needed', async () => {
    const { el } = setup();
    await tick();
    const kids = [...el.querySelector('.u3-ts').children].map(
      (n) => n.className
    );
    const iChips = kids.findIndex((c) => c.includes('u3-ts__facts'));
    const iHold = kids.findIndex((c) => c.includes('u3-hd--top'));
    const iTime = kids.findIndex((c) => c.includes('u3-ts__time'));
    expect(iChips).toBeLessThan(iHold);
    expect(iHold).toBeLessThan(iTime);
    expect(top(el).textContent).toContain('Held by');
    expect(top(el).querySelector('.u3-hd__row').textContent).not.toMatch(
      /^\s*qa\s*$/
    );
    expect(el.querySelector('#u3-ed-asg')).toBeNull();
  });

  test('one tap opens the sheet, one tap on a name saves; Undo restores', async () => {
    const { el, send } = setup();
    await tick();
    top(el).querySelector('.u3-hd__row').click();
    await tick();
    const opts = [...el.querySelectorAll('.u3-hd__opt')];
    expect(opts[0].dataset.role).toBe('qa'); // current first
    expect(opts[0].getAttribute('aria-checked')).toBe('true');
    expect(opts[1].dataset.role).toBe(''); // then Unassigned
    el.querySelector('.u3-hd__opt[data-role="swe"]').click();
    await tick();
    expect(send).toHaveBeenCalledWith('update-assignee', {
      id: 'p-1',
      assignee: 'swe'
    });
    expect(el.querySelector('.u3-hd__sheet')).toBeNull();
    expect(top(el).querySelector('.u3-hd__row').textContent).not.toContain(
      'Unassigned'
    );
    const toast = el.querySelector('.u3-hd__toast');
    expect(toast.textContent).toContain('Assigned to');
    toast.querySelector('button').click();
    await tick();
    expect(send).toHaveBeenLastCalledWith('update-assignee', {
      id: 'p-1',
      assignee: 'qa'
    });
    expect(el.querySelector('.u3-hd__toast')).toBeNull();
  });

  test('Undo toast goes away after 6 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { el } = setup();
      await vi.advanceTimersByTimeAsync(50);
      top(el).querySelector('.u3-hd__row').click();
      await vi.advanceTimersByTimeAsync(10);
      el.querySelector('.u3-hd__opt[data-role="swe"]').click();
      await vi.advanceTimersByTimeAsync(50);
      expect(el.querySelector('.u3-hd__toast')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(6100);
      expect(el.querySelector('.u3-hd__toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a failed save reverts the row, shows the reason and Retry', async () => {
    const { el, send } = setup('update-assignee');
    await tick();
    top(el).querySelector('.u3-hd__row').click();
    await tick();
    el.querySelector('.u3-hd__opt[data-role="swe"]').click();
    await tick();
    const err = top(el).querySelector('.u3-hd__err');
    expect(err.textContent).toContain('Could not assign');
    expect(err.textContent).toContain('bd said no');
    expect(el.querySelector('.u3-hd__toast')).toBeNull();
    expect(top(el).querySelector('.u3-hd__row').textContent).not.toContain(
      'Software'
    );
    const n = send.mock.calls.filter((c) => c[0] === 'update-assignee').length;
    err.querySelector('button').click();
    await tick();
    expect(
      send.mock.calls.filter((c) => c[0] === 'update-assignee').length
    ).toBe(n + 1);
  });

  test('Escape closes the sheet without saving', async () => {
    const { el, send } = setup();
    await tick();
    top(el).querySelector('.u3-hd__row').click();
    await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    expect(el.querySelector('.u3-hd__sheet')).toBeNull();
    expect(send).not.toHaveBeenCalledWith('update-assignee', expect.anything());
  });
});
