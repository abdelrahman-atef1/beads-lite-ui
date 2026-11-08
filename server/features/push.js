/**
 * Board Web Push (ADR 0007 N3; company-1bo5.6.16).
 *
 * The notifier hands every bell event to send(); this module turns it into one
 * end-to-end encrypted push to the phones the owner subscribed. The bell stays
 * the source of truth: push is only the alarm, so every refusal here (no
 * subscriber, muted, capped, push service down, no key) degrades to "bell only".
 *
 * Secrets live only in <boardHome> (%USERPROFILE%\.codesters\board): vapid.json
 * (private key) and push-subs.json (endpoint URLs are capabilities). The
 * folder is locked to the owner + SYSTEM before the first key is written; if
 * that fails no key is made and push stays off. Neither file, nor any key or
 * endpoint, is ever logged, sent over the socket (only the PUBLIC key) or put
 * in a payload.
 *
 * Payload (JSON, no free text): { kind, project, bead, title, count, at }.
 * title is card_title for a non-desk card, null for a desk bead (pointer only).
 * Never card_q, options, comments or the owner's words. The service worker
 * (app/sw.js) builds the visible text.
 *
 * Caps: one push per bell event key (the notifier already dedups); per project
 * at most one push per 2 min, extras folded into one "N decisions waiting in
 * <project>"; 50 pushes a day, then one "more on the board" and silence until
 * local midnight. 404/410 from the push service deletes that subscription.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debug } from '../logging.js';
import { allowPhoneFeatureType } from '../phone.js';

const log = debug('push');

export const PROJECT_GAP_MS = 2 * 60 * 1000;
export const DAILY_CAP = 50;
const MAX_SUBS = 5;
const MAX_ENDPOINT = 1000;
const TTL_S = 3600;
const SEND_TIMEOUT_MS = 10000;
const SUBJECT =
  process.env.BDUI_VAPID_SUBJECT || 'mailto:board@codesters-inc.com';
// Only the public push services the browsers use; also the SSRF guard.
// FCM is one exact host (no storage.googleapis.com etc.); the others are
// their own sub-domain families.
const PUSH_EXACT = ['fcm.googleapis.com'];
const PUSH_SUFFIX = [
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com'
];
const MAX_LABEL = 40;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;

function homeDir(env = process.env) {
  return env.BDUI_BOARD_HOME || path.join(os.homedir(), '.codesters', 'board');
}

/** @param {string} file @param {any} fallback */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** @param {string} file @param {any} data */
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  // Antivirus now and then holds the file for a moment (EPERM/EBUSY on rename).
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      if (i >= 3 || (code !== 'EPERM' && code !== 'EBUSY')) throw e;
      const until = Date.now() + 25 * (i + 1);
      while (Date.now() < until);
    }
  }
}

/**
 * Decoded byte length of a base64url string.
 *
 * @param {string} s
 */
function b64Len(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length;
}

/**
 * Owner + SYSTEM only, inherited by files created later. Windows: icacls.
 * Elsewhere the 0600 file mode plus a 0700 folder is the same promise.
 * Throws if it cannot be done (caller then makes no key).
 * @param {string} dir
 */
export function lockDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform !== 'win32') {
    fs.chmodSync(dir, 0o700);
    return;
  }
  const user = process.env.USERNAME;
  if (!user) throw new Error('no USERNAME for the ACL');
  execFileSync(
    'icacls',
    [
      dir,
      '/inheritance:r',
      '/grant:r',
      `${user}:(OI)(CI)F`,
      '*S-1-5-18:(OI)(CI)F'
    ],
    { windowsHide: true, stdio: 'ignore', timeout: 20000 }
  );
}

/**
 * Validate a browser PushSubscription JSON. Returns a clean copy or null.
 * @param {any} s
 */
