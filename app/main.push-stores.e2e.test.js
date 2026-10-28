import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

/** Wait for subscription stores to notify their view listeners. */
async function flushStoreNotifications() {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    await new Promise((resolve) =>
      globalThis.requestAnimationFrame(() => resolve(undefined))
    );
    return;
  }
  await Promise.resolve();
  await Promise.resolve();
}

// Mock WS client to drive push envelopes and connection state
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p: any) => void>} */
  const handlers = {};
  /** @type {Set<(s: 'connecting'|'open'|'closed'|'reconnecting') => void>} */
  const connHandlers = new Set();
  /** @type {Array<[string, any]>} */
  const sent = [];
  const singleton = {
    /** Test helper: every message the client was asked to send */
    _sent: sent,
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    async send(type, payload) {
      // Subscriptions are fire-and-forget in tests, but recorded so tests can
      // assert which subscriptions a view requests.
      sent.push([String(type), payload]);
      return null;
    },
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {(p:any)=>void} handler
     */
    on(type, handler) {
      handlers[type] = handler;
      return () => {
        delete handlers[type];
      };
    },
    /** Test helper: trigger a server event */
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    _trigger(type, payload) {
      if (handlers[type]) {
        handlers[type](payload);
      }
    },
    /**
     * @param {(s:'connecting'|'open'|'closed'|'reconnecting')=>void} fn
     */
    onConnection(fn) {
      connHandlers.add(fn);
      return () => connHandlers.delete(fn);
    },
    /** Test helper: emit connection state */
    /** @param {'connecting'|'open'|'closed'|'reconnecting'} s */
    _emitConn(s) {
      for (const fn of Array.from(connHandlers)) {
        try {
          fn(s);
        } catch {
          /* ignore */
        }
      }
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

describe('push stores integration (board view)', () => {
  /** Boot the app on the board and return the ws client + helpers. */
  async function boot() {
    const client = /** @type {any} */ (createWsClient());
    client._sent.length = 0;
    window.location.hash = '#/board';
    document.body.innerHTML = '<nav id="top-nav"></nav><main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    await bootstrap(root).ready;
    await flushStoreNotifications();
    return client;
  }
  /**
   * @param {any} client
   * @param {string} id
   * @param {any[]} issues
   * @param {number} [revision]
   */
  function snapshot(client, id, issues, revision = 1) {
    client._trigger('snapshot', { type: 'snapshot', id, revision, issues });
  }
  const count = (/** @type {string} */ col) =>
    document.querySelectorAll(`#${col}-col .card`).length;

  test('subscribes to the all-issues list, ready, blocked and closed', async () => {
    const client = await boot();
    await Promise.resolve();
    const requested = client._sent
      .filter((/** @type {[string, any]} */ e) => e[0] === 'subscribe-list')
      .map((/** @type {[string, any]} */ e) => e[1]);
    const typeOf = (/** @type {string} */ id) =>
      requested.find((/** @type {any} */ p) => p.id === id)?.type;
    expect(typeOf('tab:all')).toBe('all-issues');
    expect(typeOf('tab:board:ready')).toBe('ready-issues');
    expect(typeOf('tab:board:blocked')).toBe('blocked-issues');
    expect(typeOf('tab:board:closed')).toBe('closed-issues');
    // The contract needs one list call for every non-closed column, so the
    // per-status lists are gone.
    expect(typeOf('tab:board:in-progress')).toBeUndefined();
    expect(typeOf('tab:board:status-blocked')).toBeUndefined();
  });

  test('columns follow push events (snapshot, upsert, delete)', async () => {
    const client = await boot();
    expect(count('progress')).toBe(0);

    snapshot(client, 'tab:all', [
      { id: 'P-1', title: 'prog 1', status: 'in_progress', updated_at: 20_000 },
      { id: 'R-1', title: 'ready 1', status: 'open', updated_at: 10_000 },
      { id: 'R-2', title: 'ready 2', status: 'open', updated_at: 11_000 }
    ]);
    snapshot(client, 'tab:board:ready', [
      { id: 'R-1', title: 'ready 1', status: 'open' },
      { id: 'R-2', title: 'ready 2', status: 'open' }
    ]);
    await flushStoreNotifications();
    expect(count('ready')).toBe(2);
    expect(count('progress')).toBe(1);

    client._trigger('upsert', {
      type: 'upsert',
      id: 'tab:all',
      revision: 2,
      issue: {
        id: 'P-1',
        title: 'prog 1',
        status: 'waiting_for_test',
        updated_at: 21_000
      }
    });
    await flushStoreNotifications();
    expect(count('progress')).toBe(0);
    expect(count('test')).toBe(1);

    client._trigger('delete', {
      type: 'delete',
      id: 'tab:all',
      revision: 3,
      issue_id: 'P-1'
    });
    await flushStoreNotifications();
    expect(count('test')).toBe(0);
    expect(count('ready')).toBe(2);
  });

  test('reconnect replay does not duplicate entries', async () => {
    const client = await boot();
    const issues = [
      { id: 'R-1', title: 'r1', status: 'open', updated_at: 10_000 },
      { id: 'R-2', title: 'r2', status: 'open', updated_at: 10_100 }
    ];
    snapshot(client, 'tab:all', issues);
    snapshot(client, 'tab:board:ready', issues);
    await flushStoreNotifications();
    expect(count('ready')).toBe(2);

    client._emitConn('reconnecting');
    client._emitConn('open');
    snapshot(client, 'tab:all', issues);
    snapshot(client, 'tab:board:ready', issues);
    await flushStoreNotifications();
    expect(count('ready')).toBe(2);
  });

  test('Blocked holds dependency-blocked and stored-status blocked, once each', async () => {
    const client = await boot();
    snapshot(client, 'tab:all', [
      { id: 'D-1', title: 'dep blocked', status: 'open', updated_at: 10_000 },
      {
        id: 'S-1',
        title: 'status blocked',
        status: 'blocked',
        updated_at: 10_200
      }
    ]);
    // `bd blocked` may also report the stored-status one: still one card.
    snapshot(client, 'tab:board:blocked', [
      { id: 'D-1', title: 'dep blocked', status: 'open' },
      { id: 'S-1', title: 'status blocked', status: 'blocked' }
    ]);
    await flushStoreNotifications();
    const ids = Array.from(document.querySelectorAll('#blocked-col .card')).map(
      (el) => el.getAttribute('data-issue-id')
    );
    expect(ids.slice().sort()).toEqual(['D-1', 'S-1']);
  });

  test('the Decisions tab count follows owner_decision beads', async () => {
    const client = await boot();
    snapshot(client, 'tab:all', [
      { id: 'O-1', title: 'q1', status: 'owner_decision', updated_at: 1 },
      { id: 'O-2', title: 'q2', status: 'owner_decision', updated_at: 2 },
      { id: 'P-1', title: 'p', status: 'in_progress', updated_at: 3 }
    ]);
    await flushStoreNotifications();
    expect(document.querySelector('.nav-badge')?.textContent).toBe('2');
  });
});
