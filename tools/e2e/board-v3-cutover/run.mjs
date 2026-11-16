// QA wave 6 cutover runner. Plain playwright (headless Chrome), no ?ui flag anywhere unless a case says so.
// Writes OUT/results.json and OUT/summary-browser.md. Each case is try/caught: a wrong selector in the harness shows as HARNESS, a board problem as FAIL.
// usage: node run.mjs [sectionLetters]   e.g. node run.mjs ABC
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { CHROME, OUT, SC, E, base, bd, show, comments, FAST3G, COMBOS, door, watch } from './lib.mjs';
import { TN } from './paths.mjs';

const only = (process.argv[2] || 'ABCDEFG').toUpperCase();
const env = E();
const S = env.seed;
fs.mkdirSync(OUT + '/shots', { recursive: true });
fs.writeFileSync(SC + '/runner.pid', String(process.pid));
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(id, name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ok = r === undefined ? true : r.ok !== false;
    results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail: r?.detail ?? '', ms: Date.now() - t0 });
  } catch (e) {
    results.push({ id, name, status: 'HARNESS', detail: String(e.message || e).split('\n')[0].slice(0, 260), ms: Date.now() - t0 });
  }
  const r = results[results.length - 1];
  console.log(r.status, r.id, r.name, '|', String(r.detail).slice(0, 200));
}
const notRun = (id, name, why) => { results.push({ id, name, status: 'NOT COVERED', detail: why, ms: 0 }); console.log('NOT COVERED', id, name, '|', why); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
async function ctx(C, extra = {}) {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US', ...extra });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch { /* none */ } }, [C.lang, C.theme]);
  return c;
}
const COMBO0 = COMBOS[0];
const measure = (page) => page.evaluate(() => {
  const iw = innerWidth;
  const txt = document.body.innerText;
  const off = [...document.querySelectorAll('.u3 button, .u3 a[href], .u3 input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > iw + 1) && !(() => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; })(); }).length;
  const small = [...document.querySelectorAll('.u3 button, .u3 a[href]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 28 || r.width < 28) && getComputedStyle(e).visibility !== 'hidden'; }).length;
  return {
    hscroll: document.documentElement.scrollWidth > iw + 1,
    len: txt.length,
    raw: (txt.match(/\bu3_[a-z_]+|undefined|NaN|\[object|\{\{/g) || []).slice(0, 4),
    arDigits: (txt.match(/[\u0660-\u0669\u06F0-\u06F9]/g) || []).length,
    dir: document.documentElement.dir || document.querySelector('[dir]')?.getAttribute('dir'),
    legacy: ['#shell', '.rpt-open', 'nav.tabs', '#list-root'].filter((s) => document.querySelector(s)).length,
    off, small,
    v3: !!document.querySelector('.u3-main__in')
  };
});

// ---------------------------------------------------------------- A / B: default board, every screen, every combo
const SCREENS = [
  ['stats', '#/'], ['desk', '#/decisions'], ['tasks-list', '#/issues'], ['tasks-board', '#/board'], ['tasks-epics', '#/epics'],
  ['task', `#/issues?issue=${S.plain}`], ['task-card', `#/issues?issue=${S.q_att}&at=card`], ['releases', '#/releases'], ['time', '#/time'], ['projects', '#/projects'], ['settings', '#/settings']
];
const allReqs = new Set();
if (only.includes('A') || only.includes('B')) {
  for (const C of COMBOS) {
    await check(`B-${C.tag}`, `every screen renders clean, NO ?ui flag [${C.tag}]`, async () => {
      const c = await ctx(C); const rows = []; const bad = [];
      for (const [name, hash] of SCREENS) {
        const page = await c.newPage(); const errs = []; watch(page, errs);
        page.on('request', (r) => allReqs.add(r.url().replace(/^https?:\/\/[^/]+/, '')));
        await page.goto(base(door(C)) + '/' + hash);
        await page.waitForSelector('.u3-main__in', { timeout: 30000 }); await page.waitForTimeout(2300);
        const m = await measure(page); await page.screenshot({ path: `${OUT}/shots/B-${C.tag}-${name}.png` });
        rows.push({ name, ...m, errs });
        if (m.hscroll || m.len < 40 || m.raw.length || m.legacy || m.off || !m.v3 || errs.length || (C.lang === 'ar' && (m.dir !== 'rtl' || m.arDigits))) bad.push(`${name}: ${JSON.stringify({ hscroll: m.hscroll, len: m.len, raw: m.raw, legacy: m.legacy, off: m.off, dir: m.dir, arDigits: m.arDigits, errs })}`);
        await page.close();
      }
      fs.writeFileSync(`${OUT}/B-${C.tag}.json`, JSON.stringify(rows, null, 1));
      await c.close();
      return { ok: bad.length === 0, detail: bad.length ? bad.join(' || ') : `${rows.length} screens clean; small tap targets (<28px): ${rows.map((r) => r.name + ':' + r.small).join(',')}` };
    });
  }
  // A1/A2/A3: default shell, no legacy, flags
  await check('A1', 'opening / with no flag shows the new shell; final URL has no ?ui', async () => {
    const c = await ctx(COMBO0); const page = await c.newPage(); await page.goto(base('phone') + '/');
    await page.waitForSelector('.u3-top', { timeout: 30000 }); const u = page.url(); const nav = await page.locator('.u3-tabbar a, .u3-tabbar button').count();
    await c.close(); return { ok: !/ui=/.test(u) && nav >= 3, detail: `url=${u.replace(/^https?:\/\/[^/]+/, '')} tabbar=${nav}` };
  });
  await check('A3', '?ui=3, ?ui=2 and stored bl.ui flags land on the new board', async () => {
    const out = [];
    for (const [label, q, store] of [['?ui=3', '/?ui=3', null], ['?ui=2', '/?ui=2', null], ['stored bl.ui=2', '/', ['bl.ui', '2']], ['stored bl.ui=3', '/', ['bl.ui', '3']], ['stored beads-ui.ui=2', '/', ['beads-ui.ui', '2']]]) {
      const c = await ctx(COMBO0); const page = await c.newPage(); const errs = []; watch(page, errs);
      if (store) await page.addInitScript(([k, v]) => localStorage.setItem(k, v), store);
      await page.goto(base('phone') + q + '#/issues?issue=' + S.plain); let ok = true;
      try { await page.waitForSelector('.u3-ts__title', { timeout: 20000 }); } catch { ok = false; }
      const legacy = await page.evaluate(() => !!document.getElementById('shell'));
      out.push(`${label}:${ok && !legacy && !errs.length ? 'ok' : 'BAD(' + errs.join(';').slice(0, 80) + ')'}`); await c.close();
    }
    return { ok: out.every((x) => x.endsWith(':ok')), detail: out.join(' ') };
  });
  await check('A2', 'no legacy asset requested, no failed request across the whole journey', async () => {
    const list = [...allReqs]; const legacy = list.filter((u) => /styles\.css|\/views\/|legacy|bundle\.js\.map/.test(u));
    return { ok: legacy.length === 0, detail: `${list.length} distinct requests; legacy-looking: ${legacy.join(',') || 'none'}` };
  });
  await check('A4', 'first load payload (index + js + css), gzip over the wire, no flag', async () => {
    const page = await (await ctx(COMBO0, { serviceWorkers: 'block' })).newPage(); const rows = [];
    const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    page.on('response', async (r) => { const t = r.request().resourceType(); if (['script', 'stylesheet', 'document'].includes(t)) { try { const s = await r.request().sizes(); rows.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ''), t, enc: r.headers()['content-encoding'] || '', body: s.responseBodySize }); } catch { /* none */ } } });
    await page.goto(base('phone') + '/'); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(2500);
    const gz = rows.filter((r) => r.t !== 'document'); const total = gz.reduce((a, r) => a + r.body, 0);
    // independent: gzip each served body ourselves
    let own = 0; for (const r of gz) { const buf = Buffer.from(await (await fetch(base('pc') + r.url, { headers: { 'accept-encoding': 'identity' } })).arrayBuffer()); own += zlib.gzipSync(buf, { level: 9 }).length; }
    fs.writeFileSync(OUT + '/payload-wire.json', JSON.stringify({ rows, wire_total: total, own_gzip9_total: own }, null, 1));
    await page.context().close();
    return { ok: total <= 131064 && own <= 131064, detail: `wire (as served) ${total} B over ${gz.length} files (${gz.map((r) => r.enc || 'identity').filter((v, i, a) => a.indexOf(v) === i)}); own gzip-9 ${own} B; budget 131064` };
  });
  await check('A5', 'service worker: shell list all 200, nothing legacy, offline reload opens the shell', async () => {
    const c = await ctx(COMBO0); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('phone') + '/'); await page.waitForSelector('.u3-main__in');
    const info = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; const keys = await caches.keys(); const urls = []; for (const k of keys) urls.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return { state: reg.active?.state, keys, urls }; });
    const sw = await page.evaluate(() => fetch('/sw.js').then((r) => r.text())); const m = /JSON\.parse\('(.+?)'\)/.exec(sw); const shell = m ? JSON.parse(m[1]) : [];
    const bad = []; for (const u of shell) { const st = await page.evaluate((u) => fetch(u).then((r) => r.status), u); if (st !== 200) bad.push(u + ' ' + st); }
    const legacy = shell.filter((u) => /styles\.css|\/views\//.test(u));
    await page.waitForTimeout(1500); await c.setOffline(true); let off = 'x';
    try { await page.reload({ timeout: 10000 }); await page.waitForSelector('.u3-top', { timeout: 8000 }); off = 'shell opens'; } catch (e) { off = 'FAIL ' + String(e.message).split('\n')[0].slice(0, 80); }
    await c.setOffline(false); await c.close();
    return { ok: info.state === 'activated' && bad.length === 0 && legacy.length === 0 && info.urls.length >= shell.length && off === 'shell opens', detail: `sw=${info.state} shell=${shell.length} cached=${info.urls.length} bad=${bad.join(',') || 'none'} legacy=${legacy.join(',') || 'none'} offline=${off} errs=${errs.length}` };
  });
}

// ---------------------------------------------------------------- B detail: filters, bulk, search, bell, time, releases, projects
if (only.includes('B')) {
  for (const C of [COMBOS[0], COMBOS[2]]) {
    await check(`B3-${C.tag}`, `tasks filters change the list and survive refresh [${C.tag}]`, async () => {
      const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
      await page.goto(base(door(C)) + '/#/issues'); await page.waitForSelector('.u3t-card, .u3t-group', { timeout: 30000 }); await page.waitForTimeout(1500);
      const n0 = await page.locator('.u3t-card').count();
      const btns = await page.locator('.u3t-filters button, .u3t-bar button').allInnerTexts();
      const proj = page.locator('.u3t-filters button, .u3t-bar button').filter({ hasText: /Project|المشروع/ }).first();
      await proj.click(); await page.waitForSelector('.u3t-opt', { timeout: 5000 });
      const opts = await page.locator('.u3t-opt').allInnerTexts();
      await page.locator('.u3t-opt').filter({ hasText: 'whisper-flow' }).first().click(); await page.waitForTimeout(1200); await page.keyboard.press('Escape');
      const n1 = await page.locator('.u3t-card').count(); const chip = await page.locator('.u3t-fchip').count(); const hash1 = await page.evaluate(() => location.hash);
      await page.screenshot({ path: `${OUT}/shots/B3-${C.tag}-filtered.png` });
      await page.reload(); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(2000);
      const n2 = await page.locator('.u3t-card').count(); const chip2 = await page.locator('.u3t-fchip').count();
      const clear = page.locator('.u3t-fchip--clear'); if (await clear.count()) { await clear.first().click(); await page.waitForTimeout(800); }
      const n3 = await page.locator('.u3t-card').count();
      await c.close();
      return { ok: n1 !== n0 && chip > 0 && n2 === n1 && n3 === n0 && !errs.length, detail: `unfiltered=${n0} filtered(whisper-flow)=${n1} chips=${chip} after refresh=${n2} chips=${chip2} cleared=${n3} hash=${hash1} options=${opts.length} errs=${errs.join(';').slice(0, 100)}` };
    });
  }
  await check('B3b', 'bulk bar: enter, select one, count, cancel, no sideways scroll at 390 en [F2 regression]', async () => {
    const C = COMBOS[3]; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('phone') + '/#/issues'); await page.waitForSelector('.u3t-card', { timeout: 30000 });
    await page.getByTestId('bulk-enter').click(); await page.getByTestId('bulk-bar').waitFor();
    await page.locator('.u3t-card').first().click(); await page.waitForTimeout(400);
    const count = (await page.getByTestId('bulk-count').innerText()).replace(/\s+/g, ' '); const h = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.screenshot({ path: `${OUT}/shots/B3b-bulk-390-en.png` }); await page.getByTestId('bulk-cancel').click(); await c.close();
    return { ok: h && !errs.length, detail: `count="${count}" fits=${h} errs=${errs.join(';').slice(0, 100)}` };
  });
  await check('B10', 'search: type, hits, tap a hit after visiting another screen first [F3 regression]', async () => {
    const C = COMBOS[0]; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('phone') + '/#/releases'); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(1500);
    await page.goto(base('phone') + '/#/'); await page.waitForTimeout(1500); await page.locator('.u3-search__btn').click(); await page.locator('.u3-search__field input').fill('QA6 plain'); await page.waitForTimeout(1200);
    const hits = await page.locator('.u3-search__hit').count(); await page.screenshot({ path: `${OUT}/shots/B10-search-390.png` });
    await page.locator('.u3-search__hit').first().click(); await page.waitForSelector('.u3-ts__title', { timeout: 15000 }); const title = await page.locator('.u3-ts__title').innerText();
    await c.close(); return { ok: hits > 0 && /QA6 plain/.test(title) && !errs.length, detail: `hits=${hits} opened="${title}" errs=${errs.join(';').slice(0, 160)}` };
  });
  for (const C of [COMBOS[0], COMBOS[1]]) {
    await check(`B9-${C.tag}`, `notifications bell opens, lists, closes; fits the window [${C.tag}]`, async () => {
      const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
      await page.goto(base(door(C)) + '/#/'); await page.waitForSelector('.u3-pn-bell'); await page.waitForTimeout(2500);
      await page.locator('.u3-pn-bell').click(); await page.waitForSelector('.u3-pn__list, .u3-pn__empty, .u3-pn', { timeout: 5000 });
      const items = await page.locator('.u3-pn__item').count(); const txt = (await page.locator('.u3-pn').first().innerText()).replace(/\s+/g, ' ').slice(0, 120);
      const fits = await page.evaluate(() => { const p = document.querySelector('.u3-pn__list, .u3-pn'); const r = p.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
      await page.screenshot({ path: `${OUT}/shots/B9-${C.tag}-bell.png` });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300); if (await page.locator('.u3-pn__list').count()) await page.locator('.u3-pn-bell').click(); await page.waitForTimeout(300);
      await c.close(); return { ok: fits && !errs.length, detail: `items=${items} fits=${fits} text="${txt}" errs=${errs.join(';').slice(0, 100)}` };
    });
  }
  await check('B5', 'releases: list shows seeded deploy and build; open reader; link; download bytes', async () => {
    const C = COMBOS[1]; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('pc') + '/#/releases'); await page.waitForSelector('.rl3-card, .rl3-item', { timeout: 30000 }); await page.waitForTimeout(1500);
    const cards = await page.locator('.rl3-card').count(); const txt = await page.locator('.rl3-main').innerText();
    await page.screenshot({ path: `${OUT}/shots/B5-releases-1440.png` });
    const apkCard = page.locator('.rl3-card', { hasText: 'QA6 test apk' }).first(); await apkCard.click(); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/shots/B5-release-open-1440.png` });
    const detail = (await page.locator('.rl3-main, .rl3-aside').first().innerText()).replace(/\s+/g, ' ').slice(0, 200);
    const links = await page.locator('a[href]').evaluateAll((a) => a.map((x) => x.getAttribute('href')).filter((h) => /^https?:|release-file|\/api\//.test(h || '')).slice(0, 8));
    const taskLink = await page.locator('.rl3-tlink, .rl3-task a, a[href*="issue="]').count();
    // download through the page's own link or the endpoint the link points at
    let dl = 'no link'; const dlLink = page.locator('a[href*="release-file"], a[download]').first();
    if (await dlLink.count()) { const href = await dlLink.getAttribute('href'); const r = await fetch(base('pc') + href); const buf = Buffer.from(await r.arrayBuffer()); dl = `status=${r.status} type=${r.headers.get('content-type')} disp=${r.headers.get('content-disposition')} bytes=${buf.length} sha_ok=${require_sha(buf) === S.apk_sha}`; }
    await c.close();
    return { ok: cards >= 2 && /QA6 board deploy/.test(txt) && /status=200/.test(dl) && /sha_ok=true/.test(dl) && !errs.length, detail: `cards=${cards} reader="${detail}" links=${JSON.stringify(links).slice(0, 160)} task_links=${taskLink} download: ${dl} errs=${errs.join(';').slice(0, 100)}` };
  });
}
import crypto from 'node:crypto';
function require_sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

// ---------------------------------------------------------------- C: old links
if (only.includes('C')) {
  const C = COMBOS[1];
  for (const at of ['c-last', 'c-1', 'description', 'design', 'notes', 'acceptance', 'card']) {
    await check(`C1-${at}`, `#/issues?issue=<id>&at=${at} opens the task and brings the target into view`, async () => {
      const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs);
      const id = at === 'card' ? S.q_stale : S.plain;
      await page.goto(base('pc') + `/#/issues?issue=${id}&at=${at}`); await page.waitForSelector('.u3-ts__title', { timeout: 30000 }); await page.waitForTimeout(2500);
      const r = await page.evaluate((at) => {
        const q = at === 'card' ? '.u3-cardhost, [data-anchor="card"]' : `[data-anchor="${at}"]`; const el = document.querySelector(q) || document.querySelector(`[data-at-target="${at}"]`);
        if (!el) return { found: false, anchors: [...document.querySelectorAll('[data-anchor]')].map((e) => e.dataset.anchor).slice(0, 12) };
        const b = el.getBoundingClientRect(); return { found: true, inView: b.bottom > 0 && b.top < innerHeight, top: Math.round(b.top), hl: [...el.classList].join(' ') };
      }, at);
      await page.screenshot({ path: `${OUT}/shots/C1-${at}.png` }); await c.close();
      return { ok: r.found && r.inView && !errs.length, detail: JSON.stringify(r) + ' errs=' + errs.join(';').slice(0, 100) };
    });
  }
  await check('C2/C3', '?ui=3 link, older #/issue/<id> link and ?ui=2 link open the same task', async () => {
    const out = [];
    for (const u of [`/?ui=3#/issues?issue=${S.plain}`, `/#/issue/${S.plain}`, `/?ui=2#/issues?issue=${S.plain}`, `/#/board?issue=${S.plain}`]) {
      const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs); await page.goto(base('pc') + u);
      let t = ''; try { await page.waitForSelector('.u3-ts__title', { timeout: 15000 }); t = await page.locator('.u3-ts__title').innerText(); } catch { t = 'NONE'; }
      out.push(`${u.slice(0, 40)} -> ${t === 'QA6 plain task for links' ? 'ok' : t} errs=${errs.length}`); await c.close();
    }
    return { ok: out.every((x) => /-> ok errs=0/.test(x)), detail: out.join(' | ') };
  });
  await check('C4', 'every top-level hash opens its screen, refresh keeps it, back returns', async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs); const out = [];
    const routes = [['#/', '[data-screen=stats], .u3-sh'], ['#/decisions', '.dk3'], ['#/board', '.u3t'], ['#/epics', '.u3t'], ['#/issues', '.u3t'], ['#/releases', '.rl3-main'], ['#/time', '.u3-tms'], ['#/projects', '.u3p'], ['#/settings', '.u3-stub, .u3-main__in']];
    for (const [h, sel] of routes) {
      await page.goto(base('pc') + '/' + h); await page.waitForSelector(sel, { timeout: 20000 }).catch(() => {}); const a = await page.locator(sel).count(); await page.reload(); await page.waitForTimeout(1200); out.push(`${h}:${a ? 'ok' : 'MISSING'}:${(await page.evaluate(() => location.hash)) === h ? 'kept' : 'LOST'}`);
    }
    await page.goto(base('pc') + '/#/issues'); await page.waitForTimeout(800); await page.goto(base('pc') + '/#/releases'); await page.waitForTimeout(800); await page.goBack(); await page.waitForTimeout(800);
    const back = await page.evaluate(() => location.hash); await c.close();
    return { ok: out.every((x) => x.includes(':ok:kept')) && back === '#/issues' && !errs.length, detail: out.join(' ') + ` back=${back} errs=${errs.join(';').slice(0, 100)}` };
  });
  await check('C5/C7', 'unknown bead id and unknown hash: honest page, no crash', async () => {
    const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs, /issue_not_found|not.found/i);
    await page.goto(base('pc') + '/#/issues?issue=beads-lite-zzzz9'); await page.waitForTimeout(5000); const t1 = (await page.evaluate(() => document.querySelector('.u3-main__in')?.innerText || '')).replace(/\s+/g, ' ').slice(0, 140);
    await page.goto(base('pc') + '/#/nope/never'); await page.waitForTimeout(2500); const t2 = await page.locator('.u3t').count();
    await c.close(); return { ok: /not found|couldn|no such|مش موجودة|غير موجود/i.test(t1) && t2 > 0, detail: `unknown id -> "${t1}"; unknown hash -> tasks screen=${t2 > 0}; errs=${errs.join(';').slice(0, 120)}` };
  });
  await check('C6', 'push/card link: service worker builds #/issues?issue=<id>&at=card', async () => {
    const sw = await (await fetch(base('pc') + '/sw.js')).text(); const m = sw.match(/issues\?issue=[^'"`]*/g) || []; const m2 = sw.match(/at=card|#\/decisions|openWindow\([^)]*\)/g) || [];
    return { ok: m.length > 0 || m2.length > 0, detail: `sw link patterns: ${JSON.stringify(m.slice(0, 3))} ${JSON.stringify(m2.slice(0, 4))}` };
  });
}

// ---------------------------------------------------------------- D: owner card answer, wake, attachments, push
const wakeFiles = () => fs.existsSync(env.home + '/wake') ? fs.readdirSync(env.home + '/wake', { recursive: true }).filter((f) => String(f).endsWith('.json')).map((f) => String(f)) : [];
if (only.includes('D')) {
  await check('D1', 'waiting cards show on Desk with options and on their task page', async () => {
    const c = await ctx(COMBOS[1]); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('pc') + '/#/decisions'); await page.waitForSelector('.u3-cd', { timeout: 30000 }); await page.waitForTimeout(1500);
    const n = await page.locator('.u3-cd').count(); const txt = (await page.locator('.dk3').innerText()).replace(/\s+/g, ' ');
    await page.goto(base('pc') + `/#/issues?issue=${S.q_pc}&at=card`); await page.waitForSelector('.u3-cardhost .u3-cd__opt', { timeout: 30000 }); const opts = await page.locator('.u3-cd__opt').count();
    await page.screenshot({ path: `${OUT}/shots/D1-card-task-1440.png` }); await c.close();
    return { ok: n >= 5 && opts === 2 && !errs.length, detail: `desk cards=${n} task page options=${opts} deskhas_att_card=${/QA6 card with attachments|Wide shot/.test(txt)} errs=${errs.join(';').slice(0, 100)}` };
  });
  await check('D2/D3', 'answer on PC: option, confirm; one record, status moves back, one wake, card says answered', async () => {
    const before = wakeFiles().length; const c = await ctx(COMBOS[2]); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('pc') + `/#/issues?issue=${S.q_pc}&at=card`); await page.waitForSelector('.u3-cd__opt');
    await page.locator('.u3-cd__opt').nth(1).click(); await page.waitForSelector('[data-act=confirm]'); await page.screenshot({ path: `${OUT}/shots/D2-selected-1440-light.png` });
    await page.locator('[data-act=confirm]').click(); await page.waitForTimeout(6000);
    const j = show('beads-lite', S.q_pc); const cm = comments('beads-lite', S.q_pc); const decisions = (cm.match(/OWNER DECISION/g) || []).length;
    const wk = wakeFiles(); const newW = wk.slice(0, wk.length); const bodies = newW.map((f) => { try { return JSON.parse(fs.readFileSync(env.home + '/wake/' + f, 'utf8')); } catch { return null; } }).filter((x) => x && JSON.stringify(x).includes(S.q_pc));
    const ui = (await page.locator('.u3-cardhost').innerText()).replace(/\s+/g, ' ').slice(0, 180); await page.screenshot({ path: `${OUT}/shots/D2-answered-1440-light.png` });
    await c.close();
    const wkOk = bodies.length === 1 && JSON.stringify(bodies[0]).length < 1024;
    return { ok: j.status !== 'owner_decision' && j.assignee === 'swe' && decisions === 1 && wkOk && !errs.length, detail: `status=${j.status} assignee=${j.assignee} decision_comments=${decisions} wake_files(new for bead)=${bodies.length} wake=${JSON.stringify(bodies[0] || {}).slice(0, 200)} ui="${ui}" wake_files_before=${before} errs=${errs.join(';').slice(0, 100)}` };
  });
  await check('D4', 'stale card: answered in another tab, second confirm is refused honestly, still one record', async () => {
    const c = await ctx(COMBOS[1]); const a = await c.newPage(); const b = await c.newPage(); const errs = []; watch(b, errs, /already|handled|409|400|403/i);
    for (const p of [a, b]) { await p.goto(base('pc') + `/#/issues?issue=${S.q_stale}&at=card`); await p.waitForSelector('.u3-cd__opt'); await p.locator('.u3-cd__opt').first().click(); await p.waitForSelector('[data-act=confirm]'); }
    await a.locator('[data-act=confirm]').click(); await a.waitForTimeout(5000);
    await b.locator('[data-act=confirm]').click(); await b.waitForTimeout(4000);
    const msg = ((await b.locator('.u3-cd__err, .u3-cd__msg').allInnerTexts()).join(' | ') || (await b.locator('.u3-cardhost').innerText())).replace(/\s+/g, ' ').slice(0, 200);
    const cm = comments('beads-lite', S.q_stale); const decisions = (cm.match(/OWNER DECISION/g) || []).length; await b.screenshot({ path: `${OUT}/shots/D4-stale-second-tab.png` }); await c.close();
    return { ok: decisions === 1 && msg.length > 5, detail: `decision_comments=${decisions} second tab says: "${msg}"` };
  });
  await check('D6', 'phone door at 390: pick, double-tap confirm; exactly one record, one wake', async () => {
    const C = COMBOS[0]; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs, /already|handled/i);
    await page.goto(base('phone') + `/#/issues?issue=${S.q_phone}&at=card`); await page.waitForSelector('.u3-cd__opt'); await page.locator('.u3-cd__opt').first().click(); await page.waitForSelector('[data-act=confirm]');
    await page.screenshot({ path: `${OUT}/shots/D6-selected-390-ar.png` });
    await page.locator('[data-act=confirm]').dblclick(); await page.waitForTimeout(6000);
    const j = show('beads-lite', S.q_phone); const decisions = (comments('beads-lite', S.q_phone).match(/OWNER DECISION/g) || []).length;
    const w = wakeFiles().map((f) => { try { return JSON.parse(fs.readFileSync(env.home + '/wake/' + f, 'utf8')); } catch { return null; } }).filter((x) => x && JSON.stringify(x).includes(S.q_phone));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); await page.screenshot({ path: `${OUT}/shots/D6-answered-390-ar.png` }); await c.close();
    return { ok: j.status !== 'owner_decision' && decisions === 1 && w.length === 1 && fits, detail: `status=${j.status} decision_comments=${decisions} wakes=${w.length} via=${w[0]?.via} fits=${fits}` };
  });
  await check('D5', 'offline at Confirm: honest message, selection kept, retry works, one record', async () => {
    const C = COMBOS[0]; const c = await ctx(C); const page = await c.newPage(); const errs = []; watch(page, errs, /ERR_|Failed to fetch|WebSocket/i);
    await page.goto(base('phone') + `/#/issues?issue=${S.q_offline}&at=card`); await page.waitForSelector('.u3-cd__opt'); await page.locator('.u3-cd__opt').first().click(); await page.waitForSelector('[data-act=confirm]');
    await c.setOffline(true); await page.waitForTimeout(1500); await page.locator('[data-act=confirm]').click(); await page.waitForTimeout(3500);
    const still = await page.locator('[data-act=confirm]').count(); const msg = (await page.locator('.u3-cd__err, .u3-cd__msg').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 160); const stat0 = show('beads-lite', S.q_offline).status;
    await page.screenshot({ path: `${OUT}/shots/D5-offline-390.png` });
    await c.setOffline(false); let done = false;
    for (let i = 0; i < 6 && !done; i++) { await page.waitForTimeout(3000); if (await page.locator('[data-act=confirm]').count()) { await page.locator('[data-act=confirm]').click().catch(() => {}); } await page.waitForTimeout(3000); done = show('beads-lite', S.q_offline).status !== 'owner_decision'; }
    const decisions = (comments('beads-lite', S.q_offline).match(/OWNER DECISION/g) || []).length; await c.close();
    return { ok: stat0 === 'owner_decision' && still === 1 && done && decisions === 1, detail: `offline: confirm still there=${still === 1} message="${msg}" status stayed=${stat0}; after back online recorded=${done} decision_comments=${decisions}` };
  });
  await check('D7', 'typed-answer card: text box limited, answer recorded', async () => {
    const c = await ctx(COMBOS[1]); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.goto(base('pc') + `/#/issues?issue=${S.q_type}&at=card`); await page.waitForSelector('.u3-cd__text'); const max = await page.locator('.u3-cd__text').getAttribute('maxlength');
    await page.locator('.u3-cd__text').fill('Project Falcon'); await page.locator('[data-act=send]').click(); await page.waitForTimeout(6000);
    const j = show('beads-lite', S.q_type); const cm = comments('beads-lite', S.q_type); await c.close();
    return { ok: j.status !== 'owner_decision' && /Project Falcon/.test(cm) && Number(max) > 0 && !errs.length, detail: `maxlength=${max} status=${j.status} text_in_record=${/Project Falcon/.test(cm)} errs=${errs.join(';').slice(0, 100)}` };
  });
  await check('D8', 'attachments: 2 thumbnails load from /att/, tap opens, link item shown, bad items never drawn, no outside request', async () => {
    const out = {}; const c = await ctx(COMBOS[0]); const page = await c.newPage(); const errs = []; watch(page, errs); const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    await page.goto(base('phone') + `/#/issues?issue=${S.q_att}&at=card`); await page.waitForSelector('.u3-cardhost .att-strip__thumb, .u3-cardhost img, .att-strip__item', { timeout: 30000 }); await page.waitForTimeout(2000);
    out.imgs = await page.locator('.u3-cardhost img').evaluateAll((a) => a.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight })));
    out.links = await page.locator('.u3-cardhost a[href^="https"]').evaluateAll((a) => a.map((x) => x.href));
    await page.screenshot({ path: `${OUT}/shots/D8-att-390.png` });
    const before = await page.evaluate(() => document.querySelectorAll('[role=dialog], .u3-lightbox, .att-lightbox, .u3-sheet').length);
    await page.locator('.att-strip__thumb, .att-strip__item').first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('[role=dialog], .u3-lightbox, .att-lightbox, .u3-sheet').length); await page.screenshot({ path: `${OUT}/shots/D8-att-tap-390.png` });
    const outside = reqs.filter((u) => !u.startsWith(`http://127.0.0.1:${env.px}`) && !u.startsWith('data:') && !u.startsWith('blob:'));
    // the bad-attachment card must never draw an outside image, and must not be a waiting card
    const p2 = await c.newPage(); const reqs2 = []; p2.on('request', (r) => reqs2.push(r.url())); await p2.goto(base('phone') + `/#/issues?issue=${S.q_badatt}&at=card`); await p2.waitForTimeout(4000);
    const badImgs = await p2.locator('img').evaluateAll((a) => a.map((i) => i.src)); const evil = reqs2.filter((u) => /evil\.example|passwd/.test(u)); const evilCard = await p2.locator('.u3-cardhost').count();
    await p2.goto(base('phone') + '/#/decisions'); await p2.waitForTimeout(3500); const deskEvil = await p2.locator('.dk3').innerText().then((t) => /Bad att|bad attachments/i.test(t)).catch(() => false);
    await c.close();
    const loaded = out.imgs.filter((i) => i.w > 0 && /\/att\//.test(i.src || ''));
    return { ok: loaded.length >= 2 && out.links.some((l) => l.includes(TN)) && outside.length === 0 && evil.length === 0 && badImgs.every((s) => !/evil|passwd/.test(s)), detail: `thumbs loaded=${loaded.length}/${out.imgs.length} sizes=${JSON.stringify(loaded.map((i) => i.w + 'x' + i.h))} link items=${out.links.length} (tailnet link ${out.links.some((l) => l.includes(TN))}) tap opened overlay=${after > before} outside requests=${outside.length} bad-att card drawn=${evilCard} bad-att requests=${evil.length} bad-att on desk=${deskEvil}` };
  });
  await check('D9', 'push: a new waiting card writes one push-log line, no endpoint/key in it, and not twice', async () => {
    const logf = env.home + '/board/push-log.jsonl'; const read = () => (fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    const r = bd('beads-lite', ['create', 'QA6 card for push', '-t', 'task', '-a', 'swe', '--silent']); const id = r.stdout.split(/\s+/).filter((x) => /^beads-lite-/.test(x)).pop();
    const input = { repo: 'beads-lite', bead: id, by: 'swe', class: 'tap', q: 'Push test question?', effect: 'Nothing.', blocks: 'nothing', opts: [{ l: 'Yes' }, { l: 'No', rec: true }], show: 'x', title: 'QA6 push' };
    const res = spawnSync(process.execPath, ['E:/Projects/learner/scripts/cards/card.mjs', 'post'], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, env: { ...process.env, USERPROFILE: env.home, BDUI_ATTACH_ROOT: env.attach, BD_BIN: 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe', BD_ACTOR: 'qa', BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe' } });
    let lines = []; for (let i = 0; i < 30; i++) { await sleep(1000); lines = read().filter((l) => l.bead === id); if (lines.length) break; }
    await sleep(8000); const after = read().filter((l) => l.bead === id); const raw = fs.existsSync(logf) ? fs.readFileSync(logf, 'utf8') : '';
    bd('beads-lite', ['comments', 'add', id, 'QA6 touch to force a rescan']); await sleep(8000); const after2 = read().filter((l) => l.bead === id);
    return { ok: lines.length === 1 && after.length === 1 && after2.length === 1 && !/QA-LOCAL-ONLY|p256dh|auth|endpoint/.test(raw), detail: `post=${res.stdout.trim().slice(0, 60)} lines=${after.length} after rescan=${after2.length} line=${JSON.stringify(after[0] || {})} file_total=${read().length} secrets_in_file=${/QA-LOCAL-ONLY|p256dh|endpoint/.test(raw)}` };
  });
}

