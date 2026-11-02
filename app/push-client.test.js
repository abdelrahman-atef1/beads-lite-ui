import { describe, expect, test, vi } from 'vitest';
import {
  T_KEY,
  T_SUB,
  T_UNSUB,
  disablePush,
  enablePush,
  keyToBytes,
  pushStatus
} from './push-client.js';

const EP = 'https://fcm.googleapis.com/fcm/send/x';

/** Fake browser push objects. */
function env(/** @type {any} */ o = {}) {
  let sub = o.sub ?? null;
  const subscribe = vi.fn(async (/** @type {any} */ opts) => {
    sub = {
      endpoint: EP,
      toJSON: () => ({ endpoint: EP, keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(async () => {
        sub = null;
      }),
      opts
    };
    return sub;
  });
  return {
    subscribe,
    env: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => sub, subscribe }
        })
      },
      Notification: {
        permission: o.permission ?? 'default',
        requestPermission: vi.fn(async () => o.answer ?? 'granted')
      },
      PushManager: {}
    }
  };
}
const client = () => ({
  send: vi.fn(async (/** @type {string} */ t, /** @type {any} */ _p) =>
    t === T_KEY ? { key: 'AQAB', subscribers: 0 } : { ok: true }
  )
});

describe('push client', () => {
  test('keyToBytes decodes base64url', () => {
    expect([...keyToBytes('AQAB')]).toEqual([1, 0, 1]);
    expect([...keyToBytes('-_8')]).toEqual([251, 255]);
  });

  test('status: unsupported, denied, off, on', async () => {
    expect(await pushStatus({})).toBe('unsupported');
    expect(await pushStatus(env({ permission: 'denied' }).env)).toBe('denied');
    expect(await pushStatus(env().env)).toBe('off');
    const e = env({ permission: 'granted', sub: { endpoint: 'x' } });
    expect(await pushStatus(e.env)).toBe('on');
  });

  test('enable: asks permission, subscribes with the public key, sends it to the board', async () => {
    const e = env();
    const c = client();
    expect(await enablePush(c, e.env)).toBe('on');
    expect(e.env.Notification.requestPermission).toHaveBeenCalled();
    const opts = e.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect([...opts.applicationServerKey]).toEqual([1, 0, 1]);
    expect(c.send.mock.calls.map((x) => x[0])).toEqual([T_KEY, T_SUB]);
    expect(c.send.mock.calls[1][1].subscription.endpoint).toMatch(/^https:/);
  });

  test('permission refused -> nothing subscribed or sent', async () => {
    const e = env({ answer: 'denied' });
    const c = client();
    expect(await enablePush(c, e.env)).toBe('denied');
    expect(e.subscribe).not.toHaveBeenCalled();
    expect(c.send).not.toHaveBeenCalled();
  });

  test('board failure degrades to "error", never throws', async () => {
    const e = env();
    const c = {
      send: vi.fn(async () => {
        throw new Error('push_unavailable');
      })
    };
    expect(await enablePush(c, e.env)).toBe('error');
  });

  test('disable unsubscribes the browser and tells the board', async () => {
    const e = env();
    const c = client();
    await enablePush(c, e.env);
    expect(await disablePush(c, e.env)).toBe('off');
    expect(c.send.mock.calls.at(-1)).toEqual([T_UNSUB, { endpoint: EP }]);
    const after = { ...e.env, Notification: { permission: 'granted' } };
    expect(await pushStatus(after)).toBe('off');
  });
});
