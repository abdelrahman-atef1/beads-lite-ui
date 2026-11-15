/**
 * Board v3 entry. main.js calls bootV3() (one hook, flag on only) after it has
 * built the store, ws client, data layer and subscription stores; v3 reuses
 * those through `base` and builds none of the legacy views.
 *
 * Payload (beads-lite-1bo5.6.59.19): the shell, the desk and the small screens
 * are in the first load; the three heavy ones (task, tasks, time) are chunks,
 * fetched the first time their route opens. Each lazy loader is one literal
 * import() so esbuild can split it. Why only three: every split screen adds
 * shared chunk files the first load imports, and a phone on Fast 3G paid for
 * each (cto, 59.19: all seven, 3.5 s to the desk; these three, 2.5 s, same as
 * one file). Past the gate it is a trade: more screens split, fewer bytes,
 * more requests. Measure both before moving a screen.
 */
import { applyLang } from '../utils/i18n.js';
import { t3 } from './i18n.js';
import { mountPanels } from './panels/mount.js';
import { parseRoute } from './routes.js';
import { attachSearch } from './search.js';
import { createShell } from './shell.js';
import { mount as desk } from './views/desk.js';
import { mount as kit } from './views/kit.js';
import { mount as projects } from './views/projects.js';
import { mount as releases } from './views/releases.js';
import { mount as settings } from './views/settings.js';
import {
  applyMoved,
  movedNote,
  resolveMoved,
  switchForIssue
} from './workspace-gate.js';

/** @type {Record<string, () => Promise<{ mount: Function }>>} */
const LAZY = {
  task: () => import('./views/task.js'),
  tasks: () => import('./views/tasks.js'),
  releases: () => Promise.resolve({ mount: releases }),
  projects: () => Promise.resolve({ mount: projects }),
  settings: () => Promise.resolve({ mount: settings }),
  time: () => import('./views/time.js'),
  'ui-kit': () => Promise.resolve({ mount: kit })
};

/** @returns {HTMLElement} three grey bars, styled in u3-shell.css */
/**
 * Show a line above the task screen saying the bead moved, after an old-id redirect.
 *
 * @param {HTMLElement} el
 * @param {string | null} id
 */
function showMoved(el, id) {
  el.parentElement?.querySelector('[data-moved]')?.remove();
  const from = movedNote(id);
  if (!from) return;
  const p = document.createElement('p');
  p.className = 'u3-muted';
  p.setAttribute('role', 'status');
  p.setAttribute('data-moved', from);
  p.textContent = t3('u3_moved') + ' ' + from;
  el.before(p);
}

function skeleton() {
  const d = document.createElement('div');
  d.className = 'u3-skel';
  d.setAttribute('aria-busy', 'true');
  d.innerHTML = '<i></i><i></i><i></i>';
  return d;
}

/** After the first screen: fetch the lazy chunks while idle, unless data is scarce. */
function prefetchLazy() {
  const c = /** @type {any} */ (navigator).connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  const go = () => {
    for (const k of ['task', 'tasks', 'time']) LAZY[k]().catch(() => {});
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(go);
  else setTimeout(go, 2000);
}

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
  /** @type {{ name: string, h: any, id?: string | null }} */
  let cur = { name: '', h: null };
  /** Bumped on every route change: a slow chunk never mounts over a newer screen. */
  let seq = 0;

  /** @returns {Promise<void>} */
  function route() {
    const r0 = parseRoute(window.location.hash);
    if (r0.name === 'task' && r0.id) {
      // An old id of a moved bead: swap in the new id first (59.24).
      const old = r0.id;
      return resolveMoved(base, old).then((to) => {
        if (to && parseRoute(window.location.hash).id === old) {
          applyMoved(old, to);
        }
        return routeTo(parseRoute(window.location.hash));
      });
    }
    return routeTo(r0);
  }

  /**
   * @param {any} r
   * @returns {Promise<void>}
   */
  function routeTo(r) {
    shell.setRoute(r);
    const host = /** @type {HTMLElement} */ (root.querySelector('#u3-view'));
    const ctx = { ...base, route: r, shell };
    if (cur.name === r.name && cur.h && cur.h.update) {
      if (r.name === 'task' && r.id && r.id !== cur.id) {
        // In-app link to a bead of another project (59.23): switch first.
        const mine = ++seq;
        cur.id = r.id;
        return switchForIssue(base, r.id).then((reloading) => {
          if (!reloading && mine === seq) {
            cur.h?.update?.(r);
            const scr = host.querySelector('.u3-screen');
            if (scr) showMoved(/** @type {HTMLElement} */ (scr), r.id);
          }
        });
      }
      cur.h.update(r);
      return Promise.resolve();
    }
    cur.h?.unmount?.();
    cur = { name: '', h: null };
    const mine = ++seq;
    /** @param {Function} mount */
    const open = (mount) => {
      // A fresh host per screen: a view that wipes its host (textContent = '')
      // leaves lit's old part pointing at removed markers, and the next lit
      // render into the same element threw 'insertBefore' of null (.59.22 F-B).
      const el = document.createElement('div');
      el.className = 'u3-screen';
      host.replaceChildren(el); // also drops the skeleton
      cur = { name: r.name, h: mount(el, ctx) || null, id: r.id };
      try {
        window.sessionStorage.removeItem('bl.chunk-retry');
      } catch {
        // ignore storage errors
      }
      window.scrollTo(0, 0);
      showMoved(el, r.name === 'task' ? r.id : null);
    };
    // A task link of another project switches to it first (59.23); the chunk
    // travels meanwhile. On a switch the page reloads, so the mount never runs.
    const rid = r.id;
    const load =
      r.name === 'task' && rid
        ? () =>
            Promise.all([switchForIssue(base, rid), LAZY.task()]).then(
              ([reloading, m]) => (reloading ? new Promise(() => {}) : m)
            )
        : LAZY[r.name];
    if (!load) {
      open(desk);
      return Promise.resolve();
    }
    // Never a blank screen while the chunk travels: a skeleton goes in now.
    host.replaceChildren(skeleton());
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
  return route().then(prefetchLazy);
}
