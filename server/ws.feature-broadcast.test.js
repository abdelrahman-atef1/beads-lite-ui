import { createServer } from 'node:http';
import { afterAll, describe, expect, test } from 'vitest';
import { registerHandler } from './features/index.js';
import { attachWsServer, handleMessage } from './ws.js';

// beads-lite-1bo5.6.49: a feature handler's ctx.broadcast must reach open
// clients. It was a silent no-op, so an open Decisions tab never updated.

const server = createServer();
const { wss } = attachWsServer(server, {
  path: '/ws',
  heartbeat_ms: 0,
  refresh_debounce_ms: 5,
  root_dir: process.cwd()
});

afterAll(() => {
  wss.clients.clear();
  wss.close();
  server.close();
});

/** @returns {any} */
function sock() {
  return {
    sent: /** @type {any[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    ping() {},
    terminate() {},
    /** @param {string} m */
    send(m) {
      this.sent.push(JSON.parse(String(m)));
    }
  };
}

describe('feature broadcast', () => {
  test('ctx.broadcast from a feature handler reaches every open client', async () => {
    registerHandler('probe-broadcast', (_req, ctx) => {
      ctx.broadcast('decisions-all', { items: [] });
      return null;
    });
    const caller = sock();
    const other = sock();
    wss.clients.add(caller);
    wss.clients.add(other);
    await handleMessage(
      caller,
      Buffer.from(JSON.stringify({ id: '1', type: 'probe-broadcast' }))
    );
    for (const s of [caller, other]) {
      const ev = s.sent.find((m) => m.type === 'decisions-all');
      expect(ev?.payload).toEqual({ items: [] });
    }
  });
});
