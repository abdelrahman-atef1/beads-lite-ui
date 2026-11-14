#!/usr/bin/env node
/**
 * Agent door for @mentions (beads-lite-1bo5.6.64.1): run after
 * `bd comments add <bead> ...` so mentions in an agent's comment are handled by
 * the same code, state and limits as the board.
 *
 *   node scripts/mention-scan.mjs <project-dir> <bead-id>
 *
 * Prints one line per mention: "<role> <chip> <verdict>". Env: WAKE_ROOT,
 * BDUI_BOARD_HOME, MENTION_WAKE_SCRIPT (tests point them at temp copies).
 */
import path from 'node:path';
import { createMention } from '../server/features/mention.js';

const [dir, bead] = process.argv.slice(2);
if (!dir || !bead) {
  console.error('usage: mention-scan.mjs <project-dir> <bead-id>');
  process.exit(2);
}
try {
  const { results } = await createMention().scan(path.resolve(dir), bead);
  for (const r of results) console.log(`${r.role} ${r.chip} ${r.verdict}`);
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
}
