// Regression 13.25/13.26/13.24.1: Releases Open link. Bare console / bare App Distribution => no Open; real install link, web url => Open;
// server deploy => quiet section, no link. Records written to the SCRATCH beads-lite copy only. usage: node rel.mjs [port]
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { start, stop, sleep, WT, SC, PROJS, OUT } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const WS = createRequire(`${WT}/package.json`)('ws');
const port = process.argv[2] || '39128';
const base = `http://127.0.0.1:${port}/`;
const BS = String.fromCharCode(92);
const BDENV = { ...process.env, BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe', BD_ACTOR: 'qa' };
const BDX = `${process.env.APPDATA.split(BS).join('/')}/npm/node_modules/@beads/bd/bin/bd.exe`;
const cwd = `${PROJS}/beads-lite`;
const rows = [];
const ok = (n, p, d = '') => { rows.push({ n, p: !!p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`); };
const T = `QA${Date.now().toString(36)}`;
const recs = [
  ['CONSOLE', 'build', `https://console.firebase.google.com/project/demo/appdistribution`, 'noOpen'],
  ['BAREAD', 'build', 'https://appdistribution.firebase.google.com/', 'noOpen'],
  ['INSTALL', 'build', `https://appdistribution.firebase.google.com/testerapps/1:123:android:abc/releases/${T}`, 'open'],
  ['WEBAPP', 'deploy', `https://qa-${T}.web.app/`, 'open'],
  ['SERVER', 'deploy', `https://console.firebase.google.com/project/demo/firestore/rules`, 'noOpen']
];
let bead = '';
let browser;
try {
  bead = 'beads-lite-1bo5.13.24.1'; // scratch copy of beads-lite store (cwd); never list: bd list routes to a real planning store
  console.log('scratch bead', bead);
  for (const [k, kind, ref] of recs) {
    const label = k === 'SERVER' ? `${T} Firestore rules ${k}` : `${T} App ${k}`;
    const r = spawnSync('node', [`${process.env.USERPROFILE.split(BS).join('/')}/company/scripts/outputs/output.mjs`, 'add', bead, '--kind', kind, '--ref', ref, '--label', label, '--commit', 'abc1234'], { cwd, env: BDENV, encoding: 'utf8', windowsHide: true });
    console.log(k, r.status, (r.stdout + r.stderr).trim().slice(0, 100));
  }
  await start(port);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const c0 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c0.addInitScript(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { window.__wsu = u; return new W(u, p); }; window.WebSocket.prototype = W.prototype; });
  const pg = await c0.newPage();
  await pg.goto(base + '#/');
  await sleep(3000);
  const j = await pg.evaluate(async () => {
    const ws = new WebSocket(window.__wsu);
    await new Promise((r) => ws.addEventListener('open', r));
    return await new Promise((res) => { const id = 'q' + Math.random(); ws.addEventListener('message', (m) => { const x = JSON.parse(m.data); if (x.id === id) res(x); }); ws.send(JSON.stringify({ id, type: 'releases-list', payload: {} })); setTimeout(() => res({ timeout: true }), 40000); });
  });
  await c0.close();
  const list = j.payload?.releases || [];
  console.log('api', JSON.stringify({ total: j.payload?.total, skipped: j.payload?.skipped, degraded: j.payload?.degraded }).slice(0, 600));
  const mine = list.filter((r) => String(r.label).includes(T));
  ok('API: all 5 scratch records listed', mine.length === 5, `found ${mine.length} of ${list.length}`);
  for (const [k, , , want] of recs) {
    const r = mine.find((x) => x.label.endsWith(k));
    if (!r) { ok(`API ${k}`, false, 'record missing'); continue; }
    ok(`API ${k}: href ${want === 'open' ? 'present' : 'null'}`, want === 'open' ? !!r.href : r.href === null, `href=${r.href} server=${r.server}`);
  }
  ok('API SERVER: flagged server deploy', mine.find((x) => x.label.endsWith('SERVER'))?.server === true);
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(([a, b]) => { localStorage.setItem('beads-ui.lang', a); localStorage.setItem('beads-ui.theme', b); }, [lang, theme]);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => { if (!/localStorage/.test(String(e))) errs.push(String(e)); });
    p.setDefaultTimeout(60000);
    await p.goto(base + '#/releases');
    await p.waitForSelector('.rl3-card, .rl3-row, [class*=rl3]');
    await sleep(3000);
    for (const [k, , , want] of recs) {
      const row = p.locator(`text=${T} App ${k}`).first();
      await row.waitFor({ timeout: 9000 }).catch(() => {});
      const shownInList = await row.count();
      if (!shownInList && k !== 'SERVER') { ok(`UI ${lang} ${k}`, false, 'row not in list'); continue; }
      if (!shownInList) { ok(`UI ${lang} SERVER: not in main list (quiet section)`, true, 'not in main list'); continue; }
      await row.click();
      await sleep(1500);
      const open = await p.locator('.rl3-open').count();
      ok(`UI ${lang}-${theme} ${k}: Open ${want === 'open' ? 'shown' : 'hidden'}`, want === 'open' ? open > 0 : open === 0, `open links=${open}`);
      await p.screenshot({ path: `${OUT}/shots3/rel-${lang}-${k}.png` });
      await p.goBack().catch(() => {});
      await p.goto(base + '#/releases');
      await sleep(1200);
    }
    ok(`UI ${lang}: no page errors`, errs.length === 0, errs.join('|').slice(0, 150));
    await c.close();
  }
} catch (e) {
  ok('script', false, String(e).split('\n')[0]);
} finally {
  try { await browser?.close(); } catch {}
  stop();
  fs.writeFileSync(`${OUT}/summary-rel.md`, `# Releases Open link regression (13.25/13.26/13.24.1)\n` + rows.map((r) => `- ${r.p ? 'PASS' : 'FAIL'} ${r.n} ${r.d}`).join('\n') + '\n');
}
