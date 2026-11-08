/**
 * Outputs of a bead (ADR 0007 section 3, O1-O4; beads-lite-1bo5.6.18).
 *
 *   outputs-get     {id, more?}   -> Result  (phone door allowed)
 *   outputs-project {more?}       -> Result  (the active project; phone allowed)
 * Result = { project, root, beads:[{id,title,status}], items:Item[], has_more,
 *            degraded }
 * Item   = { src: 'commit'|'record'|'mention'|'attachment', kind, label, bead,
 *            at (ms), by, href|null, ref_type|null, sha?, landed?, branch?,
 *            remote?, att? }
 *
 * Four sources: git commits (bead id in the subject), `OUTPUT v1` comment
 * records, https links mentioned in comments, report images in
 * metadata.attachments (shown from /att/ only).
 *
 * SEC (company-1bo5.6.15 O1-O4):
 *  O1 every record is re-validated here by the shared validator
 *     (~/company/scripts/outputs/validate.mjs); no validator = no records and
 *     no mentioned links (fail closed), the comment stays a plain comment.
 *  O2 links: https, or http only for loopback / tailnet host, no userinfo, no
 *     token-like query; paths are text only. Nothing here serves a file.
 *  O3 on the phone door a desk bead (isDeskIssue) is dropped from every
 *     rollup, so its commit subjects and links never show in a parent panel.
 *  O4 the remote link is built from a parsed github.com remote; userinfo is
 *     stripped, any other form gives no link; the raw remote is never sent.
 *
 * Cost: nothing runs until a panel opens. Per bead items are cached until the
 * project's database changes (one fs watcher per project, no timer); a reopen
 * without a change spawns no bd. Git is read incrementally per repo: one
 * for-each-ref on open, `git log` only for commits not seen before.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBd, runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { watchDb } from '../watcher.js';
import { cardsDirs, projectKey } from './decisions-feed.js';

const log = debug('outputs');

export const PAGE_BEADS = 50;
/** After a failed `bd export`, wait this long before trying it again. */
const FAIL_RETRY_MS = 30000;
const MAX_PAGES = 20;
const MAX_DEPTH = 4;
const MAX_ITEMS = 400;
const MAX_MENTIONS_PER_BEAD = 20;
const MAX_COMMITS_PER_BEAD = 100;
const GIT_MAX_COMMITS = 20000;
const MAX_CODE_REPOS = 5;
const SUBJECT_MAX = 200;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
const ID_TOKEN_RE = /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+(?:\.\d+)*/g;
const ATT_RE =
  /^[a-z0-9][a-z0-9_-]{0,39}\/\d{4}-\d{2}\/[0-9a-f]{16}\.(?:png|jpg|webp)$/;
const ATT_IN_TEXT_RE =
  /\/att\/([a-z0-9][a-z0-9_-]{0,39}\/\d{4}-\d{2}\/[0-9a-f]{16}\.(?:png|jpg|webp))/g;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'`\])}]+/g;
// control and bidi-override characters never reach the screen
// eslint-disable-next-line no-control-regex
const BAD_CHARS_RE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;
const GH_OWNER_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98})$/;

/** @param {string} code */
function refuse(code) {
  return Object.assign(new Error(code), { code });
}

/** @param {unknown} s - @param {number} max */
function clean(s, max) {
  return [...String(s ?? '').replace(BAD_CHARS_RE, ' ')].slice(0, max).join('');
}

/**
 * O4: https://github.com/<owner>/<repo>/commit/<sha> from a remote url, or ''.
 * userinfo (a token in https://<token>@github.com/...) is dropped; any other
 * host or form gives ''.
 *
 * @param {string} remote
 * @param {string} sha
 */
