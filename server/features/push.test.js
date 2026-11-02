import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { DAILY_CAP, cleanSubscription, createPush } from './push.js';

const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
const sub = (/** @type {string} */ ep = EP) => ({
  endpoint: ep,
  keys: { p256dh: 'BPublicKeyAAAA_-', auth: 'authAAAA_-' }
});
const ev = (/** @type {any} */ o = {}) => ({
  id: 'n-1',
  kind: 'decision',
  project: 'alpha',
  bead: 'alpha-1',
  title: 'Ship decision',
  desk: false,
  count: 1,
  at: '2026-11-02T10:00:00.000Z',
  read: false,
  ...o
});

function rig(/** @type {any} */ over = {}) {
  const home = over.home || mkdtempSync(path.join(os.tmpdir(), 'push-'));
  /** @type {any[]} */
  const sent = [];
  /** @type {any[]} */
  const opts = [];
  /** @type {Map<string, number>} */
  const status = new Map();
  /** @type {Array<{ fn: () => void, ms: number }>} */
  const timers = [];
  let genCalls = 0;
  let t = over.t ?? new Date(2026, 10, 2, 10, 0, 0).getTime();
  /** @type {string[]} */
  const locks = [];
  const p = createPush({
    home,
    now: () => t,
    lock: (d) => {
      if (over.lockFails) throw new Error('acl refused');
      locks.push(d);
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    webpush: {
      generateVAPIDKeys: () => {
        genCalls += 1;
        return { publicKey: 'PUB_KEY', privateKey: 'PRIV_KEY_SECRET' };
      },
      sendNotification: async (
        /** @type {any} */ s,
        /** @type {string} */ body,
        /** @type {any} */ o
      ) => {
        const st = status.get(s.endpoint);
        if (st) throw Object.assign(new Error('gone'), { statusCode: st });
        sent.push({ endpoint: s.endpoint, body: JSON.parse(body), raw: body });
        opts.push(o);
      }
    }
  });
  return {
    p,
    home,
    sent,
    opts,
    status,
    timers,
    locks,
    gen: () => genCalls,
    now: () => t,
    tick: (/** @type {number} */ ms) => (t += ms)
  };
}

describe('subscription validation', () => {
  test('accepts a push-service https endpoint, rejects the rest', () => {
    expect(cleanSubscription(sub())).toBeTruthy();
    expect(
      cleanSubscription(
        sub('https://updates.push.services.mozilla.com/wpush/v2/x')
      )
    ).toBeTruthy();
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://127.0.0.1/x',
      'https://evil.example.com/x',
      'https://fcm.googleapis.com.evil.com/x',
      'https://u:p@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com/' + 'a'.repeat(1100)
    ]) {
      expect(cleanSubscription(sub(bad)), bad).toBeNull();
    }
    expect(
      cleanSubscription({ endpoint: EP, keys: { p256dh: 'a b', auth: 'x' } })
    ).toBeNull();
    expect(cleanSubscription(null)).toBeNull();
  });

  test('subscribe replaces by endpoint, caps at 5, persists under home only', () => {
    const r = rig();
    for (let i = 0; i < 7; i++) r.p.subscribe(sub(EP + i));
    r.p.subscribe(sub(EP + '6'));
    expect(r.p.subscribers()).toBe(5);
    const file = path.join(r.home, 'push-subs.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(5);
    expect(() => r.p.subscribe({ endpoint: 'x' })).toThrow(/invalid/);
    expect(rig({ home: r.home }).p.subscribers()).toBe(5);
    r.p.unsubscribe(EP + '6');
    expect(r.p.subscribers()).toBe(4);
  });
});

describe('keys', () => {
  test('folder locked first, key made once, reused after restart', async () => {
    const r = rig();
    expect(existsSync(path.join(r.home, 'vapid.json'))).toBe(false);
    expect(await r.p.publicKey()).toBe('PUB_KEY');
    expect(await r.p.publicKey()).toBe('PUB_KEY');
    expect(r.gen()).toBe(1);
    expect(r.locks).toEqual([r.home]);
    const r2 = rig({ home: r.home });
    expect(await r2.p.publicKey()).toBe('PUB_KEY');
    expect(r2.gen()).toBe(0);
  });

  test('ACL refused -> no key file, push off, send degrades quietly', async () => {
    const r = rig({ lockFails: true });
    await expect(r.p.publicKey()).rejects.toThrow();
    expect(existsSync(path.join(r.home, 'vapid.json'))).toBe(false);
    r.p.subscribe(sub());
    expect(await r.p.send(ev())).toBe('none');
    expect(r.sent).toHaveLength(0);
  });
});

