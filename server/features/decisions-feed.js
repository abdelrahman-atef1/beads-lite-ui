/**
 * Decisions feed (company-1bo5.6.26): the owner's waiting decisions from EVERY
 * registered project in one list, so the Decisions screen opens on "All".
 *
 *   list-decisions-all {}            -> Snap   (phone door allowed)
 *   decisions-all (push)             -> Snap   (only when the list changed)
 * Snap = { items: Item[], unanswerable: [{id,project,why}], projects: [{key,name,count}], rules_ok }
 * Item = { id, project:{key,name}, title, title_ar, priority, updated_at,
 *          assignee, metadata:{card_*} }
 *
 * Cost model: nothing runs until the screen is first opened. After that there
 * is one fs watcher per project (the same watcher the board uses) and ONE
 * background `bd list --status owner_decision` in the project that changed;
 * no timer, no polling. The result is cached; an unchanged list is not pushed.
 *
 * Steps (company-1bo5.6.59.3): a bead that asks the owner to DO something is
 * marked with the label `owner-steps` plus a comment whose first line is
 * `STEPS: <title>` and that holds a `## Steps` section. It shows in the feed as
 * kind 'steps' with `steps = { comment:'c-<8hex>', title, n, at }`; a bead that
 * also has a card keeps kind 'decision' and carries the same `steps` object.
 * The UI builds `&at=<comment>` from it. Convention note: bead .58.
 *
 * Gate: a card shows only when the card core accepts it and no card text trips
 * the secret scan (fails closed). Desk cards are retired (owner 2026-11-02,
 * "full control"): card_class=desk, the old PC-only labels and sec/legal
 * creators are listed like any other card (beads-lite-1bo5.13.15).
 *
 * Every owner_decision bead is accounted for (the Tasks count must match):
 * one that cannot show as a card goes in `unanswerable` = [{id, project,
 * why:'no_card'|'secret'}] with no text, so the Desk lists it as a link to the
 * task instead of dropping it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanAtt } from '../../app/utils/card-att.js';
import { runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { watchDb } from '../watcher.js';

const log = debug('decisions-feed');

export const DEBOUNCE_MS = 1500;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
const MAX_ITEMS = 200;
const MAX_STEPS_BEADS = 50;
export const STEPS_LABEL = 'owner-steps';
export const STEPS_HEAD = 'STEPS: ';
export const STEPS_DONE_HEAD = 'OWNER STEPS DONE via board';
const STEPS_TITLE_MAX = 100;
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

/**
 * The open steps comment of a bead, or null: the newest comment whose first
 * line is `STEPS: <title>` with a `## Steps` section and a hex id, not
 * followed by a board "steps done" record.
 *
 * @param {any[]} comments
 * @returns {{ comment: string, title: string, n: number, at: string, author: string } | null}
 */
