/**
 * Browser side of board Web Push (ADR 0007 N3, company-1bo5.6.16).
 * Turn on = ask permission, subscribe with the board's PUBLIC VAPID key, hand
 * the subscription to the board over the socket. Nothing here runs unless the
 * owner taps the button; no timer, no polling.
 */

export const T_KEY = 'push-key';
export const T_SUB = 'push-subscribe';
export const T_UNSUB = 'push-unsubscribe';

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
 *
 * @param {Env} [env]
 */
export async function pushStatus(env = realEnv()) {
  try {
    if (!env.serviceWorker || !env.Notification || !env.PushManager) {
      return 'unsupported';
    }
    if (env.Notification.permission === 'denied') return 'denied';
    const reg = await env.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && env.Notification.permission === 'granted' ? 'on' : 'off';
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
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(key)
      }));
    await client.send(T_SUB, { subscription: sub.toJSON() });
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
