// Diagnosis for wave 6 findings: (1) bulk bar overflow 390 en, new vs base; (2) pageerror insertBefore in search flow, new vs base.
import { launch, base, OUT } from './lib.mjs';
import fs from 'node:fs';
const b = await launch(); const out = {};
for (const srv of ['new', 'base']) for (const lang of ['en', 'ar']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', 'dark'); } catch { /* none */ } }, [lang]);
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push((e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')).slice(0, 400)));
  const r = { };
  await p.goto(base(srv, 'phone') + '/?ui=3#/issues'); await p.waitForSelector('.u3t-card', { timeout: 30000 }); await p.waitForTimeout(1200);
  await p.getByTestId('bulk-enter').click(); await p.locator('.u3t-card').first().click(); await p.waitForTimeout(400);
  r.bulk = await p.evaluate(() => { const bar = document.querySelector('[data-testid=bulk-bar]'); const br = bar.getBoundingClientRect(); const kids = [...bar.querySelectorAll('button')].map((e) => { const x = e.getBoundingClientRect(); return `${(e.innerText || '').trim().slice(0, 24)}:${Math.round(x.left)}-${Math.round(x.right)}`; }); return { sw: document.documentElement.scrollWidth, iw: innerWidth, bar: [Math.round(br.left), Math.round(br.right)], kids }; });
  await p.getByTestId('bulk-cancel').click().catch(() => {});
  // search flow steps, record errors per step
  const steps = [];
  const mark = (s) => steps.push([s, errs.length]);
  await p.goto(base(srv, 'phone') + '/?ui=3#/'); await p.waitForSelector('.u3-top'); await p.waitForTimeout(1500); mark('desk');
  await p.locator('.u3-search__btn').click(); await p.waitForTimeout(300); mark('open');
  await p.locator('.u3-search__field input').fill('board'); await p.waitForTimeout(800); mark('type');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); mark('escape');
  await p.locator('.u3-search__btn').click(); await p.waitForTimeout(300); await p.locator('.u3-search__field input').fill('board'); await p.waitForTimeout(700);
  await p.locator('.u3-search__hit').first().click(); await p.waitForTimeout(1500); mark('hit-click');
  await p.goto(base(srv, 'phone') + '/?ui=3#/issues'); await p.waitForTimeout(1500); mark('issues');
  r.steps = steps; r.errs = errs; out[`${srv}-${lang}`] = r; await c.close();
}
await b.close(); fs.writeFileSync(OUT + '/diag.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
