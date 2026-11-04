import { commentAnchor } from './anchor.js';
import { parseFolded } from './fold.js';

/**
 * A decision shown in the thread (beads-lite-1bo5.6.46.7). The card CLI
 * `post` writes it: line 1 `ASK: <question>`, then a `## Decision` section
 * (q, effect, blocks, [mode], [show], `options:` and numbered lines).
 * The answer comes back as a comment with `re: c-<8hex>` of that comment.
 *
 * @typedef {{ n: number, l: string, rec: boolean, note: string }} DOpt
 * @typedef {{ q: string, effect: string, blocks: string, show: string,
 *   nonBlocking: boolean, opts: DOpt[] }} DCard
 * @typedef {{ kind: 'open' | 'nonblocking' | 'answered' | 'closed',
 *   answer?: string }} DState
 */

const REF_RE = /(?:^|[\s,])re: (c-[0-9a-f]{8})\b/m;

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
  /** @type {Record<string, string>} */
  const f = {};
  /** @type {DOpt[]} */
  const opts = [];
  let inOpts = false;
  for (const line of sec.body.split('\n')) {
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
  if (!f.q || opts.length < 2) return null;
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
