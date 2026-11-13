/**
 * Decision card on the board: answer, ask, thread, wake state
 * (ADR 0006 D1-D3, beads-lite-1bo5.6.9).
 *
 *   card-state  {id}                              -> State  (phone door allowed)
 *   card-answer {id, option | text, sha}          -> Result (board token; phone allowed)
 *   card-ask    {id, scope, quote?, question}     -> Result (board token; phone allowed)
 *   steps-done  {id, comment}                     -> Result (board token; phone allowed)
 * Result = { code, state, wake }   (a refusal throws { code } and carries no text)
 *
 * The board never writes a decision record itself: answer and ask go to the
 * card CLI (learner/scripts/cards/card.mjs) by full path, request as JSON on
 * stdin. Then one wake event (decided | asked) goes to the queue for the
 * role named by card_back. Nothing runs until a card is opened.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchWorkspace } from '../../app/issue-workspace.js';
import { runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { withPrefixes } from '../workspace-prefix.js';
import {
  cardsDirs,
  findSteps,
  projectKey,
  scanBlocked,
  STEPS_LABEL
} from './decisions-feed.js';
import { emitWake, viaFromHost } from './report.js';

const log = debug('cards');

const OWNER = 'abdelrahman';
const BOARD = 'owner-board';
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
const CLI_TIMEOUT_MS = 100_000;
const MAX_COMMENTS = 60;
const LEASE_STALE_MS = 180_000;

const REFUSALS = new Set([
  'bad-input',
  'empty',
  'too-long',
  'secret-refused',
  'not-open',
  'bad-card',
  'bd-unreadable',
  'changed',
  'already-handled',
  'record-pending',
  'bd-failed',
  'round-cap',
  'move-pending',
  'not-found',
  'no-steps',
  'stale-steps'
]);
const STEPS_REF_RE = /^c-[0-9a-f]{8}$/;

/**
 * A refusal: wire code with underscores (the phone door only passes
 * [a-z_]), message = the card core's own code, never any user text.
 *
 * @param {string} code
 */
function refuse(code) {
  return Object.assign(new Error(code), { code: code.replace(/-/g, '_') });
}

/** Dir with card.mjs, rules.mjs, core.mjs; null when the learner repo is absent. */
function findCardsDir() {
  for (const dir of cardsDirs()) {
    if (fs.existsSync(path.join(dir, 'card.mjs'))) return dir;
  }
  return null;
}

/**
 * Same folder rule as the CLI: CARDS_HOME with a TEST_MODE marker, else
 * ~/.codesters/cards.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function cardsHome(env = process.env) {
  if (env.CARDS_HOME) {
    const abs = path.resolve(env.CARDS_HOME);
    if (fs.existsSync(path.join(abs, 'TEST_MODE'))) return abs;
  }
  return path.join(env.USERPROFILE || os.homedir(), '.codesters', 'cards');
}

/** Wake queue folder, same rule as wake.mjs. */
function wakeRoot() {
  return process.env.WAKE_ROOT || path.join(os.homedir(), '.codesters', 'wake');
}

/**
 * @param {string} dir
 * @returns {any[]}
 */
function readJsonDir(dir) {
  /** @type {any[]} */
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return out;
  }
  for (const f of names) {
    try {
      const p = path.join(dir, f);
      if (fs.statSync(p).size > 2048) continue;
      out.push(JSON.parse(fs.readFileSync(p, 'utf8')));
    } catch {
      // unreadable event: not ours to judge
    }
  }
  return out;
}

/**
 * Where the newest decided/asked wake for this bead stands: delivered (a
 * session claimed it), queued (waiting, the responsible chat is listening),
 * queued-no-listener (waiting, nobody listening, not lost) or none.
 *
 * @param {string} repo project key
 * @param {string} bead
 * @returns {{ state: 'delivered'|'queued'|'queued-no-listener'|'none', kind?: string }}
 */
