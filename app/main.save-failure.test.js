import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

// Goes through the REAL main.js transport/detail_transport wrapper. Only the
// ws client is faked, and it rejects exactly as the real one does: with the
// server's { code, message } error object (ws.js rejects with msg.error).
// A mock of the detail view's sendFn would not have caught the swallow in
// main.js (company-1bo5.6.40).
const calls = /** @type {Array<{ type: string, payload: any }>} */ ([]);
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p:any)=>void>} */
  const handlers = {};
  const singleton = {
    /**
     * @param {string} type
     * @param {any} payload
     */
    async send(type, payload) {
      calls.push({ type, payload });
      if (type === 'edit-text' || type === 'add-comment') {
        throw { code: 'bad_request', message: 'text too long (30033 chars)' };
      }
      return null;
    },
    /**
     * @param {string} type
     * @param {(p:any)=>void} handler
     */
    on(type, handler) {
      handlers[type] = handler;
      return () => {};
    },
    /**
     * @param {string} type
     * @param {any} payload
     */
    _trigger(type, payload) {
      if (handlers[type]) handlers[type](payload);
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

describe('failed save through main.js transport', () => {
  test('notes save: server reason toasted, editor stays open with text', async () => {
    window.location.hash = '#/issue/UI-2';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    const client = /** @type {any} */ (createWsClient());
    bootstrap(root);
    await Promise.resolve();
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'detail:UI-2',
      revision: 1,
      issues: [{ id: 'UI-2', title: 'Two', status: 'open', priority: 2 }]
    });
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));

    const view = /** @type {HTMLElement} */ (
      document.querySelector('.notes .editable')
    );
    expect(view).not.toBeNull();
    view.click();
    const ta = /** @type {HTMLTextAreaElement} */ (
      await vi.waitFor(() => {
        const el = document.querySelector('#detail-root .notes textarea');
        if (!el) throw new Error('no editor');
        return el;
      })
    );
    ta.value = 'typed notes that must survive';
    /** @type {HTMLButtonElement} */ (
      document.querySelector('#detail-root .notes .editable-actions button')
    ).click();

    await vi.waitFor(() => {
      const toast = document.querySelector('.toast');
      expect(toast?.textContent).toBe(
        'Failed to save notes: text too long (30033 chars)'
      );
    });
    expect(calls.some((c) => c.type === 'edit-text')).toBe(true);
    const still = /** @type {HTMLTextAreaElement|null} */ (
      document.querySelector('#detail-root .notes textarea')
    );
    expect(still?.value).toBe('typed notes that must survive');
  });
});
