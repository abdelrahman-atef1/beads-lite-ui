// QA wave 4, bulk select-all (beads-lite-1bo5.6.59.11), against .63 acceptance 8 as changed 2026-11-14.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { bd, show, create, OUT, base } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const COMBOS = [
  { name: 'phone-door 390 ar dark', door: 'phone', w: 390, lang: 'ar', theme: 'dark' },
  { name: 'pc-door 1440 en light', door: 'pc', w: 1440, lang: 'en', theme: 'light' }
];
const TAB = { open: 'ready', deferred: 'other' };
const RUN = Date.now().toString(36).slice(-4); const MADE = [];
const mk = (n, tag, extra = []) => Array.from({ length: n }, (_, i) => { const id = create(`${tag} ${i + 1} r${RUN}`, extra); MADE.push(id); return id; });
const jlist = (args) => { const r = bd(['list', ...args, '--json', '-n', '0']); return JSON.parse(r.stdout.slice(r.stdout.indexOf('['))); };
const LOG = (s) => fs.appendFileSync(OUT + '/bulk4-notes.txt', s + '\n');

for (const C of COMBOS) test.describe(C.name, () => {
  let page; const errs = []; const phone = C.w < 500;
  const sh = (n) => page.screenshot({ path: `${OUT}/shots/b4-${C.door}-${C.w}-${C.lang}-${C.theme}-${n}.png` });
  test.beforeAll(async ({ browser }) => {
    const c = await browser.newContext({ viewport: { width: C.w, height: phone ? 844 : 900 }, hasTouch: phone, locale: C.lang === 'ar' ? 'ar-EG' : 'en-US' });
    await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [C.lang, C.theme]);
    page = await c.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('/att/') && errs.push('console: ' + m.text()));
  });
  test.afterAll(async () => { for (const id of MADE.splice(0)) { try { bd(['close', id, '-r', 'qa cleanup']); } catch {} } fs.writeFileSync(`${OUT}/errors-bulk4-${C.door}-${C.w}.json`, JSON.stringify(errs, null, 1)); await page.context().close(); });
  const card = (id) => page.locator(`.u3t-card[data-issue-id="${id}"]`);
  async function board(tab = 'open', query = '') {
    await page.goto(base(C.door) + '/'); await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== 'beads-ui.lang' && k !== 'beads-ui.theme') localStorage.removeItem(k); });
    await page.goto('about:blank'); await page.goto(base(C.door) + '/?ui=3#/issues');
    await page.waitForSelector('.u3t-card', { timeout: 60000 });
    if (phone) { const chip = page.locator(`.u3t-stat__chip--${TAB[tab]}`); if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click(); }
    if (query) { await page.locator('input.u3t-search').fill(query); await page.waitForTimeout(600); }
  }
  const enter = async () => { await page.getByTestId('bulk-enter').click(); await expect(page.getByTestId('bulk-bar')).toBeVisible(); };
  const count = async () => parseInt((await page.getByTestId('bulk-count').innerText()).replace(/\D/g, ''), 10);
  const allLabel = async () => (await page.getByTestId('bulk-all').innerText()).trim().replace(/\s+/g, ' ');
  const nSel = () => page.locator('.u3t-card[data-selected="1"]').count();
  const noHscroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const inView = async (loc) => { const b = await loc.boundingBox(); return b.x >= -1 && b.x + b.width <= C.w + 1; };
  const labelOf = (id) => (show(id).labels || []);
  async function applyLabel(l) { await page.getByTestId('bulk-label').click(); await page.getByTestId('bulk-label-input').fill(l); await page.getByTestId('bulk-apply').click(); await expect(page.getByTestId('bulk-result')).toBeVisible({ timeout: 20000 }); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  const cleanup = (ids) => ids.forEach((id) => bd(['close', id, '-r', 'qa cleanup']));

  test(`B-1/3/5/8 select-all takes exactly the searched cards; label names column and n [${C.name}]`, async () => {
    const T = `QAW4 sa${C.door} r${RUN}`; const vis = mk(3, T + ' alpha'); const hid = mk(3, T + ' beta');
    await board('open', T + ' alpha'); await expect(card(vis[2])).toBeVisible({ timeout: 30000 });
    await enter(); const label = await allLabel(); LOG(`${C.name} B-1 label="${label}"`);
    const shown = await page.locator('.u3t-card').count(); expect(shown).toBe(3);
    if (phone) { expect(label).toMatch(/^حدّد الكل في .+ \(3\)$/); } else { expect(label).toMatch(/\(3\)$/); }
    expect(label).not.toMatch(/[٠-٩]/);
    await page.getByTestId('bulk-all').click(); expect(await count()).toBe(3); expect(await nSel()).toBe(3);
    expect(await noHscroll()).toBe(true); expect(await inView(page.getByTestId('bulk-all'))).toBe(true); await sh('B1-search');
    await applyLabel('qa5sa');
    for (const id of vis) expect(labelOf(id)).toContain('qa5sa');
    for (const id of hid) expect(labelOf(id)).not.toContain('qa5sa');
    cleanup([...vis, ...hid]);
  });

  test(`B-2 select-all with a P0-P1 filter takes only the filtered [${C.name}]`, async () => {
    const T = `QAW4 fl${C.door} r${RUN}`; const hi = mk(3, T + ' hi', ['-p', '1']); const lo = mk(3, T + ' lo', ['-p', '3']);
    await board('open', T); await expect(card(lo[2])).toBeVisible({ timeout: 30000 });
    await page.locator('.u3t-fchip', { hasText: 'P0-P1' }).click(); await page.waitForTimeout(500);
    await expect(card(lo[0])).toHaveCount(0); await expect(card(hi[2])).toBeVisible();
    await enter(); const label = await allLabel(); LOG(`${C.name} B-2 label="${label}"`); expect(label).toMatch(/\(3\)$/);
    await page.getByTestId('bulk-all').click(); expect(await count()).toBe(3); await sh('B2-filter');
    await applyLabel('qa5fl');
    for (const id of hi) expect(labelOf(id)).toContain('qa5fl');
    for (const id of lo) expect(labelOf(id)).not.toContain('qa5fl');
    cleanup([...hi, ...lo]);
  });

  test(`B-4 a collapsed lane is not shown, so select-all skips it [${C.name}]`, async () => {
    const T = `QAW4 cl${C.door} r${RUN}`; const a = mk(3, T + ' a'); const b = mk(2, T + ' b');
    a.forEach((id) => bd(['update', id, '--assignee', 'qacolA' + C.door])); b.forEach((id) => bd(['update', id, '--assignee', 'qacolB' + C.door]));
    await board('open', T); await expect(card(b[1])).toBeVisible({ timeout: 30000 });
    await page.locator('[data-group-by=assignee]').click(); await page.waitForTimeout(600);
    const laneB = page.locator('.u3t-lane').filter({ hasText: 'qacolB' + C.door }).first(); await laneB.locator('.u3t-lane__btn').click(); await page.waitForTimeout(400);
    await expect(card(b[0])).toHaveCount(0);
    await enter(); const label = await allLabel(); LOG(`${C.name} B-4 label="${label}"`); expect(label).toMatch(/\(3\)$/);
    await page.getByTestId('bulk-all').click(); expect(await count()).toBe(3); await sh('B4-collapsed');
    await applyLabel('qa5cl');
    for (const id of a) expect(labelOf(id)).toContain('qa5cl');
    for (const id of b) expect(labelOf(id)).not.toContain('qa5cl');
    cleanup([...a, ...b]);
  });

  test(`B-6 over 50 shown: first 50 with a note, no block [${C.name}]`, async () => {
    const have = jlist(['--status', 'open']).length; if (have < 62) mk(64 - have, 'QAW4 cap' + C.door);
    await board('open'); await page.waitForTimeout(2000); await enter();
    const label = await allLabel(); LOG(`${C.name} B-6 label="${label}"`);
    const mm = /(?:first 50 of|أول 50 من) (\d+)/.exec(label); expect(mm, 'label says first 50 of N').not.toBeNull();
    const N = parseInt(mm[1], 10); expect(N).toBeGreaterThan(50);
    expect(label).not.toMatch(/[٠-٩]/);
    await page.getByTestId('bulk-all').click(); expect(await count()).toBe(50); expect(await nSel()).toBe(50);
    await expect(page.getByTestId('bulk-cap')).toBeVisible(); LOG(`${C.name} B-6 cap note="${(await page.getByTestId('bulk-cap').innerText()).trim()}" N=${N}`);
    await expect(page.locator('[role=alert]')).toHaveCount(0); await sh('B6-first50');
    expect(await noHscroll()).toBe(true); expect(await inView(page.getByTestId('bulk-all'))).toBe(true);
    await page.getByTestId('bulk-close').click(); await expect(page.getByTestId('bulk-reason')).toBeVisible(); await sh('B6-close-opens');
    await page.keyboard.press('Escape');
  });

  test(`B-7 over 50 by hand: blocked, nothing applied, Keep first 50 trims [${C.name}]`, async () => {
    const closedBefore = jlist(['--status', 'closed']).length;
    await board('open'); await page.waitForTimeout(2000); await enter();
    const total = await page.locator('.u3t-card').count(); expect(total).toBeGreaterThan(51);
    for (let i = 0; i < 51; i++) { const c = page.locator('.u3t-card').nth(i); await c.scrollIntoViewIfNeeded(); await c.click(); }
    expect(await count()).toBe(51);
    await expect(page.locator('[role=alert]')).toBeVisible(); LOG(`${C.name} B-7 alert="${(await page.locator('[role=alert]').innerText()).replace(/\s+/g, ' ')}"`);
    await expect(page.getByTestId('bulk-keep')).toBeVisible(); await sh('B7-over50');
    await page.getByTestId('bulk-close').click(); expect(await page.getByTestId('bulk-reason').count()).toBe(0);
    expect(jlist(['--status', 'closed']).length).toBe(closedBefore);
    await page.getByTestId('bulk-keep').scrollIntoViewIfNeeded(); await page.getByTestId('bulk-keep').click();
    expect(await count()).toBe(50); await page.waitForTimeout(500);
    const stale = await page.locator('[role=alert]').allInnerTexts(); LOG(`${C.name} B-7 after Keep first 50: alerts=${JSON.stringify(stale)}`); await sh('B7-after-keep-alert');
    await page.getByTestId('bulk-close').click(); await expect(page.getByTestId('bulk-reason')).toBeVisible(); await sh('B7-after-keep');
    expect(jlist(['--status', 'closed']).length).toBe(closedBefore);
    expect(stale, 'stale over-50 alert gone after trimming').toEqual([]);
  });

  test(`B-9 Other tab/column shows and select-all works in it [${C.name}]`, async () => {
    const ds = mk(2, 'QAW4 oth' + C.door); ds.forEach((d) => bd(['update', d, '--status', 'deferred']));
    await board('open');
    if (phone) {
      const chip = page.locator('.u3t-stat__chip--other'); await expect(chip).toBeVisible();
      const before = await chip.boundingBox(); await chip.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); const after = await chip.boundingBox();
      LOG(`${C.name} B-9 other chip before scroll x=${Math.round(before.x)} w=${Math.round(before.width)}; after scrollIntoView x=${Math.round(after.x)}; text="${(await chip.innerText()).replace(/s+/g, ' ')}"`);
      expect(await inView(chip)).toBe(true);
      await chip.click(); await expect(chip).toHaveAttribute('aria-pressed', 'true'); await page.waitForTimeout(2000); await sh('B9-other');
      expect(await page.locator('.u3t-card').count()).toBeGreaterThan(0); expect(await noHscroll()).toBe(true);
      const nOther = await page.locator('.u3t-card').count();
      await enter(); const label = await allLabel(); LOG(`${C.name} B-9 other label="${label}"`); expect(label).toContain('(' + nOther + ')');
      await page.getByTestId('bulk-all').click(); expect(await count()).toBe(nOther); await sh('B9-other-selectall');
    } else { await expect(page.locator('.u3t-col--other').first()).toBeVisible(); await sh('B9-other'); }
    cleanup(ds);
  });

  test(`B-0 no console errors [${C.name}]`, async () => { expect(errs).toEqual([]); });
});

test('B-11 the old board without ?ui=3 is unchanged', async ({ browser }) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base('pc') + '/'); await p.waitForTimeout(3000);
  const info = await p.evaluate(() => ({ u3: !!document.querySelector('[class*=u3t-], [data-testid=bulk-enter], u3-time-slot'), body: document.body.innerText.slice(0, 200).replace(/\s+/g, ' '), nav: [...document.querySelectorAll('nav a, header a')].map((a) => a.textContent.trim()).filter(Boolean).slice(0, 10) }));
  fs.writeFileSync(OUT + '/B11-old-board.json', JSON.stringify(info, null, 1));
  await p.screenshot({ path: OUT + '/shots/b11-old-board.png' });
  expect(info.u3).toBe(false); expect(errs).toEqual([]);
  await p.goto(base('pc') + '/#/time'); await p.waitForTimeout(1500);
  expect(await p.evaluate(() => !!document.querySelector('[data-view=time]'))).toBe(false);
  await c.close();
});