export function commitUrl(remote, sha) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return '';
  const raw = String(remote || '').trim();
  /** @type {string} */
  let owner = '';
  /** @type {string} */
  let repo = '';
  const scp =
    /^[A-Za-z0-9._-]+@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(
      raw
    );
  if (scp) {
    [, owner, repo] = scp;
  } else {
    /** @type {URL} */
    let u;
    try {
      u = new URL(raw);
    } catch {
      return '';
    }
    if (!['https:', 'ssh:', 'git:'].includes(u.protocol)) return '';
    if (u.hostname.toLowerCase() !== 'github.com') return '';
    if (u.protocol === 'https:' && u.port) return '';
    const m = /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(u.pathname);
    if (!m) return '';
    [, owner, repo] = m;
  }
  if (!GH_OWNER_REPO_RE.test(owner) || !GH_OWNER_REPO_RE.test(repo)) return '';
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

/**
 * Ids named in a commit subject, lower-case.
 *
 * @param {string} subject
 */
export function idsInSubject(subject) {
  const out = new Set();
  for (const m of String(subject).matchAll(ID_TOKEN_RE)) {
    out.add(m[0].toLowerCase());
  }
  return [...out];
}

/** @param {string} url - @returns {string} */
function trimUrl(url) {
  return url.replace(/[.,;:!?]+$/, '');
}

/**
 * Parse `git log` output made with the RECORD format below.
 *
 * @param {string} out
 */
export function parseGitLog(out) {
  /** @type {Array<{ sha: string, at: number, by: string, ref: string, subject: string }>} */
  const rows = [];
  for (const rec of String(out).split('\x1e')) {
    const f = rec.replace(/^\n+/, '').split('\x1f');
    if (f.length < 5 || !/^[0-9a-f]{40}$/.test(f[0])) continue;
    rows.push({
      sha: f[0],
      at: Number(f[1]) * 1000 || 0,
      by: f[2],
      ref: f[3],
      subject: f.slice(4).join('\x1f')
    });
  }
  return rows;
}

const LOG_FORMAT = '--format=%H%x1f%ct%x1f%an%x1f%S%x1f%s%x1e';

/**
 * Per repo commit index, read incrementally.
 *
 * @param {{ git: (cwd: string, args: string[], input?: string) => Promise<string> }} deps
 */
