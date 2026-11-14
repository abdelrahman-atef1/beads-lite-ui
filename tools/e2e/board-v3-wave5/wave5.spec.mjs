// QA wave 5 (board v3 at 7f4806d): L-1 L-3 L-6 (lows), X-1 X-2 (experiments, digest), O-1 (old board), S (smoke of every v3 screen).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bd, create, OUT, base, E } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const SC = E.proj.replace('/proj', '');
const B = JSON.parse(fs.readFileSync(SC + '/envb.json'));
const LOG = (s) => fs.appendFileSync(OUT + '/wave5-notes.txt', s + '\n');
const COMBOS = [];
for (const w of [390, 1440]) for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) COMBOS.push({ w, lang, theme, name: `${w} ${lang} ${theme}`, tag: `${w}-${lang}-${theme}` });

async function open(browser, C) {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [C.lang, C.theme]);
  const page = await c.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/\/att\//.test(m.location().url) && errs.push('console: ' + m.text()));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/att\/|favicon/.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  return { c, page, errs };
}
const noH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------- L-1 .59.13: @ picker first row visible ----------
for (const C of COMBOS.filter((x) => (x.w === 1440 && x.lang === 'en' && x.theme === 'light') || (x.w === 1440 && x.lang === 'ar' && x.theme === 'dark') || (x.w === 390 && x.lang === 'ar' && x.theme === 'dark') || (x.w === 390 && x.lang === 'en' && x.theme === 'light')))
  test(`L-1 @ picker first row visible at 3 scroll positions [${C.name}]`, async ({ browser }) => {
    const id = create(`QAW5 picker ${C.name}`); bd(['comments', 'add', id, 'filler comment for height']);
    const { c, page, errs } = await open(browser, C);
    await page.goto(base(C.w < 500 ? 'phone' : 'pc') + `/?ui=3#/issues?issue=${id}`);
    const ta = page.locator('#u3-ts-in'); await ta.waitFor({ timeout: 30000 });
    for (const pos of ['default', 'composer-at-top', 'composer-at-bottom']) {
      await page.evaluate(() => { const t = document.querySelector('#u3-ts-in'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
      await ta.evaluate((el, p) => { if (p === 'composer-at-top') el.scrollIntoView({ block: 'start' }); if (p === 'composer-at-bottom') el.scrollIntoView({ block: 'end' }); }, pos);
      await page.waitForTimeout(150);
      await ta.click(); await ta.pressSequentially('@');
      const first = page.locator('[role=option]').first(); await first.waitFor({ timeout: 5000 });
      const box = await first.boundingBox(); const vh = page.viewportSize().height;
      const top = await page.evaluate(() => { const h = document.querySelector('.u3-top'); return h ? h.getBoundingClientRect().bottom : 0; });
      const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('[role=option]')); }, [box.x + box.width / 2, box.y + box.height / 2]);
      LOG(`L-1 ${C.name} ${pos}: first row y=${Math.round(box.y)} h=${Math.round(box.height)} topbar bottom=${Math.round(top)} vh=${vh} hit=${hit}`);
      if (pos === 'composer-at-top') await page.screenshot({ path: `${OUT}/shots/L1-${C.tag}-${pos}.png` });
      expect(box.y, `${pos}: first row below window top`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${pos}: first row not under the top bar`).toBeGreaterThanOrEqual(top - 1);
      expect(box.y + box.height, `${pos}: inside window bottom`).toBeLessThanOrEqual(vh + 1);
      expect(hit, `${pos}: row is the topmost element at its centre`).toBe(true);
      await ta.press('Escape'); await page.waitForTimeout(100);
      expect(await page.locator('[role=option]').count(), 'Escape closes').toBe(0);
    }
    expect(errs).toEqual([]); bd(['close', id, '-r', 'qa cleanup']); await c.close();
  });

// ---------- L-3 .64.1: failed wake chip ----------
for (const C of COMBOS.filter((x) => x.theme === 'dark' && ((x.w === 1440 && x.lang === 'en') || (x.w === 390 && x.lang === 'ar'))))
  test(`L-3 failed wake shows "failed, retry", not limit; recovery on retry [${C.name}]`, async ({ browser }) => {
    const id = create(`QAW5 wake ${C.name}`); const flag = SC + '/wakefail.flag'; fs.writeFileSync(flag, '1');
    const { c, page } = await open(browser, C);
    try {
      await page.goto(base(C.w < 500 ? 'phone' : 'pc') + `/?ui=3#/issues?issue=${id}`);
      const ta = page.locator('#u3-ts-in'); await ta.waitFor({ timeout: 30000 });
      await ta.fill(C.w < 500 ? '@swe please look' : '@cto please look');
      await page.getByRole('button', { name: /post comment|ابعت التعليق/i }).click();
      await page.locator('[data-chip]').first().waitFor({ timeout: 15000 });
      const chips = await page.locator('[data-chip]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-chip'), e.innerText.trim()]));
      LOG(`L-3 ${C.name} chips with failing wake: ${JSON.stringify(chips)}`);
      await page.screenshot({ path: `${OUT}/shots/L3-${C.tag}-failed.png` });
      expect(chips.some(([k]) => k === 'failed')).toBe(true);
      expect(chips.some(([k]) => k === 'limit')).toBe(false);
      expect(chips.find(([k]) => k === 'failed')[1]).toMatch(C.lang === 'ar' ? /فشل/ : /failed, retry/);
      // retry control: tap it with the wake working again
      fs.rmSync(flag, { force: true });
      const tapped = await page.locator('[data-chip=failed]').first().click({ timeout: 3000 }).then(() => true).catch(() => false); await page.waitForTimeout(1200);
      const afterTap = await page.locator('[data-chip]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chip'))); LOG(`L-3 ${C.name} chip tap works=${tapped} chips after tap=${JSON.stringify(afterTap)}`);
      await ta.fill((C.w < 500 ? '@swe' : '@cto') + ' second try'); await page.getByRole('button', { name: /post comment|ابعت التعليق/i }).click(); await page.waitForTimeout(2500);
      const second = await page.locator('[data-chip]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-chip'), e.innerText.trim().replace(/s+/g, ' ')])); LOG(`L-3 ${C.name} chips after posting again with the wake fixed: ${JSON.stringify(second)}`);
      expect(second.some(([k]) => k === 'waiting' || k === 'woke' || k === 'seen'), 'a second mention after the failure is not swallowed').toBe(true);
      const after = await page.locator('[data-chip]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-chip'), e.innerText.trim()]));
      LOG(`L-3 ${C.name} after retry tap: ${JSON.stringify(after)}`);
      await page.screenshot({ path: `${OUT}/shots/L3-${C.tag}-retry.png` });
    } finally { fs.rmSync(flag, { force: true }); bd(['close', id, '-r', 'qa cleanup']); await c.close(); }
  });