export function cleanSubscription(s) {
  if (!s || typeof s !== 'object') return null;
  const ep = s.endpoint;
  const k = s.keys;
  if (typeof ep !== 'string' || ep.length > MAX_ENDPOINT) return null;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') {
    return null;
  }
  if (k.p256dh.length > 200 || k.auth.length > 64) return null;
  if (!B64URL.test(k.p256dh) || !B64URL.test(k.auth)) return null;
  // A real browser key pair: P-256 point (65 bytes) and auth secret (16 bytes).
  if (b64Len(k.p256dh) !== 65 || b64Len(k.auth) !== 16) return null;
  /** @type {URL} */
  let u;
  try {
    u = new URL(ep);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    !(
      PUSH_EXACT.includes(host) ||
      PUSH_SUFFIX.some((h) => host === h || host.endsWith('.' + h))
    )
  ) {
    return null;
  }
  return { endpoint: u.href, keys: { p256dh: k.p256dh, auth: k.auth } };
}

/**
 * Short printable label for the PC list.
 *
 * @param {any} v
 */
function cleanLabel(v) {
  if (typeof v !== 'string') return '';
  let out = '';
  for (const ch of v.slice(0, 200)) {
    const c = ch.charCodeAt(0);
    out += c < 32 || c === 127 || ch === '<' || ch === '>' ? ' ' : ch;
  }
  return out.trim().slice(0, MAX_LABEL);
}

/**
 * Stable id for a subscription in the PC list (the endpoint stays secret).
 *
 * @param {string} endpoint
 */
function subId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

/**
 * Local calendar day, for the daily cap.
 *
 * @param {number} t
 */