describe('payload', () => {
  test('decision: project + card_title only; nothing else leaks', async () => {
    const r = rig();
    r.p.subscribe(sub());
    expect(
      await r.p.send(ev({ card_q: 'SECRET QUESTION?', comment: 'x' }))
    ).toBe('sent');
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].body).toEqual({
      kind: 'decision',
      project: 'alpha',
      bead: 'alpha-1',
      title: 'Ship decision',
      count: 1,
      at: '2026-11-02T10:00:00.000Z'
    });
    expect(r.sent[0].raw).not.toMatch(/SECRET|PRIV_KEY/);
    expect(r.opts[0].vapidDetails.privateKey).toBe('PRIV_KEY_SECRET');
    expect(r.opts[0].TTL).toBeGreaterThan(0);
  });

  test('desk bead: pointer only, no title', async () => {
    const r = rig();
    r.p.subscribe(sub());
    await r.p.send(ev({ desk: true, title: null }));
    expect(r.sent[0].body.title).toBeNull();
    expect(r.sent[0].body.bead).toBe('alpha-1');
    await r.p.send(
      ev({ project: 'beta', desk: true, title: 'must not appear' })
    );
    expect(r.sent[1].body.title).toBeNull();
  });

  test('answer carries its kind; degraded, muted and no subscriber push nothing', async () => {
    const r = rig();
    expect(await r.p.send(ev())).toBe('no-subscriber');
    r.p.subscribe(sub());
    expect(await r.p.send(ev({ kind: 'answer' }))).toBe('sent');
    expect(r.sent[0].body.kind).toBe('answer');
    expect(await r.p.send(ev({ kind: 'degraded', project: 'b' }))).toBe(
      'not-pushed'
    );
    expect(await r.p.send(ev({ project: 'c' }), { muted: true })).toBe('muted');
    expect(r.sent).toHaveLength(1);
  });

  test('hostile project or bead strings are refused or nulled', async () => {
    const r = rig();
    r.p.subscribe(sub());
    expect(await r.p.send(ev({ project: 'A B/../x' }))).toBe('bad-project');
    await r.p.send(ev({ project: 'ok', bead: '<script>' }));
    expect(r.sent[0].body.bead).toBeNull();
  });
});

describe('caps', () => {
  test('one per project per 2 min; extras fold into one digest', async () => {
    const r = rig();
    r.p.subscribe(sub());
    expect(await r.p.send(ev({ bead: 'a-1' }))).toBe('sent');
    r.tick(10000);
    expect(await r.p.send(ev({ bead: 'a-2' }))).toBe('folded');
    r.tick(10000);
    expect(await r.p.send(ev({ bead: 'a-3' }))).toBe('folded');
    expect(await r.p.send(ev({ project: 'other', bead: 'o-1' }))).toBe('sent');
    expect(r.sent).toHaveLength(2);
    expect(r.timers).toHaveLength(1);
    expect(r.timers[0].ms).toBe(110000);
    r.tick(110000);
    await r.p.flush('alpha');
    expect(r.sent).toHaveLength(3);
    expect(r.sent[2].body).toMatchObject({
      kind: 'digest',
      project: 'alpha',
      count: 2,
      title: null,
      bead: null
    });
    expect(r.p.pending()).toEqual([]);
  });

  test('a single folded event is sent as itself', async () => {
    const r = rig();
    r.p.subscribe(sub());
    await r.p.send(ev({ bead: 'a-1' }));
    await r.p.send(ev({ bead: 'a-2', title: 'Second' }));
    r.tick(120000);
    await r.p.flush('alpha');
    expect(r.sent[1].body).toMatchObject({
      kind: 'decision',
      bead: 'a-2',
      title: 'Second'
    });
  });

  test('after the gap a project may push again', async () => {
    const r = rig();
    r.p.subscribe(sub());
    await r.p.send(ev({ bead: 'a-1' }));
    r.tick(121000);
    expect(await r.p.send(ev({ bead: 'a-2' }))).toBe('sent');
  });

  test('50 a day, then one "more" notice, then silence until the next day', async () => {
    const r = rig();
    r.p.subscribe(sub());
    for (let i = 0; i < DAILY_CAP; i++) {
      r.tick(121000);
      expect(
        await r.p.send(ev({ project: 'p' + (i % 3), bead: 'b-' + i }))
      ).toBe('sent');
    }
    r.tick(121000);
    expect(await r.p.send(ev({ bead: 'x-51' }))).toBe('noticed');
    expect(r.sent.at(-1).body.kind).toBe('more');
    r.tick(121000);
    expect(await r.p.send(ev({ bead: 'x-52' }))).toBe('capped');
    expect(r.sent).toHaveLength(DAILY_CAP + 1);
    r.tick(24 * 3600 * 1000);
    expect(await r.p.send(ev({ bead: 'x-53' }))).toBe('sent');
  });

  test('cap state survives a restart', async () => {
    const r = rig();
    r.p.subscribe(sub());
    await r.p.send(ev());
    const r2 = rig({ home: r.home, t: r.now() + 10000 });
    expect(await r2.p.send(ev({ bead: 'a-9' }))).toBe('folded');
  });
});

describe('cleanup and failure', () => {
  test('404 and 410 delete that subscription only', async () => {
    const r = rig();
    r.p.subscribe(sub(EP + 'A'));
    r.p.subscribe(sub(EP + 'B'));
    r.p.subscribe(sub(EP + 'C'));
    r.status.set(EP + 'A', 404);
    r.status.set(EP + 'B', 410);
    expect(await r.p.send(ev())).toBe('sent');
    expect(r.p.subscribers()).toBe(1);
    const file = path.join(r.home, 'push-subs.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))[0].endpoint).toBe(EP + 'C');
  });

  test('other errors (500) keep the subscription and never throw', async () => {
    const r = rig();
    r.p.subscribe(sub());
    r.status.set(EP, 500);
    expect(await r.p.send(ev())).toBe('none');
    expect(r.p.subscribers()).toBe(1);
  });

  test('corrupt state files do not stop the module', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'push-'));
    writeFileSync(path.join(home, 'push-subs.json'), '{not json');
    writeFileSync(path.join(home, 'push-state.json'), '[]');
    expect(rig({ home }).p.subscribers()).toBe(0);
  });
});
