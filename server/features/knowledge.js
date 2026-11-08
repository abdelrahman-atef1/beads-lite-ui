/**
 * Knowledge tab "المعرفة" (beads-lite-1bo5.6.54; design learner-eqt1.92 v2).
 * Read-only: what the owner should do, know and try, taken from what the
 * learner already stores. No new store, no write path.
 *
 *   knowledge-get  {}              -> Snap  (phone door allowed)
 *   knowledge-note {topic, item}   -> { title, text }  (phone door allowed)
 * Snap = { has_notes, todo: Row[], todo_more, know: Row[], try: Row[],
 *          partial, updated_at }
 * Row  = { kind, title, line, at?, note?: {topic,item}, bead?: {id, path},
 *          caution? }
 *
 * Sources (all existing files):
 *  - topics/unsorted/items count, the link inbox done.jsonl (a link whose
 *    LAST line is failed or cookie_frozen), open `from-link` beads in the
 *    company project (one bd call).
 *  - item notes in knowledge/topics/<topic>/items/*.md: the Takeaways. The
 *    learner (learner-eqt1.94) tags a bullet "[do|know|try] text"; an untagged
 *    bullet is know, or try when it names a tool listed in the note's
 *    "Tools / apps named" section (the design's fallback).
 *
 * Cost: nothing runs until the tab is opened; no timer, no watcher. Every
 * missing file or failing bd call narrows the answer (partial: true), it
 * never fails the tab (degrade, never break).
 *
 * Input is hostile: topic and item must match a strict name pattern, the path
 * must stay inside the topics folder, text is capped, and the client renders
 * it as text only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBdJson } from '../bd.js';
import { debug } from '../logging.js';
import { getAvailableWorkspaces } from '../registry-watcher.js';

const log = debug('knowledge');

export const MAX_TODO = 5;
export const MAX_KNOW = 3;
export const MAX_TRY = 6;
const MAX_NOTE_BYTES = 64 * 1024;
const MAX_ITEMS_READ = 200;
const MAX_LINE = 400;
const TOPIC_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ITEM_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const BEAD_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;
/** Hosts and platforms that many notes name; naming one is not a tool to try. */
const GENERIC_TOOL_RE =
  /^(claude( code)?|chatgpt|gemini|github|youtube|instagram|facebook|telegram|google|openai)$/i;
const MARK_RE = /^\[(do|know|try)\]\s+/i;
const TAIL_RE =
  /(?:\s+\((?:transcript|frames|both)\))?(?:\s+\[[^\]\s]+\])*\s*$/;
const CAUTION_RE =
  /\b(promotional|sponsored|unverified|exaggerat\w*|advert\w*)\b|\bclaims? (is|are|may|might|likely)\b|\bthe video's promise\b|\btreat the claims\b/i;

/** The learner's link inbox folder (same order as learner/lib/home.mjs). */
export function linkInboxHome(env = process.env) {
  const a = path.join(os.homedir(), '.codesters', 'link-inbox');
  if (fs.existsSync(a)) return a;
  if (env.LOCALAPPDATA) {
    const b = path.join(env.LOCALAPPDATA, 'Codesters', 'link-inbox');
    if (fs.existsSync(b)) return b;
  }
  return a;
}

/** The company folder: CODESTERS_COMPANY_ROOT or ~/company. */
export function companyRoot(env = process.env) {
  return env.CODESTERS_COMPANY_ROOT || path.join(os.homedir(), 'company');
}

/**
 * @param {string} s
 * @param {number} [n]
 */
function clip(s, n = MAX_LINE) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Parse one item note.
 *
 * @param {string} text
 * @param {string} topic
 * @param {string} item - file name without .md
 * @param {number} mtime
 */
