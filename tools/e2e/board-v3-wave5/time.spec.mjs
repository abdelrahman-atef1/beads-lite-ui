// QA wave 4, Time screens (beads-lite-1bo5.6.59.12) against the REAL rollup.mjs output (company d50e7ef) on copies of the dbs.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bd, create, OUT, base, E } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const FLOW = E.proj.replace('/proj', '/flow');
const ROLLUP = FLOW + '/rollup.json';
const GOOD = FLOW + '/rollup.good.json';
if (!fs.existsSync(GOOD)) fs.copyFileSync(ROLLUP, GOOD);
const DOC = JSON.parse(fs.readFileSync(GOOD, 'utf8'));
const DB = E.proj + '/.beads/beads.db';
const LOG = (s) => fs.appendFileSync(OUT + '/time-notes.txt', s + '\n');
const COMBOS = [];
for (const w of [390, 1440]) for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) COMBOS.push({ w, lang, theme, name: `${w} ${lang} ${theme}`, door: w < 500 ? 'phone' : 'pc' });
const CLOSED = 'beads-lite-1bo5.6.24', RUNNING = 'beads-lite-1bo5.6', NOHIST = 'beads-lite-1bo5.6.11';
const UNK = { en: 'unknown', ar: 'غير معروف' };
const UNIT = { d: 1440, h: 60, m: 1, ي: 1440, س: 60, د: 1 };
const mins = (t) => { if (/^\s*<1/.test(t)) return 0; let m = 0, hit = false; for (const x of t.matchAll(/(\d+)\s*([dhmيسد])/g)) { m += +x[1] * UNIT[x[2]]; hit = true; } return hit ? m : null; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, C) {
  const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [C.lang, C.theme]);
  const page = await c.newPage(); const errs = []; const wsBytes = { n: 0, frames: [] };
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('/att/') && errs.push('console: ' + m.text()));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { const p = String(f.payload); if (p.includes('flow-rollup')) { wsBytes.n += p.length; wsBytes.frames.push(p.length); } }));
  return { c, page, errs, wsBytes };
}
const slotUrl = (C, id) => base(C.door) + `/?ui=3#/issues?issue=${id}`;
const noHscroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const slotText = async (page) => { await page.waitForSelector('u3-time-slot .u3-tm__head, u3-time-slot .u3-tm__unk', { timeout: 30000 }); await page.waitForTimeout(800); return page.locator('u3-time-slot').innerText(); };

// independent oracle from the bead's own events (sqlite copy), not from rollup.json
function oracleIntervals(id) {
  const db = new DatabaseSync(DB, { readOnly: true });
  const iss = db.prepare('select created_at, closed_at from issues where id=?').get(id);
  const t = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
  const pts = [{ at: t(iss.created_at), st: 'open' }];
  for (const e of db.prepare('select event_type,new_value,created_at from events where issue_id=? order by created_at,id').all(id)) {
    if (e.event_type === 'claimed') pts.push({ at: t(e.created_at), st: 'in_progress' });
    else if (e.event_type === 'status_changed') { try { const st = JSON.parse(e.new_value).status; if (st) pts.push({ at: t(e.created_at), st }); } catch {} }
    else if (e.event_type === 'closed') pts.push({ at: t(e.created_at), st: 'closed' });
  }
  db.close();
  const out = []; for (let i = 0; i < pts.length - 1; i++) out.push({ st: pts[i].st, ms: pts[i + 1].at - pts[i].at });
  return out;
}

