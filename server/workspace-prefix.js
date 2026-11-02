import { runBd } from './bd.js';
import { debug } from './logging.js';

const log = debug('workspace-prefix');

/** A prefix is reused this long; it only changes when a project is renamed. */
const TTL_MS = 60_000;
/** list-workspaces waits at most this long; late answers land in the cache. */
const WAIT_MS = 800;

/** @type {Map<string, { at: number, prefix?: string, pending?: Promise<void> }>} */
const cache = new Map();

/**
 * The db's own issue_prefix (`bd config get issue_prefix`, run in the project
 * folder). The folder name is not the prefix (codestsers_landing, My
 * Personal Brand), so ids are matched on this.
 *
 * @param {string} dir
 * @returns {Promise<string | undefined>}
 */
async function prefixOne(dir) {
  try {
    const res = await runBd(['config', 'get', 'issue_prefix'], {
      cwd: dir,
      priority: 'background'
    });
    if (res.code !== 0) return undefined;
    const line = String(res.stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return line && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(line) ? line : undefined;
  } catch (err) {
    log('prefix failed for %s: %o', dir, err);
    return undefined;
  }
}

/**
 * Add `prefix` to each workspace. A project whose prefix is slow or unknown
 * simply has none; the board then falls back to its folder name.
 *
 * @template {{ path: string }} W
 * @param {W[]} workspaces
 * @returns {Promise<Array<W & { prefix?: string }>>}
 */
export async function withPrefixes(workspaces) {
  const now = Date.now();
  const waits = [];
  for (const w of workspaces) {
    const hit = cache.get(w.path);
    if (hit && !hit.pending && now - hit.at < TTL_MS) continue;
    // Stale-while-revalidate: a prefix we already know is served at once and
    // refreshed in the background; only a first-ever lookup is waited for.
    const known = !!hit?.prefix;
    if (hit?.pending) {
      if (!known) waits.push(hit.pending);
      continue;
    }
    const entry = hit || { at: 0 };
    cache.set(w.path, entry);
    entry.pending = prefixOne(w.path).then((prefix) => {
      entry.at = Date.now();
      if (prefix) entry.prefix = prefix;
      entry.pending = undefined;
    });
    if (!known) waits.push(entry.pending);
  }
  if (waits.length > 0) {
    await Promise.race([
      Promise.all(waits),
      new Promise((r) => setTimeout(r, WAIT_MS))
    ]);
  }
  return workspaces.map((w) => {
    const prefix = cache.get(w.path)?.prefix;
    return prefix ? { ...w, prefix } : w;
  });
}

/** Test hook. */
export function clearWorkspacePrefixes() {
  cache.clear();
}
