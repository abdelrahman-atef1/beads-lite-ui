import { chromium } from '@playwright/test';
import { CHROME, base } from './lib.mjs';
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'en'); });
const p = await c.newPage();
await p.goto(base('pc') + '/#/issues'); await p.waitForSelector('.u3t-card'); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.locator('.u3t button, .u3t [role=button], .u3t summary').evaluateAll((a) => a.filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.className.split(' ')[0] + '|' + (x.getAttribute('aria-label') || x.title || '') + '|' + x.innerText.trim().slice(0, 14)).slice(0, 40))));
await b.close();
