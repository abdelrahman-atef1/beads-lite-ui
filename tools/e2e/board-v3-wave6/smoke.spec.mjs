// QA wave 6, S: smoke of every v3 screen in 8 combos on 87edf2d + lazy first-open on the throttled profile (S-3).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { base, OUT, LOG, create, bd, throttle } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const N = 'smoke-notes.txt';
const COMBOS = [];
for (const w of [390, 1440]) for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) COMBOS.push({ w, lang, theme, name: `${w} ${lang} ${theme}`, tag: `${w}-${lang}-${theme}` });
const ID = 'beads-lite-1bo5.6.24';
const SCREENS = [
  ['desk', '#/'], ['tasks-list', '#/issues'], ['tasks-board', '#/board'], ['tasks-epics', '#/epics'], ['task-page', `#/issues?issue=${ID}`],
  ['projects', '#/projects'], ['releases', '#/releases'], ['time', '#/time'], ['settings', '#/settings'], ['swimlanes', '#/board', 'project'], ['ui-kit', '#/ui-kit']
];
const door = (C) => (C.w < 500 ? 'phone' : 'pc');
async function mkctx(browser, C, extra = {}) {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US', ...extra });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch { /* none */ } }, [C.lang, C.theme]);
  return c;
}
function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/\/att\//.test(m.location().url) && errs.push('console: ' + m.text().slice(0, 150)));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/att\/|favicon/.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
}
const measure = (page) => page.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; const m = b.match(/[\d.]+/g); if (m && !(m.length === 4 && Number(m[3]) < 0.9)) return b; } return 'rgb(255,255,255)'; };
  let invisible = 0, low = 0, small = 0; const sample = [];
  for (const el of document.querySelectorAll('main *, header *, nav *, aside *, .u3-ask__sheet *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) continue;
    const cs = getComputedStyle(el); const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    const a = lum(cs.color), b = lum(bgOf(el)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 1.5) { invisible++; if (sample.length < 3) sample.push((el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 25) + ' ' + ratio.toFixed(2)); } else if (ratio < 3) low++;
  }
  for (const el of document.querySelectorAll('button, a[href], [role=button], input, select')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && (r.height < 28 || r.width < 28) && getComputedStyle(el).visibility !== 'hidden') small++; }
  const txt = document.body.innerText;
  return { h: document.documentElement.scrollWidth <= window.innerWidth + 1, dir: document.querySelector('[dir]')?.getAttribute('dir') || document.documentElement.dir, len: txt.length, raw: (txt.match(/\bu3_[a-z_]+|undefined|NaN|\[object|\{\{/g) || []).slice(0, 5), invisible, low, small, sample };
});

for (const C of COMBOS) test(`S-1/2 every v3 screen renders clean [${C.name}]`, async ({ browser }) => {
  const c = await mkctx(browser, C); const rows = [];
  for (const [name, hash, group] of SCREENS) {
    const page = await c.newPage(); const errs = []; watch(page, errs);
    if (group) await page.addInitScript((g) => { try { localStorage.setItem('beads-ui.u3.tasks.group', g); } catch { /* none */ } }, group);
    await page.goto(base('new', door(C)) + '/?ui=3' + hash); await page.waitForSelector('.u3-main__in, #u3-view', { timeout: 30000 }); await page.waitForTimeout(2200);
    const r = await measure(page); await page.screenshot({ path: `${OUT}/shots/S-${C.tag}-${name}.png` });
    rows.push({ name, ...r, errs }); await page.close();
  }
  fs.writeFileSync(`${OUT}/S-${C.tag}.json`, JSON.stringify(rows, null, 1));
  for (const r of rows) LOG(N, `S ${C.name} ${r.name}: hscroll_ok=${r.h} dir=${r.dir} text=${r.len} raw=${JSON.stringify(r.raw)} invisible=${r.invisible} lowcontrast=${r.low} small=${r.small} errs=${JSON.stringify(r.errs)} ${r.sample.join('; ')}`);
  for (const r of rows) {
    expect(r.h, `${r.name} no horizontal scroll`).toBe(true); expect(r.len, `${r.name} has text`).toBeGreaterThan(40); expect(r.raw, `${r.name} raw keys`).toEqual([]);
    expect(r.invisible, `${r.name} invisible text ${r.sample}`).toBe(0); expect(r.errs, `${r.name} errors`).toEqual([]);
    if (C.lang === 'ar') expect(r.dir, `${r.name} rtl`).toBe('rtl');
  }
  await c.close();
});

for (const C of COMBOS) test(`S-1b bulk bar, search, top bar, experiments, ask head (open only) [${C.name}]`, async ({ browser }) => {
  const c = await mkctx(browser, C); const page = await c.newPage(); const errs = []; watch(page, errs); const rows = {};
  const phone = C.w < 500; const B = base('new', door(C));
  // top bar
  await page.goto(B + '/?ui=3#/'); await page.waitForSelector('.u3-top'); await page.waitForTimeout(1800);
  rows.topbar = await page.evaluate(() => { const iw = innerWidth; const els = [...document.querySelectorAll('.u3-top button, .u3-top a[href], .u3-top input')].filter((e) => e.getBoundingClientRect().width > 0); return { n: els.length, off: els.filter((e) => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > iw + 0.5; }).length, small: els.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 28 || r.width < 28; }).length }; });
  expect(rows.topbar.off, 'top bar control outside window').toBe(0); expect(rows.topbar.n).toBeGreaterThan(2);
  // search open
  if (phone) await page.locator('.u3-search__btn').click(); const inp = page.locator('.u3-search__field input'); await inp.fill('board'); await page.waitForTimeout(800);
  rows.search = { hits: await page.locator('.u3-search__hit').count(), h: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) }; await page.screenshot({ path: `${OUT}/shots/S1b-${C.tag}-search.png` });
  expect(rows.search.hits).toBeGreaterThan(0); expect(rows.search.h).toBe(true); await page.keyboard.press('Escape');
  // bulk bar
  await page.goto(B + '/?ui=3#/issues'); await page.waitForSelector('.u3t-card', { timeout: 30000 });
  await page.getByTestId('bulk-enter').click(); await expect(page.getByTestId('bulk-bar')).toBeVisible();
  await page.locator('.u3t-card').first().click(); await page.waitForTimeout(300);
  rows.bulk = { count: (await page.getByTestId('bulk-count').innerText()).replace(/\s+/g, ' '), h: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) }; await page.screenshot({ path: `${OUT}/shots/S1b-${C.tag}-bulk.png` });
  expect.soft(rows.bulk.h, 'bulk bar fits the window (F-A)').toBe(true); await page.getByTestId('bulk-cancel').click();
  // experiments (time screen)
  await page.goto(B + '/?ui=3#/time'); await page.waitForTimeout(2500);
  rows.time = await page.evaluate(() => ({ items: document.querySelectorAll('.u3-ex__item').length, exSection: !!document.querySelector('[class*="u3-ex"]'), len: document.getElementById('u3-view').innerText.length, h: document.documentElement.scrollWidth <= innerWidth }));
  await page.screenshot({ path: `${OUT}/shots/S1b-${C.tag}-time.png` }); expect(rows.time.h).toBe(true); expect(rows.time.len).toBeGreaterThan(60);
  // ask head: open only, never send
  await page.goto(B + `/?ui=3#/issues?issue=${ID}`); await page.waitForSelector('.u3-ask__head', { timeout: 30000 }); await page.waitForTimeout(800);
  const requests = []; page.on('request', (r) => r.method() === 'POST' && /ask/i.test(r.url()) && requests.push(r.url()));
  page.on('websocket', (ws) => ws.on('framesent', (f) => /ask-claude|"ask"|ask_/i.test(String(f.payload)) && requests.push('ws:' + String(f.payload).slice(0, 60))));
  await page.locator('.u3-ask__head').click(); await page.waitForSelector('.u3-ask__panel', { timeout: 10000 });
  const ask = await measure(page); rows.ask = { text: (await page.locator('.u3-ask__panel').innerText()).replace(/\s+/g, ' ').slice(0, 80), h: ask.h, invisible: ask.invisible, raw: ask.raw };
  await page.screenshot({ path: `${OUT}/shots/S1b-${C.tag}-ask-open.png` }); expect(ask.h).toBe(true); expect(ask.invisible).toBe(0); expect(ask.raw).toEqual([]);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); if (await page.locator('.u3-ask__panel').count()) await page.locator('.u3-ask__scrim').click({ position: { x: 5, y: 5 } }).catch(() => {});
  LOG(N, `S-1b ${C.name}: ${JSON.stringify(rows)} ask_requests=${requests.length}`);
  expect(errs).toEqual([]); await c.close();
});

