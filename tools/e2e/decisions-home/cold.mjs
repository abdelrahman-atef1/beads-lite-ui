// cold-start repro: fresh server, open page once, watch 30 s whether the cards ever appear
import { chromium } from '@playwright/test';
import path from 'node:path';
const out = process.env.QA_OUT;
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const frames = [];
p.on('websocket', (w) => w.on('framesent', (f) => { if (/list-decisions-all/.test(f.payload)) frames.push(Date.now()); }));
await p.addInitScript(() => localStorage.setItem('beads-ui.view', 'decisions'));
const t0 = Date.now();
await p.goto(process.env.QA_URL + '/#/decisions', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (const s of [3, 8, 15, 30, 60]) {
  await p.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  console.log(s, 's cards:', await p.locator('.qcard').count(), 'empty:', await p.locator('.empty').count(), 'skeleton:', await p.locator('.skeleton').count());
}
console.log('list-decisions-all sent', frames.length, 'times by the page');
await p.screenshot({ path: path.join(out, 'F1-cold-start-30s.png') });
await b.close();
