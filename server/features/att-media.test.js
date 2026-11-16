// /att serves clips with their type and answers Range (beads-lite-1bo5.13.21).
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { register } from './report.js';

let server;
let base;
let root;
const prev = process.env.BDUI_ATTACH_ROOT;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'attmedia-'));
  fs.mkdirSync(path.join(root, 'proj', '2026-11'), { recursive: true });
  for (const ext of ['mp3', 'm4a', 'ogg', 'mp4', 'webm']) {
    fs.writeFileSync(
      path.join(root, 'proj', '2026-11', `0123456789abcdef.${ext}`),
      Buffer.from('0123456789'.repeat(10))
    );
  }
  process.env.BDUI_ATTACH_ROOT = root;
  const app = express();
  register({ registerHandler() {}, registerRoute: (f) => f(app) });
  await new Promise((r) => {
    server = app.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  if (prev === undefined) delete process.env.BDUI_ATTACH_ROOT;
  else process.env.BDUI_ATTACH_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('/att clips', () => {
  const types = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    webm: 'video/webm'
  };
  for (const [ext, type] of Object.entries(types)) {
    test(`${ext} is served as ${type} and advertises ranges`, async () => {
      const r = await fetch(`${base}/att/proj/2026-11/0123456789abcdef.${ext}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain(type);
      expect(r.headers.get('accept-ranges')).toBe('bytes');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    });
  }
  test('Range returns 206 with the slice, so a phone can seek', async () => {
    const r = await fetch(`${base}/att/proj/2026-11/0123456789abcdef.mp4`, {
      headers: { Range: 'bytes=10-19' }
    });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 10-19/100');
    expect(await r.text()).toBe('0123456789');
  });
  test('unknown extension and traversal stay 404', async () => {
    expect(
      (await fetch(`${base}/att/proj/2026-11/0123456789abcdef.exe`)).status
    ).toBe(404);
    expect(
      (await fetch(`${base}/att/proj/2026-11/0123456789abcdef.gif`)).status
    ).toBe(404);
  });
});
