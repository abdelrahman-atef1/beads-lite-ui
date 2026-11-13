import { createServer, request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'abdelrahman.tail8a4e50.ts.net';
const OWNER = 'owner@example.com';
const cfg = () => ({
  host: '127.0.0.1',
  port: 0,
  app_dir: path.resolve(here, '../app'),
  root_dir: process.cwd()
});

describe('clickjacking: no site may frame the board', () => {
  /** @type {import('node:http').Server[]} */
  let servers = [];
  /** @type {Record<string, number>} */
  let ports = {};

  beforeAll(async () => {
    const pc = createServer(createApp(cfg()));
    const phone = createServer(createApp(cfg(), 'phone'));
    servers = [pc, phone];
    for (const s of servers) {
      await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
    }
    ports = {
      pc: /** @type {any} */ (pc.address()).port,
      phone: /** @type {any} */ (phone.address()).port
    };
  });

  afterAll(async () => {
    for (const s of servers) {
      s.closeAllConnections?.();
      await new Promise((r) => s.close(() => r(undefined)));
    }
  });

  /** @param {number} port - @param {string} p @param {Record<string,string>} h */
  const get = (port, p, h) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: p, headers: h },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res));
        }
      );
      req.on('error', reject);
      req.end();
    });

  const doors = [
    ['pc', { Host: '127.0.0.1' }],
    ['phone', { Host: HOST, 'Tailscale-User-Login': OWNER }]
  ];
  for (const [door, headers] of doors) {
    for (const p of [
      '/',
      '/index.html',
      '/sw.js',
      '/healthz',
      '/api/workspaces',
      '/nope'
    ]) {
      test(`${door} door ${p} carries both frame headers`, async () => {
        const res = /** @type {any} */ (
          await get(ports[String(door)], p, /** @type {any} */ (headers))
        );
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['content-security-policy']).toContain(
          "frame-ancestors 'none'"
        );
      });
    }
  }

  test('a refused request carries them too', async () => {
    const res = /** @type {any} */ (
      await get(ports.phone, '/', { Host: HOST })
    );
    expect(res.statusCode).toBe(403);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