export function createGitIndex(deps) {
  /** @type {Map<string, any>} */
  const repos = new Map();

  /** @param {string} cwd */
  async function refs(cwd) {
    const out = await deps.git(cwd, [
      'for-each-ref',
      '--format=%(objectname) %(refname)',
      'refs/heads',
      'refs/remotes',
      'refs/tags'
    ]);
    /** @type {Array<{ sha: string, ref: string }>} */
    const list = [];
    for (const line of out.split('\n')) {
      const m = /^([0-9a-f]{40}) (\S+)$/.exec(line.trim());
      if (m && !m[2].endsWith('/HEAD')) list.push({ sha: m[1], ref: m[2] });
    }
    return list.sort((a, b) => (a.ref < b.ref ? -1 : 1));
  }

  /** @param {string} cwd - @param {Array<{sha:string,ref:string}>} list */
  async function defaultRef(cwd, list) {
    const has = (/** @type {string} */ r) => list.find((x) => x.ref === r);
    for (const r of ['refs/heads/main', 'refs/heads/master']) {
      if (has(r)) return has(r);
    }
    try {
      const sym = (
        await deps.git(cwd, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])
      ).trim();
      if (has(sym)) return has(sym);
    } catch {
      // no origin/HEAD
    }
    return has('refs/remotes/origin/main') || has('refs/remotes/origin/master');
  }

  /**
   * @param {string} cwd
   * @returns {Promise<any>}
   */
  async function read(cwd) {
    const list = await refs(cwd);
    const stamp = list.map((x) => `${x.sha} ${x.ref}`).join('\n');
    let repo = repos.get(cwd);
    if (repo && repo.stamp === stamp) return repo;
    if (!repo) {
      repo = {
        stamp: '',
        tips: [],
        commits: new Map(),
        byId: new Map(),
        landed: new Set(),
        landedTip: '',
        remote: null
      };
      repos.set(cwd, repo);
    }
    if (repo.remote === null) {
      try {
        repo.remote = (
          await deps.git(cwd, ['config', '--get', 'remote.origin.url'])
        ).trim();
      } catch {
        repo.remote = '';
      }
    }
    try {
      if (await rewritten(cwd, repo, list)) reset(repo);
      await scan(cwd, repo, list);
    } catch (e) {
      // an old tip vanished (gc, rewrite): start this repo over once
      log('git scan failed, rescanning: %o', e);
      reset(repo);
      await scan(cwd, repo, list);
    }
    repo.stamp = stamp;
    return repo;
  }

  /** @param {any} repo */
  function reset(repo) {
    repo.commits.clear();
    repo.byId.clear();
    repo.landed.clear();
    repo.landedTip = '';
    repo.tips = [];
  }

  /**
   * True when a tip we indexed before is no longer reachable from any ref
   * (amend, rebase, deleted branch). A plain fast-forward is not a rewrite.
   *
   * @param {string} cwd
   * @param {any} repo
   * @param {Array<{sha:string,ref:string}>} list
   */
  async function rewritten(cwd, repo, list) {
    const now = new Set(list.map((x) => x.sha));
    const gone = /** @type {string[]} */ (repo.tips).filter((t) => !now.has(t));
    if (!gone.length) return false;
    const input = [...gone, ...list.map((x) => `^${x.sha}`)].join('\n');
    const out = await deps.git(
      cwd,
      ['rev-list', '--max-count=1', '--stdin'],
      input + '\n'
    );
    return out.trim().length > 0;
  }

  /**
   * @param {string} cwd
   * @param {any} repo
   * @param {Array<{sha:string,ref:string}>} list
   */
  async function scan(cwd, repo, list) {
    const seen = new Set(repo.tips);
    const input = [
      ...list.map((x) => x.ref),
      ...[...seen].map((s) => `^${s}`)
    ].join('\n');
    if (list.length) {
      const out = await deps.git(
        cwd,
        [
          'log',
          '--stdin',
          '--source',
          `--max-count=${GIT_MAX_COMMITS}`,
          LOG_FORMAT
        ],
        input + '\n'
      );
      for (const r of parseGitLog(out)) {
        if (repo.commits.has(r.sha)) continue;
        const ids = idsInSubject(r.subject);
        if (!ids.length) continue;
        const c = {
          sha: r.sha,
          at: r.at,
          by: r.by,
          ref: r.ref,
          subject: r.subject,
          ids
        };
        repo.commits.set(r.sha, c);
        for (const id of ids) {
          const arr = repo.byId.get(id) || [];
          arr.push(c);
          repo.byId.set(id, arr);
        }
      }
    }
    repo.tips = [...new Set(list.map((x) => x.sha))];
    await landed(cwd, repo, list);
  }

  /**
   * Landed means reachable from the default branch; updated by range.
   *
   * @param {string} cwd
   * @param {any} repo
   * @param {Array<{ sha: string, ref: string }>} list
   */
  async function landed(cwd, repo, list) {
    const d = await defaultRef(cwd, list);
    if (!d) return;
    if (d.sha === repo.landedTip) return;
    let range = [d.sha];
    if (repo.landedTip) {
      let ff = true;
      try {
        await deps.git(cwd, [
          'merge-base',
          '--is-ancestor',
          repo.landedTip,
          d.sha
        ]);
      } catch {
        ff = false;
      }
      if (ff) range = [d.sha, `^${repo.landedTip}`];
      else repo.landed.clear();
    }
    const out = await deps.git(cwd, [
      'rev-list',
      `--max-count=${GIT_MAX_COMMITS}`,
      ...range
    ]);
    for (const line of out.split('\n')) {
      const s = line.trim();
      if (repo.commits.has(s)) repo.landed.add(s);
    }
    repo.landedTip = d.sha;
  }

  return { read };
}

