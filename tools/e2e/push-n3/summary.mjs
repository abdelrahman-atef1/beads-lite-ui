// Builds summary.md in QA_OUT from unit.json, board.json, sw.json (+ vitest.json if present).
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.env.QA_OUT;
const parts = ['unit', 'phones-ui', 'sw', 'board'].filter((p) => fs.existsSync(path.join(OUT, `${p}.json`))).map((p) => JSON.parse(fs.readFileSync(path.join(OUT, `${p}.json`), 'utf8')));
const lines = ['# QA summary: board Web Push N3 (company-1bo5.6.16)', ''];
const tally = { PASS: 0, FAIL: 0, 'NOT EXERCISED': 0 };
for (const p of parts) {
  lines.push(`## ${p.part} (${(p.ms / 1000).toFixed(0)} s)`, '', '| id | result | case | detail |', '|---|---|---|---|');
  for (const r of p.rows) {
    tally[r.status]++;
    lines.push(`| ${r.id} | ${r.status} | ${r.text.replace(/\|/g, '/')} | ${String(r.detail).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 220)} |`);
  }
  lines.push('');
}
const vf = path.join(OUT, 'vitest.json');
if (fs.existsSync(vf)) {
  const v = JSON.parse(fs.readFileSync(vf, 'utf8'));
  const failed = (v.testResults || []).filter((f) => f.status === 'failed').map((f) => path.basename(f.name));
  lines.push('## vitest full suite', '', `tests ${v.numTotalTests}, passed ${v.numPassedTests}, failed ${v.numFailedTests}, files failed: ${failed.join(', ') || 'none'}`, '');
}
lines.splice(2, 0, `Totals: PASS ${tally.PASS}, FAIL ${tally.FAIL}, NOT EXERCISED ${tally['NOT EXERCISED']}`, '');
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n'));
console.log(lines.slice(0, 3).join('\n'));
