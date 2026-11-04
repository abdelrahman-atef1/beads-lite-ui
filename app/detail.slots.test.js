import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSubscriptionIssueStores } from './data/subscription-issue-stores.js';
import { createDetailView } from './views/detail.js';

const mountCard = vi.fn();
const mountOutputs = vi.fn();
vi.mock('./views/card-panel.js', () => ({
  mountCard: (/** @type {any[]} */ ...a) => mountCard(...a)
}));
vi.mock('./views/outputs-panel.js', () => ({
  mountOutputs: (/** @type {any[]} */ ...a) => mountOutputs(...a)
}));

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {string} id
 * @param {number} revision
 * @param {string} title
 */
function push(
  /** @type {any} */ store,
  /** @type {string} */ id,
  revision,
  title
) {
  store.applyPush({
    type: revision === 1 ? 'snapshot' : 'upsert',
    id: `detail:${id}`,
    revision,
    ...(revision === 1
      ? { issues: [{ id, title, comment_count: 0 }] }
      : { issue: { id, title, comment_count: 0, updated_at: revision } })
  });
}

async function setup(/** @type {string} */ id) {
  document.body.innerHTML = '<section id="mount"></section>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const stores = createSubscriptionIssueStores();
  const view = createDetailView(
    mount,
    async () => ({}),
    () => {},
    stores
  );
  await view.load(id);
  stores.register(`detail:${id}`, { type: 'issue-detail', params: { id } });
  return { mount, store: stores.getStore(`detail:${id}`), view };
}

describe('detail: skeleton and mount slots', () => {
  beforeEach(() => {
    mountCard.mockClear();
    mountOutputs.mockClear();
  });

  test('shows a skeleton at once, not bare Loading text', async () => {
    const { mount } = await setup('UI-9');
    const sk = mount.querySelector('#detail-root.detail-skeleton');
    expect(sk).not.toBeNull();
    expect(sk?.getAttribute('aria-busy')).toBe('true');
    expect(sk?.getAttribute('role')).toBe('status');
    expect(mount.textContent).not.toContain('Loading…');
    expect(mountCard).not.toHaveBeenCalled();
  });

  test('renders data-slot card and outputs and mounts them with the issue', async () => {
    const { mount, store } = await setup('UI-9');
    push(store, 'UI-9', 1, 'First');
    await tick();
    await tick();
    expect(mount.querySelector('.detail-skeleton')).toBeNull();
    const card = mount.querySelector('[data-slot="card"]');
    const out = mount.querySelector('[data-slot="outputs"]');
    expect(card).not.toBeNull();
    expect(out).not.toBeNull();
    expect(mountCard).toHaveBeenCalled();
    expect(mountCard.mock.calls[0][0]).toBe(card);
    expect(mountCard.mock.calls[0][1].id).toBe('UI-9');
    expect(mountOutputs.mock.calls[0][0]).toBe(out);
    expect(mountOutputs.mock.calls[0][1].title).toBe('First');
  });

  test('a new snapshot re-mounts the same element with the new issue', async () => {
    const { mount, store } = await setup('UI-9');
    push(store, 'UI-9', 1, 'First');
    await tick();
    await tick();
    const card = mount.querySelector('[data-slot="card"]');
    mountCard.mockClear();
    push(store, 'UI-9', 2, 'Second');
    await tick();
    await tick();
    expect(mount.querySelector('[data-slot="card"]')).toBe(card);
    const last = mountCard.mock.calls.at(-1);
    expect(last?.[0]).toBe(card);
    expect(last?.[1].title).toBe('Second');
  });

  test('a slot that throws does not break the detail', async () => {
    mountCard.mockImplementation(() => {
      throw new Error('boom');
    });
    const { mount, store } = await setup('UI-9');
    push(store, 'UI-9', 1, 'Still here');
    await tick();
    await tick();
    expect(mount.querySelector('#detail-root h2')?.textContent).toContain(
      'Still here'
    );
    mountCard.mockReset();
  });
});
