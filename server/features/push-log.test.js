import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { createPush } from './push.js';

const EP = 'https://fcm.googleapis.com/fcm/send/SECRET-endpoint-token';
const b64u = (/** @type {Buffer} */ b) => b.toString('base64url');
const sub = {
  endpoint: EP,
  keys: {
    p256dh: b64u(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])),
    auth: b64u(Buffer.alloc(16, 9))
  }
};
const ev = (/** @type {string} */ bead) => ({
  kind: 'decision',
  project: 'alpha',
  bead,
  title: 't',
  desk: false,
  count: 1,
  at: '2026-11-02T10:00:00.000Z'
});

/** @param {Array<() => any>} script one fake push-service reply per send */
function rig(script) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'pushlog-'));
  let i = 0;
  let t = new Date(2026, 10, 2, 10, 0, 0).getTime();
  const p = createPush({
    home,
    now: () => (t += 3 * 60 * 1000),
    lock: () => {},
    webpush: {
      generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
      sendNotification: async () => script[i++]()
    }
  });
  p.subscribe(sub, 'phone');
  const lines = () =>
    readFileSync(path.join(home, 'push-log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  return { p, home, lines };
}

test('201, 410 and timeout each log one line; no endpoint anywhere', async () => {
  const gone = () => {
    throw Object.assign(new Error('gone ' + EP), { statusCode: 410 });
  };
  const slow = () => {
    throw Object.assign(new Error('timeout ' + EP), { code: 'ETIMEDOUT' });
  };
  const r = rig([() => ({ statusCode: 201 }), slow, gone]);
  await r.p.send(ev('alpha-1'));
  await r.p.send(ev('alpha-2'));
  await r.p.send(ev('alpha-3'));
  const l = r.lines();
  expect(l.map((x) => x.result)).toEqual([201, 'ETIMEDOUT', 410]);
  expect(l.map((x) => x.bead)).toEqual(['alpha-1', 'alpha-2', 'alpha-3']);
  expect(l[0]).toMatchObject({ kind: 'decision' });
  expect(l[0].sub).toMatch(/^[0-9a-f]{16}$/);
  expect(typeof l[0].ms).toBe('number');
  expect(readFileSync(path.join(r.home, 'push-log.jsonl'), 'utf8')).not.toMatch(
    /fcm\.googleapis|SECRET|endpoint/
  );
  expect(r.p.subscribers()).toBe(0); // 410 dropped it
});

test('log over 1 MB rotates to .1', async () => {
  const r = rig([() => ({ statusCode: 201 })]);
  writeFileSync(path.join(r.home, 'push-log.jsonl'), 'x'.repeat(1024 * 1024 + 1));
  await r.p.send(ev('alpha-1'));
  expect(existsSync(path.join(r.home, 'push-log.jsonl.1'))).toBe(true);
  expect(r.lines()).toHaveLength(1);
});
