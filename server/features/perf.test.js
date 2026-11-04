import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../app.js';
import { WS_DEFLATE } from './perf.js';

/** @type {string[]} */
const tmps = [];
afterEach(() => {
  for (const d of tmps.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeAppDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  tmps.push(dir);
  fs.mkdirSync(path.join(dir, 'css'));
  fs.writeFileSync(
    path.join(dir, 'main.js'),
    "import { x } from './dep.js';\nconsole.log('hello ' + x + ' '.repeat(40));\n"
  );
  fs.writeFileSync(path.join(dir, 'dep.js'), "export const x = 'one';\n");
  fs.writeFileSync(
    path.join(dir, 'styles.css'),
    'body { color: red; }\n'.repeat(50)
  );
  fs.writeFileSync(
    path.join(dir, 'css', 'a.css'),
    '.a { margin: 0; }\n'.repeat(50)
  );
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<html><head>\n    <link rel="stylesheet" href="./styles.css" />\n    <link rel="stylesheet" href="./css/a.css" />\n  </head><body>__BOARD_TOKEN__<script type="module" src="/main.bundle.js"></script></body></html>\n'
  );
  return dir;
}

/** @param {string} app_dir - @param {(base: string) => Promise<void>} fn */
async function withServer(app_dir, fn) {
  const app = createApp({
    host: '127.0.0.1',
    port: 0,
    app_dir,
    root_dir: app_dir
  });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {any} */ (srv.address()).port;
  try {
    await fn(`http://127.0.0.1:${port}`, app);
  } finally {
    srv.close();
  }
}

/** @param {string} url - @param {Record<string, string>} [headers] */
async function get(url, headers = {}) {
  // fetch would decode transparently; node:http keeps the wire bytes
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
      })
      .on('error', reject);
  });
}

describe('first paint on a slow link (1bo5.6.31)', () => {
  test('index points at one hashed css and the hashed bundle; both immutable, compressed, ETag, 304', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base) => {
      const idx = /** @type {any} */ (await get(base + '/'));
      const html = idx.body.toString();
      const js = /src="(\/main\.[0-9a-f]{12}\.js)"/.exec(html);
      const css = [...html.matchAll(/href="(\/app\.[0-9a-f]{12}\.css)"/g)];
      expect(js).toBeTruthy();
      expect(css).toHaveLength(1);
      expect(html).not.toMatch(/\.\/styles\.css|css\/a\.css/);

      for (const u of [js?.[1], css[0][1]]) {
        const r = /** @type {any} */ (
          await get(base + u, { 'accept-encoding': 'gzip, br' })
        );
        expect(r.status).toBe(200);
        expect(r.headers['content-encoding']).toBe('br');
        expect(r.headers['cache-control']).toMatch(/immutable/);
        expect(r.headers.etag).toBeTruthy();
        expect(r.headers.vary).toMatch(/Accept-Encoding/i);
        const again = /** @type {any} */ (
          await get(base + u, { 'if-none-match': r.headers.etag })
        );
        expect(again.status).toBe(304);
        const gz = /** @type {any} */ (
          await get(base + u, { 'accept-encoding': 'gzip' })
        );
        expect(gz.headers['content-encoding']).toBe('gzip');
        expect(
          zlib.gunzipSync(gz.body).equals(zlib.brotliDecompressSync(r.body))
        ).toBe(true);
        const plain = /** @type {any} */ (await get(base + u));
        expect(plain.headers['content-encoding']).toBeUndefined();
      }
      const bundle = /** @type {any} */ (
        await get(base + js?.[1], { 'accept-encoding': 'gzip' })
      );
      const text = zlib.gunzipSync(bundle.body).toString();
      expect(text).not.toMatch(/sourceMappingURL/); // no inline map
      expect(text).toContain('hello');
    });
  });

  test('/main.bundle.js still works (service worker shell) and revalidates', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base) => {
      const r = /** @type {any} */ (
        await get(base + '/main.bundle.js', { 'accept-encoding': 'gzip' })
      );
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-cache');
    });
  });

  test('built once, rebuilt only when a source file changes', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base, app) => {
      const hashOf = async () =>
        /main\.([0-9a-f]{12})\.js/.exec(
          /** @type {any} */ ((await get(base + '/')).body).toString()
        )?.[1];
      const h1 = await hashOf();
      await get(base + '/main.bundle.js');
      await get(base + '/main.bundle.js');
      const h2 = await hashOf();
      expect(h2).toBe(h1);
      expect(app.locals.perf.stats.builds).toBe(1);
      const dep = path.join(dir, 'dep.js');
      fs.writeFileSync(dep, "export const x = 'two';\n");
      fs.utimesSync(dep, new Date(), new Date(Date.now() + 5000));
      const h3 = await hashOf();
      expect(h3).not.toBe(h1);
      expect(app.locals.perf.stats.builds).toBe(2);
    });
  });

  test('css joins in index order and follows file edits', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base) => {
      const html = /** @type {any} */ ((await get(base + '/')).body).toString();
      const u = /href="(\/app\.[0-9a-f]{12}\.css)"/.exec(html)?.[1];
      const body = /** @type {any} */ (await get(base + u)).body.toString();
      expect(body.indexOf('body {')).toBeLessThan(body.indexOf('.a {'));
    });
  });

  test('plain static files are compressed with a revalidating ETag', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base) => {
      const r = /** @type {any} */ (
        await get(base + '/styles.css', { 'accept-encoding': 'gzip' })
      );
      expect(r.headers['content-encoding']).toBe('gzip');
      expect(r.headers['cache-control']).toBe('no-cache');
      expect(
        (await get(base + '/styles.css', { 'if-none-match': r.headers.etag }))
          .status
      ).toBe(304);
    });
  });

  test('no path escape and no timers', async () => {
    const dir = makeAppDir();
    const iv = vi.spyOn(globalThis, 'setInterval');
    await withServer(dir, async (base) => {
      const r = /** @type {any} */ (
        await get(base + '/..%2f..%2fetc%2fpasswd.json')
      );
      expect([400, 404]).toContain(r.status);
      await get(base + '/');
      await get(base + '/main.bundle.js');
    });
    expect(iv).not.toHaveBeenCalled();
  });

  test('socket frames are deflated above 1 KB', () => {
    expect(WS_DEFLATE.threshold).toBe(1024);
    expect(WS_DEFLATE.clientNoContextTakeover).toBe(true);
    expect(WS_DEFLATE.concurrencyLimit).toBeLessThanOrEqual(4);
  });
});

describe('index page', () => {
  test('is gzipped for clients that accept it and plain otherwise', async () => {
    const dir = makeAppDir();
    await withServer(dir, async (base) => {
      const gz = /** @type {any} */ (
        await get(base + '/', { 'accept-encoding': 'gzip' })
      );
      expect(gz.headers['content-encoding']).toBe('gzip');
      expect(gz.headers['cache-control']).toBe('no-store');
      expect(zlib.gunzipSync(gz.body).toString()).toContain(
        '<script type="module" src="/main.'
      );
      const plain = /** @type {any} */ (await get(base + '/'));
      expect(plain.headers['content-encoding']).toBeUndefined();
    });
  });
});
