/**
 * Live-behaviour guard (beads-lite-1bo5.6.59.1): the socket contract the board
 * UI depends on. Real http server + real ws client + the real feature
 * handlers; only inputs that never reach bd, the card CLI or the disk.
 * Rows LB07-LB09 of docs/live-behaviour.md.
 */
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../server/app.js';
import { getHandler, isFeatureMutating } from '../server/features/index.js';
import { getBoardToken } from '../server/guard.js';
import { attachWsServer } from '../server/ws.js';

/** Every feature socket type the UI sends: [type, mutating]. */
const WIRE = /** @type {[string, boolean][]} */ ([
  ['card-state', false],
  ['card-answer', true],
  ['card-ask', true],
  ['list-decisions-all', false],
  ['notify-list', false],
  ['notify-mark-read', true],
  ['notify-set', true],
  ['notify-mute', true],
  ['push-key', false],
  ['push-subscribe', true],
  ['push-list', false],
  ['push-remove', true],
  ['push-unsubscribe', true],
  ['outputs-get', false],
  ['outputs-project', false],
  ['releases-list', false],
  ['releases-get', false]
]);

/** @type {import('node:http').Server} */
let server;
let port = 0;
/** @type {string} */
let dir = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livewire-'));
  const app = createApp({
    host: '127.0.0.1',
    port: 0,
    app_dir: path.resolve('app'),
    root_dir: dir
  });
  server = createServer(app);
  attachWsServer(server, { path: '/ws', heartbeat_ms: 60000, root_dir: dir });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  port = /** @type {any} */ (server.address()).port;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(() => r(undefined)));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** One request on a fresh authed socket; resolves with the reply frame. */
function call(/** @type {string} */ type, /** @type {any} */ payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${getBoardToken()}`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    const timer = setTimeout(
      () => reject(new Error('no reply: ' + type)),
      8000
    );
    ws.on('error', reject);
    ws.on('open', () =>
      ws.send(JSON.stringify({ id: 'live-1', type, payload }))
    );
    ws.on('message', (m) => {
      const f = JSON.parse(String(m));
      if (f.id !== 'live-1') return;
      clearTimeout(timer);
      ws.close();
      resolve(f);
    });
  });
}

describe('LB07 feature socket types the UI sends', () => {
  test.each(WIRE)('%s is registered; mutating=%s', (type, mutating) => {
    expect(typeof getHandler(type)).toBe('function');
    expect(isFeatureMutating(type)).toBe(mutating);
  });
});

describe('LB08 a socket without the board token never connects', () => {
  test('no token, wrong token and foreign origin are refused (403)', async () => {
    /** @param {string} q @param {string} origin */
    const status = (q, origin) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${q}`, {
          headers: { Origin: origin }
        });
        ws.on('open', () => {
          ws.close();
          resolve('open');
        });
        ws.on('unexpected-response', (_r, res) => {
          res.resume();
          resolve(res.statusCode);
        });
        ws.on('error', () => {});
      });
    const own = `http://127.0.0.1:${port}`;
    expect(await status('', own)).toBe(403);
    expect(await status('?t=wrong', own)).toBe(403);
    expect(await status(`?t=${getBoardToken()}`, 'http://evil.example')).toBe(
      403
    );
    expect(await status(`?t=${getBoardToken()}`, own)).toBe('open');
  });
});

describe('LB09 card handlers answer on the real socket', () => {
  test('card-state with a bad id is a bad_input reply, not a crash', async () => {
    const f = /** @type {any} */ (await call('card-state', { id: 'x;rm -rf' }));
    expect(f.ok).toBe(false);
    expect(f.error.code).toBe('bad_input');
  });
  test('card-answer needs exactly one of option or text', async () => {
    const none = /** @type {any} */ (await call('card-answer', { id: 'a-1' }));
    expect(none.ok).toBe(false);
    const both = /** @type {any} */ (
      await call('card-answer', { id: 'a-1', option: 1, text: 'x' })
    );
    expect(both.ok).toBe(false);
  });
  test('card-ask with a bad id is refused before any wake', async () => {
    const f = /** @type {any} */ (
      await call('card-ask', { id: '../x', question: 'why?' })
    );
    expect(f.ok).toBe(false);
  });
  test('ping still works (the socket is the same one the cards use)', async () => {
    const f = /** @type {any} */ (await call('ping', {}));
    expect(f.ok).toBe(true);
  });
});
