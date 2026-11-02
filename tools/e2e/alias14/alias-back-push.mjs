// company-8ce8.14.11: old-id alias in real Chrome (12 ids), back button not stuck, push (bell, push-key, Phones list).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const Q = process.env.FIXTURE, OUT = process.env.QA_OUT, PORT = Number(process.env.PORT || 4750);
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)('playwright-core');
const WS = createRequire(root + '/package.json')('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (b) => b.toString('base64url');
const res = [];
const rec = (id, desc, ok, note = '') => { res.push({ id, desc, ok, note }); console.log(ok ? 'PASS' : 'FAIL', id, desc, note); };
const cases = fs.readFileSync(`${Q}/cases.tsv`, 'utf8').trim().split('\n').map((l) => l.split('\t'));
const env = { ...process.env, PORT: String(PORT), PHONE_PORT: 'off', USERPROFILE: `${Q}/home`, HOME: `${Q}/home`, BEADS_MOVED_ALIAS: `${Q}/alias.tsv` };
const outFd = fs.openSync(`${OUT}/alias-board.log`, 'w');
const srv = spawn(process.execPath, [`${root}/server/index.js`], { cwd: `${Q}/ws/company`, env, stdio: ['ignore', outFd, outFd], windowsHide: true });
fs.writeFileSync(`${OUT}/alias-board.pid`, String(srv.pid));
const base = `http://127.0.0.1:${PORT}`;
let b;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/api/workspaces`)).ok) break; } catch { /* retry */ }
    await sleep(500);
  }
  await fetch(`${base}/api/register-workspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: `${Q}/ws/patient-record`, database: `${Q}/ws/patient-record/.beads` }) });
  b = await chromium.launch({ headless: true, executablePath: process.env.EXE });
  const detail = (p) => p.evaluate(() => (document.querySelector('#detail-root') || { innerText: '' }).innerText);
  // A: alias + back button, each of 12 ids, with a prior history entry
  for (const [, old, neu] of cases) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${base}/#/issues`);
    await sleep(1200);
    const len0 = await p.evaluate(() => history.length);
    p.evaluate((h) => { location.hash = h; }, `#/issues?issue=${old}`).catch(() => {});
    let ok = false, txt = '', h = '';
    for (let i = 0; i < 100 && !ok; i++) {
      await sleep(150);
      txt = await detail(p);
      h = await p.evaluate(() => location.hash);
      ok = /patient|PMR|record/i.test(txt) && !/Loading/.test(txt.slice(0, 40)) && h.endsWith('issue=' + neu);
    }
    const len1 = await p.evaluate(() => history.length);
    rec('A-open ' + old, `opens ${neu} with detail text`, ok, ok ? '' : `hash=${h} txt=${txt.slice(0, 40)}`);
    await p.goBack().catch(() => {});
    await sleep(1500);
    const hb = await p.evaluate(() => location.hash);
    await sleep(1500);
    const hb2 = await p.evaluate(() => location.hash);
    rec('A-back ' + old, 'back returns to #/issues (not stuck on old/new id) and stays', /^#\/issues$|^#\/issues\?(?!.*issue=)/.test(hb) && hb === hb2, `len ${len0}->${len1}, after back=${hb}, +1.5s=${hb2}`);
    await ctx.close();
  }
  // A2: old id as first page
  {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto(`${base}/#/issues?issue=company-f85j.5`).catch(() => {});
    await sleep(4000);
    const h = await p.evaluate(() => location.hash);
    const len = await p.evaluate(() => history.length);
    rec('A2-first-page', 'old id as first page lands on new id; no extra loop history entries', h.endsWith('issue=patient-record-f85j.5') && len <= 3, `hash=${h} len=${len}`);
    await ctx.close();
  }
  // B: push over real PC socket + bell UI
  const rpc = (ws, type, payload) => new Promise((res2) => {
    const id = 'q' + Math.random().toString(36).slice(2);
    const on = (m) => { const r = JSON.parse(m); if (r.id === id) { ws.off('message', on); res2(r); } };
    ws.on('message', on);
    ws.send(JSON.stringify({ id, type, payload }));
  });
  const html = await (await fetch(`${base}/`)).text();
  const tokn = /name="board-token" content="([^"]+)"/.exec(html)[1];
  const ws = new WS(`ws://127.0.0.1:${PORT}/ws?t=${tokn}`, { headers: { origin: base } });
  await new Promise((r) => ws.on('open', r));
  const k = await rpc(ws, 'push-key', {});
  rec('B-key', 'push-key returns public key only', k.ok && typeof k.payload?.key === 'string' && k.payload.key.length > 60 && !/private/i.test(JSON.stringify(k)), JSON.stringify(k).slice(0, 80));
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/qa-8ce8-14-11', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } };
  const s = await rpc(ws, 'push-subscribe', { subscription: sub, label: 'QA Phone' });
  const l = await rpc(ws, 'push-list', {});
  rec('B-list', 'subscribe then push-list shows the phone, no endpoint/keys', s.ok && l.ok && l.payload.subscriptions.some((x) => x.label === 'QA Phone') && !/fcm\.googleapis|p256dh/.test(JSON.stringify(l)), JSON.stringify(l).slice(0, 160));
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/#/issues`);
  await sleep(2500);
  const bell = p.locator('button.nt-bell');
  rec('B-bell', 'bell button present', (await bell.count()) === 1);
  await bell.click();
  await sleep(2000);
  const panel = await p.evaluate(() => (document.querySelector('.nt-panel') || { innerText: '' }).innerText);
  const phones = await p.locator('.nt-phone').count();
  const rm = await p.locator('.nt-phone-rm').count();
  const ov = await p.evaluate(() => document.documentElement.scrollWidth <= 391);
  await p.screenshot({ path: `${OUT}/bell-phones-390x844.png` });
  rec('B-panel', 'bell panel opens, Phones list shows QA Phone + Remove, no horizontal overflow', panel.length > 0 && phones === 1 && rm === 1 && /QA Phone/.test(panel) && ov, `phones=${phones} rm=${rm} overflow-ok=${ov}`);
  await p.locator('.nt-phone-rm').click();
  await sleep(1500);
  const l2 = await rpc(ws, 'push-list', {});
  rec('B-remove', 'Remove empties the list', l2.ok && l2.payload.subscriptions.length === 0 && (await p.locator('.nt-phone').count()) === 0);
  rec('B-noerr', 'no page errors', errs.length === 0, errs.join('|').slice(0, 120));
  ws.close();
} catch (e) {
  rec('HARNESS', 'script error', false, String(e).slice(0, 200));
} finally {
  await Promise.race([b?.close(), sleep(5000)]).catch(() => {});
  try { process.kill(srv.pid); } catch { /* gone */ }
  fs.writeFileSync(`${OUT}/alias-back-push.json`, JSON.stringify(res, null, 1));
  const f = res.filter((r) => !r.ok);
  console.log(`TOTAL ${res.length - f.length} PASS / ${f.length} FAIL`);
  process.exit(f.length ? 1 : 0);
}