function dayOf(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * @param {{
 *   home?: string,
 *   webpush?: { generateVAPIDKeys: Function, sendNotification: Function },
 *   lock?: (dir: string) => void,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any
 * }} [opts]
 */
export function createPush(opts = {}) {
  const home = opts.home || homeDir();
  const keyFile = path.join(home, 'vapid.json');
  const subsFile = path.join(home, 'push-subs.json');
  const stateFile = path.join(home, 'push-state.json');
  const now = opts.now || Date.now;
  const lock = opts.lock || lockDir;
  const setTimer =
    opts.setTimer ||
    ((/** @type {() => void} */ fn, /** @type {number} */ ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    });
  /** @type {any} */
  let wp = opts.webpush || null;
  const lib = async () => (wp ||= (await import('web-push')).default);

  /** @type {{ publicKey: string, privateKey: string } | null} */
  let keys = null;
  let locked = false;

  /** @type {Array<{ endpoint: string, keys: { p256dh: string, auth: string }, at: string, label?: string, ok?: string }>} */
  let subs = readJson(subsFile, []).filter((/** @type {any} */ s) =>
    cleanSubscription(s)
  );
  /** @type {{ day: string, count: number, noticed: boolean, last: Record<string, number> }} */
  let state = readJson(stateFile, null);
  // W9: a state file that exists but cannot be read must not reset the caps.
  // Push stays off (bell only) until the next local day, then starts fresh.
  let stateBroken = '';
  if (
    fs.existsSync(stateFile) &&
    (!state || typeof state !== 'object' || Array.isArray(state))
  ) {
    stateBroken = dayOf(now());
    log('push-state.json unreadable: push off until the next day');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    state = /** @type {any} */ ({});
  }
  state.last = state.last && typeof state.last === 'object' ? state.last : {};
  state.count = Number(state.count) || 0;
  state.noticed = state.noticed === true;
  state.day = typeof state.day === 'string' ? state.day : '';

  /** @type {Map<string, { n: number, mixed: boolean, first: any, timer: any }>} */
  const folded = new Map();

  const saveSubs = () => writeJson(subsFile, subs);
  const saveState = () => writeJson(stateFile, state);

  function ensureLocked() {
    if (locked) return;
    lock(home); // throws: no key is written, push stays off
    locked = true;
  }

  /** Load or create the VAPID pair. Throws when it cannot be done safely. */
  async function ensureKeys() {
    if (keys) return keys;
    ensureLocked();
    const j = readJson(keyFile, null);
    if (
      j &&
      typeof j.publicKey === 'string' &&
      typeof j.privateKey === 'string'
    ) {
      keys = { publicKey: j.publicKey, privateKey: j.privateKey };
      return keys;
    }
    const k = (await lib()).generateVAPIDKeys();
    writeJson(keyFile, { publicKey: k.publicKey, privateKey: k.privateKey });
    keys = { publicKey: k.publicKey, privateKey: k.privateKey };
    return keys;
  }

  function rollDay() {
    const d = dayOf(now());
    if (state.day !== d) {
      state.day = d;
      state.count = 0;
      state.noticed = false;
    }
  }

  /**
   * Post one payload to every subscription. Never throws.
   * @param {any} payload
   */
  async function post(payload) {
    if (!subs.length) return 0;
    /** @type {{ publicKey: string, privateKey: string }} */
    let k;
    try {
      k = await ensureKeys();
    } catch (e) {
      log('push off: no safe key store (%s)', /** @type {any} */ (e)?.message);
      return 0;
    }
    const w = await lib();
    const body = JSON.stringify(payload);
    let ok = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await w.sendNotification(
            { endpoint: s.endpoint, keys: s.keys },
            body,
            {
              vapidDetails: { subject: SUBJECT, ...k },
              TTL: TTL_S,
              urgency: 'high',
              timeout: SEND_TIMEOUT_MS
            }
          );
          ok += 1;
          s.ok = new Date(now()).toISOString();
        } catch (e) {
          const code = /** @type {any} */ (e)?.statusCode;
          if (code === 404 || code === 410) {
            subs = subs.filter((x) => x.endpoint !== s.endpoint);
            saveSubs();
          } else {
            log('push post failed: status %s', code ?? 'none');
          }
        }
      })
    );
    if (ok) {
      try {
        saveSubs();
      } catch {
        // last-ok is cosmetic
      }
    }
    return ok;
  }

  /**
   * Apply the daily cap, then post.
   *
   * @param {any} payload
   * @returns {Promise<'sent'|'capped'|'noticed'|'none'>}
   */
  async function deliver(payload) {
    rollDay();
    if (state.noticed) return 'capped';
    if (state.count >= DAILY_CAP) {
      state.noticed = true;
      state.count += 1;
      saveState();
      await post({
        kind: 'more',
        project: '',
        bead: null,
        title: null,
        count: 0,
        at: payload.at
      });
      return 'noticed';
    }
    state.count += 1;
    if (payload.project) state.last[payload.project] = now();
    saveState();
    return (await post(payload)) ? 'sent' : 'none';
  }

  /** @param {string} project */
  function flush(project) {
    const f = folded.get(project);
    folded.delete(project);
    if (!f) return Promise.resolve('none');
    const at = new Date(now()).toISOString();
    return deliver(
      f.n === 1
        ? f.first
        : {
            // folded releases keep their own words; anything mixed is a digest
            kind: f.mixed ? 'digest' : 'release',
            project,
            bead: null,
            title: null,
            count: f.n,
            at
          }
    );
  }

  return {
    subscribers: () => subs.length,
    /** The PUBLIC key for PushManager.subscribe. */
    async publicKey() {
      return (await ensureKeys()).publicKey;
    },
    /** @param {any} s @param {any} [label] */
    subscribe(s, label) {
      const c = cleanSubscription(s);
      if (!c)
        throw Object.assign(new Error('invalid subscription'), {
          code: 'bad_payload'
        });
      const rest = subs.filter((x) => x.endpoint !== c.endpoint);
      // Never evict: junk must not push the real phone out. Full means the
      // owner removes one on the PC list.
      if (rest.length >= MAX_SUBS) {
        throw Object.assign(
          new Error('too many phones; remove one on the PC'),
          { code: 'too_many' }
        );
      }
      const old = subs.find((x) => x.endpoint === c.endpoint);
      subs = [
        ...rest,
        {
          ...c,
          at: old?.at || new Date(now()).toISOString(),
          label: cleanLabel(label) || old?.label || '',
          ...(old?.ok ? { ok: old.ok } : {})
        }
      ];
      saveSubs();
      return { ok: true, subscribers: subs.length };
    },
    /** PC list: no endpoint or key leaves the PC. */
    list() {
      return subs.map((x) => ({
        id: subId(x.endpoint),
        label: x.label || '',
        created: x.at,
        last_ok: x.ok || null
      }));
    },
    /** @param {any} id */
    remove(id) {
      if (typeof id !== 'string' || id.length > 40) {
        throw Object.assign(new Error('invalid id'), { code: 'bad_payload' });
      }
      subs = subs.filter((x) => subId(x.endpoint) !== id);
      saveSubs();
      return { ok: true, subscribers: subs.length };
    },
    /** @param {any} endpoint */
    unsubscribe(endpoint) {
      if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) {
        throw Object.assign(new Error('invalid endpoint'), {
          code: 'bad_payload'
        });
      }
      subs = subs.filter((x) => x.endpoint !== endpoint);
      saveSubs();
      return { ok: true, subscribers: subs.length };
    },
    /**
     * Called for every new bell event.
     * @param {any} ev @param {{ muted?: boolean }} [ctx]
     * @returns {Promise<string>} what happened (tests, logs)
     */
    async send(ev, ctx = {}) {
      if (!ev || !subs.length) return 'no-subscriber';
      if (stateBroken) {
        if (dayOf(now()) === stateBroken) return 'state-unreadable';
        stateBroken = '';
        state = /** @type {any} */ ({
          last: {},
          count: 0,
          day: '',
          noticed: false
        });
      }
      if (ev.kind === 'degraded') return 'not-pushed';
      if (ctx.muted) return 'muted';
      const project = String(ev.project || '');
      if (!PROJECT_RE.test(project)) return 'bad-project';
      const desk =
        ev.desk === true || typeof ev.title !== 'string' || !ev.title;
      const payload = {
        kind: ev.kind,
        project,
        bead:
          typeof ev.bead === 'string' && BEAD_ID_RE.test(ev.bead)
            ? ev.bead
            : null,
        title: ev.kind === 'digest' || desk ? null : ev.title.slice(0, 80),
        count: Number(ev.count) || 1,
        at: String(ev.at || new Date(now()).toISOString())
      };
      rollDay();
      const f = folded.get(project);
      const last = state.last[project];
      if (f || (typeof last === 'number' && now() - last < PROJECT_GAP_MS)) {
        if (f) {
          f.n += payload.kind === 'digest' ? payload.count : 1;
          if (payload.kind !== 'release') f.mixed = true;
        } else {
          const wait = Math.max(0, last + PROJECT_GAP_MS - now());
          folded.set(project, {
            n: payload.kind === 'digest' ? payload.count : 1,
            mixed: payload.kind !== 'release',
            first: payload,
            timer: setTimer(() => void flush(project), wait)
          });
        }
        return 'folded';
      }
      return deliver(payload);
    },
    flush,
    pending: () => [...folded.keys()]
  };
}