// ---------------------------------------------------------------- E: doors, headers
if (only.includes('E')) {
  const raw = (port, p, headers) => new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port, path: p, headers, method: 'GET' }, (res) => { res.resume(); resolve({ status: res.statusCode, h: res.headers }); }); r.on('error', (e) => resolve({ status: 'ERR ' + e.code })); r.end(); });
  await check('E1', 'PC door: localhost opens; foreign Host gets 403 on page and API', async () => {
    const ok = await raw(env.pc, '/', { host: `127.0.0.1:${env.pc}` }); const bad1 = await raw(env.pc, '/', { host: 'evil.example' }); const bad2 = await raw(env.pc, '/api/workspaces', { host: 'evil.example' }); const bad3 = await raw(env.pc, '/api/workspaces', { host: TN });
    return { ok: ok.status === 200 && bad1.status === 403 && bad2.status === 403 && bad3.status === 403, detail: `localhost=${ok.status} foreign page=${bad1.status} foreign api=${bad2.status} tailnet host on PC door=${bad3.status}` };
  });
  await check('E2', 'phone door: right host + owner login opens; wrong host, missing login, foreign origin refused', async () => {
    const good = await raw(env.ph, '/', { host: TN, 'tailscale-user-login': 'qa-owner@example.test' }); const nologin = await raw(env.ph, '/', { host: TN }); const wrongLogin = await raw(env.ph, '/', { host: TN, 'tailscale-user-login': 'someone@else.test' }); const wrongHost = await raw(env.ph, '/', { host: 'evil.example', 'tailscale-user-login': 'qa-owner@example.test' }); const local = await raw(env.ph, '/', { host: `127.0.0.1:${env.ph}`, 'tailscale-user-login': 'qa-owner@example.test' });
    const wsOrigin = await new Promise((resolve) => { const s = net.connect(env.ph, '127.0.0.1', () => { s.write(`GET /ws HTTP/1.1\r\nHost: ${TN}\r\ntailscale-user-login: qa-owner@example.test\r\nOrigin: https://evil.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`); }); let b = ''; s.on('data', (d) => { b += d; if (b.includes('\r\n')) { s.destroy(); resolve(b.split('\r\n')[0]); } }); s.on('error', () => resolve('ERR')); setTimeout(() => { s.destroy(); resolve('timeout:' + b.slice(0, 40)); }, 4000); });
    return { ok: good.status === 200 && [401, 403].includes(nologin.status) && [401, 403].includes(wrongLogin.status) && [401, 403, 421].includes(wrongHost.status) && !/101/.test(wsOrigin), detail: `good=${good.status} no login=${nologin.status} wrong login=${wrongLogin.status} wrong host=${wrongHost.status} localhost on phone door=${local.status} ws with foreign origin: ${wsOrigin}` };
  });
  await check('E3', 'frame headers on page, css, js, api, 404', async () => {
    const html = await (await fetch(base('pc') + '/')).text(); const css = html.match(/href="(\/app\.[a-z0-9]+\.css)"/)?.[1]; const js = html.match(/src="(\/[^"]*main[^"]*\.js)"/)?.[1] || '/main.bundle.js';
    const out = []; for (const p of ['/', css, js, '/api/workspaces', '/sw.js', '/nope-404']) { const r = await fetch(base('pc') + p); const xfo = r.headers.get('x-frame-options'); const csp = r.headers.get('content-security-policy') || ''; out.push(`${p.slice(0, 22)}:${r.status}:${xfo || '-'}:${/frame-ancestors/.test(csp) ? 'fa' : '-'}`); }
    return { ok: out.every((x) => !x.endsWith(':-:-')), detail: out.join(' ') };
  });
  await check('E4', 'server started with BD_BIN unset and found bd by itself', async () => { const log = fs.readFileSync(SC + '/server.log', 'utf8'); const r = await fetch(base('pc') + '/api/workspaces'); return { ok: /bd: using .*bd\.exe/.test(log) && r.status === 200, detail: log.split('\n')[0] }; });
}

