// QA board polish (beads-lite-1bo5.6.59.33). Cases in tools/e2e/board-polish-33/CASES.md. Plain playwright headless Chrome; browser PID recorded.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { CHROME, OUT, SC, E, base, show, comments, COMBOS, door, watch, postCard } from './lib.mjs';
const env = E(); const S = env.seed;
fs.mkdirSync(OUT + '/shots', { recursive: true });
const results = [];
async function check(id, name, fn) {
  const t0 = Date.now();
  try { const r = await fn(); results.push({ id, name, status: (r?.ok !== false) ? 'PASS' : 'FAIL', detail: r?.detail ?? '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ id, name, status: 'HARNESS', detail: String(e.message || e).split('\n')[0].slice(0, 260), ms: Date.now() - t0 }); }
  const r = results[results.length - 1]; console.log(r.status, r.id, '|', String(r.detail).slice(0, 300));
}
import { spawn } from 'node:child_process';
const PORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + SC + '/chrome-profile', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const bpid = chrome.pid; fs.writeFileSync(SC + '/browser.pid', String(bpid)); console.log('chrome pid', bpid, 'port', PORT);
let browser; for (let i = 0; i < 40; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
async function ctx(C) {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch { /* none */ } }, [C.lang, C.theme]);
  return c;
}
const nDec = (store, id) => (comments(store, id).match(/OWNER DECISION/g) || []).length;
try {
for (const [tag, C, id] of [['pc', COMBOS[1], S.q_type], ['phone', COMBOS[0], postCard('QA33 typed phone', { class: 'type', opts: [{ l: 'Name it' }], q: 'What should it be called?' }).id]]) {
  await check('P1-P3-' + tag, `typed card on task page (${tag}): box present, limited, empty blocked, answer recorded once`, async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base(door(C)) + `/#/issues?issue=${id}&at=card`); await page.waitForSelector('.u3-ts__title', { timeout: 30000 }); await page.waitForTimeout(3000);
    const box = await page.locator('.u3-cd__text').count(); const max = box ? await page.locator('.u3-cd__text').getAttribute('maxlength') : null;
    await page.screenshot({ path: `${OUT}/shots/P1-typed-task-${tag}.png` });
    const before = nDec('beads-lite', id); if (box) { await page.locator('[data-act=send]').click().catch(() => {}); await page.waitForTimeout(1500); }
    const afterEmpty = nDec('beads-lite', id); const statEmpty = show('beads-lite', id).status;
    if (box) { await page.locator('.u3-cd__text').fill('Project Falcon'); await page.locator('[data-act=send]').click(); await page.waitForTimeout(6000); }
    const j = show('beads-lite', id); const dec = nDec('beads-lite', id); const body = (await page.locator('.u3-cd, .u3-ts').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140);
    await page.screenshot({ path: `${OUT}/shots/P2-typed-answered-${tag}.png` });
    await c.close();
    return { ok: box === 1 && Number(max) > 0 && afterEmpty === before && statEmpty === 'owner_decision' && j.status !== 'owner_decision' && dec === 1 && /Project Falcon/.test(comments('beads-lite', id)) && !errs.length,
      detail: `box=${box} maxlength=${max} records_after_empty_send=${afterEmpty - before} status_after=${j.status} decision_comments=${dec} errs=${errs.join(';').slice(0, 100)} screen="${body}"` };
  });
}
await check('P2b', 'typed card leaves Desk after answer', async () => {
  const c = await ctx(COMBOS[1]); const page = await c.newPage(); await page.goto(base('pc') + '/#/decisions'); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(3000);
  const txt = await page.locator('.u3-main__in').innerText(); await c.close(); return { ok: !txt.includes(S.q_type), detail: `Desk mentions answered card id ${S.q_type}: ${txt.includes(S.q_type)}` };
});
await check('P4', 'tap card still shows 2 option buttons on task page', async () => {
  const c = await ctx(COMBOS[0]); const page = await c.newPage(); await page.goto(base('phone') + `/#/issues?issue=${S.q_pc}&at=card`); await page.waitForSelector('.u3-cd__opt', { timeout: 30000 });
  const n = await page.locator('.u3-cd__opt').count(); const txt = (await page.locator('.u3-cd__opt').allInnerTexts()).join('|').replace(/\s+/g, ' '); const tb = await page.locator('.u3-cd__text').count(); await c.close();
  return { ok: n === 2 && tb === 0, detail: `options=${n} (${txt}) typed boxes=${tb}` };
});
for (const C of [COMBOS[0], COMBOS[3]]) {
  await check('P5-P6-' + C.tag, `offline Confirm (${C.tag}): waiting message <=3.6 s, pick kept, no record; online: one record, message cleared`, async () => {
    const card = postCard('QA33 offline ' + C.tag); const id = card.id; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs, /ERR_|Failed to fetch|WebSocket|net::/i);
    await page.goto(base('phone') + `/#/issues?issue=${id}&at=card`); await page.waitForSelector('.u3-cd__opt', { timeout: 30000 }); await page.locator('.u3-cd__opt').first().click(); await page.waitForSelector('[data-act=confirm]');
    await c.setOffline(true); await page.waitForTimeout(1500); await page.locator('[data-act=confirm]').click(); const t0 = Date.now(); let msg = ''; let at = -1;
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); msg = (await page.locator('.u3-cd__err, .u3-cd__msg').allInnerTexts()).join(' | ').replace(/\s+/g, ' '); if (msg.trim()) { at = Date.now() - t0; break; } }
    await page.waitForTimeout(1500);
    const confirmKept = await page.locator('[data-act=confirm]').count(); const stOff = show('beads-lite', id).status; const decOff = nDec('beads-lite', id);
    await page.screenshot({ path: `${OUT}/shots/P5-offline-${C.tag}.png` });
    await c.setOffline(false); let done = false; for (let i = 0; i < 12 && !done; i++) { await page.waitForTimeout(2500); done = show('beads-lite', id).status !== 'owner_decision'; }
    await page.waitForTimeout(2000); const msg2 = (await page.locator('.u3-cd__err').allInnerTexts()).join('|').replace(/\s+/g, ' ');
    const j = show('beads-lite', id); const dec = nDec('beads-lite', id); await page.screenshot({ path: `${OUT}/shots/P6-online-${C.tag}.png` }); await c.close();
    return { ok: at >= 0 && at <= 3600 && confirmKept === 1 && stOff === 'owner_decision' && decOff === 0 && done && dec === 1 && !/connection|الاتصال/.test(msg2),
      detail: `msg after ${at} ms: "${msg.slice(0, 110)}"; confirm kept=${confirmKept}; offline status=${stOff} records=${decOff}; online: status=${j.status} records=${dec} err_text_after="${msg2.slice(0, 50)}"` };
  });
}
for (const C of COMBOS) {
  await check('P7-' + C.tag, `Stats rows name then title (${C.tag})`, async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs); await page.goto(base(door(C)) + '/#/'); await page.waitForSelector('[data-screen=stats] [data-block=stuck] .u3-sh__row', { timeout: 30000 }); await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const names = new Set(); const titles = new Set();
      document.querySelectorAll('.u3-sh__row--q').forEach((r) => { const s = r.querySelector('strong'); const m = r.querySelector('.u3-sh__muted'); if (s && m && m.textContent.trim() && !/\d/.test(m.textContent)) { names.add(s.textContent.trim()); titles.add(m.textContent.trim()); } });
      const rows = [...document.querySelectorAll('[data-block=stuck] .u3-sh__row .u3-sh__muted')].map((e) => e.textContent.trim());
      return { names: [...names], titles: [...titles], rows, hs: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    let good = 0, bad = 0, unk = 0;
    for (const r of info.rows) { const m = r.split(' - '); if (m.length < 2) { unk++; continue; } const a = m[0].trim(); const b = m.slice(1).join(' - ').trim(); if (info.titles.includes(a) || info.names.includes(b)) bad++; else if (info.names.includes(a) || info.titles.includes(b)) good++; else unk++; }
    await page.screenshot({ path: `${OUT}/shots/P7-stats-${C.tag}.png` }); await c.close();
    return { ok: info.rows.length > 0 && bad === 0 && good > 0 && !info.hs && !errs.length, detail: `stuck rows=${info.rows.length} name-first=${good} title-first=${bad} unverifiable=${unk} sample="${info.rows.slice(0, 3).join(' / ')}" hscroll=${info.hs} errs=${errs.join(';').slice(0, 80)}` };
  });
}
for (const C of [COMBOS[0], COMBOS[1], COMBOS[2]]) {
  await check('P8-P9-' + C.tag, `Settings absent from nav and More, route loads (${C.tag})`, async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs); await page.goto(base(door(C)) + '/#/'); await page.waitForSelector('.u3-top', { timeout: 30000 }); await page.waitForTimeout(1500);
    const phone = C.w < 500; const navLinks = await page.evaluate(() => [...document.querySelectorAll('.u3-side__nav a, .u3-tabbar a, .u3-tabbar button')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('href') || '') + ':' + e.textContent.trim().replace(/\s+/g, ' ')));
    let more = []; if (phone) { await page.locator('.u3-tabbar button, .u3-tabbar a').last().click(); await page.waitForSelector('.u3-more'); more = await page.evaluate(() => [...document.querySelectorAll('.u3-more a')].map((e) => e.getAttribute('href'))); await page.screenshot({ path: `${OUT}/shots/P8-more-${C.tag}.png` }); }
    else await page.screenshot({ path: `${OUT}/shots/P8-nav-${C.tag}.png` });
    const hasSet = navLinks.concat(more).some((x) => /settings/.test(x));
    await page.goto(base(door(C)) + '/#/settings'); await page.waitForTimeout(2500); const title = await page.locator('.u3-top__title').innerText().catch(() => ''); const body = (await page.locator('.u3-main__in').innerText().catch(() => '')).trim().length; await page.screenshot({ path: `${OUT}/shots/P9-settings-route-${C.tag}.png` });
    await c.close();
    return { ok: !hasSet && navLinks.length >= 4 && body > 0 && !errs.length, detail: `nav=[${navLinks.join(' ; ')}] more=[${more.join(',')}] settings_in_nav=${hasSet}; route title="${title}" body_chars=${body} errs=${errs.join(';').slice(0, 80)}` };
  });
}
for (const C of [COMBOS[0], COMBOS[1]]) {
  await check('P10-' + C.tag, `neighbour screens open, no errors, no hscroll (${C.tag})`, async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs); const out = [];
    for (const h of ['#/', '#/decisions', '#/issues', '#/releases', '#/time', '#/projects']) { await page.goto(base(door(C)) + '/' + h); await page.waitForSelector('.u3-main__in', { timeout: 30000 }); await page.waitForTimeout(1800); const m = await page.evaluate(() => ({ hs: document.documentElement.scrollWidth > innerWidth + 1, len: document.body.innerText.length })); out.push(`${h}:${m.len}${m.hs ? ':HSCROLL' : ''}`); }
    await c.close(); return { ok: !errs.length && !out.some((x) => /HSCROLL|:0$/.test(x)), detail: out.join(' ') + ' errs=' + errs.join(';').slice(0, 100) };
  });
}
} finally {
  await browser.close().catch(() => {});
  try { process.kill(bpid); } catch {}
  fs.writeFileSync(OUT + '/results-browser.json', JSON.stringify(results, null, 1));
  const c = { PASS: 0, FAIL: 0, HARNESS: 0 }; results.forEach((r) => c[r.status]++);
  fs.writeFileSync(OUT + '/summary-browser.md', `Browser pass: ${results.length} cases; PASS ${c.PASS}, FAIL ${c.FAIL}, HARNESS ${c.HARNESS}\n\n` + results.map((r) => `- ${r.status} ${r.id} ${r.name} | ${r.detail}`).join('\n') + '\n');
}
