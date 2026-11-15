/**
 * Stats home data (beads-lite-1bo5.6.68.4). One read-only handler:
 *
 *   flow-stats {days?} -> one small object the Stats screen draws (about 3 KB)
 *
 * Reads ~/.codesters/flow/rollup.json and tokens.json (FLOW_HOME overrides the folder),
 * both written by scripts in the company repo. Nothing here writes, spawns or polls:
 * the answer is computed when the screen asks, and cached until a file changes (or 60 s,
 * because ages count up). The page never receives the 5000 rows. Unknown stays null,
 * never 0; groups under MIN_N closed beads are marked `enough: false`; time is never
 * shown without the quality counters; tokens are counts and a list-price equivalent,
 * never money spent. Titles of the few "stuck" beads come from the project's own bead
 * store, read-only, when node:sqlite is there; otherwise the id stands.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';

const log = debug('flow-stats');
const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** A close counts as finished work only with at least this much active time. */
const REAL_WORK_MS = 60_000;
export const MIN_N = 8;
const BUCKETS = ['active', 'test', 'owner', 'merge', 'blocked', 'queue'];
const STUCK = [
  'owner_decision',
  'waiting_for_test',
  'waiting_for_merge',
  'blocked'
];
const TTL = 60_000;

const home = () =>
  process.env.FLOW_HOME || path.join(os.homedir(), '.codesters', 'flow');

/** @type {Map<string, { mtime: number, doc: any }>} */
const files = new Map();

/**
 * @param {string} name
 * @returns {{ doc: any, mtime: number } | null}
 */
function readJson(name) {
  const f = path.join(home(), name);
  try {
    const mtime = fs.statSync(f).mtimeMs;
    const hit = files.get(f);
    if (hit && hit.mtime === mtime) return hit;
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const v = { mtime, doc };
    files.set(f, v);
    return v;
  } catch (err) {
    log('%s not readable: %o', name, /** @type {any} */ (err)?.code);
    return null;
  }
}

/** @param {number[]} a - @param {number} p */
function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}
/** @param {number[]} a */
const median = (a) => pct(a, 0.5);
/** @param {any} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @type {Map<string, string>} */
const titles = new Map();

/**
 * Title of one bead from its project store (read-only). '' when not found.
 *
 * @param {any} doc
 * @param {any} b
 */
async function titleOf(doc, b) {
  if (titles.has(b.id)) return /** @type {string} */ (titles.get(b.id));
  let t = '';
  try {
    const db = doc.projects?.[b.project]?.db;
    if (typeof db === 'string' && fs.existsSync(db)) {
      const { DatabaseSync } = await import('node:sqlite');
      const h = new DatabaseSync(db, { readOnly: true });
      try {
        const r = /** @type {any} */ (
          h.prepare('select title from issues where id = ?').get(b.id)
        );
        t = typeof r?.title === 'string' ? r.title.slice(0, 160) : '';
      } finally {
        h.close();
      }
    }
  } catch (err) {
    log('title lookup failed: %o', /** @type {any} */ (err)?.code);
  }
  titles.set(b.id, t);
  return t;
}

/**
 * Project of a bead the rollup does not carry: its id prefix matched to a project key.
 *
 * @param {any} doc
 * @param {string} id
 */
function projectOfId(doc, id) {
  const pre = id.split('-')[0] || 'unknown';
  const keys = Object.keys(doc.projects || {});
  return keys.find((k) => k === pre || k.startsWith(pre + '-')) || pre;
}

/**
 * Pure aggregation: the whole screen's numbers from the two documents.
 *
 * @param {any} doc - rollup.json
 * @param {any} tok - tokens.json or null
 * @param {number} days
 * @param {number} now
 */
