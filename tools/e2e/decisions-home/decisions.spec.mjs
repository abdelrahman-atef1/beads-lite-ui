// beads-lite-1bo5.6.26 QA: cases D1-D16 (docs/qa/cases/decisions-home.md)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SCR = process.env.QA_SCRATCH;
const OUT = process.env.QA_OUT;
const { ws, ids } = JSON.parse(fs.readFileSync(path.join(SCR, 'ids.json'), 'utf8'));
const bd = (cwd, ...a) =>
  execFileSync(process.env.BD_BIN, a, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, BEADS_DIR: '' } });
const show = (k, id) => JSON.parse(bd(ws[k], 'show', id, '--json'))[0];
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const VALID = [ids['A zero card'], ids['A two card'], ids['A type card'], ids['B one card'], ids['C copy card']];
const HIDDEN = [ids['B INVALID no card_q'], ids['B DESK card'], ids['B SECRET card']];

const cardIds = (page) => page.$$eval('.qcard', (els) => els.map((e) => e.getAttribute('data-issue-id')));
async function open(page, { lang = 'en', theme = 'light' } = {}) {
  await page.addInitScript(
    ([l, t]) => {
      localStorage.setItem('beads-ui.lang', l);
      localStorage.setItem('beads-ui.theme', t);
      localStorage.setItem('beads-ui.view', 'decisions');
    },
    [lang, theme]
  );
  await page.goto('/#/decisions');
  await page.waitForSelector('.qcard, .empty', { timeout: 20000 });
}
const panelOpen = async (page) => {
  if (!(await page.locator('.dfilter').evaluate((d) => d.open))) await page.locator('.dfilter summary').click();
};
const box = (page, key) => page.locator(`.dfilter input[data-project="${key}"]`);

test.describe.configure({ mode: 'serial' });

test('D1-D3 D12 desktop EN light: opens on All, feed gate, order, chips, dropdown', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(page.locator('.dfilter summary')).toHaveText('All projects');
  const got = await cardIds(page);
  expect(got.slice().sort()).toEqual(VALID.slice().sort());
  for (const h of HIDDEN) expect(got).not.toContain(h);
  expect(got[0]).toBe(ids['A zero card']); // P0 first
  const pri = await page.locator('.qcard .card__pri').allInnerTexts();
  fs.writeFileSync(path.join(OUT, 'priority-badge-text.txt'), JSON.stringify(pri));
  for (const t of pri) expect(t).not.toMatch(/P[0-4]|\u{1F534}|\u{1F7E0}|\u{1F7E1}/u);
  const chips = await page.$$eval('.qcard .dchip', (els) => els.map((e) => e.textContent.trim()));
  expect(chips.length).toBe(5);
  expect(new Set(chips)).toEqual(new Set(['wsA', 'wsB', 'wsC']));
  await panelOpen(page);
  await expect(box(page, '*')).toBeChecked();
  expect(await page.locator('.dfilter__row').count()).toBe(4);
  await shot(page, 'D12-desktop-en-light-open');
  const by = await page.locator('.dfilter').boundingBox();
  const cy = await page.locator('.qcard').first().boundingBox();
  expect(by.y).toBeLessThan(cy.y);
});

test('D4 D5 filter: one, union, back to All, tick-all = All; reload resets to All', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await panelOpen(page);
  await box(page, 'wsa').check();
  expect((await cardIds(page)).sort()).toEqual([ids['A zero card'], ids['A two card'], ids['A type card']].sort());
  await expect(page.locator('.dfilter summary')).toHaveText('wsA');
  await box(page, 'wsb').check();
  expect((await cardIds(page)).sort()).toEqual(
    [ids['A zero card'], ids['A two card'], ids['A type card'], ids['B one card']].sort()
  );
  await expect(page.locator('.dfilter summary')).toHaveText('2 projects');
  await shot(page, 'D4-two-projects');
  await box(page, '*').check();
  await expect(page.locator('.dfilter summary')).toHaveText('All projects');
  expect((await cardIds(page)).length).toBe(5);
  await box(page, 'wsc').check();
  await box(page, 'wsa').check();
  await box(page, 'wsb').check();
  await expect(page.locator('.dfilter summary')).toHaveText('All projects');
  expect((await cardIds(page)).length).toBe(5);
  await box(page, 'wsb').check();
  await page.reload();
  await page.waitForSelector('.qcard');
  await expect(page.locator('.dfilter summary')).toHaveText('All projects');
  expect((await cardIds(page)).length).toBe(5);
});