// S-3: first open of the lazy screens (task, tasks, time) on Fast 3G + 4x CPU: how long is the view blank?
const LAZY = [['tasks', '#/issues'], ['task', `#/issues?issue=${ID}`], ['time', '#/time']];
for (const C of COMBOS) for (const [name, hash] of LAZY) test(`S-3 lazy first open: ${name} blank flash on Fast 3G + 4x CPU [${C.name}]`, async ({ browser }) => {
  const c = await mkctx(browser, C, { serviceWorkers: 'block' }); const page = await c.newPage(); const errs = []; watch(page, errs);
  await page.addInitScript(() => {
    window.__t = { events: [] };
    const view = () => document.getElementById('u3-view');
    const loop = () => {
      const v = view(); const txt = v ? (v.innerText || '').trim().length : -1; const now = performance.now();
      const st = window.__t; if (st.hashAt != null) {
        if (txt <= 1 && st.blankStart == null && st.firstContent == null) st.blankStart = now;
        if (txt > 1 && st.blankStart != null && st.blankEnd == null) st.blankEnd = now;
        if (txt > 40 && !v.querySelector('.dk3') && st.firstContent == null) st.firstContent = now;
        if (st.firstContent != null && st.blankStart != null && st.blankEnd == null) st.blankEnd = st.firstContent;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const cdp = await throttle(page); const cache = await c.newCDPSession(page); await cache.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(base('new', door(C)) + '/?ui=3#/'); await page.waitForSelector('.dk3-h', { timeout: 60000 }); await page.waitForTimeout(2500);
  const chunks0 = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\/chunks\//.test(r.name)).length);
  await page.evaluate((h) => { window.__t.hashAt = performance.now(); location.hash = h; }, hash.slice(1));
  await page.waitForFunction(() => window.__t.firstContent != null, null, { timeout: 60000, polling: 50 });
  const t = await page.evaluate(() => window.__t); const chunks1 = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\/chunks\//.test(r.name)).length);
  const blank = t.blankStart != null ? (t.blankEnd ?? t.firstContent) - t.blankStart : 0; const toContent = t.firstContent - t.hashAt;
  await page.screenshot({ path: `${OUT}/shots/S3-${C.tag}-${name}.png` });
  LOG(N, `S-3 ${C.name} ${name}: blank=${blank.toFixed(0)}ms to_first_content=${toContent.toFixed(0)}ms chunks_before=${chunks0} chunks_after=${chunks1}`);
  fs.appendFileSync(`${OUT}/S3.jsonl`, JSON.stringify({ combo: C.name, screen: name, blank_ms: Math.round(blank), to_content_ms: Math.round(toContent), chunks_before: chunks0, chunks_after: chunks1 }) + '\n');
  expect.soft(blank, `${name} blank flash ms (S-3)`).toBeLessThanOrEqual(1000); expect(chunks1, 'lazy chunk fetched on first open').toBeGreaterThan(chunks0);
  expect(errs).toEqual([]); await cdp.detach().catch(() => {}); await c.close();
});

// S-3b: same first open, but the service worker has finished its precache first (a phone that has been on the board for a few seconds).
for (const C of COMBOS.filter((x) => x.w === 390 && x.theme === 'dark')) for (const [name, hash] of LAZY) test(`S-3b lazy open after the service worker precache: ${name} [${C.name}]`, async ({ browser }) => {
  const c = await mkctx(browser, C); const page = await c.newPage(); const errs = []; watch(page, errs);
  await page.addInitScript(() => {
    window.__t = {}; const loop = () => { const v = document.getElementById('u3-view'); const txt = v ? (v.innerText || '').trim().length : -1; const now = performance.now(); const st = window.__t;
      if (st.hashAt != null) { if (txt <= 1 && st.blankStart == null && st.firstContent == null) st.blankStart = now; if (txt > 40 && !v.querySelector('.dk3') && st.firstContent == null) { st.firstContent = now; } } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await page.goto(base('new', door(C)) + '/?ui=3#/'); await page.waitForSelector('.dk3-h', { timeout: 60000 });
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(2500);
  const cdp = await throttle(page);
  await page.evaluate((h) => { window.__t.hashAt = performance.now(); location.hash = h; }, hash.slice(1));
  await page.waitForFunction(() => window.__t.firstContent != null, null, { timeout: 60000, polling: 50 });
  const t = await page.evaluate(() => window.__t); const blank = t.blankStart != null ? t.firstContent - t.blankStart : 0;
  LOG(N, `S-3b ${C.name} ${name}: blank=${blank.toFixed(0)}ms to_first_content=${(t.firstContent - t.hashAt).toFixed(0)}ms (SW active, chunks cached)`);
  fs.appendFileSync(`${OUT}/S3b.jsonl`, JSON.stringify({ combo: C.name, screen: name, blank_ms: Math.round(blank), to_content_ms: Math.round(t.firstContent - t.hashAt) }) + '\n');
  expect.soft(blank, `${name} blank flash ms with SW precache`).toBeLessThanOrEqual(1000); expect(errs).toEqual([]); await cdp.detach().catch(() => {}); await c.close();
});
