import { commentAnchor } from './anchor.js';
import { parseFolded } from './fold.js';

/**
 * A decision shown in the thread (beads-lite-1bo5.6.46.7). The card CLI
 * `post` writes it: line 1 `ASK: <question>`, then a `## Decision` section
 * (q, effect, blocks, [mode], [show], `options:` and numbered lines).
 * The answer comes back as a comment with `re: c-<8hex>` of that comment.
 *
 * @typedef {{ n: number, l: string, rec: boolean, note: string }} DOpt
 * @typedef {{ n: number, q: string, effect: string, show: string,
 *   opts: DOpt[] }} DQuestion
 * @typedef {{ q: string, effect: string, blocks: string, show: string,
 *   nonBlocking: boolean, opts: DOpt[], questions?: DQuestion[] }} DCard
 * @typedef {{ kind: 'open' | 'nonblocking' | 'answered' | 'closed',
 *   answer?: string }} DState
 */

const REF_RE = /(?:^|[\s,])re: (c-[0-9a-f]{8})\b/m;

/**
 * One block of lines (the card level, or one `### Q<k>`): its key lines and
 * numbered options.
 *
 * @param {string[]} blockLines
 */
function readBlock(blockLines) {
  /** @type {Record<string, string>} */
  const f = {};
  /** @type {DOpt[]} */
  const opts = [];
  let inOpts = false;
  for (const line of blockLines) {
    const m = /^(\d{1,2})\. (.+)$/.exec(line);
    if (inOpts && m) {
      let l = m[2];
      const rec = / \(recommended\)/.test(l);
      l = l.replace(' (recommended)', '');
      const at = l.indexOf(' - ');
      opts.push({
        n: Number(m[1]),
        l: at < 0 ? l : l.slice(0, at),
        rec,
        note: at < 0 ? '' : l.slice(at + 3)
      });
      continue;
    }
    if (line.trim() === 'options:') {
      inOpts = true;
      continue;
    }
    const kv = /^(q|effect|blocks|mode|show): ?(.*)$/.exec(line);
    if (kv) f[kv[1]] = kv[2];
  }
  return { f, opts };
}

/**
 * @param {string} text
 * @returns {DCard | null} null when the comment is not a decision card
 */
export function parseDecisionComment(text) {
  const first = String(text ?? '')
    .trimStart()
    .split('\n', 1)[0];
  if (!first.startsWith('ASK: ')) return null;
  const p = parseFolded(text);
  const sec = p?.sections.find((s) => s.name === 'Decision');
  if (!sec) return null;
  // A card of several questions: the lines before the first `### Q<k>` are
  // the card level (headline q, effect, blocks, show), then one block each.
  /** @type {string[]} */
  const head = [];
  /** @type {Array<{ k: number, lines: string[] }>} */
  const blocks = [];
  for (const line of sec.body.split('\n')) {
    const h = /^### Q(\d)\s*$/.exec(line);
    if (h) {
      blocks.push({ k: Number(h[1]), lines: [] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    } else {
      head.push(line);
    }
  }
  const { f, opts } = readBlock(head);
  if (blocks.length) {
    // 2-5 blocks numbered 1..n in order, each with a q and at least one option
    if (blocks.length < 2 || blocks.length > 5 || !f.q) return null;
    /** @type {DQuestion[]} */
    const questions = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = readBlock(blocks[i].lines);
      if (blocks[i].k !== i + 1 || !b.f.q || b.opts.length < 1) return null;
      questions.push({
        n: i + 1,
        q: b.f.q,
        effect: b.f.effect || f.effect || '',
        show: b.f.show || '',
        opts: b.opts
      });
    }
    return {
      q: f.q,
      effect: f.effect || '',
      blocks: f.blocks || '',
      show: f.show || '',
      nonBlocking: /^non-blocking/.test(f.mode || ''),
      opts: [],
      questions
    };
  }
  if (!f.q || opts.length < 1) return null;
  return {
    q: f.q,
    effect: f.effect || '',
    blocks: f.blocks || '',
    show: f.show || '',
    nonBlocking: /^non-blocking/.test(f.mode || ''),
    opts
  };
}

/**
 * `Answered: 2 - Label, re: c-1234abcd` (non-blocking answers).
 *
 * @param {DOpt} o
 * @param {string} ref
 */
export function answerText(o, ref) {
  return `Answered: ${o.n} - ${o.l.replace(/\s+/g, ' ')}, re: ${ref}`;
}

/** @param {string} text */
function pickOf(text) {
  // a record of several questions: `answer 1: option 2 "..."`, `answer 2: ...`
  const many = [...text.matchAll(/^answer ([1-5]): option (\d+) "(.*)"$/gm)];
  const typedMany = [
    ...text.matchAll(/^answer ([1-5]) \(typed[^)]*\): (.*)$/gm)
  ];
  if (many.length + typedMany.length > 1) {
    return [
      ...many.map((m) => ({ k: Number(m[1]), t: `${m[2]} - ${m[3]}` })),
      ...typedMany.map((m) => ({ k: Number(m[1]), t: m[2] }))
    ]
      .sort((a, b) => a.k - b.k)
      .map((x) => `${x.k}: ${x.t}`)
      .join(' / ');
  }
  const rec = /^answer: option (\d+) "(.*)"$/m.exec(text);
  if (rec) return `${rec[1]} - ${rec[2]}`;
  const typed = /^answer \(typed[^)]*\): (.*)$/m.exec(text);
  if (typed) return typed[1];
  const a = /^Answered: (.+?),? re: c-[0-9a-f]{8}\s*$/m.exec(text);
  return a ? a[1] : '';
}

/**
 * State of each decision comment. Oldest first in, Map(index -> state) out.
 *
 * @param {Array<{ id?: string, text?: string }>} comments
 * @param {{ status?: string } | null} issue
 * @returns {Map<number, DState>}
 */
export function decisionStates(comments, issue) {
  /** @type {Map<number, DState>} */
  const out = new Map();
  /** @type {number[]} */
  const open = [];
  comments.forEach((c, i) => {
    const d = parseDecisionComment(String(c.text ?? ''));
    if (!d) return;
    const ref = commentAnchor(/** @type {any} */ (c));
    let answer = '';
    for (let j = i + 1; j < comments.length && !answer; j++) {
      const t = String(comments[j].text ?? '');
      if (REF_RE.exec(t)?.[1] === ref) answer = pickOf(t) || '-';
    }
    if (answer) out.set(i, { kind: 'answered', answer });
    else if (d.nonBlocking) out.set(i, { kind: 'nonblocking' });
    else {
      out.set(i, { kind: 'closed' });
      open.push(i);
    }
  });
  const last = open[open.length - 1];
  if (last !== undefined && issue?.status === 'owner_decision') {
    out.set(last, { kind: 'open' });
  }
  return out;
}
