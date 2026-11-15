import { launch, base, OUT } from './lib.mjs';
import fs from 'node:fs';
const b = await launch(); const res = {};
const ROUTES = { projects: '#/projects', time: '#/time', releases: '#/releases', tasks: '#/issues', settings: '#/settings', 'bulk-cancel': '#/issues' };
for (const [name, hash] of Object.entries(ROUTES)) for (const srv of ['new', 'base']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'en-US' });
  await c.addInitScript(() => { try { localStorage.setItem('beads-ui.lang', 'en'); } catch { /* none */ } });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 50)));
  await p.goto(base(srv, 'phone') + '/?ui=3' + hash); await p.waitForSelector('.u3-top'); await p.waitForTimeout(2000);
  if (name === 'bulk-cancel') { await p.waitForSelector('.u3t-card'); await p.getByTestId('bulk-enter').click(); await p.locator('.u3t-card').first().click(); await p.getByTestId('bulk-cancel').click(); await p.waitForTimeout(300); }
  const e0 = errs.length;
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1200); const eDesk = errs.length - e0;
  await p.locator('.u3-search__btn').click(); await p.locator('.u3-search__field input').fill('board'); await p.waitForTimeout(800);
  const e1 = errs.length; await p.locator('.u3-search__hit').first().click(); await p.waitForTimeout(2000);
  res[`${name}/${srv}`] = { errs_on_leaving_to_desk: eDesk, errs_on_hit_click: errs.length - e1, total: errs.length };
  await c.close();
}
await b.close(); console.log(JSON.stringify(res)); fs.writeFileSync(OUT + '/diag3.json', JSON.stringify(res, null, 1));
