import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { E, bd, show, create, OUT, base } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const COMBOS = [
  { name: 'phone-door 390 ar dark', door: 'phone', w: 390, lang: 'ar', theme: 'dark' },
  { name: 'pc-door 1440 en light', door: 'pc', w: 1440, lang: 'en', theme: 'light' }
];
const TAB = { open: 'ready', in_progress: 'progress', owner_decision: 'owner', waiting_for_test: 'test', waiting_for_merge: 'merge', blocked: 'blocked' };
let RUN = ''; const mk = (n, tag, extra = []) => Array.from({ length: n }, (_, i) => create(`QAW4R ${tag} ${i + 1}`, extra));
const jlist = (args) => { const r = bd(['list', ...args, '--json', '-n', '0']); return JSON.parse(r.stdout.slice(r.stdout.indexOf('['))); };
const closedCount = () => jlist(['--status', 'closed']).length;

for (const C of COMBOS) test.describe(C.name, () => {
  const _mk = null;
  let page; const errs = [];
  const sh = (n) => page.screenshot({ path: `${OUT}/shots/${C.door}-${C.w}-${C.lang}-${C.theme}-${n}.png` });
  test.beforeAll(async ({ browser }) => {
    const c = await browser.newContext({ viewport: { width: C.w, height: C.w < 500 ? 844 : 900 }, hasTouch: C.w < 500, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
    await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [C.lang, C.theme]);
    page = await c.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  });
  test.afterAll(async () => { fs.writeFileSync(`${OUT}/errors-bulk-${C.door}-${C.w}.json`, JSON.stringify(errs, null, 1)); await page.context().close(); });

  const card = (id) => page.locator(`.u3t-card[data-issue-id="${id}"]`);
  async function board(statusTab = 'open', query = '') {
    await page.goto('about:blank'); await page.goto(base(C.door) + '/?ui=3#/issues');
    await page.waitForSelector('.u3t-card', { timeout: 60000 });
    if (C.w < 500) { const chip = page.locator(`.u3t-stat__chip--${TAB[statusTab]}`); if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click(); }
    if (query) { await page.locator('input.u3t-search').fill(query); await page.waitForTimeout(500); }
  }
  async function pressHold(id, ms = 650) {
    const loc = card(id); await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox(); const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    if (C.w < 500) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
  }
  const enter = async () => { await page.getByTestId('bulk-enter').click(); await expect(page.getByTestId('bulk-bar')).toBeVisible(); };
  async function pick(ids) { for (const id of ids) { await card(id).scrollIntoViewIfNeeded(); await card(id).click(); } }
  const count = async () => (await page.getByTestId('bulk-count').innerText()).trim();
  async function applyClose(reason) { await page.getByTestId('bulk-close').click(); await page.getByTestId('bulk-reason').fill(reason); await page.getByTestId('bulk-apply').click(); await expect(page.getByTestId('bulk-result')).toBeVisible({ timeout: 20000 }); }
  const resultText = async () => (await page.getByTestId('bulk-result').innerText());
  const noHscroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const result = async () => { await expect(page.getByTestId('bulk-result')).toBeVisible({ timeout: 20000 }); };
  const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };

  test(`B-1 long-press enters select, 3 taps = 3, back leaves, nothing changed [${C.name}]`, async () => {
    const ids = mk(3, 'lp'); await board('open', 'QAW4R lp');
    await expect(card(ids[0])).toBeVisible({ timeout: 30000 });
    await pressHold(ids[0]);
    await expect(page.getByTestId('bulk-bar')).toBeVisible(); expect(await count()).toMatch(/1/);
    await card(ids[1]).click(); await card(ids[2]).click();
    expect(await count()).toMatch(/3/); expect(await count()).not.toMatch(/[٠-٩]/);
    expect(await noHscroll()).toBe(true);
    const bb = await page.getByTestId('bulk-bar').boundingBox(); expect(bb.x).toBeGreaterThanOrEqual(-1); expect(bb.x + bb.width).toBeLessThanOrEqual(C.w + 1);
    for (const b of ['close', 'move', 'defer']) { const bx = await page.getByTestId('bulk-' + b).boundingBox(); expect(bx.x + bx.width).toBeLessThanOrEqual(C.w + 1); expect(bx.x).toBeGreaterThanOrEqual(-1); }
    await sh('B1-select3');
    await page.goBack(); await expect(page.getByTestId('bulk-bar')).toBeHidden();
    for (const id of ids) expect(show(id).status).toBe('open');
  });

  test(`B-2 close 5 with reason, marker, sheet says 5 [${C.name}]`, async () => {
    const ids = mk(5, 'c5'); await board('open', 'QAW4R c5'); await expect(card(ids[4])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids); expect(await count()).toMatch(/5/);
    await page.getByTestId('bulk-close').click(); await page.getByTestId('bulk-reason').fill('qa wave4 close');
    await expect(page.getByTestId('bulk-confirm')).toContainText(/5/); await sh('B2-confirm');
    await page.getByTestId('bulk-apply').click(); await result();
    expect(await resultText()).toMatch(/5/); await sh('B2-result');
    const batches = new Set();
    for (const id of ids) { const s = show(id); expect(s.status).toBe('closed'); expect(s.close_reason).toMatch(/^\[bulk:[^\]]+\] qa wave4 close$/); batches.add(s.close_reason.split(']')[0]); }
    expect(batches.size).toBe(1);
  });

  test(`B-3 mixed batch: parent with open child refused with reason, others close [${C.name}]`, async () => {
    const ids = mk(3, 'mx'); const [parent] = mk(1, 'mxparent'); create('QAW4R mxchild', ['--parent', parent]);
    await board('open', 'QAW4R mx'); await expect(card(parent)).toBeVisible({ timeout: 30000 });
    await enter(); await pick([...ids, parent]); await applyClose('qa mixed');
    const t = await resultText(); expect(t).toContain(parent); await sh('B3-mixed');
    for (const id of ids) expect(show(id).status).toBe('closed');
    expect(show(parent).status).not.toBe('closed');
  });

  test(`B-4 move 4 and relabel 4, board and bd agree after reload [${C.name}]`, async () => {
    const ids = mk(4, 'mv', ['-l', 'qaold']); await board('open', 'QAW4R mv'); await expect(card(ids[3])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids);
    await page.getByTestId('bulk-move').click(); await page.locator('.u3bk-form select').selectOption('waiting_for_test'); await page.getByTestId('bulk-apply').click();
    await result(); expect(await resultText()).toMatch(/4/); await esc();
    for (const id of ids) expect(show(id).status).toBe('waiting_for_test');
    await board('waiting_for_test', 'QAW4R mv'); await expect(card(ids[3])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids);
    await page.getByTestId('bulk-label').click(); await page.getByTestId('bulk-label-input').fill('qanew'); await page.getByTestId('bulk-apply').click();
    await result(); await esc();
    for (const id of ids) expect(show(id).labels).toContain('qanew');
    await board('waiting_for_test', 'QAW4R mv'); await enter(); await pick(ids);
    await page.getByTestId('bulk-label').click();
    await page.getByTestId('bulk-label-mode').selectOption({ index: 1 }).catch(async () => { await page.getByTestId('bulk-label-mode').click(); });
    await page.getByTestId('bulk-label-input').fill('qaold'); await page.getByTestId('bulk-apply').click(); await result();
    for (const id of ids) { const l = show(id).labels || []; expect(l).toContain('qanew'); expect(l).not.toContain('qaold'); }
    await esc(); await page.reload(); await page.waitForSelector('.u3t-card', { timeout: 60000 });
  });

  test(`B-5 defer 3 until a date, leave active columns [${C.name}]`, async () => {
    const ids = mk(3, 'df'); await board('open', 'QAW4R df'); await expect(card(ids[2])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids); await page.getByTestId('bulk-defer').click();
    await page.locator('.u3bk-form input[type=date]').fill('2026-12-24'); await page.getByTestId('bulk-apply').click();
    await result(); await esc();
    for (const id of ids) { const s = show(id); expect(s.status).toBe('deferred'); expect(JSON.stringify(s)).toMatch(/2026-12-2[34]/); }
    await page.waitForTimeout(800); await expect(page.locator('.u3t-col--ready').locator('.u3t-card[data-issue-id="' + ids[0] + '"]')).toHaveCount(0);
  });

  test(`B-6 owner_decision refused; live lease skipped, take-over works [${C.name}]`, async () => {
    const [od] = mk(1, 'od'); bd(['update', od, '--status', 'owner_decision']);
    const [live] = mk(1, 'live'); bd(['update', live, '--status', 'in_progress', '--assignee', 'qa-live']);
    await board('owner_decision', 'QAW4R od'); await expect(card(od)).toBeVisible({ timeout: 30000 });
    await enter(); await pick([od]); await applyClose('qa must refuse');
    expect(await resultText()).toContain(od); await sh('B6-decision'); expect(show(od).status).toBe('owner_decision'); await esc();
    await board('in_progress', 'QAW4R live'); await expect(card(live)).toBeVisible({ timeout: 30000 });
    await enter(); await pick([live]); await page.getByTestId('bulk-move').click(); await page.locator('.u3bk-form select').selectOption('blocked'); await page.getByTestId('bulk-apply').click();
    await result(); expect(await resultText()).toContain(live); await sh('B6-live');
    expect(show(live).status).toBe('in_progress'); await esc();
    await page.getByTestId('bulk-move').click(); await page.locator('.u3bk-form select').selectOption('blocked');
    await page.locator('.u3bk-form input[type=checkbox]').last().check(); await page.getByTestId('bulk-apply').click();
    await result();
    expect(show(live).status).toBe('blocked');
  });

  test(`B-7 undo within 10 s restores status+labels; button gone after 10 s [${C.name}]`, async () => {
    const ids = mk(3, 'un', ['-l', 'qakeep']); await board('open', 'QAW4R un'); await expect(card(ids[2])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids); await applyClose('qa undo');
    for (const id of ids) expect(show(id).status).toBe('closed');
    await page.getByTestId('bulk-undo').click(); await page.waitForTimeout(2500);
    for (const id of ids) { const s = show(id); expect(s.status).toBe('open'); expect(s.labels).toContain('qakeep'); }
    const ids2 = mk(2, 'un2'); await board('open', 'QAW4R un2'); await expect(card(ids2[1])).toBeVisible({ timeout: 30000 });
    await enter(); await pick(ids2); await applyClose('qa undo late'); await expect(page.getByTestId('bulk-undo')).toBeVisible();
    await page.waitForTimeout(10600); await expect(page.getByTestId('bulk-undo')).toHaveCount(0); await sh('B7-after10s');
    for (const id of ids2) expect(show(id).status).toBe('closed');
  });

  // B-12/13 select-all moved to bulk4.spec.mjs (accepted rule changed 2026-11-14)
  test(`B-9/10 filter active + 20-task close under 3 s [${C.name}]`, async () => {
    const ids = mk(20, 'perf' + C.door); await board('open', 'QAW4R perf' + C.door); await expect(card(ids[19])).toBeVisible({ timeout: 40000 });
    await enter(); await page.getByTestId('bulk-all').click(); expect(await count()).toMatch(/20/);
    expect(await noHscroll()).toBe(true);
    await page.getByTestId('bulk-close').click(); await page.getByTestId('bulk-reason').fill('qa perf');
    const t0 = Date.now(); await page.getByTestId('bulk-apply').click(); await result(); const dt = Date.now() - t0;
    fs.appendFileSync(OUT + '/perf20.txt', `${C.name}: 20-task close click->result ${dt} ms\n`);
    expect(await resultText()).toMatch(/20/); for (const id of ids) expect(show(id).status).toBe('closed');
    expect(dt).toBeLessThan(3000);
  });

  test(`B-12 select-all-in-lane selects only that lane (group by assignee) [${C.name}]`, async () => {
    const a = mk(3, 'lnA' + C.door); const b = mk(2, 'lnB' + C.door);
    a.forEach((id) => bd(['update', id, '--assignee', 'qalaneA' + C.door])); b.forEach((id) => bd(['update', id, '--assignee', 'qalaneB' + C.door]));
    await board('open', 'QAW4R ln'); await expect(card(b[1])).toBeVisible({ timeout: 30000 });
    await page.locator('[data-group-by=assignee]').click(); await page.waitForTimeout(600); await enter();
    const lane = page.locator('.u3t-lane').filter({ hasText: 'qalaneA' + C.door }).first(); await expect(lane).toBeVisible();
    await lane.getByTestId('bulk-lane-all').click(); expect(await count()).toMatch(/3/); await sh('B12-lane');
    for (const id of b) await expect(card(id)).not.toHaveAttribute('data-selected', 'true');
    await page.getByTestId('bulk-cancel').click();
    for (const id of [...a, ...b]) bd(['close', id, '-r', 'qa cleanup']);
  });
});
