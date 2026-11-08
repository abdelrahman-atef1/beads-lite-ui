/**
 * Releases (beads-lite-1bo5.6.36): a read-only view over `OUTPUT v1 deploy|build`
 * comments (ADR 0007, `output add`) of every registered project.
 *
 *   releases-list {project?, kind?, more?} -> { releases, total, has_more,
 *                                               skipped, degraded }
 *   releases-get  {project, id}            -> { tasks, more, git_failed }
 * Release = { id, project, name, bead, kind, label, commit, ref_type, href,
 *             path, by, at (ms), n_tasks? }
 * Task    = { id, title, status, closed_at (ms | null), via }
 *
 * A release is one valid record comment (no guessing from free text). Its
 * tasks are the carrying bead, that bead's closed descendants, and beads named
 * in commit subjects between the previous release of the same kind (that has
 * a commit) and this one, read in the project folder and its code repos.
 *
 * Cost: nothing runs until a screen opens or the notifier scans. One `bd
 * export` per project, kept until that project's database changes (one fs
 * watcher per project, no timer); task lists (git ranges) are cached the same
 * way. A project that cannot be read is skipped with its name; a git failure
 * drops only the commit part. Nothing here writes to a bead or a repo.
 */
import path from 'node:path';
import { debug } from '../logging.js';
import { isDeskIssue } from '../phone.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';
import { watchDb } from '../watcher.js';
import { projectKey } from './decisions-feed.js';
import {
  codeRepos,
  idsInSubject,
  loadSecurity,
  parseExport,
  realExport,
  realGit
} from './outputs.js';

const log = debug('releases');

export const PAGE = 30;
const MAX_PAGES = 7;
const MAX_TASKS = 200;
const MAX_DEPTH = 4;
const GIT_RANGE_COMMITS = 2000;
const GIT_CONCURRENCY = 4;
const KINDS = new Set(['deploy', 'build']);
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
// control and bidi-override characters never reach the screen
// eslint-disable-next-line no-control-regex
const BAD_RE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

/** @param {string} code */
function refuse(code) {
  return Object.assign(new Error(code), { code });
}

/** @param {unknown} s @param {number} max */
function clean(s, max) {
  return [...String(s ?? '').replace(BAD_RE, ' ')].slice(0, max).join('');
}

/**
 * Run `fn` over `items`, at most `n` at a time.
 *
 * @param {any[]} items
 * @param {number} n
 * @param {(item: any) => Promise<void>} fn
 */
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(n, items.length) },
    async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    }
  );
  await Promise.all(workers);
}

/**
 * Release records of one parsed export, newest first. Pure.
 *
 * @param {{ rows: Map<string, any>, comments: Map<string, any[]> }} snap
 * @param {{ parseOutputComment: (t: string) => any } | null} validator
 * @param {{ key: string, name: string }} proj
 */
export function releasesOf(snap, validator, proj) {
  /** @type {any[]} */
  const out = [];
  if (!validator) return out;
  for (const [bead, row] of snap.rows) {
    const desk = isDeskIssue(row);
    const list = snap.comments.get(bead) || [];
    list.forEach((c, i) => {
      const rec = validator.parseOutputComment(String(c?.text ?? ''));
      if (!rec || !KINDS.has(rec.kind)) return;
      out.push({
        id: `${bead}~${clean(c.id || i, 40)}`,
        project: proj.key,
        name: proj.name,
        bead,
        kind: rec.kind,
        label: clean(rec.label, 80),
        commit: rec.commit || null,
        ref_type: rec.refType,
        href: rec.refType === 'url' ? rec.ref : null,
        path: rec.refType === 'path' ? clean(rec.ref, 200) : null,
        by: clean(c.author, 40),
        at: Date.parse(c.created_at) || 0,
        desk
      });
    });
  }
  out.sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
  return out;
}

/**
 * Tasks of the bead part: the carrying bead plus its closed descendants.
 *
 * @param {{ rows: Map<string, any>, kids: Map<string, any[]> }} snap
 * @param {string} bead
 * @returns {Map<string, { row: any, via: string }>}
 */
export function beadPart(snap, bead) {
  /** @type {Map<string, { row: any, via: string }>} */
  const found = new Map();
  const root = snap.rows.get(bead);
  if (root) found.set(bead, { row: root, via: 'bead' });
  let frontier = [bead];
  for (let d = 0; d < MAX_DEPTH && frontier.length; d++) {
    /** @type {string[]} */
    const next = [];
    for (const f of frontier) {
      for (const k of snap.kids.get(f) || []) {
        if (found.has(k.id)) continue;
        next.push(k.id);
        if (k.status === 'closed') found.set(k.id, { row: k, via: 'child' });
      }
    }
    frontier = next;
  }
  return found;
}

