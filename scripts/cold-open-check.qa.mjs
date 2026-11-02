// Regression guard for the cold-server freeze (company-8ce8.14.3): opening an
// id of another workspace with a fresh server must show the detail, never hang
// the tab (releaseHeldDetail <-> ensureIssueWorkspace loop). jsdom cannot
// reproduce it (it needs a real cold bd open), so this drives headless Chromium.
//
// usage: FIXTURE=<dir> PLAYWRIGHT_CORE=<path to playwright-core> \
//        node scripts/cold-open-check.mjs [runs=5] [port0=4400]
// FIXTURE holds: ws/<folders> (copies of the dbs), alias.tsv, cases.tsv
// (kind<TAB>id-to-open<TAB>expected-final-id; each issue's text has "qa sample"),
// home/ (empty, used as isolated HOME), and optional EXE (chromium path) via env.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = process.env.FIXTURE;
if (!Q || !process.env.PLAYWRIGHT_CORE) {
  console.error('set FIXTURE and PLAYWRIGHT_CORE (see header)');
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)('playwright-core');
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const runs = Number(process.argv[2] || 5);
const port0 = Number(process.argv[3] || 4400);
const cases = fs.readFileSync(`${Q}/cases.tsv`, 'utf8').trim().split('\n').map((l) => l.split('\t'));
const detail = (/** @type {any} */ p) => p.evaluate(() => (document.querySelector('#detail-root') || { innerText: '' }).innerText);
let bad = 0;
for (let run = 0; run < runs; run++) {
  const port = port0 + run;
  const env = { ...process.env, PORT: String(port), PHONE_PORT: 'off', USERPROFILE: `${Q}/home`, HOME: `${Q}/home`, BEADS_MOVED_ALIAS: `${Q}/alias.tsv` };
  const out = fs.openSync(`${Q}/srv${run}.log`, 'w');
  const srv = spawn(process.execPath, [`${root}/server/index.js`], { cwd: `${Q}/ws/company`, env, stdio: ['ignore', out, out], windowsHide: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/workspaces`)).ok) break; } catch { /* retry */ } await sleep(500); }
  for (const d of fs.readdirSync(`${Q}/ws`).filter((x) => x !== 'company')) {
    const w = `${Q}/ws/${d}`;
    await fetch(`http://127.0.0.1:${port}/api/register-workspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: w, database: w + '/.beads' }) });
  }
  const b = await chromium.launch({ headless: true, executablePath: process.env.EXE });
  let rb = 0;
  try {
    for (const [, open, expect] of cases) {
      const p = await (await b.newContext()).newPage();
      p.goto(`http://127.0.0.1:${port}/#/issues?issue=${open}`).catch(() => {});
      let ok = false, hung = false, txt = '';
      for (let i = 0; i < 100 && !ok; i++) {
        await sleep(150);
        try {
          txt = await Promise.race([detail(p), sleep(3000).then(() => { throw new Error('HANG'); })]);
          const h = await p.evaluate(() => location.hash);
          ok = /patient|PMR|record/i.test(txt) && h.endsWith('issue=' + expect);
        } catch { hung = true; break; }
      }
      if (!ok) { rb++; console.log(`run${run} FAIL ${open} ${hung ? 'TAB HUNG' : txt.slice(0, 60)}`); }
    }
  } finally {
    await Promise.race([b.close(), sleep(5000)]).catch(() => {});
    try { process.kill(srv.pid); } catch { /* gone */ }
  }
  bad += rb;
  console.log(`run${run} ${cases.length - rb}/${cases.length}`);
}
console.log(bad ? 'FAIL' : 'OK');
process.exit(bad ? 1 : 0);
