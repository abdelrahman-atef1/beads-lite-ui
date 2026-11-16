/**
 * Emoji reactions on comments (beads-lite-1bo5.13.3). A reaction is a bead
 * comment with exact text `REACT: <emoji> re: c-<8hex>`, written by
 * ~/company/scripts/react.mjs. The thread hides these and shows them as chips
 * under the target comment.
 */
import { commentAnchor } from './anchor.js';

const REACT_RE = /^REACT: (\S{1,16}) re: (c-[0-9a-f]{8})\s*$/;

/** @param {{ text?: string }} c */
export function isReaction(c) {
  return REACT_RE.test(String(c?.text ?? ''));
}

/**
 * @param {any[]} comments
 * @returns {{ real: any[], byAnchor: Map<string, { emoji: string, who: string[] }[]> }}
 */
export function splitReactions(comments) {
  const real = [];
  /** @type {Map<string, Map<string, string[]>>} */
  const m = new Map();
  for (const c of comments || []) {
    const r = REACT_RE.exec(String(c?.text ?? ''));
    if (!r) {
      real.push(c);
      continue;
    }
    const by = m.get(r[2]) || new Map();
    const who = by.get(r[1]) || [];
    const a = String(c.author || '?');
    if (!who.includes(a)) who.push(a);
    by.set(r[1], who);
    m.set(r[2], by);
  }
  /** @type {Map<string, { emoji: string, who: string[] }[]>} */
  const byAnchor = new Map();
  for (const [k, by] of m) {
    byAnchor.set(
      k,
      [...by].map(([emoji, who]) => ({ emoji, who }))
    );
  }
  return { real, byAnchor };
}

export { commentAnchor };
