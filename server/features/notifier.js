/**
 * Board notifier (ADR 0007 N1, N2, N4, N5; SEC W3, W7, W9; company-1bo5.6.14).
 *
 * Watches every registered project whose switch is on. A change in its .beads
 * folder (debounced 5 s) or the 30 min rescan runs ONE background
 * `bd list --status owner_decision --json` in that project and diffs it against
 * notified.json. Two triggers only:
 *   decision: owner_decision + assignee abdelrahman + a card the card core accepts
 *   answer:   such a card whose card_state is "explained" (key includes the round)
 * Events go to the bell store (notified.json, 30 days) and to every socket as a
 * `notify-event` frame. Push (N3, push.js) reads the same events through onEvent.
 *
 * Bell data contract is on the bead company-1bo5.6.14. Desk and unreadable-gate
 * beads never carry a title (W3, fails closed).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { allowPhoneFeatureType, isDeskIssue } from '../phone.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { watchDb } from '../watcher.js';
import { getPush } from './push.js';

const log = debug('notifier');

export const OWNER = 'abdelrahman';
export const DEBOUNCE_MS = 5000;
export const RESCAN_MS = 30 * 60 * 1000;
const KEEP_MS = 30 * 24 * 3600 * 1000;
const KEY_KEEP_MS = 60 * 24 * 3600 * 1000;
const MAX_EVENTS = 100;
const MAX_MUTE_MS = 7 * 24 * 3600 * 1000;
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
const SPAWN_FAIL_RE = /EPERM|uv_spawn|Access is denied/i;
const BIDI_RE = /[‪-‮⁦-⁩‎‏؜]/g;
// eslint-disable-next-line no-control-regex -- intentional: strip control characters
const CTRL_RE = /[\u0000-\u001F\u007F]/g;

/** @param {string} p folder name, lower-case = project key (same as report.js) */
export function projectKey(p) {
  return path.basename(p.replace(/[\\/]+$/, '')).toLowerCase();
}

export function boardHome(env = process.env) {
  return env.BDUI_BOARD_HOME || path.join(os.homedir(), '.codesters', 'board');
}

/** Card core by full path (ADR 0006 D1); CARDS_DIR overrides for tests. */
async function loadRules() {
  const dir =
    process.env.CARDS_DIR ||
    path.join('E:', 'Projects', 'learner', 'scripts', 'cards');
  return import(pathToFileURL(path.join(dir, 'rules.mjs')).href);
}

/** @param {string} file @param {any} fallback */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Atomic write: temp file then rename. */
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

const sha = (/** @type {string} */ s) =>
  createHash('sha256').update(s).digest('hex');

/**
 * @param {{
 *   home?: string,
 *   listProjects?: () => Array<{ path: string }>,
 *   listParked?: (cwd: string) => Promise<any[]>,
 *   readBeadLabels?: (cwd: string, id: string) => Promise<string[] | null>,
 *   rules?: { parseCard: Function, gate: Function, scanText: Function },
 *   watch?: (root: string, cb: () => void) => { close: () => void },
 *   broadcast?: (type: string, payload?: unknown) => void,
 *   onEvent?: (ev: any, ctx: { muted: boolean }) => unknown,
 *   now?: () => number,
 *   rescan_ms?: number
 * }} [opts]
 */
