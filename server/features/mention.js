/**
 * @mentions in comments that wake the named role (beads-lite-1bo5.6.64.1;
 * UI = .59.13).
 *
 *   mention-roles {}          -> {roles:[...], owner:true}        (picker list)
 *   mention-scan  {id, via?}  -> {results:[{comment, role, chip, verdict}]}
 *   mention-chips {id}        -> {chips:[{comment, role, chip, verdict}]}
 *
 * `mention-scan` is sent by the board after a comment is saved. The server
 * never trusts text from the client: it re-reads the bead's comments with bd
 * and handles each comment id once (edit and delete never re-fire). Agents
 * that use `bd comments add` call the same code through
 * scripts/mention-scan.mjs.
 *
 * A mention wakes through the existing wake queue
 * (`wake.mjs emit --kind mention`): bead id and role only, never the text.
 * Limits are enforced here, at emit time, and fail closed:
 *   1 at most 3 roles per comment, the rest "limit"
 *   2 same role on the same bead: one wake per 10 minutes (merged)
 *   3 6 mention wakes per bead per hour (wake.mjs caps stay the ceiling)
 *   4 never self; a role that was woken on this bead cannot mention the role
 *     that woke it
 *   5 chain depth 2 per bead per hour; the 3rd is refused and ONE decision
 *     card is filed for the owner
 *   6 only the owner or a known role actor wakes anyone
 *   7 edit / delete never re-fires
 *   8 one router.log line and one record in mention-log.jsonl per mention
 *   9 router.off present: nothing emitted, chip "paused"
 * `@owner` raises the bell (notifier) and creates no wake file.
 *
 * Chips: waiting (queued, nobody has it yet), woke (a chat claimed it),
 * seen (@owner bell raised), limit (refused or capped), paused (router off).
 * State lives in the board home (mention-state.json, mention-log.jsonl).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBd, runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { isBoardPosted } from './board-posted.js';
import { boardHome, projectKey, raiseMention } from './notifier.js';

const log = debug('mention');

/** Known role names (the wake system validates ^[a-z]{2,12}$). */
export const ROLES = [
  'pm',
  'cos',
  'swe',
  'qa',
  'ux',
  'sre',
  'sec',
  'cto',
  'legal',
  'analytics',
  'sup',
  'brand',
  'content',
  'viewer',
  'director',
  'editor',
  'designer',
  'growth',
  'community',
  'partnerships'
];

export const MAX_ROLES_PER_COMMENT = 3;
export const SAME_ROLE_MS = 10 * 60_000;
export const BEAD_PER_HOUR = 6;
export const MAX_HOPS = 2;
export const HOUR_MS = 3600_000;
/** On a bead's first scan only comments this young can wake anyone. */
export const FRESH_MS = 120_000;
const MAX_SEEN = 300;
const MAX_RECORDS = 60;
const BEAD_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[0-9]+)*$/;
export const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/**
 * Text without fenced code, inline code and quote lines (nothing in them
 * counts as a mention).
 * @param {string} text
 */