/** Real git, hidden window, bounded. */
export function realGit(
  /** @type {string} */ cwd,
  /** @type {string[]} */ args,
  /** @type {string} */ input = ''
) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['-c', 'core.quotepath=off', ...args],
      {
        cwd,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 32 * 1024 * 1024
      },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout)))
    );
    if (input) child.stdin?.end(input);
    else child.stdin?.end();
  });
}

/** `bd export` output of one project; null on any failure. */
export async function realExport(/** @type {string} */ cwd) {
  const r = await runBd(['export'], {
    cwd,
    timeout_ms: 60000,
    priority: 'background'
  });
  return r.code === 0 ? r.stdout : null;
}

/**
 * Index the JSON lines of `bd export`.
 *
 * @param {string} text
 */
export function parseExport(text) {
  /** @type {Map<string, any>} */
  const rows = new Map();
  /** @type {Map<string, any[]>} */
  const kids = new Map();
  /** @type {Map<string, any[]>} */
  const comments = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!o || typeof o.id !== 'string' || o._type === 'memory') continue;
    rows.set(o.id, o);
    comments.set(o.id, Array.isArray(o.comments) ? o.comments : []);
    let parent = typeof o.parent === 'string' ? o.parent : '';
    if (!parent && Array.isArray(o.dependencies)) {
      const d = o.dependencies.find(
        (/** @type {any} */ x) => x?.type === 'parent-child'
      );
      parent = d && typeof d.depends_on_id === 'string' ? d.depends_on_id : '';
    }
    if (parent) {
      const arr = kids.get(parent) || [];
      arr.push(o);
      kids.set(parent, arr);
    }
  }
  return { rows, kids, comments };
}

/**
 * Code repos of a project besides its own folder: one path per line in
 * `.beads/code-repos` (relative paths resolve from the project folder; `#`
 * comments). Only folders with a `.git`, at most MAX_CODE_REPOS. No secrets.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function codeRepos(root) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(root, '.beads', 'code-repos'), 'utf8');
  } catch {
    return [];
  }
  const seen = new Set([path.resolve(root).toLowerCase()]);
  /** @type {string[]} */
  const out = [];
  for (const raw of text.split('\n').slice(0, 50)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.length > 300) continue;
    const dir = path.resolve(root, line);
    const key = dir.toLowerCase();
    if (seen.has(key) || !fs.existsSync(path.join(dir, '.git'))) continue;
    seen.add(key);
    out.push(dir);
    if (out.length >= MAX_CODE_REPOS) break;
  }
  return out;
}

/** Shared validator + secret scanner; null parts = fail closed. */
export async function loadSecurity() {
  /** @type {{ validator: any, scan: ((s: string) => any[]) | null }} */
  const out = { validator: null, scan: null };
  const dirs = [
    process.env.OUTPUTS_DIR,
    path.join(os.homedir(), 'company', 'scripts', 'outputs')
  ].filter(Boolean);
  for (const d of /** @type {string[]} */ (dirs)) {
    const f = path.join(d, 'validate.mjs');
    if (!fs.existsSync(f)) continue;
    try {
      out.validator = await import(pathToFileURL(f).href);
      break;
    } catch (e) {
      log('validator failed to load: %o', e);
    }
  }
  for (const dir of cardsDirs()) {
    const f = path.join(dir, 'rules.mjs');
    if (!fs.existsSync(f)) continue;
    try {
      const rules = await import(pathToFileURL(f).href);
      out.scan = rules.scanSecrets || null;
      break;
    } catch (e) {
      log('rules failed to load: %o', e);
    }
  }
  return out;
}