export function wakeState(repo, bead) {
  const root = wakeRoot();
  /** @type {any} */
  let best = null;
  let where = '';
  for (const st of ['pending', 'claimed', 'done']) {
    for (const e of readJsonDir(path.join(root, st))) {
      if (
        e &&
        e.bead === bead &&
        (e.kind === 'decided' || e.kind === 'asked') &&
        (!best || String(e.at) > String(best.at))
      ) {
        best = e;
        where = st;
      }
    }
  }
  if (!best) return { state: 'none' };
  if (where !== 'pending') return { state: 'delivered', kind: best.kind };
  let chat = '';
  try {
    const j = JSON.parse(
      fs.readFileSync(path.join(root, 'responsible.json'), 'utf8')
    );
    chat = String(j?.p?.[repo]?.chat || '');
  } catch {
    // no registry: nobody is responsible yet
  }
  const now = Date.now();
  const listening =
    !!chat &&
    readJsonDir(path.join(root, 'sessions')).some(
      (l) => l && l.chat === chat && now - Number(l.at) < LEASE_STALE_MS
    );
  return {
    state: listening ? 'queued' : 'queued-no-listener',
    kind: best.kind
  };
}

/**
 * @param {string} s
 * @returns {string}
 */
function jsonText(s) {
  try {
    const v = JSON.parse(s);
    return typeof v === 'string' ? v : s;
  } catch {
    return s;
  }
}

/**
 * Owner questions and asker answers, oldest first.
 *
 * @param {any[]} comments
 */
export function parseThread(comments) {
  /** @type {Array<{ kind: 'q'|'a', round: number, scope?: string, quote?: string, text: string, at?: string }>} */
  const out = [];
  for (const c of comments.slice(-MAX_COMMENTS)) {
    const text = String(c?.text ?? '');
    const lines = text.split('\n').map((l) => l.trim());
    if (
      c?.author === BOARD &&
      lines[0] === 'OWNER QUESTION via board - NOT A DECISION'
    ) {
      const get = (/** @type {string} */ k) => {
        const l = lines.find((x) => x.startsWith(k + ': '));
        return l ? l.slice(k.length + 2) : '';
      };
      const round = Number((/^(\d)/.exec(get('round')) || [])[1]) || 0;
      out.push({
        kind: 'q',
        round,
        scope: get('scope'),
        ...(get('quote') ? { quote: jsonText(get('quote')) } : {}),
        text: jsonText(get('question')),
        at: c.created_at
      });
      continue;
    }
    const m = /^ASKER ANSWER round (\d)\b/.exec(lines[0]);
    if (m && c?.author !== BOARD) {
      out.push({
        kind: 'a',
        round: Number(m[1]),
        text: text.split('\n').slice(1).join('\n').trim().slice(0, 1200),
        at: c.created_at
      });
    }
  }
  return out;
}

/**
 * The newest recorded decision on the bead (answer line only).
 *
 * @param {any[]} comments
 */
export function lastDecision(comments) {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    const lines = String(c?.text ?? '')
      .split('\n')
      .map((l) => l.trim());
    if (
      c?.author === BOARD &&
      lines[0].startsWith('OWNER DECISION via board')
    ) {
      const a = lines.find((l) => l.startsWith('answer'));
      const via = /\((pc|phone)\)/.exec(lines[0]);
      return {
        via: via ? via[1] : '',
        answer: a ? a.slice(0, 700) : '',
        at: c.created_at
      };
    }
  }
  return null;
}

/**
 * @param {{
 *   listProjects?: () => Array<{ path: string }>,
 *   prefixes?: (ws: Array<{ path: string }>) => Promise<Array<{ path: string, prefix?: string }>>,
 *   runBdJson?: typeof runBdJson,
 *   exec?: (file: string, args: string[], input: string) => Promise<{ code: number|null, stdout: string }>,
 *   wake?: typeof emitWake,
 *   cardsDir?: string | null
 * }} [opts]
 */