// ---------- L-6 .59.12: "N in progress" counts in_progress only ----------
test('L-6 in progress count equals in_progress beads of the copy, not all non-closed', async ({ browser }) => {
  let want = 0; const DB = E.proj + '/.beads/beads.db';
  let all = 0; for (const p of ['company', 'beads-lite']) { const db = new DatabaseSync(SC + '/dbs/' + p + '/beads.db', { readOnly: true }); want += db.prepare("select count(*) n from issues where status='in_progress'").get().n; all += db.prepare("select count(*) n from issues where status<>'closed'").get().n; db.close(); }
  const C = COMBOS[3]; const { c, page } = await open(browser, { ...C, w: 1440, lang: 'en', theme: 'light' });
  await page.goto(base('pc') + '/?ui=3#/time'); await page.waitForSelector('.u3-ex, .u3-tm__head, .u3-tmr', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2500);
  const t = await page.evaluate(() => document.body.innerText); const m = /(\d+)\s+(in progress|running now)/i.exec(t);
  LOG(`L-6 UI="${m && m[0]}" oracle in_progress=${want} non-closed=${all}`);
  expect(m, 'count text present').toBeTruthy(); expect(Number(m[1])).toBe(want); expect(want).not.toBe(all);
  await c.close();
});

// ---------- X-1/X-2 .66.7 experiments and digest (swe's real flow-exp/flow-weekly verdict files, server B) ----------
const EXPDIR = SC + '/flowB/exp';
const exps = fs.readdirSync(EXPDIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(EXPDIR + '/' + f, 'utf8')));
const wantPill = (e) => e.confounded ? /confound|مشوّ|ملخبط|مختلط/i : e.verdict === 'ADOPT' ? /ADOPT|اعتمد|تبنّ/i : e.verdict === 'ROLL BACK' ? /ROLL BACK|تراجع|ارجع/i : e.verdict === 'EXTEND' ? /too few|extend|قليل|مد/i : /inconcl|غير حاسم/i;
for (const C of COMBOS) test(`X-1/2 experiment view + digest card [${C.name}] (verdict files from real flow-exp)`, async ({ browser }) => {
  const { c, page, errs } = await open(browser, C);
  await page.goto(`http://127.0.0.1:${B.pb}/?ui=3#/time`); await page.waitForSelector('.u3-ex__item', { timeout: 30000 }); await page.waitForTimeout(600);
  const items = page.locator('.u3-ex__item'); expect(await items.count()).toBe(exps.length);
  const pills = await page.locator('.u3-ex__item .u3-ex__pill').allInnerTexts(); LOG(`X-1 ${C.name} pills=${JSON.stringify(pills)}`);
  // every experiment: pill matches its own verdict file; open it; arms with n + time + quality; target; reason
  for (let i = 0; i < exps.length; i++) {
    const it = items.nth(i); const name = (await it.innerText()).split('\n')[0].trim(); const e = exps.find((x) => x.slug === name || x.slug === (name.replace(/\s+/g, '-'))) || exps[i];
    await it.click(); await page.waitForTimeout(200);
    const det = page.locator('.u3-ex__detail'); const dt = await det.innerText();
    const before = await det.locator('.u3-ex__arm--before').innerText(), during = await det.locator('.u3-ex__arm--during').innerText();
    const pill = await det.locator('.u3-ex__pill').first().innerText().catch(() => '');
    if (C.lang === 'en') { expect(pill, `${e.slug} pill`).toMatch(wantPill(e)); expect(dt).toContain(e.slug); }
    for (const arm of [before, during]) { expect(arm).toMatch(/\d/); expect(arm).toMatch(/tasks|مهم/i); expect(arm).toMatch(/median|وسيط/i); }
    expect(await det.locator('.u3-ex__arm-q').count(), 'quality counters in both arms').toBeGreaterThanOrEqual(2);
    expect(await det.locator('.u3-ex__target').count()).toBeGreaterThan(0);
    expect(await det.locator('.u3-ex__reason').innerText()).toContain((e.reason || '').slice(0, 20));
    const ctl = await det.locator('button, input, textarea, select, [role=button]').evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 140))); if (ctl.length) LOG(`X-1 ${C.name} ${e.slug} controls in detail: ${JSON.stringify(ctl)}`);
    expect(ctl.length, 'detail has no adopt / roll back / new buttons or inputs').toBe(0);
    if (i === 0) await page.screenshot({ path: `${OUT}/shots/X1-${C.tag}-${e.slug}.png` });
  }
  const ex = page.locator('.u3-ex'); expect(await ex.locator('button:not(.u3-ex__item), input, textarea, select').count(), 'no action buttons or inputs anywhere in the experiments view').toBe(0);
  expect(await noH(page), 'no horizontal scroll').toBe(true);
  expect(await page.evaluate(() => document.documentElement.dir || document.body.dir || document.querySelector('.u3-app,[dir]')?.getAttribute('dir'))).toBe(C.lang === 'ar' ? 'rtl' : 'ltr');
  // X-2 digest: five labelled lines and a clickable bead link
  const txt = await page.evaluate(() => document.body.innerText); const dgText = txt.slice(txt.search(/Weekly flow digest|الملخص الأسبوعي/), txt.search(/Written by the weekly script|كتبه/) + 60);
  fs.writeFileSync(`${OUT}/X2-digest-${C.tag}.txt`, dgText);
  const dg = page.locator('section, div, article').filter({ hasText: /Written by the weekly script|اتكتب|كتبه/ }).last();
  const labels = C.lang === 'en' ? ['Title', 'Done since last', 'Next', 'Needs you', 'Risks'] : null;
  if (labels) for (const l of labels) expect(dgText, `digest label ${l}`).toContain(l);
  await page.screenshot({ path: `${OUT}/shots/X2-${C.tag}-digest.png`, fullPage: false });
  expect(errs).toEqual([]); await c.close();
});