/**
 * @param {{
 *   listProjects?: () => Array<{ path: string }>,
 *   runBdJson?: typeof runBdJson,
 *   git?: (cwd: string, args: string[], input?: string) => Promise<string>,
 *   exportIssues?: ((cwd: string) => Promise<string | null>) | null,
 *   security?: () => Promise<{ validator: any, scan: ((s: string) => any[]) | null }>,
 *   watch?: (root: string, cb: () => void) => { close: () => void },
 *   now?: () => number
 * }} [opts]
 */
export function createOutputs(opts = {}) {
  const listProjects = opts.listProjects || getAvailableWorkspaces;
  const rawBd = opts.runBdJson || runBdJson;
  /** @type {typeof runBdJson} */
  const bdJson = (args, o) => {
    log('bd %s', args.slice(0, 3).join(' '));
    return rawBd(args, o);
  };
  const gitIndex = createGitIndex({ git: opts.git || realGit });
  // one `bd export` gives every bead, its parent and its comments (one process
  // instead of one per bead); a test that injects its own bd opts out
  const exportIssues =
    opts.exportIssues !== undefined
      ? opts.exportIssues
      : opts.runBdJson
        ? null
        : realExport;
  const watch =
    opts.watch ||
    ((root, cb) => watchDb(root, cb, { debounce_ms: 1500, cooldown_ms: 1000 }));
  /** @type {Promise<any> | null} */
  let secP = null;
  const security = () => (secP ??= (opts.security || loadSecurity)());

  /** @type {Map<string, Promise<any>>} */
  const inflight = new Map();

  /** @type {Map<string, { version: number, close: () => void, beads: Map<string, any>, kids: Map<string, any[]>, roots: Map<string, any>, snap: Promise<any> | null, exportFail?: { version: number, at: number } }>} */
  const projects = new Map();

  /** @param {string} root */
  function project(root) {
    const key = root.toLowerCase();
    let p = projects.get(key);
    if (p) return p;
    /** @type {any} */
    const np = {
      version: 0,
      close: () => {},
      beads: new Map(),
      kids: new Map(),
      roots: new Map(),
      snap: null
    };
    try {
      const w = watch(root, () => {
        np.version += 1;
        np.beads.clear();
        np.kids.clear();
        np.roots.clear();
        np.snap = null;
      });
      np.close = () => w.close();
    } catch (e) {
      // no watcher = no cache: every call re-reads (still correct)
      np.nocache = true;
      log('no watcher for %s: %o', root, e);
    }
    projects.set(key, np);
    return np;
  }

  /**
   * @param {string | undefined} root
   * @returns {{ path: string, key: string }}
   */
  function locateRoot(root) {
    if (!root) throw refuse('no_project');
    const hit = listProjects().find(
      (p) =>
        p.path.replace(/\\/g, '/').toLowerCase() ===
        root.replace(/\\/g, '/').toLowerCase()
    );
    const dir = hit ? hit.path : root;
    return { path: dir, key: projectKey(dir) };
  }

  /**
   * Items of one bead from its comments and metadata (no git).
   *
   * @param {any} row - bd row
   * @param {any[]} comments
   * @param {{ validator: any, scan: any }} sec
   */
  function beadItems(row, comments, sec) {
    /** @type {any[]} */
    const items = [];
    const recorded = new Set();
    const bead = String(row.id);
    const v = sec.validator;
    const at = (/** @type {any} */ s) => Date.parse(s) || 0;
    for (const c of comments) {
      const text = String(c?.text ?? '');
      const rec = v ? v.parseOutputComment(text) : null;
      if (rec) {
        recorded.add(rec.ref);
        items.push({
          src: 'record',
          kind: rec.kind,
          label: clean(rec.label, 80),
          bead,
          at: at(c.created_at),
          by: clean(c.author, 40),
          ref_type: rec.refType,
          href: rec.refType === 'url' ? rec.ref : null,
          path: rec.refType === 'path' ? clean(rec.ref, 200) : null,
          sha: rec.commit || null
        });
        continue;
      }
      if (v) {
        let n = 0;
        for (const m of text.matchAll(URL_IN_TEXT_RE)) {
          const url = trimUrl(m[0]);
          if (recorded.has(url) || n >= MAX_MENTIONS_PER_BEAD) continue;
          const chk = v.checkRef(url);
          if (chk.error || chk.type !== 'url') continue;
          if (sec.scan && sec.scan(url).length) continue;
          if (!sec.scan) continue;
          recorded.add(url);
          n += 1;
          items.push({
            src: 'mention',
            kind: 'link',
            label: clean(url, 120),
            bead,
            at: at(c.created_at),
            by: clean(c.author, 40),
            ref_type: 'url',
            href: url
          });
        }
      }
      for (const m of text.matchAll(ATT_IN_TEXT_RE)) {
        if (recorded.has(m[1])) continue;
        recorded.add(m[1]);
        items.push({
          src: 'attachment',
          kind: 'image',
          label: m[1].split('/').pop(),
          bead,
          at: at(c.created_at),
          by: clean(c.author, 40),
          ref_type: null,
          href: null,
          att: m[1]
        });
      }
    }
    const atts = row.metadata && row.metadata.attachments;
    if (Array.isArray(atts)) {
      for (const a of atts.slice(0, 10)) {
        if (typeof a !== 'string' || !ATT_RE.test(a) || recorded.has(a))
          continue;
        recorded.add(a);
        items.push({
          src: 'attachment',
          kind: 'image',
          label: a.split('/').pop(),
          bead,
          at: Date.parse(row.updated_at) || 0,
          by: '',
          ref_type: null,
          href: null,
          att: a
        });
      }
    }
    return items;
  }

  /**
   * The whole project in memory (rows, children, comments), or null when the
   * export is unavailable (then the per bead path below is used).
   *
   * @param {{ path: string }} proj
   * @param {any} p - cache entry
   * @returns {Promise<{ rows: Map<string, any>, kids: Map<string, any[]>, comments: Map<string, any[]> } | null>}
   */
  function snapshot(proj, p) {
    if (!exportIssues) return Promise.resolve(null);
    if (p.snap) return p.snap;
    // a failed export is not retried per node: one try per FAIL_RETRY_MS
    if (
      p.exportFail &&
      p.exportFail.version === p.version &&
      Date.now() - p.exportFail.at < FAIL_RETRY_MS
    ) {
      return Promise.resolve(null);
    }
    const version = p.version;
    const pr = exportIssues(proj.path)
      .then((text) => (text ? parseExport(text) : null))
      .catch((e) => {
        log('export failed, reading per bead: %o', e);
        return null;
      });
    if (!p.nocache) {
      p.snap = pr;
      // a failed export is not remembered
      void pr.then((v) => {
        if (v) return;
        if (p.version === version) p.snap = null;
        p.exportFail = { version, at: Date.now() };
      });
    }
    return pr;
  }

  /**
   * @param {{ path: string }} proj
   * @param {any} p - cache entry
   * @param {any} row
   * @param {any} sec
   */
  async function beadEntry(proj, p, row, sec) {
    const stamp = `${p.version}|${row.updated_at}|${row.comment_count}`;
    const hit = p.beads.get(row.id);
    if (hit && hit.stamp === stamp) return hit;
    /** @type {any[]} */
    let comments = [];
    let failed = false;
    const snap = await snapshot(proj, p);
    if (snap) {
      comments = snap.comments.get(row.id) || [];
    } else if (Number(row.comment_count) > 0) {
      const r = await bdJson(['comments', row.id, '--json'], {
        cwd: proj.path,
        timeout_ms: 30000,
        priority: 'background'
      });
      if (r.code === 0 && Array.isArray(r.stdoutJson)) comments = r.stdoutJson;
      else failed = true;
    }
    const entry = {
      stamp,
      desk: isDeskIssue(row),
      row: { id: row.id, title: row.title, status: row.status },
      items: beadItems(row, comments, sec),
      failed
    };
    // a bead whose comments could not be read is not cached: next read retries
    if (!p.nocache && !failed) p.beads.set(row.id, entry);
    return entry;
  }

  /** @param {{ path: string }} proj - @param {any} p @param {string} id */
  async function children(proj, p, id) {
    const hit = p.kids.get(id);
    if (hit) return hit;
    const snap = await snapshot(proj, p);
    if (snap) return snap.kids.get(id) || [];
    const r = await bdJson(
      ['list', '--parent', id, '--status', 'all', '--json', '-n', '0'],
      { cwd: proj.path, timeout_ms: 30000, priority: 'background' }
    );
    const rows =
      r.code === 0 && Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
    if (!p.nocache) p.kids.set(id, rows);
    return rows;
  }

  /**
   * @param {any} sec
   * @param {{ path: string }} proj
   * @param {any[]} rows - beads in scope
   * @param {boolean} phone
   */
  async function collect(sec, proj, rows, phone) {
    const p = project(proj.path);
    const version = p.version;
    const gits = (
      await Promise.all(
        [proj.path, ...codeRepos(proj.path)].map((dir, i) =>
          gitIndex
            .read(dir)
            .then((g) => ({ g, name: i ? path.basename(dir) : '' }))
            .catch((e) => {
              log('git unreadable: %o', e);
              return null;
            })
        )
      )
    ).filter((x) => x !== null);
    /** @type {any[]} */
    const items = [];
    /** @type {any[]} */
    const beads = [];
    let skipped = 0;
    for (const row of rows) {
      const e = await beadEntry(proj, p, row, sec);
      if (phone && e.desk) continue;
      if (e.failed) skipped += 1;
      beads.push(e.row);
      items.push(...e.items);
      const lid = String(row.id).toLowerCase();
      const commits = gits
        .flatMap((x) =>
          (x.g.byId.get(lid) || []).map((/** @type {any} */ c) => ({
            c,
            repo: x.g,
            name: x.name
          }))
        )
        .sort((a, b) => b.c.at - a.c.at);
      for (const { c, repo, name } of commits.slice(0, MAX_COMMITS_PER_BEAD)) {
        const subject = clean(c.subject, SUBJECT_MAX);
        const blocked = !sec.scan || sec.scan(subject).length > 0;
        items.push({
          src: 'commit',
          kind: 'commit',
          label: blocked ? c.sha.slice(0, 8) : subject,
          bead: row.id,
          at: c.at,
          by: clean(c.by, 40),
          ref_type: null,
          href: null,
          sha: c.sha.slice(0, 10),
          landed: repo.landed.has(c.sha),
          branch: clean(
            c.ref.replace(/^refs\/(?:heads|remotes|tags)\//, ''),
            60
          ),
          remote: commitUrl(repo.remote, c.sha) || null,
          repo: clean(name, 60)
        });
      }
    }
    // a db change during the read: do not keep what we just cached
    if (p.version !== version) {
      p.beads.clear();
      p.kids.clear();
      p.roots.clear();
      p.snap = null;
    }
    items.sort((a, b) => b.at - a.at);
    return { beads, items: items.slice(0, MAX_ITEMS), skipped };
  }

  /** @param {any} ws */
  const isPhone = (ws) => ws?.door === 'phone';

  /** @param {unknown} more */
  const pages = (more) => {
    const n = Number(more);
    return Number.isInteger(n) && n >= 0 && n < MAX_PAGES ? n : 0;
  };

  return {
    /**
     * @param {any} payload
     * @param {{ ws?: any, root_dir?: string }} ctx
     */
    get(payload, ctx) {
      // one read per identical request in flight (a re-mount must not double the bd calls)
      const key = [
        ctx.root_dir,
        payload?.id,
        payload?.more,
        payload?.rollup,
        isPhone(ctx.ws)
      ].join('|');
      let p = inflight.get(key);
      if (!p) {
        p = this.getOnce(payload, ctx);
        inflight.set(key, p);
        const done = () => inflight.delete(key);
        p.then(done, done);
      }
      return p;
    },
    async getOnce(payload, ctx) {
      const id = payload?.id;
      if (typeof id !== 'string' || id.length > 64 || !BEAD_ID_RE.test(id)) {
        throw refuse('bad_input');
      }
      const proj = locateRoot(ctx.root_dir);
      const sec = await security();
      const p = project(proj.path);
      const cap = (pages(payload?.more) + 1) * PAGE_BEADS;
      const rootRow = await rootRowOf(proj, p, id);
      if (!rootRow) throw refuse('not_found');
      const scope = [rootRow];
      let frontier = [id];
      let depth = 0;
      let has_more = false;
      const own = payload?.rollup === false;
      while (!own && frontier.length && depth < MAX_DEPTH) {
        /** @type {string[]} */
        const next = [];
        for (const f of frontier) {
          for (const k of await children(proj, p, f)) {
            if (scope.length >= cap) {
              has_more = true;
              continue;
            }
            scope.push(k);
            next.push(k.id);
          }
        }
        frontier = next;
        depth += 1;
      }
      const out = await collect(sec, proj, scope, isPhone(ctx.ws));
      return {
        project: proj.key,
        root: id,
        beads: out.beads,
        items: out.items,
        has_more,
        degraded: !sec.validator || !sec.scan,
        skipped: out.skipped
      };
    },
    /**
     * @param {any} payload
     * @param {{ ws?: any, root_dir?: string }} ctx
     */
    async project(payload, ctx) {
      const proj = locateRoot(ctx.root_dir);
      const sec = await security();
      const cap = (pages(payload?.more) + 1) * PAGE_BEADS;
      const snap = await snapshot(proj, project(proj.path));
      /** @type {any[]} */
      let all;
      if (snap) {
        all = [...snap.rows.values()]
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
          .slice(0, cap + 1);
      } else {
        const r = await bdJson(
          [
            'list',
            '--all',
            '--sort',
            'updated',
            '--json',
            '-n',
            String(cap + 1)
          ],
          { cwd: proj.path, timeout_ms: 30000, priority: 'background' }
        );
        all = r.code === 0 && Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
      }
      const rows = all.slice(0, cap);
      const out = await collect(sec, proj, rows, isPhone(ctx.ws));
      return {
        project: proj.key,
        root: null,
        beads: out.beads,
        items: out.items,
        has_more: all.length > cap,
        degraded: !sec.validator || !sec.scan,
        skipped: out.skipped
      };
    },
    close() {
      for (const p of projects.values()) p.close();
      projects.clear();
    }
  };

  /** @param {{ path: string }} proj - @param {any} p @param {string} id */
  async function rootRowOf(proj, p, id) {
    const hit = p.roots.get(id);
    if (hit) return hit;
    const snap = await snapshot(proj, p);
    if (snap) return snap.rows.get(id) || null;
    const r = await bdJson(['show', id, '--json'], {
      cwd: proj.path,
      timeout_ms: 30000,
      priority: 'background'
    });
    if (r.code !== 0) return null;
    const row = Array.isArray(r.stdoutJson) ? r.stdoutJson[0] : r.stdoutJson;
    if (!row || row.id !== id) return null;
    if (!p.nocache) p.roots.set(id, row);
    return row;
  }
}

/** @type {ReturnType<typeof createOutputs> | null} */
let shared = null;
function outputs() {
  shared ??= createOutputs();
  return shared;
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'outputs-get',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      outputs().get(req.payload || {}, ctx),
    { phone: true }
  );
  seam.registerHandler(
    'outputs-project',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      outputs().project(req.payload || {}, ctx),
    { phone: true }
  );
}
