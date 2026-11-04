/**
 * Weighted progress for the bead header (beads-lite-1bo5.6.47).
 * Pure functions, no DOM. Weight: metadata.weight (whole number 1..21), else
 * by priority P0=8 P1=5 P2=3 P3=2 P4=1. Invalid values never throw and fall
 * back to the priority default. In-progress counts 0; deferred/won't-do
 * children leave the total.
 */
export const PRIORITY_WEIGHT = [8, 5, 3, 2, 1];
export const MAX_CHILDREN = 200;
const OUT_STATUSES = new Set(['deferred', 'wontdo', "won't do", 'wont_do']);

/**
 * @param {unknown} priority
 */
function priorityWeight(priority) {
  const p = Number(priority);
  const i = Number.isFinite(p) ? Math.max(0, Math.min(4, Math.round(p))) : 2;
  return PRIORITY_WEIGHT[i];
}

/**
 * @param {unknown} priority
 * @param {unknown} [explicit] - raw metadata.weight (number or numeric string)
 * @returns {number}
 */
export function weightOf(priority, explicit) {
  const raw = typeof explicit === 'string' ? explicit.trim() : explicit;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 21) {
      return n;
    }
  }
  return priorityWeight(priority);
}

/** @param {number} n */
function stepWeight(n) {
  return Number.isInteger(n) && n >= 1 && n <= 21 ? n : 1;
}

/**
 * Checklist steps: `- [ ] (3) text` / `- [x] text` lines. Only the texts
 * passed in are parsed (description and acceptance, never design).
 *
 * @param {...unknown} texts
 * @returns {{ weight: number, done: boolean }[]}
 */
export function parseSteps(...texts) {
  const steps = [];
  const re = /^\s*[-*]\s+\[([ xX])\]\s*(?:\((\d{1,3})\)\s*)?/;
  for (const text of texts) {
    for (const line of String(text || '').split('\n')) {
      const m = re.exec(line);
      if (!m) {
        continue;
      }
      steps.push({
        weight: m[2] === undefined ? 1 : stepWeight(Number(m[2])),
        done: m[1] !== ' '
      });
    }
  }
  return steps;
}

/**
 * @param {{ status?: string, priority?: number, id?: string }[]} children
 * @param {{ weight: number, done: boolean }[]} steps
 * @param {Record<string, number | string>} [weights] - explicit weights by child id
 * @returns {{ done: number, total: number, pct: number }}
 */
export function progress(children, steps, weights = {}) {
  let done = 0;
  let total = 0;
  for (const c of (children || []).slice(0, MAX_CHILDREN)) {
    const st = String(c.status || '').toLowerCase();
    if (OUT_STATUSES.has(st)) {
      continue;
    }
    const w = weightOf(c.priority, c.id ? weights[c.id] : undefined);
    total += w;
    if (st === 'closed') {
      done += w;
    }
  }
  for (const s of steps || []) {
    total += s.weight;
    if (s.done) {
      done += s.weight;
    }
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/**
 * Agents who worked on a bead: comment authors, then assignee, created_by and
 * owner when they are roles. Current assignee first, then newest commenter.
 * There is no assignee history: the bd events journal is off, see the bead.
 *
 * @param {{ assignee?: string, created_by?: string, owner?: string }} issue
 * @param {{ author?: string, created_at?: string }[]} comments
 * @param {(a: string) => boolean} isRole
 * @returns {string[]}
 */
export function deriveActors(issue, comments, isRole) {
  const last = new Map();
  (comments || []).forEach((c, i) => {
    const a = String(c.author || '').trim();
    if (a) {
      last.set(a, Math.max(last.get(a) ?? -1, i));
    }
  });
  const extra = [issue.created_by, issue.owner]
    .map((x) => String(x || '').trim())
    .filter((x) => x && isRole(x) && !last.has(x));
  const assignee = String(issue.assignee || '').trim();
  const ordered = [...last.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
  const all = [
    ...new Set([...ordered, ...extra, ...(assignee ? [assignee] : [])])
  ];
  all.sort((a, b) => (a === assignee ? -1 : b === assignee ? 1 : 0));
  return all;
}