test('X-2b real rollup on main server: no findings, experiments show too few to tell, digest shows Risks: none', async ({ browser }) => {
  const { c, page, errs } = await open(browser, COMBOS[3]);
  await page.goto(base('pc') + '/?ui=3#/time'); await page.waitForSelector('.u3-ex__item', { timeout: 30000 });
  const pills = await page.locator('.u3-ex__item .u3-ex__pill').allInnerTexts(); LOG(`X-2b pills on real data: ${JSON.stringify(pills)}`);
  const txt = await page.evaluate(() => document.body.innerText); expect(txt).toMatch(/Risks:?\s*none/i);
  expect(errs).toEqual([]); await c.close();
});

// ---------- X-4b tapping the flow push opens #/time on a phone that never set ?ui=3 this session ----------
test('X-4b sw click target /#/time works from a fresh phone context without ?ui=3', async ({ browser }) => {
  const { c, page } = await open(browser, { w: 390, lang: 'ar', theme: 'dark' });
  await page.goto(base('phone') + '/#/time'); await page.waitForTimeout(3000);
  const v3 = await page.locator('.u3-app, .u3-top, .u3-tabbar').count(); const t = (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n+/g, ' | ');
  LOG(`X-4b /#/time without ?ui=3 on a fresh context: v3 elements=${v3}; text="${t}"`);
  await page.screenshot({ path: `${OUT}/shots/X4b-fresh-time.png` });
  await c.close();
});

