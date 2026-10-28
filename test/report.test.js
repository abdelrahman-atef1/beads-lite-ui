import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest';

// All state lives in a temp copy: attachments, wake queue, project list.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
const attach = path.join(tmp, 'attachments');
const wakeRoot = path.join(tmp, 'wake');
const list = path.join(tmp, 'projects.list');
fs.mkdirSync(attach);
fs.writeFileSync(list, '/e/Projects/demo\n');
process.env.BDUI_ATTACH_ROOT = attach;
process.env.WAKE_ROOT = wakeRoot;
process.env.WAKE_PROJECTS_LIST = list;

/** @type {Array<{args: string[], cwd?: string}>} */
const bdCalls = [];
let bdFail = false;
let bdBusyTimes = 0;
let bdBusyMsg = 'database is locked';
vi.mock('../server/bd.js', async (orig) => ({
  ...(await orig()),
  runBd: async (/** @type {string[]} */ args, /** @type {any} */ o) => {
    bdCalls.push({ args, cwd: o?.cwd });
    if (bdBusyTimes > 0) {
      bdBusyTimes--;
      return { code: 1, stdout: '', stderr: bdBusyMsg };
    }
    return bdFail
      ? { code: 1, stdout: '', stderr: 'boom' }
      : { code: 0, stdout: 'demo-ab1\n', stderr: '' };
  }
}));
vi.mock('../server/registry-watcher.js', async (orig) => ({
  ...(await orig()),
  getAvailableWorkspaces: () => [
    { path: path.join(tmp, 'demo'), database: 'x', pid: 1, version: '1' }
  ]
}));

const { createApp } = await import('../server/app.js');
const { getBoardToken } = await import('../server/guard.js');
const { resetReportRate, sanitizeImage, afterBoardTask } =
  await import('../server/features/report.js');

const chunk = (/** @type {string} */ t, /** @type {Buffer} */ d) => {
  const b = Buffer.alloc(12 + d.length);
  b.writeUInt32BE(d.length, 0);
  b.write(t, 4, 'latin1');
  d.copy(b, 8);
  return b;
};
const PNG = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunk('IHDR', Buffer.alloc(13)),
  chunk('tEXt', Buffer.from('Author\0SECRETMETA')),
  chunk('IDAT', Buffer.from('abc')),
  chunk('IEND', Buffer.alloc(0))
]);
const JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000' +
    'ffe1000a4578696600004142' +
    'ffda00020011223344ffd9',
  'hex'
);
const webpChunk = (/** @type {string} */ t, /** @type {Buffer} */ d) =>
  Buffer.concat([
    Buffer.from(t, 'latin1'),
    Buffer.from([d.length & 255, 0, 0, 0]),
    d,
    d.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)
  ]);
const webpBody = Buffer.concat([
  Buffer.from('WEBP'),
  webpChunk('VP8L', Buffer.from('12345678')),
  webpChunk('EXIF', Buffer.from('GPS-DATA!'))
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([webpBody.length, 0, 0, 0]),
  webpBody
]);

/** @type {http.Server} */
let server;
let port = 0;
beforeAll(async () => {
  const app = createApp({
    host: '127.0.0.1',
    port: 0,
    app_dir: path.resolve('app'),
    root_dir: tmp
  });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  port = /** @type {any} */ (server.address()).port;
});
afterAll(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  bdCalls.length = 0;
  bdFail = false;
  bdBusyTimes = 0;
  resetReportRate();
  fs.rmSync(wakeRoot, { recursive: true, force: true });
  fs.rmSync(attach, { recursive: true, force: true });
  fs.mkdirSync(attach);
});

/**
 * @param {object} meta
 * @param {Buffer} [img]
 */
function frame(meta, img = Buffer.alloc(0)) {
  const m = Buffer.from(JSON.stringify(meta));
  const h = Buffer.alloc(4);
  h.writeUInt32BE(m.length);
  return Buffer.concat([h, m, img]);
}
const GOOD = {
  project: 'demo',
  text: 'Button is cut off\nsecond line',
  version: '1.2.3+4'
};

