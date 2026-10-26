import { describe, expect, test, vi } from 'vitest';
import { createSubscriptionIssueStores } from '../data/subscription-issue-stores.js';
import { createDecisionsView, pendingDecisions } from './decisions.js';

const TAP = {
  id: 'T-1',
  title: 'Map idle timeout',
  status: 'owner_decision',
  updated_at: 100,
  metadata: {
    card_class: 'tap',
    card_q: 'وقف الخريطة بعد دقيقتين؟',
    card_effect: 'راكب بيضغط مرة',
    card_back: 'swe',
    card_opts: JSON.stringify([{ l: 'نعم', rec: true }, { l: 'لا' }])
  }
};
const DESK = {
  id: 'D-1',
  title: 'Accept the risk',
  status: 'owner_decision',
  updated_at: 50,
  labels: ['security'],
  metadata: { card_class: 'desk', card_title: 'قرار أمني' }
};

/**
 * @param {any[]} issues
 * @param {any} [transport]
 */
function setup(issues, transport = vi.fn(async () => ({}))) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const stores = createSubscriptionIssueStores();
  stores.register('tab:all', { type: 'all-issues' });
  /** @type {any} */ (stores.getStore('tab:all')).applyPush({
    type: 'snapshot',
    id: 'tab:all',
    revision: 1,
    issues
  });
  const view = createDecisionsView(
    mount,
    () => {},
    /** @type {any} */ (stores),
    transport
  );
  return { mount, view, transport };
}

const flush = () => new Promise((r) => setTimeout(r, 40));

describe('views/decisions', () => {
  test('pendingDecisions keeps owner_decision only, oldest first', () => {
    expect(
      pendingDecisions([TAP, DESK, { id: 'x', status: 'open' }]).map(
        (i) => i.id
      )
    ).toEqual(['D-1', 'T-1']);
  });

  test('a desk card shows the PC-only strip and no buttons', async () => {
    const { mount, view } = setup([DESK]);
    await view.load();
    expect(mount.querySelector('.qcard__desk')).not.toBeNull();
    expect(mount.querySelectorAll('.opts button').length).toBe(0);
    expect(mount.textContent).not.toContain('Accept the risk');
  });

  test('empty queue says so instead of showing a zero', async () => {
    const { mount, view } = setup([]);
    await view.load();
    expect(mount.querySelector('.empty')).not.toBeNull();
  });

  test('a tap answer needs Confirm, then writes comment, assignee and status', async () => {
    const { mount, view, transport } = setup([TAP]);
    await view.load();
    const buttons = Array.from(mount.querySelectorAll('.opts button'));
    expect(buttons.length).toBe(2);
    /** @type {HTMLButtonElement} */ (buttons[0]).click();
    await flush();
    // nothing written before Confirm
    expect(transport).not.toHaveBeenCalled();
    const confirm = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.opts .btn--primary')
    );
    confirm.click();
    await flush();
    const calls = /** @type {any[]} */ (transport.mock.calls).map((c) => c[0]);
    expect(calls).toEqual(['add-comment', 'update-assignee', 'update-status']);
    expect(transport.mock.calls[1][1]).toEqual({ id: 'T-1', assignee: 'swe' });
    expect(transport.mock.calls[2][1]).toEqual({ id: 'T-1', status: 'open' });
    expect(String(transport.mock.calls[0][1].text)).toContain('Option 1');
  });

  test('a failed comment stops the answer (status is not changed)', async () => {
    const transport = vi.fn(async () => {
      throw new Error('boom');
    });
    const { mount, view } = setup([TAP], transport);
    await view.load();
    /** @type {HTMLButtonElement} */ (
      mount.querySelectorAll('.opts button')[0]
    ).click();
    await flush();
    /** @type {HTMLButtonElement} */ (
      mount.querySelector('.opts .btn--primary')
    ).click();
    await flush();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
