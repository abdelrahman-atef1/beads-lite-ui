/**
 * GET /api/local-img?ref=<text>&bead=<id>&w=<workspace path>
 *
 * Serves an image that an agent named in a bead (a bare file name, a
 * project-relative path, or an absolute path). Both doors, same code
 * (beads-lite-1bo5.6.28.2).
 *
 * Confinement (the reason this file exists in this shape):
 *  - the client never names a directory: `w` only counts if it equals a
 *    registered workspace path;
 *  - the candidate is realpath'd (symlinks, junctions, ".." resolve first) and
 *    must sit under a registered workspace root, a sibling "<root>-wt-*"
 *    worktree folder, or ~/company; everything else is 404;
 *  - image extensions only (no svg), no .git/.beads/.ssh/node_modules/.env
 *    segment, <= 12 MB, and the first bytes must really be an image;
 *  - every failure is the same 404.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAvailableWorkspaces } from '../registry-watcher.js';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REF = 400;
const EXT = /\.(png|jpe?g|webp|gif)$/i;
const BEAD_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BAD_SEG = /^(\.git|\.beads|\.ssh|node_modules|\.env.*)$/i;
const MIME = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};
const SEARCH_DEPTH = 4;
const SEARCH_ENTRIES = 3000;
const SUBS = ['out', 'scratch', 'logs'];

/** @param {string} p */
const norm = (p) => p.replace(/\\/g, '/');

/** @param {string} p */
function real(p) {
  try {
    // .native expands 8.3 short names (GIT~1 -> .git) that BAD_SEG must see.
    return fs.realpathSync.native(p);
  } catch {
    return '';
  }
}

/**
 * @param {string} p
 * @param {string} root
 */
function under(p, root) {
  const a = process.platform === 'win32' ? p.toLowerCase() : p;
  const b = process.platform === 'win32' ? root.toLowerCase() : root;
  return a.startsWith(b + path.sep);
}

/** @param {Buffer} b */
function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG')
    return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'jpeg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF')
    return b.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : '';
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return '';
}

/**
 * Bounded breadth-first search for a file name inside dir.
 *
 * @param {string} dir
 * @param {string} name
 */
function findByName(dir, name) {
  const want = name.toLowerCase();
  let seen = 0;
  /** @type {Array<[string, number]>} */
  const q = [[dir, 0]];
  while (q.length) {
    const [d, depth] = /** @type {[string, number]} */ (q.shift());
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (++seen > SEARCH_ENTRIES) return '';
      if (e.isFile() && e.name.toLowerCase() === want)
        return path.join(d, e.name);
      if (e.isDirectory() && depth < SEARCH_DEPTH && !BAD_SEG.test(e.name))
        q.push([path.join(d, e.name), depth + 1]);
    }
  }
  return '';
}

/**
 * Allowed roots: registered workspaces, their -wt-* siblings, ~/company.
 * `real` = realpath'd (final check); `lex` = real plus the spelled-out form
 * (lexical pre-check, before any filesystem call on a candidate).
 */
function allowedRoots() {
  /** @type {string[]} */
  const roots = [];
  /** @type {string[]} */
  const lex = [];
  const add = (/** @type {string} */ p) => {
    const r = real(p);
    if (!r) return;
    if (!roots.includes(r)) roots.push(r);
    for (const x of [r, path.resolve(p)]) if (!lex.includes(x)) lex.push(x);
  };
  for (const w of getAvailableWorkspaces()) {
    add(w.path);
    const parent = path.dirname(path.resolve(w.path));
    const base = path.basename(path.resolve(w.path));
    try {
      for (const e of fs.readdirSync(parent, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.startsWith(base + '-wt-'))
          add(path.join(parent, e.name));
      }
    } catch {
      // parent unreadable: skip siblings
    }
  }
  add(path.join(os.homedir(), 'company'));
  return { real: roots, lex };
}

/**
 * @param {string} ref
 * @param {string} bead
 * @param {string} w
 * @returns {{ file: string, kind: string } | null}
 */
export function resolveLocalImage(ref, bead, w) {
  if (!ref || ref.length > MAX_REF || ref.includes('\0')) return null;
  const r = norm(ref.trim()).replace(/^file:\/+/i, '');
  if (!EXT.test(r)) return null;
  // R1: a UNC / device path ("//host/share") makes realpath open an
  // SMB connection; "?" is never in a real file ref here.
  if (r.startsWith('//') || r.includes('?')) return null;
  // R4: no ":" after an optional drive prefix (NTFS alternate data streams).
  if (r.replace(/^[A-Za-z]:\//, '').includes(':')) return null;
  if (bead && !BEAD_RE.test(bead)) bead = '';
  const spaces = getAvailableWorkspaces().map((x) => path.resolve(x.path));
  const wr = w ? path.resolve(w) : '';
  const ordered = [
    ...spaces.filter((p) => p === wr),
    ...spaces.filter((p) => p !== wr)
  ];
  /** @type {string[]} */
  const cands = [];
  if (r.startsWith('~/')) cands.push(path.join(os.homedir(), r.slice(2)));
  else if (/^[A-Za-z]:\//.test(r) || r.startsWith('/')) {
    cands.push(r);
    // Old beads cite a drive that no longer exists.
    if (/^[A-Za-z]:\/Projects\//i.test(r)) cands.push('E:' + r.slice(2));
  } else {
    const rel = r.replace(/^\.\//, '');
    for (const root of ordered) {
      cands.push(path.join(root, rel));
      if (bead)
        for (const sub of SUBS)
          cands.push(path.join(root, '.work', sub, bead, rel));
    }
  }
  const roots = allowedRoots();
  /** @param {string} c */
  const accept = (c) => {
    // R1: lexical check first, so nothing outside a root is ever touched.
    const lc = path.resolve(c);
    if (lc.startsWith('\\\\') || !roots.lex.some((x) => under(lc, x)))
      return '';
    const rp = real(c);
    if (!rp || rp.startsWith('\\\\')) return '';
    if (rp.replace(/^[A-Za-z]:/, '').includes(':')) return '';
    if (!roots.real.some((x) => under(rp, x))) return '';
    if (rp.split(path.sep).some((s) => BAD_SEG.test(s))) return '';
    return rp;
  };
  let file = '';
  for (const c of cands) {
    file = accept(c);
    if (file) break;
  }
  if (!file && bead && !r.includes('/')) {
    for (const root of ordered) {
      for (const sub of SUBS) {
        const f = findByName(path.join(root, '.work', sub, bead), r);
        file = f ? accept(f) : '';
        if (file) break;
      }
      if (file) break;
    }
  }
  if (!file) return null;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_BYTES || st.size < 16) return null;
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const kind = sniff(head);
    return kind ? { file, kind } : null;
  } catch {
    return null;
  }
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerRoute((/** @type {import('express').Express} */ app) => {
    app.get('/api/local-img', (req, res) => {
      /** @param {string} k */
      const q = (k) =>
        typeof req.query[k] === 'string'
          ? /** @type {string} */ (req.query[k])
          : '';
      // R2: another site's page (<img src=...>) must not probe this door.
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') {
        res.status(404).type('text/plain').send('not_found');
        return;
      }
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      const hit = resolveLocalImage(q('ref'), q('bead'), q('w'));
      if (!hit) {
        res.status(404).type('text/plain').send('not_found');
        return;
      }
      res.setHeader(
        'Content-Type',
        MIME[/** @type {'png'} */ (hit.kind)] || 'application/octet-stream'
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'"
      );
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.sendFile(hit.file, { dotfiles: 'allow' }, () => {});
    });
  });
}
