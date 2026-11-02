import { describe, expect, test, vi } from 'vitest';
import { createWsClient } from './ws.js';

// Real createWsClient (not the fake client the view tests use): it rejects a
// type app/protocol.js does not know, which hid the missing push-* types.
function fakeSocket() {
  /** @type {any[]} */
  const sockets = [];
  class FakeWebSocket {
    /** @param {string} url */
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.OPEN = 1;
      /** @type {Record<string, Array<(e:any)=>void>>} */
      this.l = { open: [], message: [], error: [], close: [] };
      /** @type {string[]} */
      this.sent = [];
      sockets.push(this);
    }
    /** @param {string} t @param {(e:any)=>void} f */
    addEventListener(t, f) {
      this.l[t].push(f);
    }
    removeEventListener() {}
    /** @param {string} d */
    send(d) {
      this.sent.push(String(d));
    }
    close() {}
    openNow() {
      this.readyState = 1;
      this.l.open.forEach((f) => f({}));
    }
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);
  return sockets;
}

describe('push ws types reach the wire through the real client', () => {
  test('push-key, subscribe, unsubscribe, list, remove are all sendable', async () => {
    const sockets = fakeSocket();
    const client = createWsClient({
      backoff: { initialMs: 5, maxMs: 5, jitterRatio: 0 }
    });
    sockets[0].openNow();
    const types = [
      'push-key',
      'push-subscribe',
      'push-unsubscribe',
      'push-list',
      'push-remove'
    ];
    for (const t of types) {
      void (/** @type {any} */ (client).send(t, {}).catch(() => {}));
    }
    const sent = sockets[0].sent.map(
      (/** @type {string} */ s) => JSON.parse(s).type
    );
    expect(sent).toEqual(types);
  });
});