export function createNotifier(opts = {}) {
  const home = opts.home || boardHome();
  const prefsFile = path.join(home, 'notify.json');
  const storeFile = path.join(home, 'notified.json');
  const now = opts.now || Date.now;
  const listProjects = opts.listProjects || getAvailableWorkspaces;
  const listParked =
    opts.listParked ||
    (async (/** @type {string} */ cwd) => {
      const r = await runBdJson(
        ['list', '--status', 'owner_decision', '--json', '--limit', '0'],
        { cwd, priority: 'background', timeout_ms: 60000 }
      );
      if (r.code !== 0) {
        throw new Error(r.stderr || 'bd list failed');
      }
      return Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
    });
  const readBeadLabels =
    opts.readBeadLabels ||
    (async (/** @type {string} */ cwd, /** @type {string} */ id) => {
      const r = await runBdJson(['show', id, '--json'], {
        cwd,
        priority: 'background'
      });
      const b = /** @type {any} */ (
        Array.isArray(r.stdoutJson) ? r.stdoutJson[0] : r.stdoutJson
      );
      if (r.code !== 0 || !b || typeof b !== 'object') return null;
      return Array.isArray(b.labels) ? b.labels : [];
    });
  const watch =
    opts.watch ||
    ((/** @type {string} */ root, /** @type {() => void} */ cb) =>
      watchDb(root, cb, { debounce_ms: DEBOUNCE_MS }));
  const broadcast = opts.broadcast || (() => {});
  const onEvent = opts.onEvent || null;
  const rescan_ms = opts.rescan_ms ?? RESCAN_MS;

  /** @type {any} */
  let rules = opts.rules || null;
  /** @type {Map<string, { path: string, close: () => void }>} */
  const watchers = new Map();
  /** @type {Map<string, { running: boolean, again: boolean }>} */
  const flight = new Map();
  /** @type {Set<string>} projects already scanned in this process */
  const scanned = new Set();
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  /** @param {any} v */
  function validMute(v) {
    if (typeof v !== 'string') return null;
    const t = Date.parse(v);
    return Number.isFinite(t) && t > now() ? new Date(t).toISOString() : null;
  }

  /** @param {any} p */
  function normalizePrefs(p) {
    /** @type {Record<string, { on: boolean }>} */
    const projects = {};
    if (p && typeof p.projects === 'object' && p.projects) {
      for (const [k, v] of Object.entries(p.projects)) {
        if (PROJECT_RE.test(k) && v && typeof v === 'object') {
          projects[k] = { on: /** @type {any} */ (v).on !== false };
        }
      }
    }
    return { projects, mute_until: validMute(p && p.mute_until) };
  }

  /** @param {any} s */
  function normalizeStore(s) {
    /** @type {Record<string, string>} */
    const keys = s && typeof s.keys === 'object' && s.keys ? s.keys : {};
    /** @type {any[]} */
    const events = Array.isArray(s && s.events) ? s.events : [];
    return {
      keys,
      events: events.filter((e) => e && typeof e.id === 'string')
    };
  }

  let prefs = normalizePrefs(readJson(prefsFile, {}));
  let store = normalizeStore(readJson(storeFile, {}));

  function savePrefs() {
    writeJson(prefsFile, prefs);
  }
  function saveStore() {
    writeJson(storeFile, store);
  }

  /** @returns {Map<string, string>} key -> path */
  function known() {
    /** @type {Map<string, string>} */
    const m = new Map();
    for (const w of listProjects()) {
      const k = projectKey(w.path);
      if (PROJECT_RE.test(k) && !m.has(k)) m.set(k, w.path);
    }
    return m;
  }

  /** @param {string} key */
  const isOn = (key) => prefs.projects[key]?.on !== false;

  function prune() {
    const t = now();
    store.events = store.events
      .filter((e) => t - Date.parse(e.at) < KEEP_MS)
      .slice(0, MAX_EVENTS);
    for (const [k, at] of Object.entries(store.keys)) {
      if (t - Date.parse(at) > KEY_KEEP_MS) delete store.keys[k];
    }
  }

  /** Bell payload (the contract). */
  function snapshot() {
    prune();
    return {
      events: store.events,
      unread: store.events.filter((e) => !e.read).length,
      projects: [...known()].map(([key, p]) => ({
        key,
        name: path.basename(p),
        on: isOn(key)
      })),
      mute_until: validMute(prefs.mute_until)
    };
  }

  /** @param {any} ev */
  function emit(ev) {
    store.events.unshift(ev);
    store.events = store.events.slice(0, MAX_EVENTS);
    try {
      broadcast('notify-event', {
        event: ev,
        unread: store.events.filter((e) => !e.read).length
      });
    } catch (e) {
      log('broadcast failed %o', e);
    }
    // Web Push (N3): another reader of the same event; never blocks or throws.
    try {
      void Promise.resolve(
        onEvent?.(ev, { muted: validMute(prefs.mute_until) !== null })
      ).catch((e) => log('push failed %o', e));
    } catch (e) {
      log('push failed %o', e);
    }
  }

  /** Title for a non-desk card only: <=80, no bidi/control, passes the scan. */
  function safeTitle(/** @type {any} */ card) {
    let t = String(card.title || '')
      .replace(BIDI_RE, '')
      .replace(CTRL_RE, ' ')
      .trim();
    t = Array.from(t).slice(0, 80).join('');
    if (!t || rules.scanText(t).length) return null;
    return t;
  }

  /**
   * Is this bead desk? Fails closed: any doubt = desk (W3).
   * @param {string} cwd @param {any} bead @param {any} card
   */
  async function deskCheck(cwd, bead, card) {
    try {
      if (isDeskIssue(bead)) return true;
      /** @type {string[]} */
      let parentLabels = [];
      let parentUnreadable = false;
      const dot = bead.id.lastIndexOf('.');
      if (dot > 0) {
        const pid = bead.id.slice(0, dot);
        const l = BEAD_ID_RE.test(pid) ? await readBeadLabels(cwd, pid) : null;
        if (l === null) parentUnreadable = true;
        else parentLabels = l;
      }
      return !rules.gate(bead, card, { parentLabels, parentUnreadable }).ok;
    } catch {
      return true;
    }
  }

  /** @param {string} key */
  function degrade(key) {
    const k = `degraded|${key}`;
    if (store.keys[k] !== undefined) return;
    const at = new Date(now()).toISOString();
    store.keys[k] = at;
    emit({
      id: `n-${sha(k).slice(0, 12)}`,
      kind: 'degraded',
      project: key,
      bead: null,
      title: null,
      desk: false,
      count: 1,
      at,
      read: false
    });
    saveStore();
  }

  /** @param {string} key */
  function stopProject(key) {
    const w = watchers.get(key);
    if (w) {
      try {
        w.close();
      } catch {
        // already closed
      }
      watchers.delete(key);
    }
  }

  /**
   * One scan of one project. Never throws; one in flight per project (W9).
   * @param {string} key @param {string} cwd
   */
  async function scan(key, cwd) {
    const f = flight.get(key) || { running: false, again: false };
    flight.set(key, f);
    if (f.running) {
      f.again = true;
      return;
    }
    f.running = true;
    try {
      if (!rules) rules = await loadRules();
      if (!isOn(key)) return;
      /** @type {any[]} */
      let beads;
      try {
        beads = await listParked(cwd);
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message || e);
        if (
          SPAWN_FAIL_RE.test(msg) ||
          /** @type {any} */ (e)?.code === 'EPERM'
        ) {
          // refused program start: stop this project's watcher, show it, no retry
          stopProject(key);
          degrade(key);
        } else {
          log('scan %s failed: %s', key, msg);
        }
        return;
      }
      const first = !scanned.has(key);
      scanned.add(key);
      const at = new Date(now()).toISOString();
      /** @type {Array<{ k: string, kind: string, bead: string, title: string | null, desk: boolean }>} */
      const fresh = [];
      for (const bead of beads) {
        if (
          !bead ||
          typeof bead.id !== 'string' ||
          !BEAD_ID_RE.test(bead.id) ||
          bead.status !== 'owner_decision' ||
          bead.assignee !== OWNER
        ) {
          continue;
        }
        const parsed = rules.parseCard(bead);
        if (!parsed.ok) continue; // no valid card, no notification
        const card = parsed.card;
        const m = bead.metadata || {};
        const hash = sha(
          `${card.q}\n${JSON.stringify(m.card_opts ?? '')}`
        ).slice(0, 16);
        const base = `${key}|${bead.id}`;
        const dkey = `${base}|d|${hash}`;
        const akey = `${base}|a|${Number(m.card_round) || 0}`;
        /** @type {Array<[string, string]>} */
        const wants = [];
        if (store.keys[dkey] === undefined) wants.push([dkey, 'decision']);
        else store.keys[dkey] = at;
        if (card.explained) {
          if (store.keys[akey] === undefined) wants.push([akey, 'answer']);
          else store.keys[akey] = at;
        }
        for (const [k, kind] of wants) {
          const desk = await deskCheck(cwd, bead, card);
          fresh.push({
            k,
            kind,
            bead: bead.id,
            title: desk ? null : safeTitle(card),
            desk
          });
        }
      }
      for (const x of fresh) store.keys[x.k] = at;
      if (first && fresh.length > 1) {
        // Start-up (or first sight of a project) with several waiting: one digest.
        emit({
          id: `n-${sha(`${key}|digest|${at}`).slice(0, 12)}`,
          kind: 'digest',
          project: key,
          bead: null,
          title: null,
          desk: false,
          count: fresh.length,
          at,
          read: false
        });
      } else {
        for (const x of fresh) {
          emit({
            id: `n-${sha(x.k).slice(0, 12)}`,
            kind: x.kind,
            project: key,
            bead: x.bead,
            title: x.title,
            desk: x.desk,
            count: 1,
            at,
            read: false
          });
        }
      }
      prune();
      saveStore();
    } catch (e) {
      log('scan %s error %o', key, e);
    } finally {
      f.running = false;
      if (f.again) {
        f.again = false;
        void scan(key, cwd);
      }
    }
  }

  /** Open watchers for projects switched on, close the rest (N2, N4). */
  function sync() {
    const all = known();
    for (const key of [...watchers.keys()]) {
      if (!all.has(key) || !isOn(key)) stopProject(key);
    }
    for (const [key, p] of all) {
      if (!isOn(key) || watchers.has(key)) continue;
      if (store.keys[`degraded|${key}`] !== undefined) continue;
      try {
        const w = watch(p, () => void scan(key, p));
        watchers.set(key, { path: p, close: () => w.close() });
      } catch (e) {
        log('watch %s failed %o', key, e);
        continue;
      }
      void scan(key, p);
    }
    if (watchers.size && !timer && rescan_ms > 0) {
      timer = setInterval(() => {
        sync();
        for (const [key, w] of watchers) void scan(key, w.path);
      }, rescan_ms);
      timer.unref?.();
    } else if (!watchers.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function stop() {
    for (const key of [...watchers.keys()]) stopProject(key);
    if (timer) clearInterval(timer);
    timer = null;
  }

  /** @param {string} msg */
  const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_payload' });

  return {
    sync,
    stop,
    scan,
    snapshot,
    watching: () => [...watchers.keys()],
    list() {
      sync();
      return snapshot();
    },
    /** @param {any} payload */
    markRead(payload) {
      const p = payload || {};
      if (p.all === true) {
        for (const e of store.events) e.read = true;
      } else if (Array.isArray(p.ids) && p.ids.length <= MAX_EVENTS) {
        const ids = new Set(
          p.ids.filter((/** @type {any} */ x) => typeof x === 'string')
        );
        for (const e of store.events) if (ids.has(e.id)) e.read = true;
      } else {
        throw bad('payload requires { ids: string[] } or { all: true }');
      }
      saveStore();
      return snapshot();
    },
    /** @param {any} payload */
    setProject(payload) {
      const p = payload || {};
      if (
        typeof p.project !== 'string' ||
        typeof p.on !== 'boolean' ||
        !known().has(p.project)
      ) {
        throw bad(
          'payload requires { project: <registered key>, on: boolean }'
        );
      }
      prefs.projects[p.project] = { on: p.on };
      savePrefs();
      sync();
      return snapshot();
    },
    /** @param {any} payload */
    mute(payload) {
      const p = payload || {};
      if (p.until === null) {
        prefs.mute_until = null;
      } else {
        const t = typeof p.until === 'string' ? Date.parse(p.until) : NaN;
        if (!Number.isFinite(t) || t > now() + MAX_MUTE_MS) {
          throw bad('until must be an ISO date at most 7 days ahead, or null');
        }
        prefs.mute_until = new Date(t).toISOString();
      }
      savePrefs();
      return snapshot();
    }
  };
}

/** @type {ReturnType<typeof createNotifier> | null} */
let live = null;

/**
 * Start the process-wide notifier (called once from server/index.js).
 * @param {{ broadcast: (type: string, payload?: unknown) => void }} o
 */
export function startNotifier(o) {
  if (live) live.stop();
  live = createNotifier({
    broadcast: o.broadcast,
    onEvent: (ev, ctx) => getPush().send(ev, ctx)
  });
  live.sync();
  return live;
}

/** Re-read the project list (registry changed). */
export function syncNotifier() {
  live?.sync();
}

export function stopNotifier() {
  live?.stop();
  live = null;
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  allowPhoneFeatureType('notify-event'); // pushed frame; payload is already desk-safe
  const n = () => (live ||= createNotifier());
  seam.registerHandler('notify-list', () => n().list(), { phone: true });
  seam.registerHandler(
    'notify-mark-read',
    (/** @type {any} */ r) => n().markRead(r.payload),
    { mutating: true, phone: true }
  );
  seam.registerHandler(
    'notify-set',
    (/** @type {any} */ r) => n().setProject(r.payload),
    { mutating: true, phone: true }
  );
  seam.registerHandler(
    'notify-mute',
    (/** @type {any} */ r) => n().mute(r.payload),
    { mutating: true, phone: true }
  );
}
