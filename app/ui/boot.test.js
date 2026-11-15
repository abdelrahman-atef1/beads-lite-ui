import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from '../main.js';
import { renderAskHead } from './ask/head-slot.js';
import { renderStepsComment } from './card/steps.js';
import { renderComposerExtras } from './task/composer-ext.js';
import { renderTimeSlot } from './task/time-slot.js';
import { renderBulkBar } from './tasks/bulk.js';
import { groupIssues } from './tasks/lanes.js';
import { hooks as gate } from './workspace-gate.js';

/** Per-test reply for a message type (59.23); null for the rest. */
const replies = vi.hoisted(() => /** @type {Record<string, any>} */ ({}));
const sent = vi.hoisted(() => /** @type {string[]} */ ([]));
vi.mock('../ws.js', () => ({
  createWsClient: () => ({
    async send(/** @type {string} */ type) {
      sent.push(type);
      return replies[type] ?? null;
    },
    on() {
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  })
}));

/**
 * @param {string} hash
 * @param {string} [search]
 */
function setup(hash, search = '') {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/' + search);
  window.location.hash = hash;
  document.documentElement.removeAttribute('data-ui');
  document.body.innerHTML =
    '<div class="shell" id="shell"><main id="app"></main></div>';
  return /** @type {HTMLElement} */ (document.getElementById('app'));
}

describe('?ui=3 boot', () => {
  test('deep link to a bead of another project switches the workspace and reloads, never sits on loading (59.23)', async () => {
    replies['list-workspaces'] = {
      workspaces: [
        { path: 'E:/p/beads-lite', prefix: 'beads-lite' },
        { path: 'E:/p/rayeh', prefix: 'rayeh' }
      ],
      current: { root_dir: 'E:/p/beads-lite', db_path: 'x' }
    };
    replies['set-workspace'] = {
      workspace: { root_dir: 'E:/p/rayeh' },
      changed: true
    };
    sent.length = 0;
    window.sessionStorage.clear();
    const reload = (gate.reload = vi.fn());
    const root = setup('#/issues?issue=rayeh-3.1', '?ui=3');
    void bootstrap(root).ready;
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sent).toContain('set-workspace');
    // the task screen never mounted against the wrong project
    expect(document.querySelector('[data-view="task"]')).toBeNull();
    delete replies['list-workspaces'];
    delete replies['set-workspace'];
    document.getElementById('u3')?.remove();
  });

  test('old id of a moved bead opens the new bead, address bar replaced, says it moved (59.24)', async () => {
    replies['resolve-moved-id'] = { moved: { id: 'x-9.1', repo: 'x' } };
    window.sessionStorage.clear();
    const root = setup('#/issues?issue=company-9.1', '?ui=3');
    await bootstrap(root).ready;
    await vi.waitFor(() =>
      expect(document.querySelector('[data-view="task"]')).not.toBeNull()
    );
    expect(window.location.hash).toBe('#/issues?issue=x-9.1');
    const note = document.querySelector('[data-moved]');
    expect(note?.getAttribute('data-moved')).toBe('company-9.1');
    expect(note?.textContent).toContain('company-9.1');
    delete replies['resolve-moved-id'];
    document.getElementById('u3')?.remove();
  });

  test('flag on: v3 shell replaces the legacy shell, Arabic RTL, same hash opens the task', async () => {
    const root = setup('#/issues?issue=x-1&at=c-last', '?ui=3');
    await bootstrap(root).ready;
    expect(document.documentElement.getAttribute('data-ui')).toBe('3');
    expect(document.getElementById('shell')).toBeNull();
    const u3 = /** @type {HTMLElement} */ (document.getElementById('u3'));
    expect(u3.getAttribute('dir')).toBe('rtl');
    expect(u3.querySelectorAll('.u3-side .u3-nav').length).toBe(5);
    expect(u3.querySelectorAll('.u3-tabs .u3-tab').length).toBe(4);
    const v = u3.querySelector('[data-view="task"]');
    expect(v?.getAttribute('data-at')).toBe('c-last');
    expect(document.getElementById('issues-root')).toBeNull();
    document.getElementById('u3')?.remove();
  });

  test('flag on: routes switch with the hash', async () => {
    const root = setup('#/', '?ui=3');
    await bootstrap(root).ready;
    expect(document.querySelector('.dk3')).not.toBeNull();
    window.location.hash = '#/releases';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-view="releases"]')).not.toBeNull()
    );
    document.getElementById('u3')?.remove();
  });

  test('every seam exists', () => {
    for (const f of [
      renderStepsComment,
      renderComposerExtras,
      renderTimeSlot,
      groupIssues,
      renderBulkBar,
      renderAskHead
    ]) {
      expect(typeof f).toBe('function');
    }
  });

  test('screens are lazy: a route opens once its chunk has loaded, a stale one never mounts', async () => {
    const root = setup('#/', '?ui=3');
    await bootstrap(root).ready;
    window.location.hash = '#/releases';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-view="projects"]')).not.toBeNull()
    );
    expect(document.querySelector('[data-view="releases"]')).toBeNull();
    document.getElementById('u3')?.remove();
  });

  test('each screen gets a fresh host, and a skeleton shows while a lazy chunk loads (.59.19/.59.22)', async () => {
    const root = setup('#/', '?ui=3');
    await bootstrap(root).ready;
    const first = document.querySelector('#u3-view > .u3-screen');
    expect(first).not.toBeNull();
    window.location.hash = '#/time';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    // same tick: never an empty view
    expect(document.querySelector('#u3-view .u3-skel')).not.toBeNull();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-view="time"]')).not.toBeNull()
    );
    expect(document.querySelector('.u3-skel')).toBeNull();
    expect(document.querySelector('#u3-view > .u3-screen')).not.toBe(first);
    document.getElementById('u3')?.remove();
  });
});

describe('flag off = legacy DOM', () => {
  test('?ui=2 clears the flag and renders the legacy sections only', async () => {
    window.localStorage.setItem('bl.ui', '3');
    const root = setup('#/epics', '?ui=2');
    await bootstrap(root).ready;
    expect(document.getElementById('u3')).toBeNull();
    expect(document.documentElement.getAttribute('data-ui')).toBeNull();
    expect(window.localStorage.getItem('bl.ui')).toBeNull();
    expect(document.getElementById('epics-root')).not.toBeNull();
  });
});