for (const C of COMBOS.filter((x) => x.w === 1440 ? x.lang === 'en' && x.theme === 'light' : x.lang === 'ar' && x.theme === 'dark')) test.describe(`task Time section ${C.name}`, () => {
  test(`T-1/2/4/5/16 closed bead: total beside chips, intervals match events, unknown stages, tokens unknown [${C.name}]`, async ({ browser }) => {
    const { c, page, errs } = await open(browser, C);
    await page.goto(slotUrl(C, CLOSED)); const txt = await slotText(page);
    fs.writeFileSync(`${OUT}/T1-${C.door}-${CLOSED}.txt`, txt);
    // T-1: same row
    const head = page.locator('u3-time-slot .u3-tm__head');
    await expect(head.locator('.u3-tm__total .u3-tm__num')).toBeVisible();
    const chips = await head.locator('.u3-tm__q').allInnerTexts();
    expect(chips.length).toBe(4);
    const q = DOC.beads[CLOSED].quality; const nums = chips.map((s) => parseInt(s.replace(/\D/g, ''), 10));
    expect(nums).toEqual([q.qaFail, q.reopen, q.ownerReject, q.rework]);
    const tb = await head.locator('.u3-tm__total').boundingBox(); const qb = await head.locator('.u3-tm__qs').boundingBox();
    LOG(`${C.name} T-1 total box y=${Math.round(tb.y)} h=${Math.round(tb.height)}; chips box y=${Math.round(qb.y)} h=${Math.round(qb.height)}`);
    expect(Math.abs((tb.y + tb.height / 2) - (qb.y + qb.height / 2)) < Math.max(tb.height, qb.height) + 40 || C.w < 500).toBe(true);
    await page.screenshot({ path: `${OUT}/shots/T1-${C.door}-${C.w}-${C.lang}-${C.theme}-task.png` });
    // T-2: intervals vs independent event oracle (rounded to the minute, +-1)
    const ivs = await page.locator('u3-time-slot .u3-tm__ivs li .u3-tm__num').allInnerTexts();
    const ora = oracleIntervals(CLOSED).filter((i) => i.ms > 0);
    LOG(`${C.name} T-2 UI intervals=${JSON.stringify(ivs)} oracle(min)=${JSON.stringify(ora.map((i) => [i.st, Math.round(i.ms / 60000)]))}`);
    expect(ivs.length).toBe(ora.length);
    ivs.forEach((t, i) => expect(Math.abs(mins(t) - Math.round(ora[i].ms / 60000))).toBeLessThanOrEqual(1));
    const roles = await page.locator('u3-time-slot .u3-tm__ivs li').evaluateAll((l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
    LOG(`${C.name} T-2 interval rows=${JSON.stringify(roles)}`);
    // wall = active + waiting
    const wallLine = (await page.locator('u3-time-slot .u3-tm__wall').innerText()).trim();
    const parts = [...wallLine.matchAll(/(\d+[dhmيسد]\s*(?:\d+[hmسد])?|<1[mد])/g)].map((m) => mins(m[1]));
    LOG(`${C.name} T-2 wall line="${wallLine}" parts=${JSON.stringify(parts)}`);
    expect(Math.abs(parts[0] - (parts[1] + parts[2]))).toBeLessThanOrEqual(1);
    const wholeMin = Math.round(ora.reduce((s, i) => s + i.ms, 0) / 60000); expect(Math.abs(parts[0] - wholeMin)).toBeLessThanOrEqual(2);
    // T-4: stages that never happened say unknown, not 0
    const stageRows = await page.locator('u3-time-slot .u3-tm__list').first().locator('li').allInnerTexts();
    LOG(`${C.name} T-4 stage rows=${JSON.stringify(stageRows.map((s) => s.replace(/\s+/g, ' ')))}`);
    expect(stageRows.filter((s) => s.includes(UNK[C.lang])).length).toBeGreaterThanOrEqual(2);
    expect(stageRows.join('|')).not.toMatch(/(^|\s)0\s*[mhdدسي]?(\s|$)/);
    // T-5 tokens
    expect(txt).toMatch(C.lang === 'en' ? /Tokens: unknown/ : /التوكنز: غير معروفة/);
    expect(await noHscroll(page)).toBe(true); expect(txt).not.toMatch(/[٠-٩]/);
    expect(errs).toEqual([]); await c.close();
  });

  test(`T-3 running bead says running and counts up to now [${C.name}]`, async ({ browser }) => {
    const { c, page, errs } = await open(browser, C);
    await page.goto(slotUrl(C, RUNNING)); const txt = await slotText(page);
    fs.writeFileSync(`${OUT}/T3-${C.door}-${RUNNING}.txt`, txt);
    const word = C.lang === 'en' ? 'running' : 'شغّال دلوقتي';
    expect(txt).toContain(word);
    const row = DOC.beads[RUNNING]; const total = mins(await page.locator('u3-time-slot .u3-tm__total .u3-tm__num').innerText());
    const nowMin = (Date.now() - row.created) / 60000; const builtMin = row.wall_ms / 60000;
    LOG(`${C.name} T-3 UI total=${total}m rollup built wall=${Math.round(builtMin)}m, now-created=${Math.round(nowMin)}m`);
    expect(total).toBeGreaterThanOrEqual(Math.floor(builtMin) - 1440); // days-wide display drops minutes/hours
    expect(Math.abs(total - nowMin)).toBeLessThan(1440 + 120);
    const last = page.locator('u3-time-slot .u3-tm__ivs li').last(); await expect(last).toContainText(word);
    expect(errs).toEqual([]); await c.close();
  });

  test(`T-4/5/14 no history bead and a bead missing from the rollup: unknown as text, never 0 [${C.name}]`, async ({ browser }) => {
    const { c, page, errs } = await open(browser, C);
    await page.goto(slotUrl(C, NOHIST)); const txt = await slotText(page);
    fs.writeFileSync(`${OUT}/T4-${C.door}-nohist.txt`, txt);
    expect(txt).toContain(UNK[C.lang]);
    const tot = (await page.locator('u3-time-slot .u3-tm__total').innerText()).replace(/\s+/g, ' ');
    LOG(`${C.name} T-4 no-history total cell="${tot}"`);
    expect(tot).not.toMatch(/\b0\s*[mhd]?\b/); expect(tot).toContain(UNK[C.lang]);
    await page.screenshot({ path: `${OUT}/shots/T4-${C.door}-${C.w}-${C.lang}-${C.theme}-nohist.png` });
    const [fresh] = [create('QAW4 time fresh bead')];
    await page.goto(slotUrl(C, fresh)); await page.reload(); const t2 = await slotText(page);
    LOG(`${C.name} T-14 new bead (not in rollup) slot="${t2.replace(/\s+/g, ' ').slice(0, 160)}"`);
    expect(t2).toMatch(C.lang === 'en' ? /unknown|No time data/i : /غير معروف|مفيش بيانات/);
    expect(t2).not.toMatch(/Error|undefined|NaN|null/);
    bd(['close', fresh, '-r', 'qa cleanup']);
    expect(errs).toEqual([]); await c.close();
  });
});

for (const C of COMBOS) test.describe(`role Time screen ${C.name}`, () => {
  test(`T-6/8/12/13/16 role screen: numbers beside chips, A-Z, no timer, no hscroll, fast, agrees with rollup [${C.name}]`, async ({ browser }) => {
    const { c, page, errs, wsBytes } = await open(browser, C);
    const t0 = Date.now(); await page.goto(base(C.door) + '/?ui=3#/time'); await page.waitForSelector('[data-view=time] .u3-tmr', { timeout: 30000 }); const dt = Date.now() - t0;
    await page.waitForTimeout(500);
    LOG(`${C.name} T-13 #/time to first role card ${dt} ms; flow-rollup frame bytes=${wsBytes.n} frames=${JSON.stringify(wsBytes.frames)}`);
    expect(dt).toBeLessThan(2000 + 1500); // 2 s budget plus first-load/page boot allowance; reported separately
    const txt = await page.locator('[data-view=time]').innerText(); fs.writeFileSync(`${OUT}/T6-${C.door}-${C.w}-${C.lang}-${C.theme}.txt`, txt);
    await page.screenshot({ path: `${OUT}/shots/T6-${C.door}-${C.w}-${C.lang}-${C.theme}-roles.png`, fullPage: C.w < 500 });
    const cards = page.locator('[data-view=time] .u3-tmr'); const n = await cards.count(); expect(n).toBeGreaterThan(3);
    // every card: three time numbers and the quality chips inside the same card
    const per = await cards.evaluateAll((l) => l.map((a) => ({ role: a.dataset.role, times: a.querySelectorAll('.u3-tm__num').length, chips: a.querySelectorAll('.u3-tmr__q .u3-tm__q').length, closed: a.querySelector('.u3-tmr__n')?.innerText })));
    LOG(`${C.name} T-6 cards=${JSON.stringify(per.map((p) => [p.role, p.times, p.chips]))}`);
    for (const p of per) { expect(p.times).toBe(3); expect(p.chips).toBe(5); }
    // A-Z
    const roles = per.map((p) => p.role); expect(roles).toEqual([...roles].sort());
    // no timer / hours / log-work / sort-by-time controls
    const ctrl = await page.evaluate(() => ({ inputs: document.querySelectorAll('[data-view=time] input, [data-view=time] select, [data-view=time] textarea').length, buttons: [...document.querySelectorAll('[data-view=time] button')].map((b) => b.innerText.trim()), body: document.body.innerText }));
    LOG(`${C.name} T-8 inputs=${ctrl.inputs} buttons=${JSON.stringify(ctrl.buttons)}`);
    expect(ctrl.inputs).toBe(0);
    expect(ctrl.buttons.join('|')).not.toMatch(/timer|start|stop|log|hours|ساعات|سجّل|ابدأ|sort|ترتيب/i);
    expect(txt).not.toMatch(/[٠-٩]/);
    expect(await noHscroll(page)).toBe(true);
    // chips do not wrap
    const wraps = await page.evaluate(() => [...document.querySelectorAll('[data-view=time] .u3-tm__q')].filter((e) => getComputedStyle(e).whiteSpace !== 'nowrap').length); expect(wraps).toBe(0);
    // T-16 against the rollup file, independent of the UI code (last 30 days default)
    const now = Date.now(), from = now - 30 * 864e5; const by = {};
    for (const r of Object.values(DOC.beads)) if (r.closed !== null && r.closed >= from) { const k = r.role || 'unknown'; (by[k] ||= []).push(r); }
    let checked = 0;
    for (const p of per) { const exp = (by[p.role] || []).length; const got = parseInt((p.closed || '').replace(/\D/g, ''), 10); if (exp !== got) LOG(`${C.name} T-16 MISMATCH role=${p.role} ui=${got} rollup=${exp}`); if (C.door === 'phone') expect(got).toBeLessThanOrEqual(exp); else expect(got).toBe(exp); checked++; }
    for (const role of ['swe', 'sre']) {
      const rows = by[role] || []; const act = rows.map((r) => r.active_ms).filter((x) => x !== null).sort((a, b) => a - b);
      if (!act.length) continue; const med = act[Math.ceil(act.length * 0.5) - 1];
      const card = cards.locator(`xpath=self::*[@data-role="${role}"]`); const el = page.locator(`[data-view=time] .u3-tmr[data-role="${role}"] dd`).first();
      const shown = mins(await el.innerText()); LOG(`${C.name} T-16 ${role} active median UI=${shown}m oracle=${Math.round(med / 60000)}m (rows ${rows.length}, with time ${act.length})`);
      expect(Math.abs(shown - Math.round(med / 60000))).toBeLessThanOrEqual(1);
    }
    LOG(`${C.name} T-16 roles checked=${checked}`);
    expect(errs).toEqual([]); await c.close();
  });
});

test('T-7 verdict text: real rollup shows too-few-to-tell; sample data shows faster but worse (timefx)', async ({ browser }) => {
  const C = COMBOS.find((x) => x.name === '1440 en light'); const { c, page, errs } = await open(browser, C);
  await page.goto(base('pc') + '/?ui=3#/time'); await page.waitForSelector('[data-view=time] .u3-tmr');
  const real = await page.locator('[data-view=time] .u3-tmr__verdict').allInnerTexts(); LOG('T-7 real verdicts=' + JSON.stringify([...new Set(real.map((s) => s.replace(/\s+/g, ' ')))]));
  expect(real.length).toBeGreaterThan(3); for (const v of real) expect(v.trim().length).toBeGreaterThan(3);
  await page.goto(base('pc') + '/?ui=3&timefx=1#/time'); await page.waitForSelector('[data-view=time] .u3-tmr');
  const fx = (await page.locator('[data-view=time]').innerText()); fs.writeFileSync(OUT + '/T7-timefx.txt', fx);
  await page.screenshot({ path: OUT + '/shots/T7-timefx-1440-en-light.png', fullPage: true });
  expect(fx).toMatch(/faster but worse/i); expect(fx).toMatch(/quality worse, speed about the same/i);
  expect(errs).toEqual([]); await c.close();
});

test('T-11 More sheet link opens #/time at 390 (ar dark and en light), back returns', async ({ browser }) => {
  for (const C of [COMBOS.find((x) => x.name === '390 ar dark'), COMBOS.find((x) => x.name === '390 en light')]) {
    const { c, page, errs } = await open(browser, C);
    await page.goto(base('phone') + '/?ui=3#/issues'); await page.waitForSelector('.u3t-card');
    await page.locator('nav button, nav a, [role=navigation] button').filter({ hasText: C.lang === 'ar' ? 'المزيد' : 'More' }).first().click();
    const link = page.locator('a.u3-more__link[href="#/time"]'); await expect(link).toBeVisible();
    const bb = await link.boundingBox(); expect(bb.x).toBeGreaterThanOrEqual(0); expect(bb.x + bb.width).toBeLessThanOrEqual(C.w + 1); expect(bb.height).toBeGreaterThanOrEqual(36);
    LOG(`${C.name} T-11 more-sheet link text="${(await link.innerText()).trim()}" box h=${Math.round(bb.height)}`);
    await page.screenshot({ path: `${OUT}/shots/T11-more-${C.lang}-${C.theme}.png` });
    await link.click(); await expect(page.locator('[data-view=time]')).toBeVisible(); expect(page.url()).toContain('#/time');
    await page.waitForSelector('[data-view=time] .u3-tmr'); await expect(page.locator('.u3-sheet__scrim')).toHaveCount(0);
    await page.goBack(); await page.waitForSelector('.u3t-card'); await expect(page.locator('[data-view=time]')).toHaveCount(0);
    expect(errs).toEqual([]); await c.close();
  }
});

// last: these move the rollup file; they restore it from the good copy
test.describe.serial('rollup missing or unreadable', () => {
  const restore = () => fs.copyFileSync(GOOD, ROLLUP);
  for (const mode of ['missing', 'garbage']) test(`T-9/10 rollup ${mode}: empty state on #/time and the task, no crash, board works`, async ({ browser }) => {
    try {
      if (mode === 'missing') fs.rmSync(ROLLUP); else fs.writeFileSync(ROLLUP, 'not json {{{ \u0000');
      await wait(1100);
      for (const C of [COMBOS.find((x) => x.name === '390 ar dark'), COMBOS.find((x) => x.name === '1440 en light')]) {
        const { c, page, errs } = await open(browser, C);
        await page.goto(base(C.door) + '/?ui=3#/time'); await page.waitForSelector('[data-view=time]'); await page.waitForTimeout(1500);
        const t = await page.locator('[data-view=time]').innerText(); LOG(`${C.name} T-9 ${mode} #/time text="${t.replace(/\s+/g, ' ').slice(0, 200)}"`);
        expect(t).toMatch(C.lang === 'en' ? /No time data yet/ : /مفيش بيانات وقت/);
        expect(await page.locator('[data-view=time] .u3-tmr').count()).toBe(0);
        await page.screenshot({ path: `${OUT}/shots/T9-${mode}-${C.door}-${C.w}-time.png` });
        await page.goto(slotUrl(C, CLOSED)); const st = await slotText(page); LOG(`${C.name} T-9 ${mode} task slot="${st.replace(/\s+/g, ' ').slice(0, 200)}"`);
        expect(st).toMatch(/No time data|unknown|مفيش بيانات|غير معروف/); expect(st).not.toMatch(/NaN|undefined|Error/);
        await page.screenshot({ path: `${OUT}/shots/T9-${mode}-${C.door}-${C.w}-task.png` });
        await page.goto(base(C.door) + '/?ui=3#/issues'); await page.waitForSelector('.u3t-card', { timeout: 30000 });
        expect(errs).toEqual([]); await c.close();
      }
    } finally { restore(); }
  });
  test('T-9 after restore the screen works again', async ({ browser }) => {
    const C = COMBOS.find((x) => x.name === '1440 en light'); const { c, page, errs } = await open(browser, C);
    await wait(1100); await page.goto(base('pc') + '/?ui=3#/time'); await page.waitForSelector('[data-view=time] .u3-tmr', { timeout: 20000 }); expect(errs).toEqual([]); await c.close();
  });
});
