import { chromium } from '@playwright/test';
import { CHROME, base, E } from './lib.mjs';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'en'); localStorage.setItem('beads-ui.theme', 'light'); });
const p = await c.newPage();
p.on('console', (m) => console.log('C:', m.type(), m.text().slice(0, 150)));
const seed = E().seed;
await p.goto(base('pc') + `/#/issues?issue=${seed.q_pc}&at=card`);
for (let i = 0; i < 6; i++) { await p.waitForTimeout(2000); console.log(i, await p.evaluate(() => [document.querySelectorAll('.u3-cardhost').length, document.querySelectorAll('.u3-cd').length, document.querySelectorAll('[data-act]').length])); }
console.log(await p.evaluate(() => document.querySelector('.u3-main__in').innerHTML.slice(0, 1500)));
await b.close();
