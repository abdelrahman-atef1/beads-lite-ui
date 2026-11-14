/**
 * Flow rollup reader for the Time screens (beads-lite-1bo5.6.59.12, data of .66).
 *
 *   flow-rollup {ids?: string[], days?: number} -> { present, built_at, heavy_recorded, rows }
 *
 * Read-only: reads ~/.codesters/flow/rollup.json (FLOW_HOME overrides the folder),
 * written by the company repo's scripts/flow/rollup.mjs. Nothing here writes, spawns or
 * polls; the file is re-read only when its modified time changes. A missing or
 * unreadable file is not an error: { present: false, rows: [] } (the board shows an
 * empty state). ids: those beads (max 50). No ids: beads closed in the last `days`
 * (default 30, max 200) plus every running bead. Rows carry numbers only (no text);
 * labels are cut to exp:* ones. On the phone door desk beads are left out.
 *
 * Experiment view and weekly digest (beads-lite-1bo5.6.66.7), same rules:
 *
 *   flow-digest {} -> { digest: { week, lines[5], findings, built_at } | null, exps: [] }
 *
 * Reads FLOW_HOME/exp/*.json (flow-exp.mjs verdicts, computed by that script, never
 * here) and the head of the newest knowledge/research/flow/YYYY-Www.md
 * (FLOW_DIGEST_DIR overrides): its five digest lines, as written. pushWeeklyDigest
 * sends ONE web push per weekly file, only when the digest has findings, through the
 * board push sender (its caps, mute, subscribers). No timer, no polling: it runs when
 * the weekly file appears (fs.watch, unref'd) or once after boot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';
import { getPush } from './push.js';

const log = debug('flow');
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MAX_IDS = 50;
const MAX_ROWS = 2000;
const DAY = 86_400_000;

const file = () =>
  path.join(
    process.env.FLOW_HOME || path.join(os.homedir(), '.codesters', 'flow'),
    'rollup.json'
  );

/** @type {{ file: string, mtime: number, doc: any } | null} */
let cache = null;

/** @returns {any} parsed rollup, or null when absent / unreadable */
function readDoc() {
  const f = file();
  try {
    const mtime = fs.statSync(f).mtimeMs;
    if (cache && cache.file === f && cache.mtime === mtime) return cache.doc;
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    cache = { file: f, mtime, doc };
    return doc;
  } catch (err) {
    log('rollup not readable: %o', /** @type {any} */ (err)?.code);
    return null;
  }
}

/** @param {any} b */
function slim(b) {
  const o = { ...b };
  o.labels = (Array.isArray(b.labels) ? b.labels : []).filter(
    (/** @type {any} */ l) => typeof l === 'string' && l.startsWith('exp:')
  );
  delete o.wake;
  return o;
}

/**
 * @param {any} payload
 * @param {{ ws?: any }} ctx
 */
export function flowRollup(payload, ctx = {}) {
  const ids = payload?.ids;
  if (
    ids != null &&
    (!Array.isArray(ids) ||
      ids.length > MAX_IDS ||
      ids.some(
        (/** @type {any} */ i) => typeof i !== 'string' || !ID_RE.test(i)
      ))
  ) {
    throw Object.assign(new Error('bad_input'), { code: 'bad_input' });
  }
  const d = Number(payload?.days);
  const days = Number.isFinite(d) && d > 0 ? Math.min(Math.floor(d), 200) : 30;
  const doc = readDoc();
  if (!doc || typeof doc.beads !== 'object' || !doc.beads) {
    return { present: false, built_at: null, heavy_recorded: false, rows: [] };
  }
  const phone = ctx.ws?.door === 'phone';
  const from = Date.now() - days * DAY;
  /** @type {any[]} */
  const rows = [];
  const all = /** @type {any[]} */ (Object.values(doc.beads));
  for (const b of all) {
    if (!b || typeof b.id !== 'string') continue;
    if (ids ? !ids.includes(b.id) : !(b.running || b.closed >= from)) continue;
    if (phone && isDeskIssue({ labels: b.labels, assignee: b.role })) continue;
    rows.push(slim(b));
    if (rows.length >= MAX_ROWS) break;
  }
  return {
    present: true,
    built_at: doc.built_at ?? null,
    heavy_recorded: doc.heavy_recorded === true,
    rows
  };
}

// ---- experiment view and weekly digest (beads-lite-1bo5.6.66.7) ----------------------------------

