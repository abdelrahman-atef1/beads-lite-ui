/**
 * Decisions feed (company-1bo5.6.26): the owner's waiting decisions from EVERY
 * registered project in one list, so the Decisions screen opens on "All".
 *
 *   list-decisions-all {}            -> Snap   (phone door allowed)
 *   decisions-all (push)             -> Snap   (only when the list changed)
 * Snap = { items: Item[], projects: [{key,name,count}], rules_ok }
 * Item = { id, project:{key,name}, title, title_ar, priority, updated_at,
 *          assignee, metadata:{card_*} }
 *
 * Cost model: nothing runs until the screen is first opened. After that there
 * is one fs watcher per project (the same watcher the board uses) and ONE
 * background `bd list --status owner_decision` in the project that changed;
 * no timer, no polling. The result is cached; an unchanged list is not pushed.
 *
 * Gate: a bead appears only with a card the card core accepts, and only when
 * no card text trips the secret scan (fails closed). Desk cards are retired
 * (owner 2026-11-02); anything still marked card_class=desk or the old PC-only
 * labels is left out, so it is never answerable here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { watchDb } from '../watcher.js';

const log = debug('decisions-feed');

export const DEBOUNCE_MS = 1500;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
const MAX_ITEMS = 200;
const KEEP_META = [
  'card_class',
  'card_q',
  'card_effect',
  'card_show',
  'card_blocks',
  'card_opts',
  'card_back',
  'card_lang',
  'card_title',
  'card_thing',
  'card_norec',
  'title_ar'
];

/** @param {string} p folder name, lower-case = project key */
export function projectKey(p) {
  return path.basename(String(p).replace(/[\\/]+$/, '')).toLowerCase();
}

/** Where the card core may live; the first folder with rules.mjs wins. */
export function cardsDirs() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return /** @type {string[]} */ (
    [
      process.env.CARDS_DIR,
      path.join(os.homedir(), 'company', 'scripts', 'cards'),
      // sibling checkout of the learner repo, from a main tree or a .work/wt worktree
      path.join(here, '..', '..', '..', 'learner', 'scripts', 'cards'),
      path.join(
        here,
        '..',
        '..',
        '..',
        '..',
        '..',
        '..',
        'learner',
        'scripts',
        'cards'
      )
    ].filter(Boolean)
  );
}

async function loadRules() {
  for (const dir of cardsDirs()) {
    const file = path.join(dir, 'rules.mjs');
    if (fs.existsSync(file)) {
      const rules = await import(pathToFileURL(file).href);
      // questionSha lives in core.mjs, next to the rules
      const core = fs.existsSync(path.join(dir, 'core.mjs'))
        ? await import(pathToFileURL(path.join(dir, 'core.mjs')).href)
        : null;
      return { ...rules, questionSha: core?.questionSha };
    }
  }
  return null;
}

/**
 * True when any text the owner would read trips the secret scan (fails closed).
 *
 * @param {{ scanText: Function }} rules
 * @param {any} card parsed card
 * @param {any} bead
 */
export function scanBlocked(rules, card, bead) {
  for (const text of [
    card.q,
    card.effect,
    card.show,
    card.blocks,
    card.title,
    card.titleAr,
    String(bead.title || ''),
    ...card.opts.flatMap((/** @type {any} */ o) => [o.l, o.note])
  ]) {
    if (text && rules.scanText(String(text)).length) return true;
  }
  return false;
}

/**
 * @param {{
 *   listProjects?: () => Array<{ path: string }>,
 *   listParked?: (cwd: string) => Promise<any[]>,
 *   rules?: { parseCard: Function, scanText: Function } | null,
 *   watch?: (root: string, cb: () => void) => { close: () => void },
 *   broadcast?: (type: string, payload?: unknown) => void,
 *   debounce_ms?: number
 * }} [opts]
 */
