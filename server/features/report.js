/**
 * Bug report from the board (ADR 0006 D6, company-1bo5.6.8) and the wake for
 * board-created beads.
 *
 * POST /api/report  body = [u32 BE metaLen][meta JSON][image bytes]
 *   Content-Type: application/x-bdui-report, header x-bdui-report: 1,
 *   header x-board-token, Origin required and equal to this board.
 *   meta = { project, text, version }; the image is optional (0 bytes = none).
 * GET /att/<project>/<yyyy-mm>/<sha16>.<png|jpg|webp>  serves a stored image.
 *
 * Own wire format instead of multipart: no dependency, and base64 JSON would
 * trip the global 100 KB json limit. Everything is bounded before it is used.
 */
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBd, runBdJson } from '../bd.js';
import { isAllowedOrigin, isValidToken } from '../guard.js';
import { isDeskIssue } from '../phone.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';

export const MAX_IMAGE = 4 * 1024 * 1024;
export const MAX_TEXT = 2000;
const MAX_META = 16 * 1024;
const MAX_BODY = MAX_IMAGE + MAX_META + 4;
const REPORTS_PER_HOUR = 30;
const CONTENT_TYPE = 'application/x-bdui-report';
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9 ._+()#:/-]{0,39}$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const ATT_RE =
  /^\/att\/([a-z0-9][a-z0-9_-]{0,39})\/(\d{4}-\d{2})\/([0-9a-f]{16})\.(png|jpg|webp)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** @type {number[]} */
let recent = [];

/** Test hook: forget the rate window. */
export function resetReportRate() {
  recent = [];
}

export function attachRoot() {
  return (
    process.env.BDUI_ATTACH_ROOT ||
    path.join(os.homedir(), 'codesters-attachments')
  );
}

function wakeBin() {
  return (
    process.env.BDUI_WAKE_BIN ||
    path.join(os.homedir(), 'company', 'scripts', 'wake', 'wake.mjs')
  );
}

/** @param {string} p */
export function projectKey(p) {
  return path.basename(p.replace(/[\\/]+$/, '')).toLowerCase();
}

/** @returns {Map<string, string>} project key -> workspace path */
function projects() {
  const m = new Map();
  for (const w of getAvailableWorkspaces()) {
    const k = projectKey(w.path);
    if (PROJECT_RE.test(k) && !m.has(k)) {
      m.set(k, w.path);
    }
  }
  return m;
}

/**
 * Secret/token shapes (subset of the decision-card scan). Refuse, never echo.
 *
 * @param {string} s
 */
export function hasSecret(s) {
  if (/\d{6,}:[A-Za-z0-9_-]{30,}/.test(s)) return true;
  if (
    /(\b(sk|pk|rk)_(live|test)_|whsec_|github_pat_|glpat-|AIza[0-9A-Za-z_-]{10,}|\bsk-[A-Za-z0-9]|ghp_|gho_|ghs_|xox[abprs]-|\beyJ|-----BEGIN|AKIA[0-9A-Z]{8,})/.test(
      s
    )
  )
    return true;
  if (
    /(\b(pass(word|wd)?|pwd|secret|token|api[_ -]?key|private[_ -]?key)|كلمة\s*(السر|المرور)|مفتاح)\s*[:=]\s*\S+/i.test(
      s
    )
  )
    return true;
  for (const run of s.match(/[A-Za-z0-9+/=_-]{24,}/g) || []) {
    if (run.length >= 64 || /^[0-9a-fA-F]{32,}$/.test(run)) return true;
    if (/\d/.test(run) && /[a-z]/.test(run) && /[A-Z]/.test(run)) return true;
  }
  return false;
}

/**
 * Detect type by magic bytes and strip metadata (EXIF/XMP/text chunks).
 * Returns null for anything that is not a well-formed PNG/JPEG/WebP.
 *
 * @param {Buffer} b
 * @returns {{ ext: 'png' | 'jpg' | 'webp', data: Buffer } | null}
 */
export function sanitizeImage(b) {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  ) {
    return stripPng(b);
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return stripJpeg(b);
  }
  if (
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return stripWebp(b);
  }
  return null;
}

/**
 * @param {Buffer} b
 * @returns {{ ext: 'png' | 'jpg' | 'webp', data: Buffer } | null}
 */