const MAX_EXPS = 20;
const WEEK_FILE = /^(\d{4}-W\d{2})\.md$/;
const LABELS = ['Title:', 'Done since last:', 'Next:', 'Needs you:', 'Risks:'];

const flowHome = () =>
  process.env.FLOW_HOME || path.join(os.homedir(), '.codesters', 'flow');
export const digestDir = () =>
  process.env.FLOW_DIGEST_DIR ||
  path.join(os.homedir(), 'company', 'knowledge', 'research', 'flow');

/** @param {any} v @param {number} n */
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
/** @param {any} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * One verdict file cut to what the view draws: bounded, no field passes through unchecked.
 * @param {any} e
 */
export function slimExp(e) {
  if (!e || typeof e !== 'object' || typeof e.slug !== 'string') return null;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(e.slug)) return null;
  const x = e.exp && typeof e.exp === 'object' ? e.exp : {};
  const c = e.control && typeof e.control === 'object' ? e.control : null;
  const iv =
    e.interval80 && typeof e.interval80 === 'object' ? e.interval80 : null;
  return {
    slug: e.slug,
    verdict: str(e.verdict, 20),
    reason: str(e.reason, 500),
    final: e.final === true,
    evaluated_at: str(e.evaluated_at, 40),
    metric: str(e.metric, 12),
    n_treat: num(e.n_treat),
    n_base: num(e.n_base),
    n_unknown: num(e.n_unknown),
    median_treat: num(e.median_treat),
    median_base: num(e.median_base),
    change: num(e.change),
    interval80: iv ? { lo: num(iv.lo), hi: num(iv.hi) } : null,
    guardrails: (Array.isArray(e.guardrails) ? e.guardrails : [])
      .slice(0, 8)
      .map((/** @type {any} */ g) => ({
        name: str(g?.name, 20),
        known: g?.known === true,
        base_rate: num(g?.base_rate),
        treat_rate: num(g?.treat_rate),
        held: g?.held !== false,
        rollback: g?.rollback === true
      })),
    control: c
      ? {
          n_treat: num(c.n_treat),
          n_base: num(c.n_base),
          change: num(c.change)
        }
      : null,
    market_moved: e.market_moved === true,
    confounded: e.confounded === true,
    confounded_by: (Array.isArray(e.confounded_by) ? e.confounded_by : [])
      .slice(0, 6)
      .map((/** @type {any} */ k) => str(k, 40)),
    exp: {
      hypothesis: str(x.hypothesis, 300),
      change: str(x.change, 300),
      scope: { role: str(x.scope?.role, 40), kind: str(x.scope?.kind, 20) },
      start: num(x.start),
      target: num(x.target),
      min_n: num(x.min_n),
      max_weeks: num(x.max_weeks)
    }
  };
}

/** @param {string} [dir] */
export function readExps(dir = path.join(flowHome(), 'exp')) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  /** @type {NonNullable<ReturnType<typeof slimExp>>[]} */
  const out = [];
  for (const f of names.slice(0, 200)) {
    try {
      const j = slimExp(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      if (j) out.push(j);
    } catch {
      // an unreadable verdict file is skipped, never an error
    }
  }
  // running first, then newest: a stable order that is never by the metric
  out.sort(
    (a, b) =>
      Number(a.final) - Number(b.final) ||
      b.evaluated_at.localeCompare(a.evaluated_at) ||
      a.slug.localeCompare(b.slug)
  );
  return out.slice(0, MAX_EXPS);
}

/**
 * Newest weekly file and its five digest lines, as written. null when none.
 * @param {string} [dir]
 */
export function readDigest(dir = digestDir()) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => WEEK_FILE.test(f));
  } catch {
    return null;
  }
  names.sort();
  const name = names[names.length - 1];
  if (!name) return null;
  let text = '';
  let mtime = 0;
  try {
    const f = path.join(dir, name);
    mtime = fs.statSync(f).mtimeMs;
    text = fs.readFileSync(f, 'utf8').slice(0, 20_000);
  } catch {
    return null;
  }
  const head = text.split(/\r?\n/).slice(0, 30);
  const lines = LABELS.map((l) =>
    (head.find((x) => x.startsWith(l)) || '').slice(0, 800)
  );
  if (!lines[0]) return null;
  const risks = lines[4].slice('Risks:'.length).trim().toLowerCase();
  return {
    week: WEEK_FILE.exec(name)?.[1] || '',
    file: name,
    lines,
    findings: risks !== '' && risks !== 'none',
    built_at: new Date(mtime).toISOString(),
    mtime
  };
}

