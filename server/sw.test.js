import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { listShell, renderServiceWorker } from './sw.js';

const app_dir = path.resolve(import.meta.dirname, '../app');

/** @param {'pc'|'phone'} door */
async function withServer(door, fn) {
  const { createServer } = await import('node:http');
  const srv = createServer(
    createApp({ host: '127.0.0.1', port: 0, app_dir, root_dir: app_dir }, door)
  );
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {any} */ (srv.address()).port;
  try {
    await fn(port);
  } finally {
    srv.close();
  }
}

describe('service worker', () => {
  test('shell never lists the page, api, ws, att or tokens', () => {
    for (const u of listShell(app_dir)) {
      expect(u).not.toMatch(/index\.html|^\/api|^\/ws|^\/att|\.map$/);
      expect(u).not.toBe('/');
    }
  });

  test('built chunks are in the shell list, their maps are not (.59.19)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-chunks-'));
    fs.mkdirSync(path.join(tmp, 'chunks'));
    fs.writeFileSync(path.join(tmp, 'main.bundle.js'), 'x');
    fs.writeFileSync(path.join(tmp, 'chunks', 'AB12.js'), 'y');
    fs.writeFileSync(path.join(tmp, 'chunks', 'AB12.js.map'), '{}');
    const list = listShell(tmp);
    expect(list).toContain('/main.bundle.js');
    expect(list).toContain('/chunks/AB12.js');
    expect(list.some((u) => u.endsWith('.map'))).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('version changes when a shell file changes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-'));
    fs.mkdirSync(path.join(tmp, 'css'));
    fs.writeFileSync(
      path.join(tmp, 'sw.js'),
      fs.readFileSync(path.join(app_dir, 'sw.js'))
    );
    fs.writeFileSync(path.join(tmp, 'styles.css'), 'a{}');
    fs.writeFileSync(path.join(tmp, 'manifest.webmanifest'), '{}');
    const a = renderServiceWorker(tmp);
    fs.writeFileSync(path.join(tmp, 'styles.css'), 'b{}');
    const b = renderServiceWorker(tmp);
    expect(a).not.toBe(b);
    expect(a).not.toContain('__SW_');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test.each(['pc'])('GET /sw.js is no-cache JS on %s door', async (door) => {
    await withServer(/** @type {any} */ (door), async (port) => {
      const r = await fetch(`http://127.0.0.1:${port}/sw.js`);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(await r.text()).not.toContain('__SW_');
      const m = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`);
      expect(m.status).toBe(200);
      expect(m.headers.get('content-type')).toMatch(/manifest\+json|json/);
    });
  });
});