test('D12 desktop dark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, { theme: 'dark' });
  await panelOpen(page);
  await shot(page, 'D12-desktop-en-dark-open');
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
});

test('D11 phone 390x844 AR RTL dark: no overflow, targets >=44px, Arabic', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { lang: 'ar', theme: 'dark' });
  const dir = await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.body).direction);
  expect(dir).toBe('rtl');
  await expect(page.locator('.dfilter summary')).toHaveText('كل المشاريع');
  await panelOpen(page);
  await shot(page, 'D11-phone-ar-dark-open');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.decisions summary, .decisions .dfilter__row, .decisions .btn, .decisions .qcard__open')]
      .map((e) => ({ c: e.className || e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
      .filter((r) => r.h > 0 && r.h < 44)
  );
  fs.writeFileSync(path.join(OUT, 'D11-small-targets.json'), JSON.stringify(small, null, 1));
  // pre-existing small 'Open bead' text link (finding F2) is recorded in the json, not asserted
  expect(small.filter((r) => r.c !== 'qcard__open')).toEqual([]);
  const pb = await page.locator('.dfilter__panel').boundingBox();
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(390.5);
  await box(page, 'wsb').check();
  expect(await cardIds(page)).toEqual([ids['B one card']]);
  await page.locator('.dfilter summary').click();
  await shot(page, 'D11-phone-ar-dark-filtered');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('D11b phone 390 EN light', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { lang: 'en', theme: 'light' });
  await panelOpen(page);
  await shot(page, 'D11b-phone-en-light-open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('D10 keys 1-9 pick option, Confirm needed, Back cancels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const before = show('A', ids['A zero card']).status;
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.keyboard.press('2');
  const top = page.locator('.qcard').first();
  await expect(top.locator('.btn--primary')).toContainText(/Confirm|تأكيد/);
  expect(show('A', ids['A zero card']).status).toBe(before);
  await shot(page, 'D10-key-pick');
  await top.locator('.btn', { hasText: /Back|رجوع/ }).click();
  await expect(top.locator('.btn--primary')).not.toContainText(/Confirm|تأكيد/);
});

test('D13 push: new card in a project shows without reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const meta = {
    card_class: 'tap', card_back: 'swe', card_lang: 'en', card_q: 'Pushed live card?', card_effect: 'Nothing',
    card_blocks: 'nobody', card_opts: JSON.stringify([{ l: 'Ok', rec: true }, { l: 'No' }])
  };
  const o = JSON.parse(bd(ws.A, 'create', 'A pushed', '-t', 'task', '-p', '1', '--assignee', 'abdelrahman', '--metadata', JSON.stringify(meta), '--json'));
  const id = o.id || o[0].id;
  bd(ws.A, 'update', id, '--status', 'owner_decision');
  await expect(page.locator(`[data-issue-id="${id}"]`)).toBeVisible({ timeout: 100000 });
  await panelOpen(page);
  await expect(page.locator('.dfilter__row').first().locator('.dfilter__n')).toHaveText('6');
});

