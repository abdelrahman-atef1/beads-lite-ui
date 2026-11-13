/**
 * Board v3 entry. main.js calls bootV3() (one hook, flag on only) after it has
 * built the store, ws client, data layer and subscription stores; v3 reuses
 * those through `base` and builds none of the legacy views.
 */
import { applyLang } from '../utils/i18n.js';
import { renderAskHead } from './ask/head-slot.js';
import { renderStepsComment } from './card/steps.js';
import { parseRoute } from './routes.js';
import { createShell } from './shell.js';
import { renderComposerExtras } from './task/composer-ext.js';
import { renderTimeSlot } from './task/time-slot.js';
import { renderBulkBar } from './tasks/bulk.js';
import { groupIssues } from './tasks/lanes.js';
import { mount as desk } from './views/desk.js';
import { mount as kit } from './views/kit.js';
import { mount as projects } from './views/projects.js';
import { mount as releases } from './views/releases.js';
import { mount as settings } from './views/settings.js';
import { mount as task } from './views/task.js';
import { mount as tasks } from './views/tasks.js';
import { mount as time } from './views/time.js';

const VIEWS = {
  desk,
  task,
  tasks,
  releases,
  projects,
  settings,
  time,
  'ui-kit': kit
};

/** Seams every later task fills; exposed so they are imported and bundled. */
export const seams = {
  renderStepsComment,
  renderComposerExtras,
  renderTimeSlot,
  groupIssues,
  renderBulkBar,
  renderAskHead
};

/**
 * @param {HTMLElement} _legacy_root - the legacy #app element (its shell is removed)
 * @param {{ store: any, client: any, send: Function, router: any, data: any, subscriptions: any, sub_issue_stores: any, listSelectors: any }} base
 * @returns {Promise<void>}
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
  /** @type {{ name: string, h: any }} */
  let cur = { name: '', h: null };

  function route() {
    const r = parseRoute(window.location.hash);
    shell.setRoute(r);
    const el = /** @type {HTMLElement} */ (root.querySelector('#u3-view'));
    const ctx = { ...base, route: r, seams, shell };
    if (cur.name === r.name && cur.h && cur.h.update) {
      cur.h.update(r);
      return;
    }
    cur.h?.unmount?.();
    const mount = /** @type {any} */ (VIEWS)[r.name] || desk;
    cur = { name: r.name, h: mount(el, ctx) || null };
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
  return Promise.resolve();
}
