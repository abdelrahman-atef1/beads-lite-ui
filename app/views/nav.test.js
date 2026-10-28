import { describe, expect, test, vi } from 'vitest';
import { createTopNav } from './nav.js';

function setup() {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const store = {
    state: { view: 'issues' },
    getState() {
      return this.state;
    },
    /** @param {any} v */
    set(v) {
      this.state = { ...this.state, ...v };
    },
    /** @param {(s: any) => void} fn */
    subscribe(fn) {
      // simplistic subscription for test
      this._fn = fn;
      return () => void 0;
    },
    _fn: /** @type {(s: any) => void} */ (() => {})
  };
  const router = { gotoView: vi.fn() };
  return { mount, store, router };
}

describe('views/nav', () => {
  test('renders and routes between tabs', async () => {
    const { mount, store, router } = setup();
    createTopNav(
      mount,
      /** @type {any} */ (store),
      /** @type {any} */ (router)
    );
    const links = mount.querySelectorAll('a.tab');
    expect(links.length).toBe(3);
    links[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('decisions');
    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('board');
    links[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('issues');
    expect(mount.querySelector('button.tab--menu')).toBeTruthy();
  });

  test('Decisions tab shows the count of owner_decision beads', () => {
    const { mount, store, router } = setup();
    const stores = {
      isLoaded: () => true,
      snapshotFor: () => [
        { id: 'a', status: 'owner_decision' },
        { id: 'b', status: 'owner_decision' },
        { id: 'c', status: 'open' }
      ],
      subscribeFor: () => () => {}
    };
    createTopNav(
      mount,
      /** @type {any} */ (store),
      /** @type {any} */ (router),
      stores
    );
    const badge = mount.querySelector('a.tab .nav-badge');
    expect(badge && badge.textContent).toBe('2');
  });

  test('no badge while the list has not loaded (never a false 0)', () => {
    const { mount, store, router } = setup();
    const stores = {
      isLoaded: () => false,
      snapshotFor: () => [],
      subscribeFor: () => () => {}
    };
    createTopNav(
      mount,
      /** @type {any} */ (store),
      /** @type {any} */ (router),
      stores
    );
    expect(mount.querySelector('.nav-badge')).toBeNull();
  });
});