export function aggregate(doc, tok, days, now) {
  const all = /** @type {any[]} */ (
    Object.values(doc.beads || {}).filter(
      (/** @type {any} */ b) => b && typeof b.id === 'string'
    )
  );
  const work = all.filter((b) => b.kind !== 'epic');
  const from = now - days * DAY;
  const closed = (/** @type {any} */ b) => num(b.closed);
  const inWin = work.filter((b) => closed(b) !== null && b.closed >= from);

  // Q3 what is stuck now
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(STUCK.map((s) => [s, 0]));
  /** @type {any[]} */
  const stuck = [];
  for (const b of work) {
    if (!STUCK.includes(b.status)) continue;
    counts[b.status]++;
    const iv = (Array.isArray(b.intervals) ? b.intervals : []).filter(
      (/** @type {any} */ i) => i.running
    );
    const last = iv[iv.length - 1];
    if (!last || !num(last.from)) continue;
    stuck.push({
      id: b.id,
      project: b.project,
      status: b.status,
      role: last.role || b.role || null,
      ageMs: Math.max(0, now - last.from),
      labels: b.labels,
      _b: b
    });
  }
  stuck.sort((a, b) => b.ageMs - a.ageMs);

  // Q1 closed per week, last 8 weeks, oldest first
  /** @type {number[]} */
  const weeks = Array(8).fill(0);
  for (const b of work) {
    if (closed(b) === null) continue;
    // bulk closes (under 1 min of real work, or none recorded) are not finished work
    if (!(num(b.active_ms) >= REAL_WORK_MS)) continue;
    const k = Math.floor((now - b.closed) / WEEK);
    if (k >= 0 && k < 8) weeks[7 - k]++;
  }
  // median of the 7 complete weeks before this one, only weeks with at least 1 counted close
  const avg = median(weeks.slice(0, 7).filter((x) => x > 0));

  // Q2 where the time goes: closed in the window with known intervals
  /** @type {Record<string, number>} */
  const sum = Object.fromEntries(BUCKETS.map((k) => [k, 0]));
  const act = [];
  const wait = [];
  let splitN = 0;
  for (const b of inWin) {
    if (b.active_ms === null || b.active_ms === undefined) continue;
    splitN++;
    for (const k of BUCKETS) sum[k] += num(b.buckets?.[k]) || 0;
    act.push(b.active_ms);
    if (num(b.waiting_ms) !== null) wait.push(b.waiting_ms);
  }
  const total = BUCKETS.reduce((s, k) => s + sum[k], 0);
  const shares = total
    ? Object.fromEntries(BUCKETS.map((k) => [k, sum[k] / total]))
    : null;
  const waits = BUCKETS.filter((k) => k !== 'active' && k !== 'queue');
  const biggest =
    shares && waits.some((k) => sum[k] > 0)
      ? waits.reduce((a, k) => (sum[k] > sum[a] ? k : a), waits[0])
      : null;

  // Q4 quality by role
  /** @type {Record<string, any>} */
  const by = {};
  for (const b of inWin) {
    const k = b.role || 'unknown';
    const s = (by[k] ||= { role: k, closed: 0, bad: 0 });
    s.closed++;
    s.bad +=
      (num(b.quality?.qaFail) || 0) +
      (num(b.quality?.reopen) || 0) +
      (num(b.quality?.ownerReject) || 0);
  }
  const quality = Object.values(by)
    .filter((s) => s.role !== 'unknown' && s.role !== 'abdelrahman')
    .sort((a, b) => b.closed - a.closed)
    .slice(0, 6)
    .map((s) => ({
      role: s.role,
      closed: s.closed,
      rate: s.closed >= MIN_N ? s.bad / s.closed : null,
      enough: s.closed >= MIN_N
    }));
  const unassigned = work.filter((b) => !b.role).length;

  // Q7 machine wait (heavy key) and wake latency
  const hw = [];
  const hh = [];
  for (const b of inWin) {
    if (b.heavy && b.heavy.runs > 0) {
      if (num(b.heavy.wait_s) !== null) hw.push(b.heavy.wait_s);
      if (num(b.heavy.held_s) !== null) hh.push(b.heavy.held_s);
    }
  }
  const lat = Object.values(doc.wake_by_role || {})
    .map((/** @type {any} */ w) => num(w?.median_latency_ms))
    .filter((/** @type {number | null} */ x) => x !== null);
  const machine = {
    n: hw.length,
    waitMedS: median(hw),
    heldMedS: median(hh),
    wakeMedMs: lat.length ? median(/** @type {number[]} */ (lat)) : null
  };

  // Q5 / Q6 tokens
  /** @type {any} */
  let tokens = { present: false };
  const tb =
    tok && tok.beads && typeof tok.beads === 'object' ? tok.beads : null;
  if (tb) {
    const byId = new Map(work.map((b) => [b.id, b]));
    /** @type {Record<string, { t: number, n: number }>} */
    const roleT = {};
    let known = 0;
    let cacheS = 0;
    let freshS = 0;
    let costS = 0;
    for (const b of inWin) {
      const r = tb[b.id];
      if (!r) continue;
      known++;
      const fresh = (num(r.input) || 0) + (num(r.output) || 0);
      freshS += num(r.input) || 0;
      cacheS += num(r.cache) || 0;
      costS += num(r.cost) || 0;
      const roles = r.roles && typeof r.roles === 'object' ? r.roles : {};
      const calls = Object.values(roles).reduce((s, x) => s + (num(x) || 0), 0);
      for (const [role, c] of Object.entries(roles)) {
        const w = calls ? (num(c) || 0) / calls : 0;
        const e = (roleT[role] ||= { t: 0, n: 0 });
        e.t += fresh * w;
        e.n += w;
      }
    }
    // per project: every bead in the file (a 30-day scan), not only those closed in the window
    /** @type {Record<string, { tokens: number, cost: number, closed: number }>} */
    const proj = {};
    for (const [id, r] of Object.entries(tb)) {
      const b = byId.get(id);
      const p = b ? b.project : projectOfId(doc, id);
      const e = (proj[p] ||= { tokens: 0, cost: 0, closed: 0 });
      e.tokens +=
        (num(/** @type {any} */ (r).input) || 0) +
        (num(/** @type {any} */ (r).output) || 0);
      e.cost += num(/** @type {any} */ (r).cost) || 0;
    }
    const tdays = num(tok.days) || 30;
    for (const b of work) {
      if (
        closed(b) !== null &&
        b.closed >= now - tdays * DAY &&
        proj[b.project]
      )
        proj[b.project].closed++;
    }
    tokens = {
      present: true,
      generated: tok.generated || null,
      scanDays: tdays,
      partial: tok.partial === true,
      attributed: num(tok.share?.shareOutput),
      known,
      of: inWin.length,
      cacheHit: cacheS + freshS ? cacheS / (cacheS + freshS) : null,
      equivCost: Math.round(costS),
      roles: Object.entries(roleT)
        .filter(([, e]) => e.n > 0)
        .map(([role, e]) => ({
          role,
          avg: Math.round(e.t / e.n),
          n: Math.round(e.n * 10) / 10,
          enough: e.n >= MIN_N
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 6),
      projects: Object.entries(proj)
        .map(([project, e]) => ({
          project,
          tokens: Math.round(e.tokens),
          cost: Math.round(e.cost),
          closed: e.closed
        }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 6)
    };
  }

  return {
    present: true,
    built_at: doc.built_at ?? null,
    now,
    days,
    counts,
    stuck,
    weeks,
    weekAvg: avg,
    weekTotal: weeks.reduce((s, x) => s + x, 0),
    split: {
      n: splitN,
      shares,
      biggest,
      activeMedMs: median(act),
      waitMedMs: median(wait)
    },
    quality,
    unassigned,
    machine,
    tokens
  };
}

/** @type {{ key: string, at: number, out: any } | null} */
let cache = null;

/**
 * @param {any} payload
 * @param {{ ws?: any }} [ctx]
 */
export async function flowStats(payload, ctx = {}) {
  const d = Number(payload?.days);
  const days = Number.isFinite(d) && d > 0 ? Math.min(Math.floor(d), 200) : 7;
  const r = readJson('rollup.json');
  if (!r || !r.doc || typeof r.doc.beads !== 'object' || r.doc.beads === null) {
    return { present: false };
  }
  const t = readJson('tokens.json');
  const key = [days, r.mtime, t ? t.mtime : 0].join(':');
  const now = Date.now();
  let out;
  if (cache && cache.key === key && now - cache.at < TTL) {
    out = cache.out;
  } else {
    out = aggregate(r.doc, t ? t.doc : null, days, now);
    out.stuck = out.stuck.slice(0, 8);
    cache = { key, at: now, out };
  }
  const phone = ctx.ws?.door === 'phone';
  const rows = out.stuck
    .filter(
      (/** @type {any} */ s) =>
        !(phone && isDeskIssue({ labels: s.labels, assignee: s.role }))
    )
    .slice(0, 3);
  const stuck = await Promise.all(
    rows.map(async (/** @type {any} */ s) => ({
      id: s.id,
      project: s.project,
      status: s.status,
      role: s.role,
      ageMs: s.ageMs,
      title: await titleOf(r.doc, { id: s.id, project: s.project })
    }))
  );
  return { ...out, stuck };
}

/** @param {{ registerHandler: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'flow-stats',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      flowStats(req.payload || {}, ctx),
    { phone: true }
  );
}
