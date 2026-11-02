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

describe('bell: PC list of subscribed phones (W6)', () => {
  const phones = [
    {
      id: 'aaa',
      label: 'Android Chrome',
      created: '2026-11-01T10:00:00Z',
      last_ok: '2026-11-02T09:00:00Z'
    },
    { id: 'bbb', label: '', created: '2026-10-30T10:00:00Z', last_ok: null }
  ];

  test('lists phones with Remove; Remove sends the id and refreshes', async () => {
    const r = rig();
    let list = phones.slice();
    /** @type {any} */ (r.client.send).mockImplementation(
      async (/** @type {string} */ t, /** @type {any} */ p) => {
        if (t === 'push-key') return { key: 'AQAB' };
        if (t === 'push-list') return { subscriptions: list };
        if (t === 'push-remove') {
          list = list.filter((x) => x.id !== p.id);
          return { ok: true };
        }
        return { events: [], unread: 0, projects: [], mute_until: null };
      }
    );
    await open(r);
    await tick();
    const rows = document.querySelectorAll('.nt-phone');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Android Chrome 2026-11-02/);
    /** @type {HTMLElement} */ (rows[0].querySelector('.nt-phone-rm')).click();
    await tick();
    await tick();
    expect(r.client.send).toHaveBeenCalledWith('push-remove', { id: 'aaa' });
    expect(document.querySelectorAll('.nt-phone')).toHaveLength(1);
  });

  test('the phone door refuses the list: nothing is shown', async () => {
    const r = rig();
    /** @type {any} */ (r.client.send).mockImplementation(
      async (/** @type {string} */ t) => {
        if (t === 'push-key') return { key: 'AQAB' };
        if (t === 'push-list') throw new Error('not_allowed');
        return { events: [], unread: 0, projects: [], mute_until: null };
      }
    );
    await open(r);
    await tick();
    expect(document.querySelector('.nt-phones')?.children.length).toBe(0);
  });
});
