import { launch, base, OUT } from './lib.mjs';
import fs from 'node:fs';
const b = await launch(); const res = {};
for (const variant of ['plain', 'escape-cycle', 'close-btn', 'hit-then-back']) for (const srv of ['new', 'base']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-US' });
  await c.addInitScript(() => { try { localStorage.setItem('beads-ui.lang', 'en'); } catch { /* none */ } });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 60)));
  await p.goto(base(srv, 'phone') + '/?ui=3#/'); await p.waitForSelector('.u3-top'); await p.waitForTimeout(1500);
  await p.locator('.u3-search__btn').click(); await p.waitForTimeout(200);
  if (variant === 'escape-cycle') { await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.locator('.u3-search__btn').click(); await p.waitForTimeout(200); }
  await p.locator('.u3-search__field input').fill('board'); await p.waitForTimeout(800);
  const before = errs.length;
  await p.locator('.u3-search__hit').first().click(); await p.waitForTimeout(2000);
  const afterHit = errs.length - before;
  let taskOk = await p.evaluate(() => !!document.querySelector('.u3-st, .u3-ask__head') || document.getElementById('u3-view').innerText.length > 100);
  if (variant === 'hit-then-back') { await p.goBack(); await p.waitForTimeout(1500); }
  res[`${variant}/${srv}`] = { errsOnHit: afterHit, total: errs.length, taskOk, url: p.url().split('#')[1] };
  await c.close();
}
await b.close(); console.log(JSON.stringify(res, null, 1)); fs.writeFileSync(OUT + '/diag2.json', JSON.stringify(res, null, 1));