export function parseItem(text, topic, item, mtime = 0) {
  const lines = text.split(/\r?\n/);
  const h1 = lines.find((l) => l.startsWith('# '));
  const title = h1 ? h1.slice(2).trim() : item;
  const shared = /^Shared:\s*(\d{4}-\d{2}-\d{2})/m.exec(text);
  const at = shared ? Date.parse(shared[1]) : mtime;
  /** @type {Map<string, string[]>} */
  const sections = new Map();
  /** @type {string[] | null} */
  let cur = null;
  for (const l of lines) {
    const m = /^##\s+(.*)$/.exec(l);
    if (m) {
      cur = [];
      sections.set(m[1].trim().toLowerCase(), cur);
    } else if (cur) cur.push(l);
  }
  const sec = (/** @type {string} */ prefix) => {
    for (const [k, v] of sections) if (k.startsWith(prefix)) return v;
    return [];
  };
  const bullet = (/** @type {string} */ l) => {
    const m = /^\s*[-*]\s+(.*)$/.exec(l);
    return m ? m[1].trim() : '';
  };
  const tools = sec('tools')
    .map(bullet)
    .filter(Boolean)
    .map((b) =>
      b
        .replace(TAIL_RE, '')
        .replace(/\s*\((?:named|said)[^)]*\)\s*$/i, '')
        .trim()
    )
    .filter((n) => n && n.length <= 60);
  const bullets = sec('takeaways')
    .map(bullet)
    .filter(Boolean)
    .map((b) => {
      const mark = MARK_RE.exec(b);
      const body = clip(b.replace(MARK_RE, '').replace(TAIL_RE, '').trim());
      let tool = '';
      for (const t of tools) {
        if (
          t &&
          !GENERIC_TOOL_RE.test(t) &&
          body.toLowerCase().includes(t.toLowerCase())
        ) {
          tool = t;
          break;
        }
      }
      const kind = mark
        ? /** @type {'do'|'know'|'try'} */ (mark[1].toLowerCase())
        : tool
          ? 'try'
          : 'know';
      return { kind, text: body, tool };
    })
    .filter((b) => b.text);
  return { topic, item, title: clip(title, 160), at, tools, bullets };
}

/**
 * @param {string} topicsDir
 * @returns {{ items: ReturnType<typeof parseItem>[], unsorted: number, unsortedOldest: number, partial: boolean }}
 */
export function readTopics(topicsDir) {
  /** @type {ReturnType<typeof parseItem>[]} */
  const items = [];
  let unsorted = 0;
  let unsortedOldest = 0;
  let partial = false;
  /** @type {string[]} */
  let topics = [];
  try {
    topics = fs
      .readdirSync(topicsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && TOPIC_RE.test(d.name))
      .map((d) => d.name);
  } catch {
    return { items, unsorted, unsortedOldest, partial: true };
  }
  for (const topic of topics) {
    const dir = path.join(topicsDir, topic, 'items');
    /** @type {string[]} */
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) {
      const name = f.slice(0, -3);
      if (!ITEM_RE.test(name)) continue;
      if (items.length >= MAX_ITEMS_READ) {
        partial = true;
        break;
      }
      try {
        const file = path.join(dir, f);
        const st = fs.statSync(file);
        if (st.size > MAX_NOTE_BYTES) continue;
        const parsed = parseItem(
          fs.readFileSync(file, 'utf8'),
          topic,
          name,
          st.mtimeMs
        );
        if (topic === 'unsorted') {
          unsorted += 1;
          unsortedOldest =
            unsortedOldest === 0
              ? parsed.at
              : Math.min(unsortedOldest, parsed.at);
        }
        items.push(parsed);
      } catch {
        partial = true;
      }
    }
  }
  return { items, unsorted, unsortedOldest, partial };
}

/**
 * Links whose last recorded outcome is a failure.
 *
 * @param {string} home
 * @returns {{ failed: any[], cookie: any | null, partial: boolean }}
 */
export function readFailures(home) {
  /** @type {Map<string, any>} */
  const last = new Map();
  try {
    const raw = fs.readFileSync(path.join(home, 'done.jsonl'), 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r && typeof r.id === 'string' && typeof r.outcome === 'string') {
          last.set(String(r.platform) + ':' + r.id, r);
        }
      } catch {
        // a bad line is skipped
      }
    }
  } catch (err) {
    return {
      failed: [],
      cookie: null,
      partial: /** @type {any} */ (err)?.code !== 'ENOENT'
    };
  }
  const rows = [...last.values()];
  const at = (/** @type {any} */ r) => Date.parse(r.at) || 0;
  const failed = rows
    .filter((r) => r.outcome === 'failed')
    .sort((a, b) => at(a) - at(b));
  const cookie =
    rows
      .filter((r) => r.outcome === 'cookie_frozen')
      .sort((a, b) => at(a) - at(b))[0] || null;
  return { failed, cookie, partial: false };
}

/**
 * @param {{ topicsDir?: string, home?: string, listOffers?: () => Promise<any[]>, workspaces?: () => Array<{path:string}>, now?: () => number }} [opts]
 */
