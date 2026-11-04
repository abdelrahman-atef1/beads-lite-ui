/**
 * Deep-link anchors inside a bead: `#/issues?issue=<id>&at=<anchor>`.
 *
 * anchor = <target>[.L<n>[-<m>]]
 *   target = description | design | notes | acceptance | comments | card
 *          | c-last | c-<n> (1 = oldest) | c-<comment-id prefix, 6+ hex chars>
 * Old links (no `at`) are unchanged.
 */

export const FIELD_TARGETS = [
  'description',
  'design',
  'notes',
  'acceptance',
  'comments',
  'card'
];

/**
 * @param {string} hash
 * @returns {{ target: string, from: number, to: number } | null}
 */
export function parseAnchor(hash) {
  const h = String(hash || '');
  const q = h.indexOf('?');
  if (q < 0) {
    return null;
  }
  let at = new URLSearchParams(h.slice(q + 1)).get('at') || '';
  at = at.trim().toLowerCase();
  const m = /^([a-z0-9-]+)(?:\.l(\d{1,5})(?:-(\d{1,5}))?)?$/.exec(at);
  if (!m) {
    return null;
  }
  const target = m[1];
  const ok =
    FIELD_TARGETS.includes(target) ||
    target === 'c-last' ||
    /^c-\d{1,5}$/.test(target) ||
    /^c-[0-9a-f]{6,36}$/.test(target);
  if (!ok) {
    return null;
  }
  const from = m[2] ? Number(m[2]) : 0;
  const to = m[3] ? Number(m[3]) : from;
  return { target, from, to: Math.max(from, to) };
}

/**
 * Short, stable anchor for a comment: `c-` + first 8 chars of its id.
 *
 * @param {{ id?: string | number }} c
 */
export function commentAnchor(c) {
  return (
    'c-' +
    String(c.id || '')
      .replace(/-/g, '')
      .slice(0, 8)
  );
}

/**
 * Index (in the given array) of the comment a `c-...` target means, or -1.
 *
 * @param {string} target
 * @param {{ id?: string }[]} comments - oldest first
 */
export function findCommentIndex(target, comments) {
  if (target === 'c-last') {
    return comments.length - 1;
  }
  if (/^c-\d{1,5}$/.test(target)) {
    const i = Number(target.slice(2)) - 1;
    return i >= 0 && i < comments.length ? i : -1;
  }
  const p = target.slice(2);
  return comments.findIndex((c) =>
    String(c.id || '')
      .replace(/-/g, '')
      .toLowerCase()
      .startsWith(p)
  );
}

/**
 * Strip markdown markers so a source line can be matched to rendered text.
 *
 * @param {string} line
 */
export function plainLine(line) {
  return String(line)
    .replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6}|>)\s*(?:\[[ xX]\]\s*)?/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Smallest rendered element inside `root` whose text contains source line `n`
 * (1-based) of `source`. Null when the line is blank/out of range/not found.
 *
 * @param {Element} root
 * @param {string} source
 * @param {number} n
 * @returns {Element | null}
 */
export function findLineElement(root, source, n) {
  const line = plainLine(String(source).split('\n')[n - 1] || '');
  if (!line) {
    return null;
  }
  /** @type {{ el: Element, len: number } | null} */
  let best = null;
  for (const el of root.querySelectorAll('*')) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').toLowerCase();
    if (t.includes(line) && (!best || t.length < best.len)) {
      best = { el, len: t.length };
    }
  }
  return best ? best.el : null;
}
