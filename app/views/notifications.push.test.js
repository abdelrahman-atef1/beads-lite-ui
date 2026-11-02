import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mountBell } from './notifications.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
let el = /** @type {HTMLElement} */ (document.body);
beforeEach(() => {
  document.body.innerHTML = '<span id="slot"></span>';
  document.documentElement.setAttribute('lang', 'en');
  el = /** @type {HTMLElement} */ (document.getElementById('slot'));
});

function rig(/** @type {any} */ o = {}) {
  /** @type {any} */
  let sub = null;
  const client = {
    on: () => () => undefined,
    onConnection: () => () => undefined,
    send: vi.fn(async (/** @type {string} */ t) =>
      t === 'push-key'
        ? { key: 'AQAB' }
        : { events: [], unread: 0, projects: [], mute_until: null }
    )
  };
  const pushEnv = {
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => sub,
          subscribe: async () =>
            (sub = {
              endpoint: 'https://fcm.googleapis.com/x',
              toJSON: () => ({
                endpoint: 'https://fcm.googleapis.com/x',
                keys: {}
              }),
              unsubscribe: async () => {
                sub = null;
              }
            })
        }
      })
    },
    Notification: {
      permission: o.permission ?? 'default',
      requestPermission: async () => 'granted'
    },
    PushManager: {}
  };
  return { client, pushEnv: o.unsupported ? {} : pushEnv };
}

async function open(/** @type {any} */ r) {
  mountBell(el, r);
  await tick();
  el.querySelector('button')?.click();
  await tick();
  await tick();
}

describe('bell: phone alerts row', () => {
  test('turn on subscribes, button flips to turn off', async () => {
    const r = rig();
    await open(r);
    const b = /** @type {HTMLButtonElement} */ (
      document.querySelector('.nt-push-btn')
    );
    expect(b.textContent).toBe('Turn on for this phone');
    b.click();
    await tick();
    await tick();
    expect(r.client.send.mock.calls.map((c) => c[0])).toContain(
      'push-subscribe'
    );
    expect(document.querySelector('.nt-push-btn')?.textContent).toBe(
      'Turn off for this phone'
    );
  });

  test('blocked and unsupported browsers get a note, not a button', async () => {
    await open(rig({ permission: 'denied' }));
    expect(document.querySelector('.nt-push-btn')).toBeNull();
    expect(document.querySelector('.nt-push')?.textContent).toMatch(/blocked/);
    document.body.innerHTML = '<span id="slot"></span>';
    el = /** @type {HTMLElement} */ (document.getElementById('slot'));
    await open(rig({ unsupported: true }));
    expect(document.querySelector('.nt-push')?.textContent).toMatch(
      /cannot receive/
    );
  });
});