function stripPng(b) {
  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out = [b.subarray(0, 8)];
  let i = 8;
  let first = true;
  let ended = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > b.length || len > 0x7fffffff) return null;
    if (first && type !== 'IHDR') return null;
    first = false;
    if (!drop.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  return ended
    ? { ext: /** @type {'png'} */ ('png'), data: Buffer.concat(out) }
    : null;
}

/**
 * @param {Buffer} b
 * @returns {{ ext: 'png' | 'jpg' | 'webp', data: Buffer } | null}
 */
function stripJpeg(b) {
  const out = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xda) {
      // start of scan: entropy data to the end, verbatim
      out.push(b.subarray(i));
      return b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9
        ? { ext: 'jpg', data: Buffer.concat(out) }
        : null;
    }
    if (m === 0xd9) return null;
    const len = b.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > b.length) return null;
    const isApp = m >= 0xe1 && m <= 0xef;
    if (!isApp && m !== 0xfe) out.push(b.subarray(i, end));
    i = end;
  }
  return null;
}

/**
 * @param {Buffer} b
 * @returns {{ ext: 'png' | 'jpg' | 'webp', data: Buffer } | null}
 */
function stripWebp(b) {
  const total = b.readUInt32LE(4) + 8;
  if (total > b.length || total < 20) return null;
  const parts = [];
  let i = 12;
  let sawImage = false;
  while (i + 8 <= total) {
    const tag = b.toString('latin1', i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const end = i + 8 + len + (len & 1);
    if (end > total) return null;
    if (tag === 'EXIF' || tag === 'XMP ') {
      i = end;
      continue;
    }
    let chunk = b.subarray(i, end);
    if (tag === 'VP8X' && len >= 10) {
      chunk = Buffer.from(chunk);
      chunk[8] &= ~0x0c; // clear EXIF and XMP flags
    }
    if (tag === 'VP8 ' || tag === 'VP8L' || tag === 'VP8X') sawImage = true;
    parts.push(chunk);
    i = end;
  }
  if (!sawImage) return null;
  const body = Buffer.concat([Buffer.from('WEBP'), ...parts]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return { ext: 'webp', data: Buffer.concat([head, body]) };
}

/**
 * Read the body with a hard streaming cap. Resolves null when over the cap.
 *
 * @param {import('express').Request} req
 * @returns {Promise<Buffer | null>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let n = 0;
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      n += c.length;
      if (n > MAX_BODY) {
        over = true;
        chunks.length = 0;
        return; // keep draining so the reply can be sent; nothing is kept
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Emit a wake event. Never throws; resolves 'queued' or 'failed'.
 *
 * @param {{ kind: 'report' | 'new-task', repo: string, bead: string, via: 'pc' | 'phone' }} ev
 * @returns {Promise<'queued' | 'failed'>}
 */
export function emitWake(ev) {
  return new Promise((resolve) => {
    try {
      execFile(
        process.execPath,
        [
          wakeBin(),
          'emit',
          '--kind',
          ev.kind,
          '--repo',
          ev.repo,
          '--bead',
          ev.bead,
          '--role',
          'cos',
          '--via',
          ev.via
        ],
        { windowsHide: true, timeout: 10_000 },
        (err) => resolve(err ? 'failed' : 'queued')
      );
    } catch {
      resolve('failed');
    }
  });
}

/** @param {string | undefined} host */
export function viaFromHost(host) {
  const h = String(host || '').toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h) ? 'pc' : 'phone';
}

/** bd create args that mark a bead as created through the board's own handler. */
export const BOARD_TASK_ARGS = [
  '--actor',
  'owner-board',
  '--silent',
  '--metadata',
  JSON.stringify({ created_via: 'board-task' })
];

/**
 * After the board's create-issue succeeded: wake CoS (kind new-task).
 *
 * @param {string | undefined} root_dir workspace of the new bead
 * @param {string} stdout `bd create --silent` output (the id)
 * @param {string | undefined} host Host header of the connection
 */
export async function afterBoardTask(root_dir, stdout, host) {
  const bead = String(stdout || '')
    .trim()
    .split(/\s+/)[0];
  if (!root_dir || !bead) return 'failed';
  return emitWake({
    kind: 'new-task',
    repo: projectKey(root_dir),
    bead,
    via: viaFromHost(host)
  });
}

/**
 * Arabic-Indic / Persian digits and the Arabic decimal separator to ASCII, so
 * a version typed on an Arabic keyboard is accepted and stored as ASCII.
 *
 * @param {string} v
 */
export function normalizeVersion(v) {
  return v
    .trim()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.');
}

const BUSY_RE =
  /locked|busy|historical SQLite workspace|contention|timeout|try again|SQLITE_BUSY/i;
export const CREATE_RETRIES = 6;

/**
 * Run bd create, retrying with a short backoff while bd reports a busy or
 * locked store (parallel writers). Other failures return at once.
 *
 * @param {string[]} args
 * @param {{ cwd: string }} opts
 */
async function createWithRetry(args, opts) {
  let r = await runBd(args, opts);
  for (let i = 1; i < CREATE_RETRIES; i++) {
    if (
      r.code === 0 ||
      !BUSY_RE.test(`${r.stderr}
${r.stdout}`)
    )
      break;
    await new Promise((ok) => setTimeout(ok, 50 * i + Math.random() * 50));
    r = await runBd(args, opts);
  }
  return r;
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} error
 */
function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleReport(req, res) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const door = doorOf(req);
  // B2: Origin must be present and ours (a cross-site form post cannot be);
  // the custom header forces a CORS preflight the board refuses.
  if (!origin || !isAllowedOrigin(origin, host, door))
    return fail(res, 403, 'forbidden');
  if (req.headers['x-bdui-report'] !== '1') return fail(res, 403, 'forbidden');
  const tok = req.headers['x-board-token'];
  if (typeof tok !== 'string' || !isValidToken(tok, door))
    return fail(res, 403, 'forbidden');
  if (
    String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim() !== CONTENT_TYPE
  )
    return fail(res, 415, 'bad_type');
  const cl = Number(req.headers['content-length']);
  if (Number.isFinite(cl) && cl > MAX_BODY) return fail(res, 413, 'too_large');

  const now = Date.now();
  recent = recent.filter((t) => now - t < 3600_000);
  if (recent.length >= REPORTS_PER_HOUR) {
    // Seconds until the oldest slot in the window frees up.
    res.set(
      'Retry-After',
      String(Math.max(1, Math.ceil((recent[0] + 3600_000 - now) / 1000)))
    );
    return fail(res, 429, 'rate_limited');
  }
  // Reserve the slot BEFORE any await so parallel posts cannot all pass the
  // check; give it back unless the report was filed.
  const slot = { t: now };
  recent.push(slot.t);
  try {
    await fileReport(req, res, host);
  } finally {
    if (!res.locals.filed) {
      const i = recent.indexOf(slot.t);
      if (i >= 0) recent.splice(i, 1);
    }
  }
}