/** @type {ReturnType<typeof createPush> | null} */
let live = null;

/** Process-wide instance (the notifier and the socket handlers share it). */
export function getPush() {
  return (live ||= createPush());
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  allowPhoneFeatureType('push-key');
  const bad = (/** @type {string} */ m) =>
    Object.assign(new Error(m), { code: 'bad_payload' });
  seam.registerHandler(
    'push-key',
    async () => {
      try {
        return {
          key: await getPush().publicKey(),
          subscribers: getPush().subscribers()
        };
      } catch {
        throw Object.assign(new Error('push is unavailable on this PC'), {
          code: 'push_unavailable'
        });
      }
    },
    { phone: true }
  );
  seam.registerHandler(
    'push-subscribe',
    (/** @type {any} */ r) => {
      const s = r?.payload?.subscription;
      if (!s) throw bad('payload requires { subscription }');
      return getPush().subscribe(s, r?.payload?.label);
    },
    { mutating: true, phone: true }
  );
  // No phone flag: the phone door has full control now (company-8ce8.13), so
  // the list shows there too. Ids only; endpoints and keys never leave the PC.
  seam.registerHandler('push-list', () => ({
    subscriptions: getPush().list()
  }));
  seam.registerHandler(
    'push-remove',
    (/** @type {any} */ r) => getPush().remove(r?.payload?.id),
    { mutating: true }
  );
  seam.registerHandler(
    'push-unsubscribe',
    (/** @type {any} */ r) => getPush().unsubscribe(r?.payload?.endpoint),
    { mutating: true, phone: true }
  );
}
