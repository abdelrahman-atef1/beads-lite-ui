import { chromium } from '@playwright/test';
import { CHROME, base, E } from './lib.mjs';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' });
await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'ar'); localStorage.setItem('beads-ui.theme', 'dark'); });
const p = await c.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 150)));
const seed = E().seed;
for (const h of ['#/', '#/decisions', '#/issues', '#/releases', '#/time', '#/projects', '#/settings', `#/issues?issue=${seed.q_pc}`]) {
  await p.goto(base('phone') + '/' + h);
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ title: document.title, len: document.body.innerText.length, sh: !!document.querySelector('.u3-sh'), shell: !!document.getElementById('shell'), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260), cls: [...new Set([...document.querySelectorAll('[class]')].map((e) => e.className.toString().split(' ')[0]))].slice(0, 25) }));
  console.log(h, JSON.stringify(r));
}
console.log('errs', JSON.stringify(errs));
await p.screenshot({ path: 'probe-task.png' });
await b.close();
