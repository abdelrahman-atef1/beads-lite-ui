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
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';

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

/** @param {{ registerHandler: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'flow-rollup',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      flowRollup(req.payload || {}, ctx),
    { phone: true }
  );
}
