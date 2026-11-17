import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createWsClient } from './ws.js';

/**
 * @returns {any[]}
 */
function setupFakeWebSocket() {
  /** @type {any[]} */
  const sockets = [];
  class FakeWebSocket {
    /** @param {string} url */
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.OPEN = 1;
      this.CLOSING = 2;
      this.CLOSED = 3;
      /** @type {{ open: Array<(ev:any)=>void>, message: Array<(ev:any)=>void>, error: Array<(ev:any)=>void>, close: Array<(ev:any)=>void> }} */
      this._listeners = { open: [], message: [], error: [], close: [] };
      /** @type {string[]} */
      this.sent = [];
      sockets.push(this);
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {(ev:any)=>void} fn
     */
    addEventListener(type, fn) {
      this._listeners[type].push(fn);
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {(ev:any)=>void} fn
     */
    removeEventListener(type, fn) {
      const a = this._listeners[type];
      const i = a.indexOf(fn);
      if (i !== -1) {
        a.splice(i, 1);
      }
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {any} ev
     */
    _dispatch(type, ev) {
      for (const fn of this._listeners[type]) {
        try {
          fn(ev);
        } catch {
          // ignore
        }
      }
    }
    openNow() {
      this.readyState = this.OPEN;
      this._dispatch('open', {});
    }
    /** @param {string} data */
    send(data) {
      this.sent.push(String(data));
    }
    /** @param {any} obj */
    emitMessage(obj) {
      this._dispatch('message', { data: JSON.stringify(obj) });
    }
    close() {
      this.readyState = this.CLOSED;
      this._dispatch('close', {});
    }
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);
  return sockets;
}

describe('app/ws client', () => {
  // every retry fetches the page for a fresh token; by default that works
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ text: async () => '<html></html>' }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('correlates replies for concurrent sends', async () => {
    const sockets = setupFakeWebSocket();
    const client = createWsClient({
      backoff: { initialMs: 5, maxMs: 5, jitterRatio: 0 }
    });
    // open connection
    sockets[0].openNow();

    const p1 = client.send('list-issues', { filters: {} });
    const p2 = client.send('edit-text', {
      id: 'UI-1',
      field: 'title',
      value: 'T'
    });

    // Parse the last two frames to extract ids
    const frames = sockets[0].sent
      .slice(-2)
      .map((/** @type {string} */ s) => JSON.parse(s));
    const id1 = frames[0].id;
    const id2 = frames[1].id;

    // Reply out of order
    sockets[0].emitMessage({
      id: id2,
      ok: true,
      type: 'edit-text',
      payload: { id: 'UI-1' }
    });
    sockets[0].emitMessage({
      id: id1,
      ok: true,
      type: 'list-issues',
      payload: [{ id: 'UI-1' }]
    });

    await expect(p2).resolves.toEqual({ id: 'UI-1' });
    await expect(p1).resolves.toEqual([{ id: 'UI-1' }]);
  });

  test('reconnects after close', async () => {
    vi.useFakeTimers();
    const sockets = setupFakeWebSocket();
    const client = createWsClient({
      backoff: { initialMs: 10, maxMs: 10, jitterRatio: 0 }
    });

    // First connection opens
    sockets[0].openNow();

    // Close the socket to trigger reconnect
    sockets[0].close();
    // Advance timers for reconnect
    await vi.advanceTimersByTimeAsync(10);

    // Second socket should exist and open
    expect(sockets.length).toBeGreaterThan(1);
    sockets[1].openNow();
    // No automatic subscribe frames in v2; just ensure reconnect occurred
    expect(Array.isArray(sockets[1].sent)).toBe(true);

    vi.useRealTimers();
    client.close();
  });

  test('dispatches server events', async () => {
    const sockets = setupFakeWebSocket();
    const client = createWsClient();
    sockets[0].openNow();

    /** @type {any[]} */
    const events = [];
    client.on('snapshot', (p) => events.push(p));
    sockets[0].emitMessage({
      id: 'evt-1',
      ok: true,
      type: 'snapshot',
      payload: {
        type: 'snapshot',
        id: 'any',
        revision: 1,
        issues: []
      }
    });
    expect(events.length).toBe(1);

    // No handler registered for create-issue -> warn
    sockets[0].emitMessage({
      id: 'evt-2',
      ok: true,
      type: 'create-issue',
      payload: {}
    });
    client.close();
  });

  test('a socket refused before it opens re-reads the board token (company-1bo5.6.39)', async () => {
    const sockets = setupFakeWebSocket();
    document.head.innerHTML = '<meta name="board-token" content="old">';
    const fetchMock = vi.fn(async () => ({
      text: async () =>
        '<meta name="board-token" content="new" /><title>x</title>'
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createWsClient({
      backoff: { initialMs: 5, maxMs: 5, jitterRatio: 0 }
    });
    expect(sockets[0].url).toContain('t=old');
    sockets[0].close(); // server refused the stale token: never opened
    await new Promise((r) => setTimeout(r, 40));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toContain('t=new');
    // a drop after it opened also re-reads the token (a restart changes it)
    sockets[1].openNow();
    sockets[1].close();
    await new Promise((r) => setTimeout(r, 40));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.close();
  });

  test('first refused connect retries at once with the new token, even with a long backoff', async () => {
    const sockets = setupFakeWebSocket();
    document.head.innerHTML = '<meta name="board-token" content="old">';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        text: async () => '<meta name="board-token" content="new" />'
      }))
    );
    const client = createWsClient({
      backoff: { initialMs: 5000, maxMs: 5000, jitterRatio: 0 }
    });
    sockets[0].close();
    await new Promise((r) => setTimeout(r, 60));
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toContain('t=new');
    client.close();
  });

  test('after a drop of an open socket, retries fast with a fresh token (restart under 2 s)', async () => {
    const sockets = setupFakeWebSocket();
    document.head.innerHTML = '<meta name="board-token" content="old">';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        text: async () => '<meta name="board-token" content="new" />'
      }))
    );
    const client = createWsClient();
    sockets[0].openNow();
    sockets[0].close(); // server restarted
    await new Promise((r) => setTimeout(r, 400));
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toContain('t=new');
    sockets[1].close(); // refused once more: second quick retry, not 2 s
    await new Promise((r) => setTimeout(r, 800));
    expect(sockets.length).toBe(3);
    client.close();
  });

  test('a failed or slow token fetch does not hold back retries; a new token reconnects at once', async () => {
    const sockets = setupFakeWebSocket();
    document.head.innerHTML = '<meta name="board-token" content="old">';
    /** @type {(v: any) => void} */
    let release = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve; // the fresh server is slow to answer GET /
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createWsClient();
    sockets[0].openNow();
    sockets[0].close(); // restart
    await new Promise((r) => setTimeout(r, 300));
    // the retry did not wait for the fetch
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toContain('t=old');
    release({ text: async () => '<meta name="board-token" content="new" />' });
    await new Promise((r) => setTimeout(r, 30));
    // token changed while the old-token socket was still connecting: its
    // close retries; after it fails the next socket carries the new token
    sockets[1].close();
    await new Promise((r) => setTimeout(r, 600));
    expect(sockets.length).toBe(3);
    expect(sockets[2].url).toContain('t=new');
    client.close();
  });

  // Removed: subscription ack frames; no warnings to test
});
