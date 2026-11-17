/**
 * Who a comment really came from (beads-lite-1bo5.13.30).
 *
 * The board posts the owner's comments with `--author <git user name>`. An
 * agent that runs `bd comments add` without BD_ACTOR is stamped with the same
 * git name by bd, so the name alone cannot tell the owner from an agent. The
 * board server therefore remembers the id of every comment it posted (file in
 * the board home, bounded) and shows any other comment that carries the
 * owner's name, created after GUARD_SINCE, as "agent (no role)". The raw name
 * stays in `author_raw`. Older comments are left as they were: no history is
 * rewritten. The real fix for agents is BD_ACTOR (a bd wrapper / env), not here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { boardHome } from './notifier.js';

export const AGENT_NO_ROLE = 'agent (no role)';
/** Comments before this are never re-labelled. */
export const GUARD_SINCE = '2026-11-17T00:00:00Z';
const MAX_IDS = 2000;

/** @type {{ owner: string, ids: string[] } | null} */
let mem = null;

/** Tests only: forget the in-memory copy (the file stays). */
export function resetAuthorGuard() {
  mem = null;
}

/** @param {string} home */
const fileOf = (home) => path.join(home, 'board-comments.json');

/** @param {string} home */
function load(home) {
  if (mem) return mem;
  try {
    const j = JSON.parse(fs.readFileSync(fileOf(home), 'utf8'));
    mem = {
      owner: typeof j.owner === 'string' ? j.owner : '',
      ids: Array.isArray(j.ids) ? j.ids.map(String) : []
    };
  } catch {
    mem = { owner: '', ids: [] };
  }
  return mem;
}

/**
 * Remember a comment the board server posted for the owner.
 *
 * @param {string} id
 * @param {string} author
 * @param {{ home?: string }} [o]
 */
export function markBoardComment(id, author, o = {}) {
  if (!id) return;
  const home = o.home || boardHome();
  const s = load(home);
  if (!s.ids.includes(id)) s.ids.push(id);
  if (s.ids.length > MAX_IDS) s.ids.splice(0, s.ids.length - MAX_IDS);
  if (author) s.owner = author;
  try {
    fs.mkdirSync(home, { recursive: true });
    const tmp = `${fileOf(home)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s));
    fs.renameSync(tmp, fileOf(home));
  } catch {
    // not remembered: the comment then shows as agent (no role), never as a wrong owner
  }
}

/**
 * @param {any[]} comments
 * @param {{ home?: string, owner?: () => Promise<string> }} [o] owner = fallback name lookup (git)
 * @returns {Promise<any[]>}
 */
export async function guardAuthors(comments, o = {}) {
  if (!Array.isArray(comments)) return comments;
  const fresh = comments.filter(
    (c) => c && typeof c.created_at === 'string' && c.created_at >= GUARD_SINCE
  );
  if (!fresh.length) return comments;
  const s = load(o.home || boardHome());
  let owner = s.owner;
  if (!owner && o.owner) owner = await o.owner().catch(() => '');
  if (!owner) return comments;
  const mine = new Set(s.ids);
  return comments.map((c) =>
    fresh.includes(c) && c.author === owner && !mine.has(String(c.id))
      ? { ...c, author: AGENT_NO_ROLE, author_raw: c.author }
      : c
  );
}
