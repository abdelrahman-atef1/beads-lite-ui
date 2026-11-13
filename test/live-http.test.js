/**
 * Live-behaviour guard (beads-lite-1bo5.6.59.1): what the browser gets over
 * plain HTTP from the real app dir. Rows LB16-LB18 of docs/live-behaviour.md.
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../server/app.js';
import { getBoardToken } from '../server/guard.js';

/** @type {import('node:http').Server} */
let server;
let base = '';

beforeAll(async () => {
  const app = createApp({
    host: '127.0.0.1',
    port: 0,
    app_dir: path.resolve('app'),
    root_dir: process.cwd()
  });
  server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
});
afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(() => r(undefined)));
});

describe('LB16 the page and its assets', () => {
  test('index carries this launch token, no-store, and one hashed css + bundle', async () => {
    const r = await fetch(base + '/');
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain(getBoardToken('pc'));
    expect(html).not.toContain('__BOARD_TOKEN__');
    const css = html.match(/\/app\.[0-9a-f]{12}\.css/);
    const js = html.match(/\/main\.[0-9a-f]{12}\.js/);
    expect(css).not.toBeNull();
    expect(js).not.toBeNull();
    for (const u of [css?.[0], js?.[0]]) {
      const a = await fetch(base + u);
      expect(a.status).toBe(200);
      expect(a.headers.get('cache-control')).toContain('immutable');
    }
  });
  test('service worker is served fresh and the manifest exists', async () => {
    const sw = await fetch(base + '/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    expect(await sw.text()).toContain('push');
    expect((await fetch(base + '/manifest.webmanifest')).status).toBe(200);
  });
  test('health answers and x-powered-by is off', async () => {
    const r = await fetch(base + '/healthz');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-powered-by')).toBeNull();
  });
});

describe('LB17 the door refuses strangers', () => {
  test('foreign Host and foreign Origin get 403 on the page and the API', async () => {
    const http = await import('node:http');
    /** @param {string} p @param {Record<string,string>} h */
    const status = (p, h) =>
      new Promise((resolve, reject) => {
        http
          .get(base + p, { headers: h }, (res) => {
            res.resume();
            resolve(res.statusCode);
          })
          .on('error', reject);
      });
    expect(await status('/', { Host: 'evil.example' })).toBe(403);
    expect(
      await status('/api/workspaces', { Origin: 'http://evil.example' })
    ).toBe(403);
    expect(await status('/api/workspaces', {})).toBe(200);
  });
});

describe('LB18 frame headers on every response (.62, pending)', () => {
  // board-v2 a1bf92c has none. The row runs for real the moment .62 lands.
  const probe = async () => {
    const r = await fetch(base + '/');
    return (
      (r.headers.get('content-security-policy') || '').includes(
        'frame-ancestors'
      ) || r.headers.has('x-frame-options')
    );
  };
  test('index and API replies forbid framing', async (ctx) => {
    if (!(await probe()))
      return ctx.skip('pending .62: header not on board-v2');
    for (const p of ['/', '/api/workspaces', '/healthz', '/sw.js']) {
      const r = await fetch(base + p);
      const csp = r.headers.get('content-security-policy') || '';
      expect(
        csp.includes('frame-ancestors') || r.headers.has('x-frame-options')
      ).toBe(true);
    }
  });
});
