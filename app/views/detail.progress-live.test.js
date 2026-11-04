import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

// beads-lite-1bo5.6.47.1: while the parent stays open, a child closing
// refreshes the header bar and re-asks get-weights (once per change).
describe('detail header progress follows children', () => {
  test('child closes -> bar updates, weights re-asked once; no loop', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const kid = (/** @type {string} */ id, /** @type {string} */ status) => ({
      id,
      status,
      priority: 2,
      updated_at: status,
      dependency_type: 'parent-child'
    });
    let issue = {
      id: 'P-1',
      title: 't',
      dependencies: [],
      dependents: [kid('P-1.1', 'open'), kid('P-1.2', 'open')],
      comments: []
    };
    /** @type {Array<() => void>} */
    const subs = [];
    const stores = {
      snapshotFor: () => [issue],
      subscribe: (/** @type {() => void} */ fn) => {
        subs.push(fn);
        return () => {};
      }
    };
    let asked = 0;
    const send = async (/** @type {string} */ type) => {
      if (type === 'get-weights') {
        asked++;
        return {};
      }
      return {};
    };
    const view = createDetailView(mount, send, undefined, stores);
    await view.load('P-1');
    await new Promise((r) => setTimeout(r, 20));
    const now = () =>
      mount.querySelector('.dh-bar')?.getAttribute('aria-valuenow');
    expect(now()).toBe('0');
    expect(asked).toBe(1);

    issue = {
      ...issue,
      dependents: [kid('P-1.1', 'closed'), kid('P-1.2', 'open')]
    };
    subs.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 20));
    expect(Number(now())).toBeGreaterThan(0);
    expect(asked).toBe(2);

    subs.forEach((f) => f()); // same data again: nothing new asked
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).toBe(2);
  });
});