export function flowDigest() {
  const d = readDigest();
  return {
    digest: d
      ? {
          week: d.week,
          lines: d.lines,
          findings: d.findings,
          built_at: d.built_at
        }
      : null,
    exps: readExps()
  };
}

// ---- the weekly push -------------------------------------------------------------------------------

const stateFile = () =>
  path.join(
    process.env.BDUI_BOARD_HOME ||
      path.join(os.homedir(), '.codesters', 'board'),
    'flow-push.json'
  );

/** @returns {boolean} the owner's mute window is open (notify.json, the file the bell reads) */
function ownerMuted() {
  try {
    const f = path.join(path.dirname(stateFile()), 'notify.json');
    const t = Date.parse(JSON.parse(fs.readFileSync(f, 'utf8')).mute_until);
    return Number.isFinite(t) && t > Date.now();
  } catch {
    return false;
  }
}

/** @type {Promise<string> | null} */
let inflight = null;

/**
 * Push the newest weekly digest once, and return what happened. Never throws.
 * No file, older than 8 days, no findings or already handled: nothing is sent.
 * One push per weekly file and at most one per 6 days, however often this runs.
 * The board sender decides the rest (subscribers, mute, 2-minute and daily caps);
 * a refusal there leaves the file unmarked so a later boot or file event can retry.
 * @param {{ push?: { send: Function }, now?: number, dir?: string, state?: string, muted?: boolean }} [o]
 * @returns {Promise<string>}
 */
export function pushWeeklyDigest(o = {}) {
  if (inflight) return inflight;
  inflight = run(o)
    .catch((/** @type {any} */ e) => {
      log('weekly push failed: %o', e?.code || e?.message);
      return 'error';
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** @param {any} o */
async function run(o) {
  const now = o.now ?? Date.now();
  const d = readDigest(o.dir);
  if (!d) return 'no-file';
  if (now - d.mtime > 8 * DAY) return 'stale';
  const sf = o.state || stateFile();
  /** @type {{ files: string[], last_at: number }} */
  let st = { files: [], last_at: 0 };
  try {
    const j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    st = {
      files: Array.isArray(j.files) ? j.files.slice(-20) : [],
      last_at: Number(j.last_at) || 0
    };
  } catch {
    // first run
  }
  if (st.files.includes(d.file)) return 'already';
  /** @param {boolean} sent */
  const mark = (sent) => {
    fs.mkdirSync(path.dirname(sf), { recursive: true });
    const tmp = sf + '.' + process.pid + '.tmp';
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        files: [...st.files, d.file].slice(-20),
        last_at: sent ? now : st.last_at
      })
    );
    fs.renameSync(tmp, sf);
  };
  if (!d.findings) {
    mark(false);
    return 'no-findings';
  }
  if (now - st.last_at < 6 * DAY) {
    mark(false);
    return 'week-cap';
  }
  const push = o.push || getPush();
  const r = await push.send(
    {
      kind: 'flow',
      project: 'flow',
      bead: null,
      title: null,
      count: 1,
      at: new Date(now).toISOString()
    },
    { muted: o.muted ?? ownerMuted() }
  );
  if (r === 'sent' || r === 'folded') mark(true);
  return String(r);
}

/** Event driven and unref'd: watch the digest folder, plus one check after boot. */
function watchDigest() {
  if (process.env.VITEST || process.env.BDUI_FLOW_PUSH === '0') return;
  /** @type {any} */
  let timer = null;
  const soon = (/** @type {number} */ ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => void pushWeeklyDigest(), ms);
    timer.unref?.();
  };
  try {
    const w = fs.watch(digestDir(), { persistent: false }, (_e, name) => {
      if (name && WEEK_FILE.test(String(name))) soon(5000);
    });
    w.on('error', () => w.close());
  } catch {
    // folder missing: the boot check only
  }
  soon(15_000);
}

/** @param {{ registerHandler: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'flow-rollup',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      flowRollup(req.payload || {}, ctx),
    { phone: true }
  );
  seam.registerHandler('flow-digest', () => flowDigest(), { phone: true });
  watchDigest();
}