export function createKnowledge(opts = {}) {
  const topicsDir =
    opts.topicsDir || path.join(companyRoot(), 'knowledge', 'topics');
  const getHome = () => opts.home || linkInboxHome();
  const workspaces = opts.workspaces || getAvailableWorkspaces;
  const now = opts.now || Date.now;
  const listOffers =
    opts.listOffers ||
    (async () => {
      const r = await runBdJson(
        [
          'list',
          '-l',
          'from-link',
          '--status',
          'open',
          '--json',
          '--limit',
          '0'
        ],
        { cwd: companyRoot(), priority: 'background', timeout_ms: 30000 }
      );
      if (r.code !== 0) throw new Error(r.stderr || 'bd list failed');
      return Array.isArray(r.stdoutJson) ? r.stdoutJson : [];
    });

  async function get() {
    const t = readTopics(topicsDir);
    const f = readFailures(getHome());
    let partial = t.partial || f.partial;
    /** @type {any[]} */
    let offers = [];
    try {
      offers = await listOffers();
    } catch (err) {
      partial = true;
      log('offers failed: %o', err);
    }
    let companyPath = '';
    try {
      const want = path.resolve(companyRoot()).toLowerCase();
      companyPath =
        workspaces().find((w) => path.resolve(w.path).toLowerCase() === want)
          ?.path || '';
    } catch {
      // no button, row still shows
    }

    /** @type {any[]} */
    const todo = [];
    if (t.unsorted > 0) {
      todo.push({
        kind: 'unsorted',
        n: t.unsorted,
        at: t.unsortedOldest,
        note: { topic: 'unsorted', item: 'README' }
      });
    }
    for (const r of f.failed) {
      todo.push({
        kind: 'failed',
        platform: String(r.platform || ''),
        id: String(r.id).slice(-4),
        why: typeof r.why === 'string' ? r.why.slice(0, 40) : '',
        at: Date.parse(r.at) || 0
      });
    }
    if (f.cookie) {
      todo.push({ kind: 'cookie', at: Date.parse(f.cookie.at) || 0 });
    }
    for (const b of offers) {
      if (!b || !BEAD_ID_RE.test(String(b.id))) continue;
      todo.push({
        kind: 'offer',
        title: clip(String(b.title || ''), 200),
        at:
          typeof b.created_at === 'number'
            ? b.created_at
            : Date.parse(b.created_at) || 0,
        bead: { id: String(b.id), path: companyPath }
      });
    }
    todo.sort((a, b) => (a.at || 0) - (b.at || 0));

    const newest = [...t.items].sort((a, b) => b.at - a.at);
    /** @type {any[]} */
    const know = [];
    for (const it of newest) {
      const b = it.bullets.find((x) => x.kind === 'know');
      if (b && know.length < MAX_KNOW) {
        know.push({
          kind: 'know',
          title: b.text,
          line: it.title,
          note: { topic: it.topic, item: it.item }
        });
      }
    }
    /** @type {any[]} */
    const tries = [];
    for (const it of newest) {
      const bs = it.bullets.filter((x) => x.kind === 'try');
      if (!bs.length || tries.length >= MAX_TRY) continue;
      const first = bs[0];
      const name =
        first.tool || it.tools[0] || it.title.split(':')[0].slice(0, 60);
      tries.push({
        kind: 'try',
        title: name,
        line: first.text,
        caution: it.bullets.some((x) => CAUTION_RE.test(x.text)),
        note: { topic: it.topic, item: it.item }
      });
    }
    return {
      has_notes: t.items.length > 0,
      todo: todo.slice(0, MAX_TODO),
      todo_more: Math.max(0, todo.length - MAX_TODO),
      know,
      try: tries,
      partial,
      updated_at: now()
    };
  }

  /**
   * @param {any} payload
   */
  function note(payload) {
    const topic = String(payload?.topic ?? '');
    const item = String(payload?.item ?? '');
    if (!TOPIC_RE.test(topic) || !(item === 'README' || ITEM_RE.test(item))) {
      throw { code: 'bad_request', message: 'bad note name' };
    }
    const file =
      item === 'README'
        ? path.join(topicsDir, topic, 'README.md')
        : path.join(topicsDir, topic, 'items', item + '.md');
    let real = '';
    try {
      real = fs.realpathSync(file);
      const root = fs.realpathSync(topicsDir);
      if (!real.startsWith(root + path.sep)) throw new Error('outside');
      const st = fs.statSync(real);
      if (!st.isFile()) throw new Error('not a file');
    } catch {
      throw { code: 'not_found', message: 'note not found' };
    }
    const fd = fs.openSync(real, 'r');
    try {
      const buf = Buffer.alloc(MAX_NOTE_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_NOTE_BYTES, 0);
      const text = buf.subarray(0, n).toString('utf8');
      const h1 = /^# (.*)$/m.exec(text);
      return { title: clip(h1 ? h1[1].trim() : item, 160), text };
    } finally {
      fs.closeSync(fd);
    }
  }

  return { get, note };
}

/** @param {{ registerHandler: Function, registerRoute: Function }} seam */
export function register(seam) {
  const k = createKnowledge();
  seam.registerHandler('knowledge-get', () => k.get(), { phone: true });
  seam.registerHandler(
    'knowledge-note',
    (/** @type {any} */ req) => k.note(req.payload),
    {
      phone: true
    }
  );
}
