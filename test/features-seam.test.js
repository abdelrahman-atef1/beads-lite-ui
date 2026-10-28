import { describe, expect, test } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { FEATURE_MESSAGE_TYPES } from '../server/features/types.js';
import { MESSAGE_TYPES } from '../app/protocol.js';
import {
  getHandler,
  mountFeatureRoutes,
  registerHandler,
  registerRoute
} from '../server/features/index.js';
import { handleMessage } from '../server/ws.js';

function stub() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} m */
    send(m) {
      this.sent.push(String(m));
    }
  };
}
const req = (/** @type {string} */ type) =>
  JSON.stringify({ id: 'r1', type, payload: { a: 1 } });

describe('features seam', () => {
  test('stubs load empty; feature types flow into protocol', () => {
    expect(FEATURE_MESSAGE_TYPES).toEqual([]);
    for (const t of FEATURE_MESSAGE_TYPES) {
      expect(MESSAGE_TYPES).toContain(t);
    }
  });

  test('unknown type still errors', async () => {
    const ws = stub();
    await handleMessage(/** @type {any} */ (ws), Buffer.from(req('nope-x')));
    expect(JSON.parse(ws.sent[0]).error.code).toBe('unknown_type');
  });

  test('registered fake handler gets a reply; throws become errors', async () => {
    registerHandler('fake-feature', (r) => ({ echo: r.payload }));
    registerHandler('fake-bad', () => {
      throw { code: 'nope', message: 'bad' };
    });
    expect(getHandler('fake-feature')).toBeTypeOf('function');
    const ws = stub();
    await handleMessage(/** @type {any} */ (ws), Buffer.from(req('fake-feature')));
    const ok = JSON.parse(ws.sent[0]);
    expect(ok.ok).toBe(true);
    expect(ok.payload).toEqual({ echo: { a: 1 } });
    await handleMessage(/** @type {any} */ (ws), Buffer.from(req('fake-bad')));
    expect(JSON.parse(ws.sent[1]).error.code).toBe('nope');
  });

  test('mutating feature handler refused on unauthed guarded socket', async () => {
    registerHandler('fake-mut', () => 1, { mutating: true });
    const ws = Object.assign(stub(), { guarded: true, authed: false });
    await handleMessage(/** @type {any} */ (ws), Buffer.from(req('fake-mut')));
    expect(JSON.parse(ws.sent[0]).error.code).toBe('forbidden');
  });

  test('registered route is mounted', async () => {
    registerRoute((app) => app.get('/api/fake-feature', (_q, r) => r.json({ ok: 1 })));
    const app = express();
    mountFeatureRoutes(app, /** @type {any} */ ({}));
    const srv = createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(null)));
    const { port } = /** @type {any} */ (srv.address());
    const res = await fetch(`http://127.0.0.1:${port}/api/fake-feature`);
    expect(await res.json()).toEqual({ ok: 1 });
    srv.close();
  });
});