/**
 * Body of POST /api/report after the gates and the rate-slot reservation.
 * Sets res.locals.filed when a bead was created.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string | undefined} host
 */
async function fileReport(req, res, host) {
  const body = await readBody(req);
  if (!body) return fail(res, 413, 'too_large');
  if (body.length < 4) return fail(res, 400, 'bad_request');
  const metaLen = body.readUInt32BE(0);
  if (metaLen < 2 || metaLen > MAX_META || 4 + metaLen > body.length)
    return fail(res, 400, 'bad_request');

  /** @type {any} */
  let meta;
  try {
    meta = JSON.parse(body.toString('utf8', 4, 4 + metaLen));
  } catch {
    return fail(res, 400, 'bad_request');
  }
  if (!meta || typeof meta !== 'object') return fail(res, 400, 'bad_request');
  const { project, text, version } = meta;
  if (
    typeof project !== 'string' ||
    typeof text !== 'string' ||
    typeof version !== 'string'
  )
    return fail(res, 400, 'bad_request');
  const ver = normalizeVersion(version);
  if (!ver) return fail(res, 400, 'version_required');
  if (!VERSION_RE.test(ver)) return fail(res, 400, 'bad_version');
  const msg = text.trim();
  // eslint-disable-next-line no-control-regex
  if (!msg || Array.from(msg).length > MAX_TEXT || /\u0000/.test(msg))
    return fail(res, 400, 'bad_text');
  if (hasSecret(msg) || hasSecret(ver)) return fail(res, 400, 'secret_refused');
  const root = projects().get(project);
  if (!root) return fail(res, 400, 'unknown_project');

  const imgBytes = body.subarray(4 + metaLen);
  if (imgBytes.length > MAX_IMAGE) return fail(res, 413, 'too_large');
  let img = null;
  if (imgBytes.length > 0) {
    img = sanitizeImage(imgBytes);
    if (!img) return fail(res, 415, 'bad_image');
  }

  // Store the image (content-addressed; remember whether this call created it).
  let rel = '';
  let created = false;
  let abs = '';
  if (img) {
    const d = new Date();
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const name = createHash('sha256')
      .update(img.data)
      .digest('hex')
      .slice(0, 16);
    rel = `${project}/${ym}/${name}.${img.ext}`;
    abs = path.join(attachRoot(), project, ym, `${name}.${img.ext}`);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      try {
        fs.writeFileSync(abs, img.data, { flag: 'wx' });
        created = true;
      } catch (e) {
        if (/** @type {any} */ (e).code !== 'EEXIST') throw e;
      }
    } catch {
      return fail(res, 500, 'not_filed');
    }
  }

  const firstLine = Array.from(msg.split(/\r?\n/).find((l) => l.trim()) || msg)
    .slice(0, 60)
    .join('')
    .trim();
  const title = `[v${ver}] ${firstLine}`;
  const desc =
    `${msg}\n\nVersion: ${ver}` +
    (rel ? `\nScreenshot: [${rel}](/att/${rel})` : '');
  const metadata = {
    created_via: 'board-report',
    version: ver,
    attachments: rel ? [rel] : []
  };
  const r = await createWithRetry(
    [
      'create',
      title,
      '-t',
      'bug',
      '-l',
      'owner-report',
      '-d',
      desc,
      '--metadata',
      JSON.stringify(metadata),
      '--actor',
      'owner-board',
      '--silent'
    ],
    { cwd: root }
  );
  const id = r.code === 0 ? r.stdout.trim().split(/\s+/)[0] : '';
  if (!id) {
    if (created) {
      try {
        fs.unlinkSync(abs);
      } catch {
        // already gone
      }
    }
    return fail(res, 500, 'not_filed');
  }
  res.locals.filed = true;
  const wake = await emitWake({
    kind: 'report',
    repo: project,
    bead: id,
    via: viaFromHost(host)
  });
  res.status(200).json({ ok: true, id, wake, image: rel || null });
}

