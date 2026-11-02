import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail failed save (company-1bo5.6.40)', () => {
  test('shows the server reason, keeps the editor open with the typed text', async () => {
    document.body.innerHTML = '<section><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const initial = {
      id: 'UI-1',
      title: 'T',
      status: 'open',
      priority: 2,
      description: 'old'
    };
    const stores = {
      /** @param {string} id */
      snapshotFor: (id) => (id === 'detail:UI-1' ? [initial] : []),
      subscribe: () => () => {}
    };
    const send = vi.fn(async () => {
      throw {
        code: 'bd_error',
        message: 'text too long (30033 chars, limit 24000)'
      };
    });
    const view = createDetailView(mount, send, undefined, stores);
    await view.load('UI-1');

    /** @type {HTMLElement} */ (
      mount.querySelector('.description .editable') ||
        mount.querySelector('.md.editable')
    ).click();
    const ta = /** @type {HTMLTextAreaElement} */ (
      mount.querySelector('#detail-root textarea')
    );
    ta.value = 'my long typed text';
    /** @type {HTMLButtonElement} */ (
      mount.querySelector('.editable-actions button')
    ).click();
    await new Promise((r) => setTimeout(r, 20));

    const toast = document.body.querySelector('.toast');
    expect(toast?.textContent).toContain('text too long (30033 chars');
    const ta2 = /** @type {HTMLTextAreaElement|null} */ (
      mount.querySelector('#detail-root textarea')
    );
    expect(ta2).not.toBeNull();
    expect(ta2?.value).toBe('my long typed text');
    expect(ta2?.disabled).toBe(false);
  });
});
