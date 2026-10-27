import { runBdJson } from './bd.js';
import { debug } from './logging.js';

const log = debug('workspace-counts');

/** A count is reused this long, so reopening the switcher does not respawn bd. */
const TTL_MS = 10_000;
/** list-workspaces waits at most this long for counts; late ones land in the cache. */
const WAIT_MS = 800;

/** @type {Map<string, { at: number, counts?: { total: number, owner_decision: number }, pending?: Promise<void> }>} */
const cache = new Map();

/**
 * One `bd count --by-status --json` in the project's own folder (contract
 * board-data.md, "Workspace counts"). total = everything but closed.
 *
 * @param {string} dir
 * @returns {Promise<{ total: number, owner_decision: number } | undefined>}
 */
async function countOne(dir) {
  try {
    const res = await runBdJson(['count', '--by-status', '--json'], {
      cwd: dir,
      priority: 'background'
    });
    const groups =
      res && res.code === 0 && /** @type {any} */ (res).stdoutJson?.groups;
    if (!Array.isArray(groups)) {
      return undefined;
    }
    let total = 0;
    let owner_decision = 0;
    for (const g of groups) {
      const n = Number(g?.count) || 0;
      if (g?.group === 'closed') {
        continue;
      }
      total += n;
      if (g?.group === 'owner_decision') {
        owner_decision = n;
      }
    }
    return { total, owner_decision };
  } catch (err) {
    log('count failed for %s: %o', dir, err);
    return undefined;
  }
}

/**
 * Add `counts` to each workspace. A project whose count is slow or failed
 * simply has none (FR-015); it never blocks the others. Computed only when
 * asked, no polling.
 *
 * @template {{ path: string }} W
 * @param {W[]} workspaces
 * @returns {Promise<Array<W & { counts?: { total: number, owner_decision: number } }>>}
 */
export async function withCounts(workspaces) {
  const waits = start(workspaces);
  if (waits.length > 0) {
    await Promise.race([
      Promise.all(waits),
      new Promise((r) => setTimeout(r, WAIT_MS))
    ]);
  }
  return workspaces.map((w) => {
    const counts = cache.get(w.path)?.counts;
    return counts ? { ...w, counts } : w;
  });
}

/**
 * Start (not await) the counts that are missing or stale.
 *
 * @param {Array<{ path: string }>} workspaces
 * @returns {Promise<void>[]}
 */
function start(workspaces) {
  const now = Date.now();
  const waits = [];
  for (const w of workspaces) {
    const hit = cache.get(w.path);
    if (hit && !hit.pending && now - hit.at < TTL_MS) {
      continue;
    }
    if (hit?.pending) {
      waits.push(hit.pending);
      continue;
    }
    const entry = hit || { at: 0 };
    cache.set(w.path, entry);
    entry.pending = countOne(w.path).then((counts) => {
      entry.at = Date.now();
      if (counts) {
        entry.counts = counts;
      }
      entry.pending = undefined;
    });
    waits.push(entry.pending);
  }
  return waits;
}

/**
 * One-shot warm-up when a project is registered, so the first switcher open
 * already has its count. Not awaited, not repeated.
 *
 * @param {string} path
 */
export function prewarmCounts(path) {
  start([{ path }]);
}

/** Test hook. */
export function clearWorkspaceCounts() {
  cache.clear();
}