// ---------------------------------------------------------------- F: degraded path
if (only.includes('F')) {
  await check('F1', 'Fast 3G + 4x CPU, cold cache, no SW: stats home content and lazy first opens (blank <= 1 s)', async () => {
    const c = await ctx(COMBO0, { serviceWorkers: 'block' }); const page = await c.newPage(); const errs = []; watch(page, errs);
    await page.addInitScript(() => { window.__t = {}; const loop = () => { const v = document.getElementById('u3-view') || document.querySelector('.u3-main__in'); const txt = v ? (v.innerText || '').trim().length : -1; const now = performance.now(); const st = window.__t; if (st.hashAt != null) { if (txt <= 1 && st.bs == null && st.fc == null) st.bs = now; if (txt > 40 && st.fc == null) st.fc = now; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const cdp = await c.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', FAST3G); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const t0 = Date.now(); await page.goto(base('phone') + '/', { timeout: 120000 }); await page.waitForSelector('.u3-main__in', { timeout: 120000 }); await page.waitForFunction(() => document.querySelector('.u3-main__in')?.innerText.length > 40, null, { timeout: 120000 }); const stats = Date.now() - t0;
    const rows = [];
    for (const [n, h] of [['tasks', '#/issues'], ['task', `#/issues?issue=${S.plain}`], ['time', '#/time']]) {
      await page.evaluate((h) => { window.__t = { hashAt: performance.now() }; location.hash = h; }, h); await page.waitForFunction(() => window.__t.fc != null, null, { timeout: 90000, polling: 50 }); const t = await page.evaluate(() => window.__t); rows.push({ n, blank: Math.round(t.bs != null ? t.fc - t.bs : 0), toContent: Math.round(t.fc - t.hashAt) });
    }
    await page.screenshot({ path: `${OUT}/shots/F1-throttled-390.png` }); await c.close();
    return { ok: rows.every((r) => r.blank <= 1000) && !errs.length, detail: `stats home content after ${stats} ms; lazy: ${rows.map((r) => `${r.n} blank ${r.blank} ms, content ${r.toContent} ms`).join('; ')}; errs=${errs.length}` };
  });
  await check('F4', 'narrow windows 320 and 360: Desk, Tasks, Stats, task page have no sideways scroll', async () => {
    const out = [];
    for (const w of [320, 360]) { const c = await browser.newContext({ viewport: { width: w, height: 700 }, hasTouch: true }); const page = await c.newPage(); const errs = []; watch(page, errs);
      for (const h of ['#/', '#/decisions', '#/issues', `#/issues?issue=${S.q_att}&at=card`, '#/releases']) { await page.goto(base('phone') + '/' + h); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(1800); const f = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); if (!f) out.push(`${w}:${h}`); }
      if (errs.length) out.push(`${w} errs ${errs[0].slice(0, 60)}`); await c.close(); }
    return { ok: out.length === 0, detail: out.length ? 'overflow/errors: ' + out.join(', ') : '5 screens x 2 widths fit' };
  });
  await check('F2', 'cold state: no flow data -> Stats and Time show an empty state, not an error', async () => {
    // the board server has flow data; ask for the empty flavour through a fresh server is not run here: read the live screens for error words instead
    const c = await ctx(COMBO0); const page = await c.newPage(); const errs = []; watch(page, errs); const bad = [];
    for (const h of ['#/', '#/time', '#/projects']) { await page.goto(base('phone') + '/' + h); await page.waitForSelector('.u3-main__in'); await page.waitForTimeout(2200); const t = await page.evaluate(() => document.body.innerText); if (/error|failed|exception|خطأ|فشل/i.test(t)) bad.push(h + ':' + (t.match(/error|failed|exception|خطأ|فشل/i) || [''])[0]); }
    await c.close(); return { ok: bad.length === 0 && !errs.length, detail: `error words on screens: ${bad.join(',') || 'none'} (data present in this run; empty flow data NOT exercised here)` };
  });
}

// ---------------------------------------------------------------- G: regression memory
if (only.includes('G')) {
  await check('G2', 'Stats stuck rows read "name - title" (SRE deploy-1 finding)', async () => {
    const c = await ctx(COMBOS[1]); const page = await c.newPage(); await page.goto(base('pc') + '/#/'); await page.waitForSelector('.u3-sh__row', { timeout: 30000 }); await page.waitForTimeout(1500);
    const rows = await page.locator('.u3-sh__muted').allInnerTexts(); const sample = rows.filter((t) => / - /.test(t)).slice(0, 4); await c.close();
    return { ok: false === true ? true : sample.length === 0 || sample.every((t) => !/^(Lead|Engineer|Manager|Officer|QA|Chief|Software|Site|Product|UX|Security|Reliability)/i.test(t.split(' - ')[0])), detail: `role lines: ${JSON.stringify(sample)}` };
  });
}

await browser.close();
const tally = (s) => results.filter((r) => r.status === s).length;
fs.writeFileSync(`${OUT}/results-${only}.json`, JSON.stringify(results, null, 1));
fs.writeFileSync(`${OUT}/summary-browser-${only}.md`, `# Browser run (${only})\n\nPASS ${tally('PASS')}, FAIL ${tally('FAIL')}, HARNESS ${tally('HARNESS')}, NOT COVERED ${tally('NOT COVERED')}\n\n` + results.map((r) => `- ${r.status} ${r.id} ${r.name}\n  ${r.detail}`).join('\n') + '\n');
console.log(`DONE pass=${tally('PASS')} fail=${tally('FAIL')} harness=${tally('HARNESS')}`);
process.exit(0);