export function createCards(opts = {}) {
  const listProjects = opts.listProjects || getAvailableWorkspaces;
  const prefixes = opts.prefixes || withPrefixes;
  const bdJson = opts.runBdJson || runBdJson;
  const wake = opts.wake || emitWake;
  /** @type {any} */
  let mods = null;
  /** @type {Map<string, Promise<unknown>>} one write at a time per bead */
  const chain = new Map();

  const exec =
    opts.exec ||
    ((
      /** @type {string} */ file,
      /** @type {string[]} */ args,
      /** @type {string} */ input
    ) =>
      new Promise((resolve) => {
        const child = execFile(
          process.execPath,
          [file, ...args],
          {
            windowsHide: true,
            timeout: CLI_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
            env: process.env
          },
          (err, stdout) =>
            resolve({
              code: err ? /** @type {any} */ (err.code ?? 1) : 0,
              stdout: String(stdout || '')
            })
        );
        child.stdin?.end(input);
      }));

  async function load() {
    if (mods) return mods;
    const dir = opts.cardsDir !== undefined ? opts.cardsDir : findCardsDir();
    if (!dir) throw refuse('cards-missing');
    const [rules, core, cli] = await Promise.all(
      ['rules.mjs', 'core.mjs', 'card.mjs'].map(
        (f) => import(pathToFileURL(path.join(dir, f)).href)
      )
    );
    mods = { dir, rules, core, cli };
    return mods;
  }

  /**
   * Project folder and key of a bead, by id prefix.
   *
   * @param {string} id
   */
  async function locate(id) {
    const all = listProjects();
    const ws = await prefixes(all.map((p) => ({ path: p.path })));
    const best = matchWorkspace(id, ws);
    if (!best) throw refuse('not-found');
    return { path: best.path, key: projectKey(best.path) };
  }

  /**
   * The CLI reads its repo list from a config file in the cards home; keep it
   * equal to the registered projects (one small JSON, written only on change).
   *
   * @param {{ cli: any }} m
   */
  function ensureConfig(m) {
    const home = m.cli.homeDir(process.env);
    const repos = listProjects().map((p) => ({
      name: projectKey(p.path),
      path: p.path
    }));
    const file = path.join(home, 'config.json');
    const next = JSON.stringify({ owner: OWNER, repos });
    try {
      if (fs.readFileSync(file, 'utf8') === next) return;
    } catch {
      // absent: write it
    }
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
  }

  /** @param {string} id */
  function assertId(id) {
    if (typeof id !== 'string' || id.length > 64 || !BEAD_ID_RE.test(id)) {
      throw refuse('bad-input');
    }
  }

  /**
   * @param {string} id
   * @returns {Promise<{ bead: any, comments: any[], proj: { path: string, key: string } }>}
   */
  async function read(id) {
    const proj = await locate(id);
    const opt = { cwd: proj.path, timeout_ms: 30000 };
    const [b, c] = await Promise.all([
      bdJson(['show', id, '--json'], opt),
      bdJson(['comments', id, '--json'], opt)
    ]);
    if (b.code !== 0) throw refuse('not-found');
    const bead = Array.isArray(b.stdoutJson) ? b.stdoutJson[0] : b.stdoutJson;
    const comments = Array.isArray(c.stdoutJson) ? c.stdoutJson : [];
    if (!bead || bead.id !== id) throw refuse('not-found');
    return { bead, comments, proj };
  }

  /**
   * @param {string} id
   * @returns {Promise<any>}
   */
  async function state(id) {
    assertId(id);
    const m = await load();
    const { bead, comments, proj } = await read(id);
    const meta = bead.metadata || {};
    const hasCard = Object.keys(meta).some((k) => k.startsWith('card_'));
    const base = {
      id,
      project: proj.key,
      thread: parseThread(comments),
      wake: wakeState(proj.key, id)
    };
    if (!hasCard) return { ...base, state: 'none', card: null };
    const parsed = m.rules.parseCard(bead);
    const waiting = bead.status === 'owner_decision' && bead.assignee === OWNER;
    /** @type {any} */
    let card = null;
    if (parsed.ok && !scanBlocked(m.rules, parsed.card, bead)) {
      const c = parsed.card;
      card = {
        cls: c.cls,
        lang: c.lang,
        q: c.q,
        effect: c.effect,
        show: c.show,
        blocks: c.blocks,
        opts: c.opts
      };
    }
    let st = 'none';
    if (waiting && card) st = 'waiting';
    else if (meta.card_state === 'asked' && bead.status !== 'closed') {
      st = 'asked';
    } else if (lastDecision(comments)) st = 'answered';
    return {
      ...base,
      state: st,
      card: st === 'none' ? null : card,
      sha: waiting && card ? m.core.questionSha(parsed.card) : '',
      round: Number(meta.card_round) || 0,
      max_rounds: m.core.MAX_ROUNDS,
      decision: st === 'answered' ? lastDecision(comments) : null,
      back: parsed.ok ? parsed.card.back : ''
    };
  }

  /**
   * @param {'answer'|'ask'|'steps-done'} cmd
   * @param {string} id
   * @param {Record<string, unknown>} req CLI request without repo/bead/via
   * @param {string | undefined} host
   */
  async function write(cmd, id, req, host) {
    assertId(id);
    const m = await load();
    const proj = await locate(id);
    ensureConfig(m);
    const via = viaFromHost(host);
    const payload = JSON.stringify({ repo: proj.key, bead: id, via, ...req });
    const res = await exec(path.join(m.dir, 'card.mjs'), [cmd], payload);
    /** @type {any} */
    let out = null;
    try {
      out = JSON.parse(res.stdout.trim().split('\n').pop() || '');
    } catch {
      // no JSON: treated as an error below
    }
    if (!out || out.ok !== true) {
      const code = out && REFUSALS.has(out.code) ? out.code : 'error';
      log('%s refused: %s', cmd, code);
      throw refuse(code);
    }
    // One wake for the role the bead goes back to; the event carries no text.
    let wk = 'failed';
    try {
      wk = await wake({
        kind: cmd === 'ask' ? 'asked' : 'decided',
        repo: proj.key,
        bead: id,
        via,
        role: String((cmd === 'steps-done' && req.back) || out.back)
      });
    } catch {
      // the record is written; a missing wake is shown as failed
    }
    return { code: out.code, round: out.round || 0, wake: wk };
  }

  /**
   * One write at a time per bead inside this process; the card core's guarded
   * update still decides across processes.
   *
   * @template T
   * @param {string} id
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  function serial(id, fn) {
    const prev = chain.get(id) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    chain.set(id, run);
    const done = () => {
      if (chain.get(id) === run) chain.delete(id);
    };
    run.then(done, done);
    return run;
  }

  return {
    state,
    /**
     * @param {any} p
     * @param {string | undefined} host
     */
    answer(p, host) {
      const id = p?.id;
      const hasOpt = p?.option !== undefined && p?.option !== null;
      const hasText = typeof p?.text === 'string';
      if (hasOpt === hasText) throw refuse('bad-input');
      /** @type {Record<string, unknown>} */
      const req = hasOpt ? { option: p.option } : { text: p.text };
      if (typeof p.sha === 'string') req.sha = p.sha;
      return serial(id, () => write('answer', id, req, host));
    },
    /**
     * @param {any} p
     * @param {string | undefined} host
     */
    ask(p, host) {
      const id = p?.id;
      /** @type {Record<string, unknown>} */
      const req = { scope: p?.scope, question: p?.question };
      if (p?.quote !== undefined) req.quote = p.quote;
      return serial(id, () => write('ask', id, req, host));
    },
    /**
     * The owner did the steps. Refuses unless the bead carries the steps
     * label, is open, its newest steps comment is the one he saw, and no text
     * trips the secret scan. The record and the label removal are the card
     * CLI's job; this only checks, calls it once and queues one wake.
     *
     * @param {any} p
     * @param {string | undefined} host
     */
    stepsDone(p, host) {
      const id = p?.id;
      const ref = p?.comment;
      if (typeof ref !== 'string' || !STEPS_REF_RE.test(ref)) {
        throw refuse('bad-input');
      }
      return serial(id, async () => {
        assertId(id);
        const m = await load();
        const { bead, comments } = await read(id);
        if (bead.status === 'closed') throw refuse('not-open');
        const labels = Array.isArray(bead.labels) ? bead.labels : [];
        if (!labels.includes(STEPS_LABEL)) throw refuse('no-steps');
        const st = findSteps(comments);
        if (!st) throw refuse('no-steps');
        if (st.comment !== ref) throw refuse('stale-steps');
        if (m.rules.scanText(`${st.title}
${String(bead.title || '')}`).length) {
          throw refuse('secret-refused');
        }
        /** @type {Record<string, unknown>} */
        const req = { comment: ref };
        if (/^[a-z][a-z0-9-]{1,30}$/.test(st.author) && st.author !== OWNER) {
          req.back = st.author;
        }
        return write('steps-done', id, req, host);
      });
    }
  };
}

/** @type {ReturnType<typeof createCards> | null} */
let shared = null;
function cards() {
  shared ??= createCards();
  return shared;
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'card-state',
    (/** @type {any} */ req) => cards().state(req.payload?.id),
    { phone: true }
  );
  seam.registerHandler(
    'card-answer',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      cards().answer(req.payload || {}, ctx?.ws?.hostHeader),
    { mutating: true, phone: true }
  );
  seam.registerHandler(
    'card-ask',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      cards().ask(req.payload || {}, ctx?.ws?.hostHeader),
    { mutating: true, phone: true }
  );
  seam.registerHandler(
    'steps-done',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      cards().stepsDone(req.payload || {}, ctx?.ws?.hostHeader),
    { mutating: true, phone: true }
  );
}