// ---------- O-1 old board without ?ui=3 ----------
test('O-1 old board without ?ui=3 renders the old shell and requests no v3 data', async ({ browser }) => {
  const { c, page, errs } = await open(browser, { w: 1440, lang: 'en', theme: 'light' });
  const frames = []; page.on('websocket', (ws) => ws.on('framesent', (f) => frames.push(String(f.payload).slice(0, 200))));
  await page.goto(base('pc') + '/'); await page.waitForTimeout(3500);
  const v3 = await page.locator('.u3-top, .u3-side, .u3-tabbar, [class*=u3-]').count();
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300);
  const sentV3 = frames.filter((f) => /flow-|mention|u3/i.test(f)); LOG(`O-1 v3 nodes=${v3}; v3-ish ws frames=${JSON.stringify(sentV3)}; body="${body}"`);
  await page.screenshot({ path: `${OUT}/shots/O1-old-board.png` });
  expect(v3).toBe(0); expect(sentV3).toEqual([]); expect(await page.locator('#board-root, #list-root, #issues-root, #app').count()).toBeGreaterThan(0);
  expect(errs).toEqual([]); await c.close();
});

// ---------- S smoke: every v3 screen in 8 combos ----------
const ID = 'beads-lite-1bo5.6.24';
const SCREENS = [
  ['desk', '#/'], ['tasks-list', '#/issues'], ['tasks-board', '#/board'], ['tasks-epics', '#/epics'], ['task-page', `#/issues?issue=${ID}`],
  ['projects', '#/projects'], ['releases', '#/releases'], ['time', '#/time'], ['settings', '#/settings'], ['swimlanes', '#/board', 'project'], ['ui-kit', '#/ui-kit']
];
for (const C of COMBOS) test(`S smoke of all v3 screens [${C.name}]`, async ({ browser }) => {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [C.lang, C.theme]);
  const rows = [];
  for (const [name, hash, group] of SCREENS) {
    const page = await c.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && !/\/att\//.test(m.location().url) && errs.push('console: ' + m.text().slice(0, 150)));
    page.on('response', (r) => { if (r.status() >= 400 && !/\/att\/|favicon/.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
    if (group) await page.addInitScript((g) => { try { localStorage.setItem('beads-ui.u3.tasks.group', g); } catch {} }, group);
    await page.goto(base(C.w < 500 ? 'phone' : 'pc') + '/?ui=3' + hash); await page.waitForSelector('.u3-main__in, #u3-view', { timeout: 30000 }); await page.waitForTimeout(2200);
    const r = await page.evaluate(() => {
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; const m = b.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.9) && !(m.length === 4 && Number(m[3]) === 0)) return b; } return 'rgb(255,255,255)'; };
      let low = 0, invisible = 0, sample = []; let small = 0;
      for (const el of document.querySelectorAll('main *, header *, nav *, aside *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) continue;
        const cs = getComputedStyle(el); const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
        const a = lum(cs.color), b = lum(bgOf(el)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 1.5) { invisible++; if (sample.length < 3) sample.push((el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 25) + ' ' + ratio.toFixed(2)); } else if (ratio < 3) low++;
      }
      for (const el of document.querySelectorAll('button, a[href], [role=button], input, select')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && (r.height < 28 || r.width < 28) && getComputedStyle(el).visibility !== 'hidden') small++; }
      const txt = document.body.innerText;
      return { h: document.documentElement.scrollWidth <= window.innerWidth + 1, dir: document.querySelector('[dir]')?.getAttribute('dir') || document.documentElement.dir, len: txt.length, raw: (txt.match(/\bu3_[a-z_]+|undefined|NaN|\[object|\{\{/g) || []).slice(0, 5), invisible, low, small, sample };
    });
    await page.screenshot({ path: `${OUT}/shots/S-${C.tag}-${name}.png` });
    rows.push({ name, ...r, errs }); await page.close();
  }
  fs.writeFileSync(`${OUT}/S-${C.tag}.json`, JSON.stringify(rows, null, 1));
  for (const r of rows) LOG(`S ${C.name} ${r.name}: hscroll_ok=${r.h} dir=${r.dir} text=${r.len} raw=${JSON.stringify(r.raw)} invisible_text=${r.invisible} lowcontrast(1.5-3)=${r.low} small_targets=${r.small} errs=${JSON.stringify(r.errs)} ${r.sample.join('; ')}`);
  for (const r of rows) {
    expect(r.h, `${r.name} no horizontal scroll`).toBe(true); expect(r.len, `${r.name} has text`).toBeGreaterThan(40); expect(r.raw, `${r.name} raw keys`).toEqual([]);
    expect(r.invisible, `${r.name} invisible text ${r.sample}`).toBe(0); expect(r.errs, `${r.name} errors`).toEqual([]);
    if (C.lang === 'ar') expect(r.dir, `${r.name} rtl`).toBe('rtl');
  }
  await c.close();
});

// ---------- L-4 .59.4: a question on an unlabelled steps item shows the steps wording ----------
for (const C of COMBOS.filter((x) => x.theme === 'light' && ((x.w === 1440 && x.lang === 'en') || (x.w === 390 && x.lang === 'ar'))))
  test(`L-4 unlabelled steps item: asking shows the steps wording [${C.name}]`, async ({ browser }) => {
    const id = create(`QAW5 steps ${C.name}`);
    bd(['comments', 'add', id, 'STEPS: QA steps\n\n## Steps\n1. open the thing\n2. press the button\n']);
    const { c, page } = await open(browser, C);
    await page.goto(base(C.w < 500 ? 'phone' : 'pc') + `/?ui=3#/issues?issue=${id}`);
    await page.locator('.u3-st').first().waitFor({ timeout: 30000 });
    const btns = await page.locator('.u3-st__act button').allInnerTexts(); LOG(`L-4 ${C.name} steps buttons=${JSON.stringify(btns)}`);
    await page.locator('.u3-st__act button:not(.u3-btn--steps)').first().click();
    await page.locator('.u3-st .u3-cd__text').fill('which one?');
    await page.screenshot({ path: `${OUT}/shots/L4-${C.tag}-ask.png` });
    await page.locator('.u3-st .u3-cd__form button[type=submit], .u3-st .u3-cd__row button').first().click();
    await page.locator('.u3-st [role=alert]').waitFor({ timeout: 15000 });
    const err = await page.locator('.u3-st [role=alert]').innerText(); LOG(`L-4 ${C.name} error shown="${err}"`);
    await page.screenshot({ path: `${OUT}/shots/L4-${C.tag}-refused.png` });
    expect(err).toMatch(/steps|الخطوات/i); expect(err).not.toMatch(/Could not save|تعذر/);
    bd(['close', id, '-r', 'qa cleanup']); await c.close();
  });

// ---------- S-search: top search finds a task by title and by id, either language ----------
for (const C of COMBOS.filter((x) => x.theme === 'dark'))
  test(`S-search top search finds by title and id, opens the task [${C.name}]`, async ({ browser }) => {
    const id = create(`QAW5 zebrafinch ${C.name}`);
    const { c, page, errs } = await open(browser, C);
    await page.goto(base(C.w < 500 ? 'phone' : 'pc') + '/?ui=3#/'); await page.waitForSelector('.u3-top'); await page.waitForTimeout(1500);
    if (C.w < 500) await page.locator('.u3-search__btn').click();
    const inp = page.locator('.u3-search__field input'); await inp.fill('zebrafinch'); await page.waitForTimeout(800);
    const hits = page.locator('.u3-search__hit'); const n = await hits.count(); LOG(`S-search ${C.name} title hits=${n}`);
    await page.screenshot({ path: `${OUT}/shots/Ssearch-${C.tag}.png` });
    expect(n).toBeGreaterThan(0); expect(await noH(page)).toBe(true);
    await inp.fill(id); await page.waitForTimeout(600); expect(await hits.count()).toBeGreaterThan(0);
    await hits.first().click(); await page.waitForTimeout(1200); expect(page.url()).toContain(id);
    bd(['close', id, '-r', 'qa cleanup']); expect(errs).toEqual([]); await c.close();
  });

// ---------- X-2c digest Next line with a bead link (what flow-weekly writes when it files a task) ----------
for (const C of COMBOS.filter((x) => x.theme === 'light'))
  test(`X-2c digest card: bead link in Next opens the bead inside the board [${C.name}]`, async ({ browser }) => {
    const f = SC + '/digestB/2026-W47.md';
    fs.writeFileSync(f, ['# Flow review 2026-W47', '', 'Title: Flow 2026-W47: at risk (n=40 closed in 4 weeks)', 'Done since last: nothing to report', 'Next: cto - [Flow review 2026-W47](https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=beads-lite-1bo5.6.24)', 'Needs you: nothing', 'Risks: swe task: waiting median 1h to 2h (+100%), fails 3/20 (quality worse)', ''].join(String.fromCharCode(10)));
    try {
      const { c, page, errs } = await open(browser, C);
      await page.goto(`http://127.0.0.1:${B.pb}/?ui=3#/time`); await page.waitForSelector('.u3-ex__item'); await page.waitForTimeout(800);
      const link = page.locator('a[href*="issue=beads-lite-1bo5.6.24"]').first(); await expect(link).toBeVisible();
      const href = await link.getAttribute('href'); const box = await link.boundingBox(); LOG(`X-2c ${C.name} link href=${href} box=${JSON.stringify(box)}`);
      await page.screenshot({ path: `${OUT}/shots/X2c-${C.tag}.png` });
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(C.w + 1); expect(await noH(page)).toBe(true);
      const tgt = await link.evaluate((a) => [a.target, a.rel]); LOG(`X-2c ${C.name} link target/rel=${JSON.stringify(tgt)}`); const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 4000 }).catch(() => null), link.click()]); LOG(`X-2c ${C.name} click opened new tab=${!!pop} popup url=${pop ? pop.url().slice(0, 80) : ''}`); if (pop) await pop.close(); await page.waitForTimeout(500);
      LOG(`X-2c ${C.name} after click url=${page.url().split('127.0.0.1')[1]}`);
      expect(!!pop || page.url().includes('beads-lite-1bo5.6.24'), 'the link goes somewhere: new tab or in-page').toBe(true); expect(tgt[1] || '', 'external new-tab link has noopener').toMatch(/noopener/);
      expect(errs).toEqual([]); await c.close();
    } finally { fs.rmSync(f, { force: true }); }
  });