export function stripQuoted(text) {
  const out = [];
  let fence = '';
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = '';
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    if (/^\s{0,3}>/.test(line)) continue;
    out.push(line.replace(/`+[^`]*`+/g, ' '));
  }
  return out.join('\n');
}

/**
 * Mentions in a comment: known roles in order of appearance, unique, plus
 * whether @owner was named. Unknown names are plain text.
 * @param {string} text
 * @returns {{ roles: string[], owner: boolean }}
 */
export function parseMentions(text) {
  const clean = stripQuoted(text);
  /** @type {string[]} */
  const roles = [];
  let owner = false;
  const re = /(^|[^\w@./:\\-])@([a-zA-Z]{2,12})(?![\w@-])(?!\.\w)/g;
  let m;
  while ((m = re.exec(clean))) {
    const name = m[2].toLowerCase();
    if (name === 'owner') owner = true;
    else if (ROLES.includes(name) && !roles.includes(name)) roles.push(name);
  }
  return { roles, owner };
}

/**
 * Who wrote it (sec M1). The owner is only a comment the board server itself
 * posted (id in the board-posted set); every other comment needs an author
 * that is exactly a role (or marketing:<role>), else null = no-actor. No
 * name prefix ever counts as the owner.
 * @param {string} author
 * @param {string} [id]
 * @returns {{ kind: 'owner' } | { kind: 'role', role: string } | null}
 */
export function classifyAuthor(author, id = '') {
  if (id && isBoardPosted(id)) return { kind: 'owner' };
  const a = String(author || '');
  const r = a.startsWith('marketing:') ? a.slice(10) : a;
  return /^[a-z]{2,12}$/.test(r) && ROLES.includes(r)
    ? { kind: 'role', role: r }
    : null;
}

/** @param {string} file @param {any} obj */
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

/**
 * @typedef {{ comment: string, role: string, chip: string, verdict: string, wake?: string, at: string }} Rec
 * @typedef {{
 *   home?: string,
 *   wakeRoot?: string,
 *   wakeScript?: string,
 *   now?: () => number,
 *   listComments?: (cwd: string, id: string) => Promise<any[]|null>,
 *   runWake?: (args: string[]) => { code: number, stdout: string },
 *   routerOff?: () => boolean,
 *   raiseOwner?: (project: string, bead: string) => void,
 *   fileCard?: (cwd: string, bead: string) => Promise<string|null>,
 *   cardOpen?: (cwd: string, id: string) => Promise<boolean>,
 *   lockWaitMs?: number,
 *   writeState?: (file: string, obj: any) => void
 * }} Opts
 */

/** @param {Opts} [opts] */
export function createMention(opts = {}) {
  const home = opts.home || boardHome();
  const wakeRoot =
    opts.wakeRoot ||
    process.env.WAKE_ROOT ||
    path.join(os.homedir(), '.codesters', 'wake');
  const wakeScript =
    opts.wakeScript ||
    process.env.MENTION_WAKE_SCRIPT ||
    path.join(os.homedir(), 'company', 'scripts', 'wake', 'wake.mjs');
  const now = opts.now || Date.now;
  const stateFile = path.join(home, 'mention-state.json');
  const logFile = path.join(home, 'mention-log.jsonl');

  const listComments =
    opts.listComments ||
    (async (/** @type {string} */ cwd, /** @type {string} */ id) => {
      const r = await runBdJson(['comments', id, '--json'], { cwd });
      return r.code === 0 && Array.isArray(r.stdoutJson) ? r.stdoutJson : null;
    });
  const runWake =
    opts.runWake ||
    ((/** @type {string[]} */ args) => {
      const r = spawnSync(process.execPath, [wakeScript, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
        env: { ...process.env, WAKE_ROOT: wakeRoot }
      });
      return { code: r.status ?? 1, stdout: String(r.stdout || '') };
    });
  const routerOff =
    opts.routerOff ||
    (() =>
      fs.existsSync(
        process.env.WAKE_ROUTER_OFF || path.join(wakeRoot, 'router.off')
      ));
  const raiseOwner = opts.raiseOwner || raiseMention;
  const fileCard =
    opts.fileCard ||
    (async (/** @type {string} */ cwd, /** @type {string} */ bead) => {
      const meta = {
        card_q: 'الأدوار بترد على بعض في البيد ده، نوقف الاستدعاء التلقائي؟',
        card_effect: 'لو وقفناه محدش هيتصحى لوحده من التعليقات هنا',
        card_opts: JSON.stringify([
          { l: 'وقّفه', n: 'الرد بالإيد بس', rec: true },
          { l: 'كمّل', n: 'سيبهم يكملوا' }
        ]),
        card_blocks: 'مفيش واقف، الاستدعاء اتوقف عند التكرار التاني',
        card_class: 'tap',
        card_back: 'cos',
        card_lang: 'ar',
        title_ar: 'الأدوار بترد على بعض'
      };
      const r = await runBd(
        [
          'create',
          `Roles are bouncing on ${bead}`,
          '--parent',
          bead,
          '-a',
          'abdelrahman',
          '-s',
          'owner_decision',
          '-p',
          '2',
          '--silent',
          '--metadata',
          JSON.stringify(meta),
          '-d',
          'Two roles keep mentioning each other on this bead; the third wake was refused. Answer the card.'
        ],
        { cwd }
      );
      return r.code === 0 ? String(r.stdout).trim() : null;
    });

  /**
   * ENOENT = empty state. Any other read or parse error throws: the caller
   * refuses, it never starts from an empty state (sec M3).
   * @returns {{ seen: Record<string, string[]>, last: Record<string, number>, emits: Record<string, any[]>, recs: Record<string, Rec[]>, cards: Record<string, any> }}
   */
  function load() {
    /** @type {any} */
    let s = {};
    try {
      s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (!s || typeof s !== 'object' || Array.isArray(s))
        throw new Error('shape');
    } catch (e) {
      if (/** @type {any} */ (e).code !== 'ENOENT') {
        throw Object.assign(new Error('state unreadable'), { code: 'state' });
      }
      s = {};
    }
    const o = (/** @type {any} */ v) => (v && typeof v === 'object' ? v : {});
    return {
      seen: o(s.seen),
      last: o(s.last),
      emits: o(s.emits),
      recs: o(s.recs),
      cards: o(s.cards)
    };
  }
  /** @param {ReturnType<typeof load>} st */
  function save(st) {
    (opts.writeState || writeJson)(stateFile, st);
  }
  const lockDir = path.join(home, 'mention.lock');
  /** A mkdir lock around load and save: stale after 60 s, refuses on timeout (sec M3). */
  async function lock() {
    fs.mkdirSync(home, { recursive: true });
    let wait = 10;
    const end = Date.now() + (opts.lockWaitMs ?? 20_000);
    for (;;) {
      try {
        fs.mkdirSync(lockDir);
        return () => {
          try {
            fs.rmdirSync(lockDir);
          } catch {
            /* ignore */
          }
        };
      } catch (e) {
        const c = /** @type {any} */ (e).code;
        if (c !== 'EEXIST' && c !== 'EPERM' && c !== 'EBUSY') throw e;
        try {
          if (Date.now() - fs.statSync(lockDir).mtimeMs > 60_000)
            fs.rmdirSync(lockDir);
        } catch {
          /* raced */
        }
        if (Date.now() > end) {
          throw Object.assign(new Error('mention state busy'), {
            code: 'busy'
          });
        }
        wait = Math.min(wait * 2, 200);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  const cardOpen =
    opts.cardOpen ||
    (async (/** @type {string} */ cwd, /** @type {string} */ id) => {
      const r = await runBdJson(['show', id, '--json'], { cwd });
      const b = Array.isArray(r.stdoutJson) ? r.stdoutJson[0] : r.stdoutJson;
      return !(r.code === 0 && b && b.status === 'closed'); // any doubt = still open
    });

  /** @param {string} line */
  function routerLog(line) {
    try {
      fs.mkdirSync(wakeRoot, { recursive: true });
      fs.appendFileSync(
        path.join(wakeRoot, 'router.log'),
        `${new Date(now()).toISOString()} ${line}\n`
      );
    } catch (e) {
      log('router.log failed %o', e);
    }
  }
  /** @param {object} rec */
  function provenance(rec) {
    try {
      fs.mkdirSync(home, { recursive: true });
      fs.appendFileSync(
        logFile,
        JSON.stringify({
          kind: 'mention',
          at: new Date(now()).toISOString(),
          ...rec
        }) + '\n'
      );
    } catch (e) {
      log('mention-log failed %o', e);
    }
  }

  /** Live chip of a queued wake: pending = waiting, claimed/done = woke. */
  /** @param {string|undefined} wakeId @param {string} fallback */
  function liveChip(wakeId, fallback) {
    if (!wakeId || !/^[0-9a-f]{16}$/.test(wakeId)) return fallback;
    for (const d of ['claimed', 'done']) {
      if (fs.existsSync(path.join(wakeRoot, d, `${wakeId}.json`)))
        return 'woke';
    }
    return fallback;
  }

  /**
   * Process the bead's new comments.
   * @param {string} cwd project root
   * @param {string} bead
   * @param {'pc'|'phone'} [via]
   */
  async function scan(cwd, bead, via = 'pc') {
    if (!BEAD_RE.test(bead) || bead.length > 64) {
      throw Object.assign(new Error('bad bead id'), { code: 'bad_request' });
    }
    const project = projectKey(cwd);
    if (!PROJECT_RE.test(project)) {
      throw Object.assign(new Error('bad project'), { code: 'bad_request' }); // M6
    }
    const comments = await listComments(cwd, bead);
    if (!comments) return { results: [] };
    const unlock = await lock();
    try {
      return await scanLocked(cwd, project, bead, via, comments);
    } finally {
      unlock();
    }
  }

  /**
   * @param {string} cwd @param {string} project @param {string} bead
   * @param {'pc'|'phone'} via @param {any[]} comments
   */
  async function scanLocked(cwd, project, bead, via, comments) {
    const key = `${project}|${bead}`;
    const t = now();
    const sorted = comments
      .filter((c) => c && typeof c.id === 'string')
      .sort((a, b) =>
        String(a.created_at || '').localeCompare(String(b.created_at || ''))
      );
    /** @param {any} c */
    const young = (c) => {
      const ct = Date.parse(c.created_at);
      return Number.isFinite(ct) && t - ct <= FRESH_MS;
    };
    /** @type {ReturnType<typeof load>} */
    let st;
    try {
      st = load();
    } catch {
      // M3: refuse, never start from an empty state. Fresh mentions are shown, nothing is emitted or saved.
      /** @type {Rec[]} */
      const refused = [];
      for (const c of sorted) {
        if (!young(c)) continue;
        const f = parseMentions(String(c.text || ''));
        for (const role of [...f.roles, ...(f.owner ? ['owner'] : [])]) {
          routerLog(`${project} mention ${bead} ${role} state-unreadable`);
          refused.push({
            comment: c.id,
            role,
            chip: 'limit',
            verdict: 'state-unreadable',
            at: new Date(t).toISOString()
          });
        }
      }
      return { results: refused.map(publicRec) };
    }
    const seen = new Set(st.seen[key] || []);
    const lastAt = st.last[key] || 0;
    /** @type {Rec[]} */
    const results = [];
    for (const c of sorted) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const ct = Date.parse(c.created_at);
      // M2: age and order checked on every scan, the seen list is only a second guard
      const ok = young(c) && ct >= lastAt;
      if (Number.isFinite(ct)) st.last[key] = Math.max(st.last[key] || 0, ct);
      st.seen[key] = [...seen].slice(-MAX_SEEN);
      save(st); // M3: seen is written before any emit; a failed write throws and nothing is emitted
      if (!ok) continue;
      const found = parseMentions(String(c.text || ''));
      if (!found.roles.length && !found.owner) continue;
      const author = classifyAuthor(c.author, c.id);
      const recs = await handleComment(
        { st, cwd, project, bead, key, via, t, commentId: c.id, author },
        found
      );
      results.push(...recs);
      try {
        save(st);
      } catch (e) {
        log('state save after emit failed %o', e); // seen is already on disk: no replay
      }
    }
    return { results: results.map(publicRec) };
  }

  /**
   * @param {{ st: ReturnType<typeof load>, cwd: string, project: string, bead: string, key: string, via: 'pc'|'phone', t: number, commentId: string, author: any }} x
   * @param {{ roles: string[], owner: boolean }} found
   */
  async function handleComment(x, found) {
    const { st, key, t } = x;
    const by = !x.author
      ? 'none'
      : x.author.kind === 'role'
        ? x.author.role
        : 'owner';
    st.emits[key] = (st.emits[key] || []).filter((e) => t - e.t < HOUR_MS);
    const emits = st.emits[key];
    /** @type {Rec[]} */
    const out = [];
    /** @param {string} role @param {string} chip @param {string} verdict @param {string} [wake] */
    const rec = (role, chip, verdict, wake) => {
      /** @type {Rec} */
      const r = {
        comment: x.commentId,
        role,
        chip,
        verdict,
        ...(wake ? { wake } : {}),
        at: new Date(t).toISOString()
      };
      out.push(r);
      (st.recs[key] ||= []).push(r);
      st.recs[key] = st.recs[key].slice(-MAX_RECORDS);
      routerLog(`${x.project} mention ${x.bead} ${role} ${verdict}`);
      provenance({
        bead: x.bead,
        project: x.project,
        comment: x.commentId,
        by,
        role,
        verdict,
        chip,
        ...(wake ? { wake } : {})
      });
      return r;
    };

    if (!x.author) {
      // M1: not a board post and not an exact role: shown, never woken
      for (const role of [...found.roles, ...(found.owner ? ['owner'] : [])]) {
        rec(role, 'limit', 'no-actor');
      }
      return out;
    }
    if (found.owner) {
      try {
        raiseOwner(x.project, x.bead);
        rec('owner', 'seen', 'bell');
      } catch (e) {
        log('bell failed %o', e);
        rec('owner', 'limit', 'bell-failed');
      }
    }
    const off = routerOff();
    // hop of the author: how deep in a wake chain it was itself woken
    const woken =
      x.author.kind === 'role'
        ? emits.filter((e) => e.role === x.author.role)
        : [];
    const hop = woken.reduce((m, e) => Math.max(m, e.hop), 0) + 1;
    let needCard = false;
    // M5: while the card filed for this bead is open, role-authored mentions are held
    const prior = st.cards[key];
    const hold =
      x.author.kind === 'role' && prior && prior.id
        ? await cardOpen(x.cwd, prior.id)
        : false;
    for (let i = 0; i < found.roles.length; i++) {
      const role = found.roles[i];
      if (i >= MAX_ROLES_PER_COMMENT) {
        rec(role, 'limit', 'too-many-roles');
        continue;
      }
      if (off) {
        rec(role, 'paused', 'paused');
        continue;
      }
      if (x.author.kind === 'role' && role === x.author.role) {
        rec(role, 'limit', 'self');
        continue;
      }
      if (hold) {
        rec(role, 'limit', 'loop-hold');
        continue;
      }
      if (hop > MAX_HOPS || woken.some((e) => e.by === role)) {
        needCard = true;
        rec(role, 'limit', hop > MAX_HOPS ? 'loop-depth' : 'loop-bounce');
        continue;
      }
      const same = emits.find((e) => e.role === role && t - e.t < SAME_ROLE_MS);
      if (same) {
        rec(role, liveChip(same.wake, 'waiting'), 'merged', same.wake);
        continue;
      }
      if (emits.length >= BEAD_PER_HOUR) {
        rec(role, 'limit', 'bead-hour');
        continue;
      }
      const r = runWake([
        'emit',
        '--kind',
        'mention',
        '--repo',
        x.project,
        '--bead',
        x.bead,
        '--role',
        role,
        '--via',
        x.via
      ]);
      const q = /wake: queued ([0-9a-f]{16})/.exec(r.stdout);
      const pending = /already pending ([0-9a-f]{16})/.exec(r.stdout);
      if (r.code === 0 && q) {
        emits.push({ t, role, wake: q[1], hop, by });
        rec(role, 'waiting', 'queued', q[1]);
      } else if (r.code === 0 && pending) {
        rec(role, 'waiting', 'merged', pending[1]);
      } else if (r.code === 0) {
        rec(role, 'limit', 'capped'); // wake.mjs project/global cap
      } else {
        rec(role, 'limit', 'emit-failed');
      }
    }
    st.emits[key] = emits;
    if (
      needCard &&
      !(t - ((st.cards[key] && st.cards[key].t) || 0) < HOUR_MS)
    ) {
      st.cards[key] = { t, id: '' };
      try {
        const id = await fileCard(x.cwd, x.bead);
        st.cards[key] = { t, id: id || '' };
        routerLog(`${x.project} mention-card ${x.bead} - ${id || 'failed'}`);
      } catch (e) {
        log('card failed %o', e);
      }
    }
    return out;
  }

  /** @param {Rec} r */
  function publicRec(r) {
    return {
      comment: r.comment,
      role: r.role,
      chip: liveChip(r.wake, r.chip),
      verdict: r.verdict
    };
  }

  /**
   * @param {string} cwd @param {string} bead
   */
  function chips(cwd, bead) {
    const st = load();
    const rs = st.recs[`${projectKey(cwd)}|${bead}`] || [];
    return { chips: rs.map(publicRec) };
  }

  return { scan, chips, load };
}

/** @type {ReturnType<typeof createMention>|null} */
let live = null;

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  const m = () => (live ||= createMention());
  /** @param {any} ctx */
  const root = (ctx) => {
    if (!ctx || typeof ctx.root_dir !== 'string' || !ctx.root_dir) {
      throw Object.assign(new Error('no project'), { code: 'bad_request' });
    }
    return ctx.root_dir;
  };
  /** @param {any} p */
  const idOf = (p) => {
    const id = p && p.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      throw Object.assign(new Error('bad id'), { code: 'bad_request' });
    }
    return id;
  };
  seam.registerHandler('mention-roles', () => ({ roles: ROLES, owner: true }), {
    phone: true
  });
  seam.registerHandler(
    'mention-scan',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      m().scan(
        root(ctx),
        idOf(req.payload),
        req.payload.via === 'phone' ? 'phone' : 'pc'
      ),
    { mutating: true, phone: true }
  );
  seam.registerHandler(
    'mention-chips',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      m().chips(root(ctx), idOf(req.payload)),
    { phone: true }
  );
}
