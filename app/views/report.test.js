import { describe, expect, test, vi } from 'vitest';
import {
  buildFrame,
  createQueue,
  downscaleSize,
  flushQueue,
  projectKey,
  submitReport,
  validVersion
} from './report.js';

describe('report client', () => {
  test('downscale keeps ratio, caps the longest side, never enlarges', () => {
    expect(downscaleSize(4000, 2000)).toEqual({ w: 1280, h: 640 });
    expect(downscaleSize(1080, 2400)).toEqual({ w: 576, h: 1280 });
    expect(downscaleSize(300, 200)).toEqual({ w: 300, h: 200 });
  });

  test('frame = u32 BE meta length, meta json, image bytes', () => {
    const f = buildFrame({ project: 'p', text: 'x', version: '1' }, new Uint8Array([9, 8]));
    const n = new DataView(f.buffer).getUint32(0, false);
    const meta = JSON.parse(new TextDecoder().decode(f.slice(4, 4 + n)));
    expect(meta).toEqual({ project: 'p', text: 'x', version: '1' });
    expect([...f.slice(4 + n)]).toEqual([9, 8]);
    expect(f.length).toBe(4 + n + 2);
  });

  test('version rules match the server', () => {
    expect(validVersion('1.4.2')).toBe(true);
    expect(validVersion('build 31')).toBe(true);
    expect(validVersion('')).toBe(false);
    expect(validVersion('  ')).toBe(false);
    expect(validVersion('x'.repeat(41))).toBe(false);
    expect(validVersion('<b>')).toBe(false);
  });

  test('project key = lowercase folder name', () => {
    const bs = String.fromCharCode(92);
    expect(projectKey(['E:', 'Projects', 'Rayeh', ''].join(bs))).toBe('rayeh');
    expect(projectKey('/home/a/fatura')).toBe('fatura');
  });

  test('submit sends the right headers and returns the bead id', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, id: 'rayeh-7' })
    }));
    const r = await submitReport(
      { project: 'rayeh', text: 'hi', version: '1.0' },
      { fetch: /** @type {any} */ (f), token: 'tok' }
    );
    expect(r).toEqual({ ok: true, id: 'rayeh-7' });
    const [url, init] = /** @type {any} */ (f.mock.calls[0]);
    expect(url).toBe('/api/report');
    expect(init.headers).toMatchObject({
      'content-type': 'application/x-bdui-report',
      'x-bdui-report': '1',
      'x-board-token': 'tok'
    });
  });

  test('network failure is offline; refusal carries the code', async () => {
    const boom = vi.fn(async () => {
      throw new TypeError('fail');
    });
    const d = { project: 'p', text: 't', version: '1' };
    expect(await submitReport(d, { fetch: /** @type {any} */ (boom) })).toEqual({
      ok: false,
      offline: true
    });
    const ref = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: 'version_required' })
    }));
    expect(await submitReport(d, { fetch: /** @type {any} */ (ref) })).toEqual({
      ok: false,
      status: 400,
      error: 'version_required',
      retryAfter: 0
    });
  });

  test('queue keeps drafts; flush sends oldest first and stops offline', async () => {
    const q = createQueue({ idb: null });
    await q.add({ text: 'a' });
    await q.add({ text: 'b' });
    await q.add({ text: 'c' });
    const seen = [];
    let n = 0;
    const out = await flushQueue(q, async (d) => {
      seen.push(d.text);
      return ++n === 2 ? { ok: false, offline: true } : { ok: true, id: 'id-' + d.text };
    });
    expect(seen).toEqual(['a', 'b']);
    expect(out).toEqual({ sent: ['id-a'], dropped: [], left: 2 });
    expect((await q.all()).map((x) => x.text)).toEqual(['b', 'c']);
  });

  test('flush drops a permanent refusal but keeps rate-limited drafts', async () => {
    const q = createQueue({ idb: null });
    await q.add({ text: 'bad' });
    await q.add({ text: 'later' });
    const out = await flushQueue(q, async (d) =>
      d.text === 'bad'
        ? { ok: false, status: 400, error: 'unknown_project' }
        : { ok: false, status: 429, error: 'rate_limited' }
    );
    expect(out).toEqual({ sent: [], dropped: ['unknown_project'], left: 1 });
    expect((await q.all()).map((x) => x.text)).toEqual(['later']);
  });
});
