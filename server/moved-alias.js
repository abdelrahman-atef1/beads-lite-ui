import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Old bead id -> new id, from the company alias file written by
 * scripts/bead-move.mjs (tab separated: old_id, new_id, repo; header row).
 * Read on demand and cached by mtime; absent file = no aliases.
 */
export function aliasPath() {
  return (
    process.env.BEADS_MOVED_ALIAS ||
    path.join(os.homedir(), 'company', 'knowledge', 'moved-beads.tsv')
  );
}

/** @type {{ file: string, mtime: number, map: Map<string, { id: string, repo: string }> } | null} */
let cached = null;

/**
 * @param {string} id
 * @returns {{ id: string, repo: string } | null}
 */
export function resolveMovedId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) return null;
  const map = load();
  return (map && map.get(id.toLowerCase())) || null;
}

/**
 * The whole alias table (lower-case old id -> new id), so the browser loads
 * it once and looks ids up locally.
 *
 * @returns {Record<string, string>}
 */
export function allMovedIds() {
  const map = load();
  /** @type {Record<string, string>} */
  const out = {};
  if (map) for (const [o, v] of map) out[o] = v.id;
  return out;
}

/** @returns {Map<string, { id: string, repo: string }> | null} */
function load() {
  const file = aliasPath();
  let mtime;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  if (!cached || cached.file !== file || cached.mtime !== mtime) {
    const map = new Map();
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    for (const line of text.split(/\r?\n/)) {
      const [o, n, repo] = line.split('\t');
      if (o && n && o !== 'old_id')
        map.set(o.toLowerCase(), { id: n, repo: repo || '' });
    }
    cached = { file, mtime, map };
  }
  return cached.map;
}
