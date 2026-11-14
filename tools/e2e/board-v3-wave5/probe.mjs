import { chromium } from '@playwright/test'; import fs from 'node:fs';
const E = JSON.parse(fs.readFileSync('E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/scratch/qa5/env.json'));
const br = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const c = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'en'); localStorage.setItem('beads-ui.theme', 'light'); });
const p = await c.newPage(); await p.goto(`http://127.0.0.1:${E.px}/?ui=3#/issues?issue=beads-lite-1bo5.6.24`); await p.waitForTimeout(3000);
const r = await p.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input, select')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 28 || r.width < 28); }).map(el => (el.className || el.tagName).toString().split(' ')[0] + ' "' + (el.textContent || '').trim().slice(0, 20) + '" ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)));
const cnt = {}; r.forEach(x => cnt[x.replace(/ "[^"]*"/, '')] = (cnt[x.replace(/ "[^"]*"/, '')] || 0) + 1); console.log(JSON.stringify(cnt));
console.log(r.slice(0, 4));
await br.close();