export function createDecisionsFeed(opts = {}) {
  const listProjects = opts.listProjects || getAvailableWorkspaces;
  const listParked =
    opts.listParked ||
    (async (/** @type {string} */ cwd) => {
      const r = await runBdJson(
        ['list', '--status', 'owner_decision', '--json', '--limit', '0'],
        { cwd, priority: 'background', timeout_ms: 60000 }
      );
      if (r.code !== 0) throw new Error(r.stderr || 'bd list failed');
      return Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
    });
  const watch =
    opts.watch ||
    ((/** @type {string} */ root, /** @type {() => void} */ cb) =>
      watchDb(root, cb, { debounce_ms: opts.debounce_ms ?? DEBOUNCE_MS }));
  const broadcast = opts.broadcast || (() => {});

  /** @type {any} */
  let rules = opts.rules;
  /** @type {Map<string, { path: string, key: string, name: string, items: any[], loaded: boolean, close: () => void }>} */
  const projects = new Map();
  /** @type {Map<string, { running: boolean, again: boolean }>} */
  const flight = new Map();
  let lastJson = '';
  /** First scan of newly seen projects; later callers wait for it (F1). */
  /** @type {Promise<void> | null} */
  let loading = null;

  async function ensureRules() {
    if (rules === undefined) rules = await loadRules();
    return rules;
  }

  /**
   * @param {any} bead
   * @param {{ key: string, name: string }} proj
   */
  function toItem(bead, proj) {
    if (
      !bead ||
      typeof bead.id !== 'string' ||
      !BEAD_ID_RE.test(bead.id) ||
      bead.status !== 'owner_decision' ||
      !rules ||
      isDeskIssue(bead)
    ) {
      return null;
    }
    const parsed = rules.parseCard(bead);
    if (!parsed.ok) return null;
    const card = parsed.card;
    if (scanBlocked(rules, card, bead)) return null;
    const m = bead.metadata || {};
    /** @type {Record<string, string>} */
    const metadata = {};
    for (const k of KEEP_META) {
      if (typeof m[k] === 'string') metadata[k] = m[k];
    }
    const ts =
      typeof bead.updated_at === 'number'
        ? bead.updated_at
        : Date.parse(bead.updated_at) || 0;
    return {
      id: bead.id,
      project: { key: proj.key, name: proj.name },
      sha:
        typeof rules.questionSha === 'function' ? rules.questionSha(card) : '',
      title: String(bead.title || ''),
      title_ar: typeof m.title_ar === 'string' ? m.title_ar : '',
      priority: typeof bead.priority === 'number' ? bead.priority : 2,
      updated_at: ts,
      assignee: typeof bead.assignee === 'string' ? bead.assignee : '',
      metadata
    };
  }

  function snapshot() {
    /** @type {any[]} */
    const items = [];
    const plist = [];
    for (const p of projects.values()) {
      // a workspace whose scan never worked (dead, no db) stays out of the dropdown
      if (!p.loaded) continue;
      items.push(...p.items);
      plist.push({ key: p.key, name: p.name, count: p.items.length });
    }
    // Priority first (P0 on top), then the longest-waiting.
    items.sort(
      (a, b) => a.priority - b.priority || a.updated_at - b.updated_at
    );
    plist.sort((a, b) => a.name.localeCompare(b.name));
    return {
      items: items.slice(0, MAX_ITEMS),
      projects: plist,
      rules_ok: !!rules
    };
  }

  function pushIfChanged() {
    const snap = snapshot();
    const json = JSON.stringify(snap);
    if (json === lastJson) return;
    lastJson = json;
    try {
      broadcast('decisions-all', snap);
    } catch (e) {
      log('broadcast failed %o', e);
    }
  }

  /** @param {string} key */
  async function scan(key) {
    const p = projects.get(key);
    if (!p) return;
    const f = flight.get(key) || { running: false, again: false };
    flight.set(key, f);
    if (f.running) {
      f.again = true;
      return;
    }
    f.running = true;
    try {
      await ensureRules();
      const beads = await listParked(p.path);
      p.items = beads.map((b) => toItem(b, p)).filter((x) => x !== null);
      p.loaded = true;
    } catch (e) {
      // keep the last good list for this project; the others are unaffected
      log('scan %s failed: %s', key, String(/** @type {any} */ (e)?.message));
    } finally {
      f.running = false;
      if (f.again) {
        f.again = false;
        void scan(key).then(pushIfChanged);
      }
    }
  }

  /**
   * Match the watchers to the registry (cheap, no bd).
   *
   * @returns {string[]} keys of projects seen for the first time
   */
  function sync() {
    /** @type {Map<string, string>} */
    const live = new Map();
    for (const w of listProjects()) {
      const key = projectKey(w.path);
      if (key && !live.has(key)) live.set(key, w.path);
    }
    for (const [key, p] of projects) {
      if (!live.has(key)) {
        try {
          p.close();
        } catch {
          // already closed
        }
        projects.delete(key);
      }
    }
    /** @type {string[]} */
    const fresh = [];
    for (const [key, dir] of live) {
      if (projects.has(key)) continue;
      let close = () => {};
      try {
        close = watch(dir, () => {
          void scan(key).then(pushIfChanged);
        }).close;
      } catch (e) {
        log('watch %s failed: %o', key, e);
      }
      projects.set(key, {
        path: dir,
        key,
        name: path.basename(dir.replace(/[\\/]+$/, '')),
        items: [],
        loaded: false,
        close
      });
      fresh.push(key);
    }
    return fresh;
  }

  /** New projects are loaded once; everything else is served from the cache. */
  async function list() {
    const fresh = sync();
    if (fresh.length) {
      const batch = (async () => {
        await ensureRules();
        await Promise.all(fresh.map((k) => scan(k)));
        lastJson = JSON.stringify(snapshot());
      })();
      const prev = loading;
      const mine = (async () => {
        await prev?.catch(() => {});
        await batch;
      })();
      loading = mine;
      void mine
        .catch(() => {})
        .finally(() => {
          if (loading === mine) loading = null;
        });
    }
    // a second call during the first scan waits for it instead of seeing []
    if (loading) await loading.catch(() => {});
    return snapshot();
  }

  function close() {
    for (const p of projects.values()) {
      try {
        p.close();
      } catch {
        // already closed
      }
    }
    projects.clear();
    lastJson = '';
  }

  return { list, sync, close, snapshot };
}

/** @type {ReturnType<typeof createDecisionsFeed> | null} */
let shared = null;
/** @type {((type: string, payload?: unknown) => void) | undefined} */
let sharedBroadcast;

/** The one feed of this process (the notifier may import it). */
export function getDecisionsFeed() {
  if (!shared) {
    shared = createDecisionsFeed({
      broadcast: (type, payload) => sharedBroadcast?.(type, payload)
    });
  }
  return shared;
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'list-decisions-all',
    (/** @type {any} */ _req, /** @type {any} */ ctx) => {
      sharedBroadcast = ctx.broadcast;
      return getDecisionsFeed().list();
    },
    { phone: true }
  );
}
