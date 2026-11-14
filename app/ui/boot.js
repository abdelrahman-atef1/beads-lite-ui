/**
 * Board v3 entry. main.js calls bootV3() (one hook, flag on only) after it has
 * built the store, ws client, data layer and subscription stores; v3 reuses
 * those through `base` and builds none of the legacy views.
 *
 * Payload (beads-lite-1bo5.6.59.19): the shell and the desk are in the first
 * load; every other screen is its own chunk, fetched the first time its route
 * opens. Each loader below is one literal import() so esbuild can split it.
 */
import { applyLang } from '../utils/i18n.js';
import { mountPanels } from './panels/mount.js';
import { parseRoute } from './routes.js';
import { attachSearch } from './search.js';
import { createShell } from './shell.js';
import { mount as desk } from './views/desk.js';

/** @type {Record<string, () => Promise<{ mount: Function }>>} */
const LAZY = {
  task: () => import('./views/task.js'),
  tasks: () => import('./views/tasks.js'),
  releases: () => import('./views/releases.js'),
  projects: () => import('./views/projects.js'),
  settings: () => import('./views/settings.js'),
  time: () => import('./views/time.js'),
  'ui-kit': () => import('./views/kit.js')
};

/**
 * @param {HTMLElement} _legacy_root - the legacy #app element (its shell is removed)
 * @param {{ store: any, client: any, send: Function, router: any, data: any, subscriptions: any, sub_issue_stores: any, listSelectors: any }} base
 * @returns {Promise<void>} resolves when the first screen is on the page
 */
export function bootV3(_legacy_root, base) {
  document.documentElement.setAttribute('data-ui', '3');
  try {
    // Arabic first: with no stored choice, v3 opens in Arabic (RTL).
    if (!window.localStorage.getItem('beads-ui.lang')) {
      window.localStorage.setItem('beads-ui.lang', 'ar');
    }
  } catch {
    // ignore storage errors
  }
  applyLang();
  document.getElementById('shell')?.remove();
  const root = document.createElement('div');
  root.id = 'u3';
  root.className = 'u3';
  document.body.appendChild(root);

  const shell = createShell(root, base);
  mountPanels(root, base);
  attachSearch(base); // SHELL-REQ .59.14: top search on every screen
  /** @type {{ name: string, h: any }} */
  let cur = { name: '', h: null };
  /** Bumped on every route change: a slow chunk never mounts over a newer screen. */
  let seq = 0;

  /** @returns {Promise<void>} */
  function route() {
    const r = parseRoute(window.location.hash);
    shell.setRoute(r);
    const el = /** @type {HTMLElement} */ (root.querySelector('#u3-view'));
    const ctx = { ...base, route: r, shell };
    if (cur.name === r.name && cur.h && cur.h.update) {
      cur.h.update(r);
      return Promise.resolve();
    }
    cur.h?.unmount?.();
    cur = { name: '', h: null };
    const mine = ++seq;
    /** @param {Function} mount */
    const open = (mount) => {
      cur = { name: r.name, h: mount(el, ctx) || null };
      try {
        window.sessionStorage.removeItem('bl.chunk-retry');
      } catch {
        // ignore storage errors
      }
      window.scrollTo(0, 0);
    };
    const load = LAZY[r.name];
    if (!load) {
      open(desk);
      return Promise.resolve();
    }
    return load().then(
      (m) => {
        if (mine === seq) open(m.mount);
      },
      () => {
        // Chunk gone (a new build went live under an open page): one reload
        // fetches the new shell; the flag stops a reload loop.
        if (mine !== seq) return;
        try {
          if (window.sessionStorage.getItem('bl.chunk-retry') !== '1') {
            window.sessionStorage.setItem('bl.chunk-retry', '1');
            window.location.reload();
          }
        } catch {
          // ignore storage errors
        }
      }
    );
  }
  window.addEventListener('hashchange', () => void route());
  return route();
}