/**
 * @param {{
 *   listProjects?: () => Array<{ path: string }>,
 *   exportIssues?: (cwd: string) => Promise<string | null>,
 *   git?: (cwd: string, args: string[]) => Promise<string>,
 *   security?: () => Promise<{ validator: any }>,
 *   repos?: (root: string) => string[],
 *   watch?: (root: string, cb: () => void) => { close: () => void }
 * }} [opts]
 */
export function createReleases(opts = {}) {
  const listProjects = opts.listProjects || getAvailableWorkspaces;
  const exportIssues = opts.exportIssues || realExport;
  const git = opts.git || realGit;
  const reposOf = opts.repos || codeRepos;
  const watch =
    opts.watch ||
    ((root, cb) => watchDb(root, cb, { debounce_ms: 1500, cooldown_ms: 1000 }));
  /** @type {Promise<any> | null} */
  let secP = null;
  const security = () => (secP ??= (opts.security || loadSecurity)());

  /** @type {Map<string, any>} */
  const projects = new Map();

  /** @param {string} root */
  function entry(root) {
    const k = root.toLowerCase();
    let p = projects.get(k);
    if (p) return p;
    /** @type {any} */
    const np = { load: null, tasks: new Map(), close: () => {} };
    try {
      const w = watch(root, () => {
        np.load = null;
        np.tasks.clear();
      });
      np.close = () => w.close();
    } catch (e) {
      np.nocache = true;
      log('no watcher for %s: %o', root, e);
    }
    projects.set(k, np);
    return np;
  }

  /**
   * One project: { snap, releases } or null when unreadable. Cached until the
   * project's database changes; `fresh` re-reads (the notifier, after a change).
   *
   * @param {{ path: string, key: string, name: string }} proj
   * @param {boolean} [fresh]
   * @returns {Promise<{ snap: any, releases: any[] } | null>}
   */
  function read(proj, fresh = false) {
    const p = entry(proj.path);
    if (p.load && !fresh) return p.load;
    p.tasks.clear();
    const pr = (async () => {
      const sec = await security();
      const text = await exportIssues(proj.path).catch(() => null);
      if (!text) return null;
      const snap = parseExport(text);
      return { snap, releases: releasesOf(snap, sec.validator, proj) };
    })().catch((e) => {
      log('read %s failed: %o', proj.key, e);
      return null;
    });
    if (!p.nocache) {
      p.load = pr;
      // an unreadable project is not remembered
      void pr.then((v) => {
        if (!v && p.load === pr) p.load = null;
      });
    }
    return pr;
  }

  function registered() {
    /** @type {Map<string, { path: string, key: string, name: string }>} */
    const m = new Map();
    for (const w of listProjects()) {
      const key = projectKey(w.path);
      if (PROJECT_RE.test(key) && !m.has(key)) {
        m.set(key, { path: w.path, key, name: path.basename(w.path) });
      }
    }
    return m;
  }

  /**
   * Beads named in commit subjects between the previous release of the same
   * kind and this one. null = could not be read (git failure).
   *
   * @param {any} proj
   * @param {any[]} all - project releases, newest first
   * @param {any} rel
   * @returns {Promise<string[] | null>} lower-case ids; [] when no range
   */
  async function commitIds(proj, all, rel) {
    if (!rel.commit || !COMMIT_RE.test(rel.commit)) return [];
    const prev = all.find(
      (r) =>
        r.kind === rel.kind &&
        r.commit &&
        COMMIT_RE.test(r.commit) &&
        (r.at < rel.at || (r.at === rel.at && r.id > rel.id))
    );
    if (!prev || prev.commit === rel.commit) return [];
    /** @type {Set<string>} */
    const ids = new Set();
    let ok = 0;
    const dirs = [proj.path, ...reposOf(proj.path)];
    for (const dir of dirs) {
      try {
        const out = await git(dir, [
          'log',
          '--format=%s',
          `-n${GIT_RANGE_COMMITS}`,
          `${prev.commit}..${rel.commit}`
        ]);
        ok += 1;
        for (const line of out.split('\n')) {
          for (const id of idsInSubject(line)) ids.add(id);
        }
      } catch (e) {
        log('git range failed in %s: %o', dir, e);
      }
    }
    return ok ? [...ids] : null;
  }

  /**
   * Tasks of one release (cached until the project's database changes).
   *
   * @param {any} proj
   * @param {{ snap: any, releases: any[] }} data
   * @param {any} rel
   * @param {boolean} phone
   */
  async function tasksOf(proj, data, rel, phone) {
    const p = entry(proj.path);
    const ck = `${rel.id}|${phone}`;
    const hit = p.tasks.get(ck);
    if (hit) return hit;
    const found = beadPart(data.snap, rel.bead);
    const ids = await commitIds(proj, data.releases, rel);
    if (ids) {
      const lower = new Map(
        [...data.snap.rows.keys()].map((k) => [k.toLowerCase(), k])
      );
      for (const lid of ids) {
        const real = lower.get(lid);
        if (real && !found.has(real)) {
          found.set(real, { row: data.snap.rows.get(real), via: 'commit' });
        }
      }
    }
    /** @type {any[]} */
    const tasks = [];
    for (const [id, { row, via }] of found) {
      if (phone && isDeskIssue(row)) continue;
      tasks.push({
        id,
        title: clean(row.title, 200),
        status: String(row.status || ''),
        closed_at: Date.parse(row.closed_at) || null,
        via
      });
    }
    tasks.sort(
      (a, b) =>
        (b.closed_at || 0) - (a.closed_at || 0) || (a.id < b.id ? -1 : 1)
    );
    const res = {
      tasks: tasks.slice(0, MAX_TASKS),
      more: Math.max(0, tasks.length - MAX_TASKS),
      git_failed: ids === null
    };
    if (!p.nocache) p.tasks.set(ck, res);
    return res;
  }

  /** @param {any} ws */
  const isPhone = (ws) => ws?.door === 'phone';

  return {
    /**
     * @param {any} payload
     * @param {{ ws?: any }} ctx
     */
    async list(payload, ctx) {
      const want = payload?.project;
      const kind = payload?.kind;
      if (
        (want != null &&
          (typeof want !== 'string' || !PROJECT_RE.test(want))) ||
        (kind != null && !KINDS.has(kind))
      ) {
        throw refuse('bad_input');
      }
      const more = Number(payload?.more);
      const pages =
        Number.isInteger(more) && more >= 0 && more < MAX_PAGES ? more : 0;
      const phone = isPhone(ctx.ws);
      const sec = await security();
      const all = [...registered().values()];
      const reads = await Promise.all(
        all.map(async (proj) => ({ proj, data: await read(proj) }))
      );
      const skipped = reads.filter((r) => !r.data).map((r) => r.proj.name);
      /** @type {any[]} */
      let rel = reads.flatMap((r) =>
        r.data && (!want || r.proj.key === want)
          ? r.data.releases.map((x) => ({ x, proj: r.proj, data: r.data }))
          : []
      );
      rel = rel.filter(
        (r) => (!kind || r.x.kind === kind) && !(phone && r.x.desk)
      );
      rel.sort((a, b) => b.x.at - a.x.at || (a.x.id < b.x.id ? -1 : 1));
      const total = rel.length;
      const cap = (pages + 1) * PAGE;
      const page = rel.slice(0, cap);
      await pool(page, GIT_CONCURRENCY, async (r) => {
        const t = await tasksOf(r.proj, r.data, r.x, phone);
        r.n = t.tasks.length;
      });
      return {
        releases: page.map((r) => {
          const out = { ...r.x, n_tasks: r.n };
          delete out.desk;
          return out;
        }),
        total,
        has_more: total > cap,
        skipped,
        degraded: !sec.validator
      };
    },
    /**
     * @param {any} payload
     * @param {{ ws?: any }} ctx
     */
    async get(payload, ctx) {
      const key = payload?.project;
      const id = payload?.id;
      if (
        typeof key !== 'string' ||
        !PROJECT_RE.test(key) ||
        typeof id !== 'string' ||
        id.length > 128
      ) {
        throw refuse('bad_input');
      }
      const proj = registered().get(key);
      if (!proj) throw refuse('not_found');
      const data = await read(proj);
      if (!data) throw refuse('unreadable');
      const rel = data.releases.find((r) => r.id === id);
      if (!rel || (isPhone(ctx.ws) && rel.desk)) throw refuse('not_found');
      return tasksOf(proj, data, rel, isPhone(ctx.ws));
    },
    /**
     * For the notifier: releases of one project folder, re-read now. null when
     * the project cannot be read.
     *
     * @param {string} cwd
     */
    async scan(cwd) {
      const key = projectKey(cwd);
      const data = await read(
        { path: cwd, key, name: path.basename(cwd) },
        true
      );
      return data ? data.releases : null;
    },
    close() {
      for (const p of projects.values()) p.close();
      projects.clear();
    }
  };
}

/** @type {ReturnType<typeof createReleases> | null} */
let shared = null;
export function getReleases() {
  shared ??= createReleases();
  return shared;
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  seam.registerHandler(
    'releases-list',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      getReleases().list(req.payload || {}, ctx),
    { phone: true }
  );
  seam.registerHandler(
    'releases-get',
    (/** @type {any} */ req, /** @type {any} */ ctx) =>
      getReleases().get(req.payload || {}, ctx),
    { phone: true }
  );
}