export function findSteps(comments) {
  /** @type {any} */
  let found = null;
  for (const c of Array.isArray(comments) ? comments : []) {
    const lines = String(c?.text ?? '')
      .split('\n')
      .map((l) => l.trim());
    if (c?.author === 'owner-board' && lines[0].startsWith(STEPS_DONE_HEAD)) {
      found = null;
    } else if (
      lines[0].startsWith(STEPS_HEAD) &&
      lines.includes('## Steps') &&
      /^[0-9a-f]{8}/.test(String(c.id || ''))
    ) {
      const from = lines.indexOf('## Steps') + 1;
      let n = 0;
      for (const l of lines.slice(from)) {
        if (l.startsWith('## ')) break;
        if (/^\d{1,2}[.)]\s/.test(l)) n += 1;
      }
      found = {
        comment: `c-${String(c.id).slice(0, 8)}`,
        title: lines[0].slice(STEPS_HEAD.length).slice(0, STEPS_TITLE_MAX),
        n,
        at: String(c.created_at || ''),
        author: String(c.author || '')
      };
    }
  }
  return found;
}

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
 *   listSteps?: (cwd: string) => Promise<Array<{ bead: any, comments: any[] }>>,
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
      if (r.code === 0) {
        return Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
      }
      // A store without the custom status set rejects `--status owner_decision`
      // ("invalid status") though it holds such beads (filmmaker, learner,
      // landing, 2026-11-16): list everything open and filter, as the board does.
      if (!/invalid status/i.test(String(r.stderr))) {
        throw new Error(r.stderr || 'bd list failed');
      }
      const all = await runBdJson(
        ['list', '--json', '--tree=false', '--limit', '0'],
        { cwd, priority: 'background', timeout_ms: 60000 }
      );
      if (all.code !== 0) throw new Error(all.stderr || 'bd list failed');
      return (Array.isArray(all.stdoutJson) ? all.stdoutJson : []).filter(
        (/** @type {any} */ b) => b && b.status === 'owner_decision'
      );
    });
  // Off in tests that inject only listParked (no real bd behind a fake path).
  const listSteps =
    opts.listSteps ||
    (opts.listParked
      ? async () => []
      : async (/** @type {string} */ cwd) => {
          const r = await runBdJson(
            ['list', '--label', STEPS_LABEL, '--json', '--limit', '0'],
            { cwd, priority: 'background', timeout_ms: 60000 }
          );
          if (r.code !== 0) throw new Error(r.stderr || 'bd list failed');
          const beads = (Array.isArray(r.stdoutJson) ? r.stdoutJson : [])
            .filter(
              (/** @type {any} */ b) =>
                b && BEAD_ID_RE.test(String(b.id)) && b.status !== 'closed'
            )
            .slice(0, MAX_STEPS_BEADS);
          return Promise.all(
            beads.map(async (/** @type {any} */ bead) => {
              const c = await runBdJson(['comments', bead.id, '--json'], {
                cwd,
                priority: 'background',
                timeout_ms: 30000
              });
              return {
                bead,
                comments: Array.isArray(c.stdoutJson) ? c.stdoutJson : []
              };
            })
          );
        });
  const watch =
    opts.watch ||
    ((/** @type {string} */ root, /** @type {() => void} */ cb) =>
      watchDb(root, cb, { debounce_ms: opts.debounce_ms ?? DEBOUNCE_MS }));
  const broadcast = opts.broadcast || (() => {});

  /** @type {any} */
  let rules = opts.rules;
  /** @type {Map<string, { path: string, key: string, name: string, items: any[], bad: any[], loaded: boolean, close: () => void }>} */
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
      !rules
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
    // card_att: only re-checked /att/ items cross to the client (list or string)
    const att = cleanAtt(m.card_att);
    if (att.length) {
      metadata.card_att = JSON.stringify(
        att.map((x) => ({ a: x.src.slice(5), n: x.n, h: x.h }))
      );
    }
    const ts =
      typeof bead.updated_at === 'number'
        ? bead.updated_at
        : Date.parse(bead.updated_at) || 0;
    return {
      id: bead.id,
      kind: 'decision',
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

  /**
   * Why a decision bead cannot show as a card: a card the core rejects or a
   * card text that trips the secret scan. Text is never copied.
   *
   * @param {any} bead
   * @param {{ key: string, name: string }} proj
   */
  function toBad(bead, proj) {
    if (!bead || typeof bead.id !== 'string' || !BEAD_ID_RE.test(bead.id)) {
      return null;
    }
    if (bead.status !== 'owner_decision') return null;
    const parsed = rules ? rules.parseCard(bead) : { ok: false };
    return {
      id: bead.id,
      project: { key: proj.key, name: proj.name },
      why: parsed.ok ? 'secret' : 'no_card'
    };
  }

  /**
   * Steps info for one labelled bead; null when there is no open steps
   * comment or any text the owner would read trips the secret scan.
   *
   * @param {{ bead: any, comments: any[] }} e
   */
  function stepsOf(e) {
    const b = e?.bead;
    if (!b || typeof b.id !== 'string' || !BEAD_ID_RE.test(b.id)) return null;
    if (b.status === 'closed' || !rules) return null;
    const st = findSteps(e.comments);
    if (!st) return null;
    if (rules.scanText(`${st.title}\n${String(b.title || '')}`).length) {
      return null;
    }
    return { comment: st.comment, title: st.title, n: st.n, at: st.at };
  }

  /**
   * @param {any} bead
   * @param {{ key: string, name: string }} proj
   * @param {NonNullable<ReturnType<typeof stepsOf>>} steps
   */
  function toStepsItem(bead, proj, steps) {
    const m = bead.metadata || {};
    const ts =
      typeof bead.updated_at === 'number'
        ? bead.updated_at
        : Date.parse(bead.updated_at) || 0;
    return {
      id: bead.id,
      kind: 'steps',
      project: { key: proj.key, name: proj.name },
      sha: '',
      title: String(bead.title || ''),
      title_ar: typeof m.title_ar === 'string' ? m.title_ar : '',
      priority: typeof bead.priority === 'number' ? bead.priority : 2,
      updated_at: ts,
      assignee: typeof bead.assignee === 'string' ? bead.assignee : '',
      metadata: {},
      steps
    };
  }

  function snapshot() {
    /** @type {any[]} */
    const items = [];
    /** @type {any[]} */
    const bad = [];
    const plist = [];
    for (const p of projects.values()) {
      // a workspace whose scan never worked (dead, no db) stays out of the dropdown
      if (!p.loaded) continue;
      items.push(...p.items);
      bad.push(...p.bad);
      plist.push({ key: p.key, name: p.name, count: p.items.length });
    }
    // Priority first (P0 on top), then the longest-waiting.
    items.sort(
      (a, b) => a.priority - b.priority || a.updated_at - b.updated_at
    );
    plist.sort((a, b) => a.name.localeCompare(b.name));
    return {
      items: items.slice(0, MAX_ITEMS),
      unanswerable: bad.slice(0, MAX_ITEMS),
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
      /** @type {any[]} */
      let labelled = [];
      try {
        labelled = await listSteps(p.path);
      } catch (e) {
        // steps are an extra: the decisions still list without them
        log(
          'steps %s failed: %s',
          key,
          String(/** @type {any} */ (e)?.message)
        );
      }
      /** @type {Map<string, any>} */
      const steps = new Map();
      for (const e of labelled) {
        const st = stepsOf(e);
        if (st) steps.set(e.bead.id, { st, bead: e.bead });
      }
      /** @type {any[]} */
      const items = beads.map((b) => toItem(b, p)).filter((x) => x !== null);
      for (const it of items) {
        const hit = steps.get(it.id);
        if (hit) {
          it.steps = hit.st;
          steps.delete(it.id);
        }
      }
      for (const { st, bead } of steps.values()) {
        items.push(toStepsItem(bead, p, st));
      }
      p.items = items;
      p.bad = beads
        .filter((b) => !items.some((it) => it.id === b?.id))
        .map((b) => toBad(b, p))
        .filter((x) => x !== null);
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
        bad: [],
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
