import { chromium } from '@playwright/test';
import { CHROME, base, E } from './lib.mjs';
const S = E().seed;
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const p = await c.newPage();
for (const at of ['c-last', 'c-1', 'c-3']) {
  await p.goto(base('pc') + `/#/issues?issue=${S.plain}&at=${at}`); await p.waitForTimeout(2500);
  console.log(at, JSON.stringify(await p.evaluate(() => ({ hit: document.querySelector('.anchor-hit[data-anchor^=c-]')?.innerText.replace(/\s+/g, ' ').slice(0, 90), order: [...document.querySelectorAll('[data-anchor^=c-]')].map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 40)) }))));
}
await b.close();