/**
 * Which door answered: the app's door, set by createApp.
 *
 * @param {import('express').Request} req
 * @returns {'pc' | 'phone'}
 */
function doorOf(req) {
  return req.app.locals.door === 'phone' ? 'phone' : 'pc';
}

/**
 * Phone door only (SEC B4): an image is served only when the bead that owns
 * it is found and is not a desk bead. Fail closed on any doubt.
 *
 * @param {string} project
 * @param {string} rel  project/yyyy-mm/name.ext
 * @returns {Promise<boolean>}
 */
async function attOwnerIsNonDesk(project, rel) {
  const root = projects().get(project);
  if (!root) return false;
  const r = await runBdJson(
    [
      'list',
      '--all',
      '--limit',
      '0',
      '--has-metadata-key',
      'attachments',
      '--json'
    ],
    { cwd: root }
  );
  if (r.code !== 0 || !Array.isArray(r.stdoutJson)) return false;
  const owners = r.stdoutJson.filter(
    (/** @type {any} */ b) =>
      Array.isArray(b?.metadata?.attachments) &&
      b.metadata.attachments.includes(rel)
  );
  return (
    owners.length > 0 && owners.every((/** @type {any} */ b) => !isDeskIssue(b))
  );
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleAtt(req, res) {
  const m = ATT_RE.exec(req.path);
  if (!m) return fail(res, 404, 'not_found');
  const [, project, ym, name, ext] = m;
  if (doorOf(req) === 'phone') {
    let ok = false;
    try {
      ok = await attOwnerIsNonDesk(project, `${project}/${ym}/${name}.${ext}`);
    } catch {
      ok = false;
    }
    if (!ok) return fail(res, 404, 'not_found');
  }
  try {
    const root = fs.realpathSync(attachRoot());
    const real = fs.realpathSync(
      path.join(root, project, ym, `${name}.${ext}`)
    );
    if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile())
      return fail(res, 404, 'not_found');
    res.setHeader('Content-Type', MIME[/** @type {'png'} */ (ext)]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(real);
  } catch {
    fail(res, 404, 'not_found');
  }
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerRoute((/** @type {import('express').Express} */ app) => {
    app.post('/api/report', (req, res) => {
      handleReport(req, res).catch(() => {
        if (!res.headersSent) fail(res, 500, 'not_filed');
      });
    });
    app.get('/att/*splat', (req, res) => {
      handleAtt(req, res).catch(() => fail(res, 404, 'not_found'));
    });
  });
}
