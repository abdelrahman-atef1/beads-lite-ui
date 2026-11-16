#!/usr/bin/env node
/**
 * Live-behaviour contract runner (beads-lite-1bo5.6.59.1, cutover 59.17).
 *   node scripts/live-contract.mjs --ui 3   run every row against the board (v3 is the only shell)
 * Writes .work/out/<bead>/qa/summary-ui3.md plus a json; exits 1 if a row fails.
 * `--ui 2` is gone with the legacy shell. A full run is about a minute of
 * vitest: when the machine is busy run it through heavy-key.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROWS } from './live-rows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BEAD = process.env.LIVE_BEAD || 'beads-lite-1bo5.6.59.1';
const argv = process.argv.slice(2);
const ui = 3;
if (argv.includes('--ui') && argv[argv.indexOf('--ui') + 1] !== '3') {
  console.error('only --ui 3 exists: the legacy shell was removed (59.17)');
  process.exit(2);
}
const outDir = path.join(root, '.work', 'out', BEAD, 'qa');
fs.mkdirSync(outDir, { recursive: true });

/** @type {Record<string, {status: string, note: string}>} */
const result = {};

{
  const files = [...new Set(ROWS.flatMap((r) => r.files))];
  const json = path.join(os.tmpdir(), `live-contract-${process.pid}.json`);
  const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const run = spawnSync(
    process.execPath,
    [vitest, 'run', ...files, '--reporter=json', `--outputFile=${json}`],
    { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 600000 }
  );
  if (!fs.existsSync(json)) {
    console.error('vitest produced no report', String(run.stderr).slice(-500));
    process.exit(2);
  }
  const rep = JSON.parse(fs.readFileSync(json, 'utf8'));
  fs.rmSync(json, { force: true });
  /** @type {Map<string, any[]>} */
  const byFile = new Map();
  for (const f of rep.testResults) {
    byFile.set(
      path.relative(root, f.name).replaceAll('\\', '/'),
      f.assertionResults
    );
  }
  for (const r of ROWS) {
    const tests = r.files.flatMap((f) =>
      (byFile.get(f) || []).filter((t) => r.match.test(t.fullName))
    );
    const n = (/** @type {string} */ s) =>
      tests.filter((t) => t.status === s).length;
    const passed = n('passed');
    const failed = n('failed');
    const skipped = tests.length - passed - failed;
    if (failed) {
      result[r.id] = {
        status: 'FAIL',
        note: `${failed} failed of ${tests.length}`
      };
    } else if (!tests.length) {
      result[r.id] = {
        status: 'FAIL',
        note: 'no test matched (missing file or name)'
      };
    } else if (r.pending && !passed) {
      result[r.id] = {
        status: 'pending',
        note: `waits for ${r.pending}; ${skipped} skipped`
      };
    } else if (!passed) {
      result[r.id] = {
        status: 'FAIL',
        note: `not exercised (${skipped} skipped, 0 ran)`
      };
    } else {
      result[r.id] = {
        status: 'pass',
        note: `${passed} tests${skipped ? `, ${skipped} skipped` : ''}`
      };
    }
  }
}

const lines = [
  `# Live-behaviour contract, ui ${ui}`,
  '',
  `Run ${new Date().toISOString()}.`,
  '',
  '| Row | Behaviour | Result | Detail |',
  '|---|---|---|---|'
];
for (const r of ROWS) {
  lines.push(
    `| ${r.id} | ${r.what} | ${result[r.id].status} | ${result[r.id].note} |`
  );
}
const all = Object.values(result);
const fail = all.filter((x) => x.status === 'FAIL').length;
const pend = all.filter((x) => x.status === 'pending').length;
lines.push(
  '',
  `${ROWS.length - fail - pend} pass, ${pend} pending, ${fail} fail.`
);
fs.writeFileSync(path.join(outDir, 'summary-ui3.md'), lines.join('\n') + '\n');
fs.writeFileSync(
  path.join(outDir, `live-contract-ui${ui}.json`),
  JSON.stringify(result, null, 2)
);
for (const r of ROWS) {
  console.log(
    `${r.id} ${result[r.id].status.padEnd(7)} ${r.what.slice(0, 66)}  [${result[r.id].note}]`
  );
}
console.log(
  `\n${ROWS.length - fail - pend} pass, ${pend} pending, ${fail} fail -> ${outDir}`
);
process.exit(fail ? 1 : 0);
