import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from '../main.js';
import { seams } from './boot.js';

vi.mock('../ws.js', () => ({
  createWsClient: () => ({
    async send() {
      return null;
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
    expect(document.querySelector('[data-view="desk"]')).not.toBeNull();
    window.location.hash = '#/releases';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('[data-view="releases"]')).not.toBeNull();
    document.getElementById('u3')?.remove();
  });

  test('every seam exists', () => {
    for (const k of [
      'renderStepsComment',
      'renderComposerExtras',
      'renderTimeSlot',
      'groupIssues',
      'renderBulkBar',
      'renderAskHead'
    ]) {
      expect(typeof (/** @type {any} */ (seams)[k])).toBe('function');
    }
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