/**
 * @param {Buffer} body
 * @param {Record<string, string | null>} [over]
 * @returns {Promise<{status: number, json: any}>}
 */
function post(body, over = {}) {
  /** @type {Record<string, any>} */
  const headers = {
    host: `127.0.0.1:${port}`,
    origin: `http://127.0.0.1:${port}`,
    'content-type': 'application/x-bdui-report',
    'x-bdui-report': '1',
    'x-board-token': getBoardToken(),
    'content-length': String(body.length),
    ...over
  };
  for (const k of Object.keys(headers)) {
    if (headers[k] === null) delete headers[k];
  }
  return new Promise((resolve) => {
    const r = http.request(
      { port, host: '127.0.0.1', path: '/api/report', method: 'POST', headers },
      (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            retryAfter: res.headers['retry-after'],
            json: (() => {
              try {
                return JSON.parse(s);
              } catch {
                return null;
              }
            })()
          })
        );
      }
    );
    r.on('error', () => resolve({ status: 0, json: null }));
    r.end(body);
  });
}
/** @param {string} p */
const get = (p) =>
  new Promise((resolve) => {
    http.get({ port, host: '127.0.0.1', path: p }, (res) => {
      /** @type {Buffer[]} */
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(c)
        })
      );
    });
  });
const pending = () => {
  const d = path.join(wakeRoot, 'pending');
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

describe('image sanitising', () => {
  test('png text chunk, jpeg APP1 and webp EXIF are stripped', () => {
    const p = sanitizeImage(PNG);
    expect(p?.ext).toBe('png');
    expect(p?.data.includes('SECRETMETA')).toBe(false);
    const j = sanitizeImage(JPG);
    expect(j?.ext).toBe('jpg');
    expect(j?.data.includes('Exif')).toBe(false);
    expect(j?.data.includes('JFIF')).toBe(true);
    const w = sanitizeImage(WEBP);
    expect(w?.ext).toBe('webp');
    expect(w?.data.includes('GPS-DATA')).toBe(false);
    expect((w?.data.readUInt32LE(4) || 0) + 8).toBe(w?.data.length);
  });
  test('garbage and html are refused', () => {
    expect(sanitizeImage(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sanitizeImage(PNG.subarray(0, 30))).toBeNull();
  });
});

describe('POST /api/report', () => {
  test('good report: bead, image stored, one wake, version on bead', async () => {
    const r = await post(frame(GOOD, PNG));
    expect(r.status).toBe(200);
    expect(r.json.id).toBe('demo-ab1');
    expect(r.json.wake).toBe('queued');
    const call = bdCalls[0];
    expect(call.cwd).toBe(path.join(tmp, 'demo'));
    expect(call.args).toContain('bug');
    expect(call.args).toContain('owner-report');
    expect(call.args[call.args.indexOf('--actor') + 1]).toBe('owner-board');
    expect(call.args[1]).toMatch(/^\[v1\.2\.3\+4\] Button is cut off$/);
    const meta = JSON.parse(call.args[call.args.indexOf('--metadata') + 1]);
    expect(meta.created_via).toBe('board-report');
    expect(meta.version).toBe('1.2.3+4');
    expect(meta.attachments).toHaveLength(1);
    expect(meta.attachments[0]).toMatch(
      /^demo\/\d{4}-\d{2}\/[0-9a-f]{16}\.png$/
    );
    expect(fs.existsSync(path.join(attach, meta.attachments[0]))).toBe(true);
    expect(call.args[call.args.indexOf('-d') + 1]).toContain(
      `Screenshot: [${meta.attachments[0]}](/att/${meta.attachments[0]})`
    );
    expect(pending()).toHaveLength(1);
    const ev = JSON.parse(
      fs.readFileSync(path.join(wakeRoot, 'pending', pending()[0]), 'utf8')
    );
    expect(ev).toMatchObject({
      kind: 'report',
      repo: 'demo',
      bead: 'demo-ab1',
      role: 'cos',
      via: 'pc'
    });
    const a = /** @type {any} */ (await get('/att/' + meta.attachments[0]));
    expect(a.status).toBe(200);
    expect(a.headers['content-type']).toBe('image/png');
    expect(a.headers['x-content-type-options']).toBe('nosniff');
    expect(a.headers['content-security-policy']).toBe("default-src 'none'");
    expect(a.body.includes('SECRETMETA')).toBe(false);
  });

  test('text-only report is allowed', async () => {
    const r = await post(frame(GOOD));
    expect(r.status).toBe(200);
    expect(r.json.image).toBeNull();
  });

  test('version is mandatory', async () => {
    expect((await post(frame({ ...GOOD, version: '  ' }))).json.error).toBe(
      'version_required'
    );
    expect((await post(frame({ project: 'demo', text: 'x' }))).status).toBe(
      400
    );
    expect(
      (await post(frame({ ...GOOD, version: '1; rm -rf' }))).json.error
    ).toBe('bad_version');
    expect(bdCalls).toHaveLength(0);
  });

  test('foreign or missing Origin, missing token or header are refused', async () => {
    const b = frame(GOOD);
    expect((await post(b, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await post(b, { origin: null })).status).toBe(403);
    expect((await post(b, { 'x-board-token': 'nope' })).status).toBe(403);
    expect((await post(b, { 'x-board-token': null })).status).toBe(403);
    expect((await post(b, { 'x-bdui-report': null })).status).toBe(403);
    expect((await post(b, { 'content-type': 'text/plain' })).status).toBe(415);
    expect(bdCalls).toHaveLength(0);
    expect(pending()).toHaveLength(0);
  });

  test('bad image type, oversize, unknown project, secret text', async () => {
    expect((await post(frame(GOOD, Buffer.from('<html>')))).json.error).toBe(
      'bad_image'
    );
    const big = Buffer.concat([
      PNG.subarray(0, 8),
      Buffer.alloc(4 * 1024 * 1024 + 10)
    ]);
    expect((await post(frame(GOOD, big))).status).toBe(413);
    expect((await post(frame({ ...GOOD, project: 'nope' }))).json.error).toBe(
      'unknown_project'
    );
    const s = await post(frame({ ...GOOD, text: 'token: abcdef123456' }));
    expect(s.json.error).toBe('secret_refused');
    expect(JSON.stringify(s.json)).not.toContain('abcdef');
    expect(
      (await post(frame({ ...GOOD, text: 'a'.repeat(2001) }))).json.error
    ).toBe('bad_text');
    expect(bdCalls).toHaveLength(0);
    expect(fs.readdirSync(attach)).toHaveLength(0);
  });

  test('bd failure removes the image it created and wakes nobody', async () => {
    bdFail = true;
    const r = await post(frame(GOOD, PNG));
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('not_filed');
    const files = fs
      .readdirSync(attach, { recursive: true })
      .filter((f) => /\.png$/.test(String(f)));
    expect(files).toHaveLength(0);
    expect(pending()).toHaveLength(0);
  });

  test('30 per hour cap', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post(frame(GOOD))).status).toBe(200);
    }
    const r = await post(frame(GOOD));
    expect(r.status).toBe(429);
    const ra = Number(r.retryAfter);
    expect(ra).toBeGreaterThan(3500);
    expect(ra).toBeLessThanOrEqual(3600);
  }, 120_000);

  test('cap holds under a parallel burst (slot reserved before awaits)', async () => {
    const rs = await Promise.all(
      Array.from({ length: 60 }, () => post(frame(GOOD)))
    );
    expect(rs.filter((r) => r.status === 200).length).toBe(30);
    expect(rs.filter((r) => r.status === 429).length).toBe(30);
  }, 120_000);

  test('a failed report gives its slot back', async () => {
    bdFail = true;
    for (let i = 0; i < 31; i++)
      expect((await post(frame(GOOD))).status).toBe(500);
    bdFail = false;
    expect((await post(frame(GOOD))).status).toBe(200);
  }, 120_000);

  test('bad JSON gets a JSON 400 with no stack or paths', async () => {
    const body = Buffer.from('{not json');
    const r = await post(body, { 'content-type': 'application/json' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: 'bad_request' });
  });
});

