// Release-candidate re-check b9e6cba: Releases screen, report version dropdown, one report lands under its inbox epic. Scratch stores only.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { start, stop, sleep, SC, PROJS, OUT } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const port = process.argv[2] || '39130';
const base = `http://127.0.0.1:${port}/`;
const BS = String.fromCharCode(92);
const BDX = `${process.env.APPDATA.split(BS).join('/')}/npm/node_modules/@beads/bd/bin/bd.exe`;
const BDENV = { ...process.env, BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe', BD_ACTOR: 'qa' };
const rows = [];
const ok = (n, p, d = '') => {
  rows.push({ n, p: !!p, d: String(d) });
  console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${String(d).slice(0, 220)}`);
};
const T = `QA${Date.now().toString(36)}`;
const cwd = `${PROJS}/beads-lite`;
const recs = [
  ['CONSOLE', 'build', 'https://console.firebase.google.com/project/demo/appdistribution', `${T} Firebase console build 1.9.9+9`, 'noOpen'],
  ['INSTALL', 'build', `https://appdistribution.firebase.google.com/testerapps/1:123:android:abc/releases/${T}`, `${T} App install 1.4.2+7`, 'open'],
  ['WEBAPP', 'deploy', `https://qa-${T}.web.app/`, `${T} App web 1.4.3+8`, 'open'],
  ['SERVER', 'deploy', 'https://console.firebase.google.com/project/demo/firestore/rules', `${T} Firestore rules`, 'noOpen']
];
const showJson = (id, dir) => {
  const sh = spawnSync(BDX, ['show', id, '--json'], { cwd: dir, env: BDENV, encoding: 'utf8', windowsHide: true });
  try {
    const j = JSON.parse(sh.stdout);
    return Array.isArray(j) ? j[0] : j;
  } catch {
    return null;
  }
};
let browser;
try {
  for (const [, kind, ref, label] of recs) {
    const r = spawnSync('node', [`${process.env.USERPROFILE.split(BS).join('/')}/company/scripts/outputs/output.mjs`, 'add', 'beads-lite-1bo5.13.24.1', '--kind', kind, '--ref', ref, '--label', label, '--commit', 'abc1234'], { cwd, env: BDENV, encoding: 'utf8', windowsHide: true });
    if (r.status) console.log('record refused', label, r.stdout + r.stderr);
  }
  await start(port);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    const tag = `${lang}-${theme}`;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(([a, b]) => { try { localStorage.setItem('beads-ui.lang', a); localStorage.setItem('beads-ui.theme', b); } catch {} }, [lang, theme]);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => { if (!/localStorage/.test(String(e))) errs.push(String(e)); });
    p.setDefaultTimeout(60000);
    // 2. Releases
    await p.goto(base + '#/releases');
    await p.locator(`text=${T} App install`).first().waitFor({ timeout: 40000 }).catch(() => {});
    await sleep(1500);
    const det = p.locator('details[data-section=server]');
    const sumTxt = (await det.count()) ? (await det.locator('summary').innerText()).replace(/\s+/g, ' ') : 'none';
    ok(`REL ${tag} server section exists and is collapsed`, (await det.count()) === 1 && !(await det.getAttribute('open')) && sumTxt.includes('('), sumTxt);
    const srvInDetails = await p.locator(`details[data-section=server] :text("${T} Firestore rules")`).count();
    const srvOutside = await p.locator(`text=${T} Firestore rules`).count();
    ok(`REL ${tag} server deploy only inside the quiet section`, srvInDetails > 0 && srvOutside === srvInDetails, `inside=${srvInDetails} total=${srvOutside}`);
    ok(`REL ${tag} app versions listed (console, install, web)`, (await p.locator(`text=${T} Firebase console`).count()) > 0 && (await p.locator(`text=${T} App install`).count()) > 0 && (await p.locator(`text=${T} App web`).count()) > 0);
    const rowTxt = await p.locator(`button:has-text("${T} App install"), li:has-text("${T} App install"), a:has-text("${T} App install")`).last().innerText().catch(() => '');
    ok(`REL ${tag} today row date reads relative (no absolute date)`, rowTxt && !/\d{4}-\d{2}-\d{2}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(rowTxt), rowTxt.replace(/\s+/g, ' '));
    await p.screenshot({ path: `${OUT}/shots3/rc-releases-${tag}.png` });
    for (const [k, , , label, want] of recs.filter((r) => r[0] !== 'SERVER')) {
      await p.goto(base + '#/releases');
      await sleep(800);
      await p.locator(`text=${label}`).first().click({ timeout: 20000 }).catch(() => {});
      await sleep(1500);
      const n = await p.locator('.rl3-open').count();
      ok(`REL ${tag} ${k}: Open ${want === 'open' ? 'shown' : 'hidden'}`, want === 'open' ? n > 0 : n === 0, `open links=${n}`);
    }
    // 3. report form
    await p.goto(base + '#/report');
    await p.waitForSelector('select[name=project]');
    await p.selectOption('select[name=project]', 'beads-lite');
    await sleep(2500);
    const opts = await p.$$eval('select[name=version-pick] option', (e) => e.map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
    ok(`RPT ${tag} version dropdown lists released versions`, opts.some((o) => o.includes('1.4.2')), opts.join(' | '));
    const other = lang === 'ar' ? 'نسخة أخرى' : 'Other version';
    ok(`RPT ${tag} last option is the other-version choice (${other})`, opts.at(-1) === other, opts.at(-1));
    ok(`RPT ${tag} version text box hidden until Other chosen`, (await p.locator('input[name=version]').count()) === 0);
    await p.selectOption('select[name=version-pick]', '__other');
    await sleep(500);
    ok(`RPT ${tag} Other shows the version box`, (await p.locator('input[name=version]').count()) === 1);
    await p.screenshot({ path: `${OUT}/shots3/rc-report-${tag}.png` });
    // 5. file one report on another scratch store
    await p.selectOption('select[name=project]', 'brother-exams');
    await sleep(2500);
    const pick = await p.$$eval('select[name=version-pick] option', (e) => e.map((x) => x.value));
    if (pick.includes('__other') && (await p.locator('input[name=version]').count()) === 0) await p.selectOption('select[name=version-pick]', '__other');
    if ((await p.locator('input[name=version]').count()) === 1) await p.fill('input[name=version]', '1.0');
    await p.fill('textarea[name=text]', `${T} ${tag} QA report, scratch`);
    const resp = p.waitForResponse((r) => r.url().includes('/api/report') && r.request().method() === 'POST', { timeout: 40000 });
    await p.click('[data-act=send]');
    const rs = await resp;
    const body = await rs.json().catch(() => ({}));
    ok(`RPT ${tag} report filed`, rs.status() === 200 && body.ok, JSON.stringify(body).slice(0, 120));
    if (body.id) {
      const dir = `${PROJS}/brother-exams`;
      const j = showJson(body.id, dir);
      const par = j?.parent || j?.parent_id || (j?.dependencies || []).find((d) => d.type === 'parent-child')?.depends_on_id || '';
      const pj = par ? showJson(par, dir) : null;
      ok(`RPT ${tag} report sits under an inbox epic in its own store`, !!par && pj?.issue_type === 'epic' && /inbox/i.test(pj?.title || ''), `id=${body.id} parent=${par} title=${pj?.title} type=${pj?.issue_type}`);
    }
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|').slice(0, 150));
    await c.close();
  }
} catch (e) {
  ok('script', false, String(e).split('\n')[0]);
} finally {
  try { await browser?.close(); } catch {}
  stop();
  fs.writeFileSync(`${OUT}/summary-rc.md`, '# RC b9e6cba re-check\n' + rows.map((r) => `- ${r.p ? 'PASS' : 'FAIL'} ${r.n} ${r.d}`).join('\n') + '\n');
}
