import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { createApp } from './app.js';
import {
  getBoardToken,
  isAllowedHost,
  isAllowedOrigin,
  isValidToken
} from './guard.js';
import { attachWsServer, handleMessage } from './ws.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app_dir = path.resolve(here, '../app');

describe('guard helpers', () => {
  test('host allowlist', () => {
    expect(isAllowedHost('127.0.0.1:3000')).toBe(true);
    expect(isAllowedHost('localhost:3004')).toBe(true);
    expect(isAllowedHost('abdelrahman.tail8a4e50.ts.net')).toBe(true);
    expect(isAllowedHost('evil.example:3000')).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  test('origin must match host', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3000', '127.0.0.1:3000')).toBe(
      true
    );
    expect(
      isAllowedOrigin(
        'https://abdelrahman.tail8a4e50.ts.net',
        'abdelrahman.tail8a4e50.ts.net'
      )
    ).toBe(true);
    expect(isAllowedOrigin('http://evil.example', '127.0.0.1:3000')).toBe(
      false
    );
    expect(isAllowedOrigin('http://127.0.0.1:9', '127.0.0.1:3000')).toBe(false);
    expect(isAllowedOrigin('null', '127.0.0.1:3000')).toBe(false);
    expect(isAllowedOrigin(undefined, '127.0.0.1:3000')).toBe(false);
    // DNS rebinding: origin equals host but host is not ours
    expect(isAllowedOrigin('http://evil.example', 'evil.example')).toBe(false);
  });

  test('token check', () => {
    expect(isValidToken(getBoardToken())).toBe(true);
    expect(isValidToken('x')).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });
});

describe('guarded server', () => {
  /** @type {import('node:http').Server} */
  let server;
  let port = 0;

  beforeAll(async () => {
    const app = createApp({
      host: '127.0.0.1',
      port: 0,
      app_dir,
      root_dir: process.cwd()
    });
    server = createServer(app);
    attachWsServer(server, { path: '/ws', heartbeat_ms: 60000 });
    await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
    port = /** @type {any} */ (server.address()).port;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(undefined)));
  });

  /**
   * @param {string | undefined} origin
   * @param {string} query
   * @returns {Promise<'open' | number>}
   */
  function connect(origin, query) {
    return new Promise((resolve) => {
      const headers = origin ? { Origin: origin } : {};
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`, {
        headers
      });
      ws.on('open', () => {
        ws.close();
        resolve('open');
      });
      ws.on('unexpected-response', (_req, res) => {
        res.resume();
        resolve(res.statusCode || 0);
      });
      ws.on('error', () => {});
    });
  }

  const own = () => `http://127.0.0.1:${port}`;
  const tok = () => `?t=${getBoardToken()}`;

  test('own origin + token upgrades', async () => {
    expect(await connect(own(), tok())).toBe('open');
  });

  test('foreign origin refused', async () => {
    expect(await connect('http://evil.example', tok())).toBe(403);
  });

  test('missing origin refused', async () => {
    expect(await connect(undefined, tok())).toBe(403);
  });

  test('missing or wrong token refused', async () => {
    expect(await connect(own(), '')).toBe(403);
    expect(await connect(own(), '?t=nope')).toBe(403);
  });

  test('page carries the token, no-store', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    expect(html).toContain(
      `<meta name="board-token" content="${getBoardToken()}"`
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('HTTP with foreign Origin refused, no Origin allowed', async () => {
    const bad = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      headers: { Origin: 'http://evil.example' }
    });
    expect(bad.status).toBe(403);
    const ok = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(ok.status).toBe(200);
  });

  test('foreign Host (DNS rebinding) refused over HTTP', async () => {
    const { request } = await import('node:http');
    const status = await new Promise((resolve) => {
      const r = request(
        { host: '127.0.0.1', port, path: '/', headers: { Host: 'evil.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
      r.end();
    });
    expect(status).toBe(403);
  });

  test('every mutation on an unauthed real connection is refused', async () => {
    const { MUTATING_TYPES } = await import('./guard.js');
    for (const type of MUTATING_TYPES) {
      /** @type {string[]} */
      const sent = [];
      const ws = {
        guarded: true,
        authed: false,
        send: (/** @type {string} */ m) => sent.push(m)
      };
      await handleMessage(
        /** @type {any} */ (ws),
        Buffer.from(JSON.stringify({ id: '1', type, payload: {} }))
      );
      expect(JSON.parse(sent[0]).error.code).toBe('forbidden');
    }
  });
});