describe('GET /att', () => {
  test('bad paths are 404', async () => {
    for (const p of [
      '/att/demo/2026-10/../../x.png',
      '/att/demo/2026-10/zz.png',
      '/att/demo/2026-10/0123456789abcdef.svg',
      '/att/%2e%2e/2026-10/0123456789abcdef.png'
    ]) {
      expect(/** @type {any} */ (await get(p)).status).toBe(404);
    }
  });
});

describe('board-created task wake', () => {
  test('afterBoardTask emits one new-task wake', async () => {
    expect(
      await afterBoardTask(path.join(tmp, 'demo'), 'demo-zz9\n', 'x.ts.net')
    ).toBe('queued');
    const f = pending();
    expect(f).toHaveLength(1);
    const ev = JSON.parse(
      fs.readFileSync(path.join(wakeRoot, 'pending', f[0]), 'utf8')
    );
    expect(ev).toMatchObject({
      kind: 'new-task',
      bead: 'demo-zz9',
      via: 'phone'
    });
  });
});

describe('company-1bo5.6.8 QA fixes', () => {
  test('Arabic-Indic and Persian digits and the Arabic separator are stored as ASCII', async () => {
    for (const v of ['١٫٢٫٣', '١.٢.٣+١٤', '۱.۲.۳']) {
      resetReportRate();
      bdCalls.length = 0;
      const r = await post(frame({ ...GOOD, version: v }));
      expect(r.status).toBe(200);
      const a = bdCalls[0].args;
      const meta = JSON.parse(a[a.indexOf('--metadata') + 1]);
      expect(meta.version).toMatch(/^[0-9.+]+$/);
    }
    resetReportRate();
    bdCalls.length = 0;
    await post(frame({ ...GOOD, version: '١٫٢٫٣' }));
    const a = bdCalls[0].args;
    expect(JSON.parse(a[a.indexOf('--metadata') + 1]).version).toBe('1.2.3');
    expect(a[1]).toMatch(/^\[v1\.2\.3\]/);
    resetReportRate();
    expect((await post(frame({ ...GOOD, version: 'إصدار' }))).status).toBe(400);
  });

  test('screenshot is a clickable markdown link to /att in the description', async () => {
    const r = await post(frame(GOOD, PNG));
    expect(r.status).toBe(200);
    const a = bdCalls[0].args;
    const d = a[a.indexOf('-d') + 1];
    const m = /\[([^\]]+)\]\((\/att\/[^)]+)\)/.exec(d);
    expect(m).not.toBeNull();
    const g = /** @type {any} */ (await get(m?.[2] || '/'));
    expect(g.status).toBe(200);
    const ts = await new Promise((resolve) => {
      http.get(
        {
          port,
          host: '127.0.0.1',
          path: m?.[2],
          headers: { host: 'abdelrahman.tail8a4e50.ts.net' }
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
    });
    expect(ts).toBe(200);
  });

  test('bd create is retried on a locked store, then filed', async () => {
    bdBusyTimes = 2;
    const r = await post(frame(GOOD));
    expect(r.status).toBe(200);
    expect(bdCalls).toHaveLength(3);
  });

  test('bd create is retried on the transient historical-workspace error', async () => {
    bdBusyMsg =
      'historical SQLite workspace detected; explicit migration is required';
    bdBusyTimes = 1;
    const r = await post(frame(GOOD));
    bdBusyMsg = 'database is locked';
    expect(r.status).toBe(200);
    expect(bdCalls).toHaveLength(2);
  });

  test('a non-busy bd failure is not retried', async () => {
    bdFail = true;
    const r = await post(frame(GOOD));
    expect(r.status).toBe(500);
    expect(bdCalls).toHaveLength(1);
  });
});