test('D6 D9 cross-project tap answer (card in wsB, server rooted at wsC)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const id = ids['B one card'];
  const other = { A: show('A', ids['A two card']).status, C: show('C', ids['C copy card']).status };
  const card = page.locator(`[data-issue-id="${id}"]`);
  await card.locator('.btn', { hasText: /Blue/ }).click();
  await expect(card.locator('.btn--primary')).toContainText('Blue');
  await card.locator('.btn--primary').click();
  await expect(card).toHaveCount(0, { timeout: 100000 });
  const b = show('B', id);
  fs.writeFileSync(path.join(OUT, 'D6-wsB-after.json'), JSON.stringify(b, null, 1));
  expect(b.status).toBe('open');
  expect(b.assignee).toBe('swe');
  const txt = JSON.stringify(JSON.parse(bd(ws.B, 'comments', id, '--json')));
  expect(txt).toContain('OWNER DECISION via web board');
  expect(txt).toContain('Option 1: Blue');
  expect(show('A', ids['A two card']).status).toBe(other.A);
  expect(show('C', ids['C copy card']).status).toBe(other.C);
  expect(JSON.stringify(JSON.parse(bd(ws.C, 'comments', ids['C copy card'], '--json')))).not.toContain('OWNER DECISION');
  // the same id sent again straight on the socket is rejected (D16)
  const reply = await page.evaluate(async (id2) => {
    const tok = document.querySelector('meta[name="board-token"]').getAttribute('content');
    const sock = new WebSocket(`ws://${location.host}/ws?t=${encodeURIComponent(tok)}`);
    await new Promise((r) => (sock.onopen = r));
    return await new Promise((res) => {
      sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 'qa-dup') res(d); };
      sock.send(JSON.stringify({ id: 'qa-dup', type: 'answer-decision', payload: { id: id2, text: 'OWNER DECISION again' } }));
      setTimeout(() => res({ timeout: true }), 10000);
    });
  }, id);
  fs.writeFileSync(path.join(OUT, 'D16-dup-reply.json'), JSON.stringify(reply, null, 1));
  expect(reply.ok).toBe(false);
  expect(JSON.stringify(JSON.parse(bd(ws.B, 'comments', id, '--json')))).not.toContain('OWNER DECISION again');
  // D9 empty narrowed state
  await panelOpen(page);
  await box(page, 'wsb').check();
  await expect(page.locator('.empty')).toBeVisible();
  await expect(page.locator('.dreset')).toBeVisible();
  await shot(page, 'D9-empty-narrowed');
  await page.locator('.dreset').click();
  await expect(page.locator('.dfilter summary')).toHaveText('All projects');
  expect((await cardIds(page)).length).toBe(5);
});

test('D6b typed answer on a type card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const id = ids['A type card'];
  const card = page.locator(`[data-issue-id="${id}"]`);
  await card.locator('textarea').fill('Free for good');
  await card.locator('.btn--primary').click();
  await expect(card).toHaveCount(0, { timeout: 100000 });
  const a = show('A', id);
  expect(a.status).toBe('open');
  expect(a.assignee).toBe('swe');
  expect(JSON.stringify(JSON.parse(bd(ws.A, 'comments', id, '--json')))).toContain('Free for good');
});

test('D7 D8 gate: bad ids sent to answer-decision are refused (invalid, desk, secret, unknown)', async ({ page }) => {
  await open(page);
  const out = {};
  for (const [name, id] of [['invalid', ids['B INVALID no card_q']], ['desk', ids['B DESK card']], ['secret', ids['B SECRET card']], ['bogus', 'nope-zzz']]) {
    out[name] = await page.evaluate(async (id2) => {
      const tok = document.querySelector('meta[name="board-token"]').getAttribute('content');
      const sock = new WebSocket(`ws://${location.host}/ws?t=${encodeURIComponent(tok)}`);
      await new Promise((r) => (sock.onopen = r));
      return await new Promise((res) => {
        sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 'qa-g') res(d); };
        sock.send(JSON.stringify({ id: 'qa-g', type: 'answer-decision', payload: { id: id2, text: 'OWNER DECISION gate test' } }));
        setTimeout(() => res({ timeout: true }), 10000);
      });
    }, id);
    expect(out[name].ok).toBe(false);
  }
  fs.writeFileSync(path.join(OUT, 'D7-gate-replies.json'), JSON.stringify(out, null, 1));
  for (const k of ['invalid', 'desk', 'secret']) {
    const id = ids[{ invalid: 'B INVALID no card_q', desk: 'B DESK card', secret: 'B SECRET card' }[k]];
    expect(show('B', id).status).toBe('owner_decision');
  }
});
