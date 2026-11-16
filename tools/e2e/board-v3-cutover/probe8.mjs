import { chromium } from '@playwright/test';
import { CHROME, base, OUT } from './lib.mjs';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
for (const w of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, locale: 'en-US', hasTouch: w < 500 });
  await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'en'); });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const base_ = base(w < 500 ? 'phone' : 'pc');
  await p.goto(base_ + '/#/issues'); await p.waitForSelector('.u3t-card'); await p.waitForTimeout(1500);
  const n = () => p.locator('.u3t-card').count(); const pressed = () => p.locator('button.u3t-fchip[aria-pressed=true]').count();
  const n0 = await n(); const chip = p.locator('button.u3t-fchip', { hasText: 'Decisions' }).first();
  await chip.click(); await p.waitForTimeout(900); const n1 = await n(); const pr1 = await pressed();
  await p.reload(); await p.waitForSelector('.u3t-card'); await p.waitForTimeout(1800); const n2 = await n(); const pr2 = await pressed();
  await p.locator('button.u3t-fchip', { hasText: 'Decisions' }).first().click(); await p.waitForTimeout(900); const n3 = await n();
  await p.locator('button.u3t-menu', { hasText: 'Assignee' }).first().click(); await p.waitForSelector('.u3t-opt'); const opts = await p.locator('.u3t-opt').allInnerTexts();
  await p.locator('.u3t-opt', { hasText: 'abdelrahman' }).first().click(); await p.waitForTimeout(900); await p.keyboard.press('Escape'); const n4 = await n();
  await p.screenshot({ path: `${OUT}/shots/B3-${w}-assignee.png` });
  console.log(w, JSON.stringify({ start: n0, decisionsChip: n1, pressed: pr1, afterRefresh: n2, pressedAfter: pr2, chipOff: n3, assigneeAbdelrahman: n4, assigneeOpts: opts.length, errs }));
  await c.close();
}
await b.close();
