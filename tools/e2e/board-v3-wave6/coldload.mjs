// QA wave 6, B-1: cold desk load, Fast 3G (1.6 Mbps down, 750 kbps up, 562 ms) + 4x CPU, phone 390x844, new profile per run, service worker blocked.
// Variants (interleaved, N runs each): new-v3 (87edf2d ?ui=3), new-legacy (87edf2d), base-v3 (7f4806d ?ui=3, one file), base-legacy (7f4806d).
// Output: coldload.json + coldload.md rows. Usage: node coldload.mjs [runs=5]
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { E, base, OUT } from './lib.mjs';
import { CHROME } from './paths.mjs';
const RUNS = Number(process.argv[2] || 5);
const NET = { offline: false, latency: 562, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };
const V = [
  ['new-v3', 'new', '/?ui=3#/', '.dk3-h'],
  ['new-legacy', 'new', '/#/', '.decisions__title'],
  ['base-v3', 'base', '/?ui=3#/', '.dk3-h'],
  ['base-legacy', 'base', '/#/', '.decisions__title']
];
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
// warm both servers once, unthrottled (bundle build/cache on the server side must not count)
for (const [, srv, p] of V) { const c = await browser.newContext(); const pg = await c.newPage(); await pg.goto(base(srv) + p); await pg.waitForTimeout(2500); await c.close(); }
const res = Object.fromEntries(V.map(([n]) => [n, []]));
for (let i = 0; i < RUNS; i++) {
  for (const [name, srv, path, sel] of V) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
    await c.addInitScript(() => { try { localStorage.setItem('beads-ui.lang', 'en'); } catch { /* none */ } });
    const page = await c.newPage();
    await page.addInitScript((sel) => {
      window.__m = {};
      const chk = () => {
        const el = document.querySelector(sel);
        if (el && !window.__m.shown) window.__m.shown = performance.now();
        if (el && !window.__m.data) {
          const root = el.closest('.dk3, .decisions') || el.parentElement;
          if (root && !root.querySelector('.skeleton') && !/Loading|loading|جاري/.test(root.innerText || '') && (root.innerText || '').length > 25) window.__m.data = performance.now();
        }
      };
      new MutationObserver(chk).observe(document, { childList: true, subtree: true, characterData: true });
      setInterval(chk, 20);
    }, sel);
    const cdp = await c.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', NET); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reqs = new Map(); let wire = 0, js = 0, jsWire = 0;
    cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, e.request.url));
    cdp.on('Network.loadingFinished', (e) => { wire += e.encodedDataLength; const u = reqs.get(e.requestId) || ''; if (/\.js(\?|$)/.test(u)) { js++; jsWire += e.encodedDataLength; } });
    const t0 = Date.now();
    await page.goto(base(srv) + path, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__m && window.__m.data, null, { timeout: 60000, polling: 50 }).catch(() => {});
    const m = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { ...window.__m, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
    await page.waitForTimeout(300);
    res[name].push({ shown: m.shown, data: m.data, dcl: m.dcl, load: m.load, wire, js, jsWire, wall: Date.now() - t0 });
    await c.close();
  }
}
await browser.close();
const sum = {};
for (const [n] of V) { const r = res[n]; sum[n] = { runs: r.length, shown_med: med(r.map((x) => x.shown || NaN)) / 1000, data_med: med(r.map((x) => x.data || NaN)) / 1000, dcl_med: med(r.map((x) => x.dcl)) / 1000, js_files: r[0].js, js_kb_wire: Math.round(r[0].jsWire / 1024), total_kb_wire: Math.round(r[0].wire / 1024), shown_all: r.map((x) => +(x.shown / 1000).toFixed(2)), data_all: r.map((x) => +(x.data / 1000).toFixed(2)) }; }
fs.writeFileSync(OUT + '/coldload.json', JSON.stringify({ net: NET, cpu: 4, viewport: '390x844', runs: RUNS, sum, raw: res }, null, 1));
for (const [n, s] of Object.entries(sum)) console.log(n.padEnd(12), `shown ${s.shown_med.toFixed(2)}s  data ${s.data_med.toFixed(2)}s  dcl ${s.dcl_med.toFixed(2)}s  js ${s.js_files} files ${s.js_kb_wire} KB  total ${s.total_kb_wire} KB`, JSON.stringify(s.shown_all));
