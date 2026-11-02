/**
 * Browser side of board Web Push (ADR 0007 N3, company-1bo5.6.16).
 * Turn on = ask permission, subscribe with the board's PUBLIC VAPID key, hand
 * the subscription to the board over the socket. Nothing here runs unless the
 * owner taps the button; no timer, no polling.
 */

export const T_KEY = 'push-key';
export const T_SUB = 'push-subscribe';
export const T_UNSUB = 'push-unsubscribe';
export const T_PUSH_LIST = 'push-list';
export const T_PUSH_REMOVE = 'push-remove';

/** Same bytes? A subscription made with another VAPID key is not usable. */
function sameKey(/** @type {any} */ buf, /** @type {Uint8Array} */ want) {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === want.length && a.every((v, i) => v === want[i]);
}

/** Short device label for the PC list, e.g. "Android Chrome". */
export function deviceLabel(ua = globalThis.navigator?.userAgent || '') {
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : '';
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return [os, br].filter(Boolean).join(' ');
}

/** @param {string} b64 */
export function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * @typedef {{ serviceWorker?: any, Notification?: any, PushManager?: any }} Env
 * @returns {Env}
 */
function realEnv() {
  return {
    serviceWorker:
      'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    Notification: 'Notification' in window ? window.Notification : undefined,
    PushManager: 'PushManager' in window ? window.PushManager : undefined
  };
}

/**
 * Push state of this browser: unsupported, denied, off or on. Never throws.
 * With a client it also checks the subscription was made with the board's
 * CURRENT key; a stale one reads as off so "Turn on" re-subscribes.
 *
 * @param {Env} [env]
 * @param {{ send: (type: string, payload?: unknown) => Promise<any> }} [client]
 */
export async function pushStatus(env = realEnv(), client) {
  try {
    if (!env.serviceWorker || !env.Notification || !env.PushManager) {
      return 'unsupported';
    }
    if (env.Notification.permission === 'denied') return 'denied';
    const reg = await env.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub || env.Notification.permission !== 'granted') return 'off';
    if (client) {
      const { key } = await client.send(T_KEY, {});
      if (!sameKey(sub.options?.applicationServerKey, keyToBytes(key))) {
        return 'off';
      }
    }
    return 'on';
  } catch {
    return 'unsupported';
  }
}

/**
 * @param {{ send: (type: string, payload?: unknown) => Promise<any> }} client
 * @param {Env} [env]
 * @returns {Promise<'on'|'denied'|'unsupported'|'error'>}
 */
export async function enablePush(client, env = realEnv()) {
  try {
    if (!env.serviceWorker || !env.Notification || !env.PushManager) {
      return 'unsupported';
    }
    const perm = await env.Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'error';
    const reg = await env.serviceWorker.ready;
    const { key } = await client.send(T_KEY, {});
    const want = keyToBytes(key);
    let sub = await reg.pushManager.getSubscription();
    // K6: a subscription bound to an older board key is refused by the push
    // service forever; drop it (and its record on the PC) and subscribe again.
    if (sub && !sameKey(sub.options?.applicationServerKey, want)) {
      const stale = sub.endpoint;
      await sub.unsubscribe();
      sub = null;
      try {
        await client.send(T_UNSUB, { endpoint: stale });
      } catch {
        // the PC prunes it on the first 404/410 anyway
      }
    }
    sub ||= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: want
    });
    await client.send(T_SUB, {
      subscription: sub.toJSON(),
      label: deviceLabel()
    });
    return 'on';
  } catch {
    return 'error';
  }
}

/**
 * @param {{ send: (type: string, payload?: unknown) => Promise<any> }} client
 * @param {Env} [env]
 */
export async function disablePush(client, env = realEnv()) {
  try {
    const reg = await env.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await client.send(T_UNSUB, { endpoint });
    }
    return 'off';
  } catch {
    return 'error';
  }
}
