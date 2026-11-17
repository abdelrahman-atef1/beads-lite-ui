// B1b: Project chip on Desk when arriving in-app (store loaded), and after a late paint. Scratch stores only.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { start, stop, sleep, SC, OUT } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const port = process.argv[2] || '39127';
const base = `http://127.0.0.1:${port}/`;
const out = [];
let browser;
try {
  await start(port);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(([l, t]) => { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); }, [lang, theme]);
    const p = await c.newPage();
    p.setDefaultTimeout(90000);
    await p.goto(base + '#/projects');
    await p.waitForSelector('.u3p-row');
    await sleep(3000);
    await p.click('.u3-tabbar >> text=/Desk|المكتب/');
    await p.waitForSelector('.dk3-main .u3-cd');
    await sleep(6000);
    const a = !!(await p.$('.u3t-menu[data-name=project]'));
    await p.screenshot({ path: `${OUT}/shots3/desk-inapp-${lang}.png` });
    // direct load
    await p.reload();
    await p.waitForSelector('.dk3-main .u3-cd');
    await sleep(8000);
    const b = !!(await p.$('.u3t-menu[data-name=project]'));
    // toggle any filter and see the chip appear (repaint)
    await p.click('[data-quick=u3_tk_p01]');
    await sleep(800);
    const c2 = !!(await p.$('.u3t-menu[data-name=project]'));
    await p.click('[data-quick=u3_tk_p01]');
    await sleep(500);
    const d = !!(await p.$('.u3t-menu[data-name=project]'));
    out.push(`[${lang}-${theme}] chip on Desk: arriving from Projects=${a}; direct load/reload (8s)=${b}; after tapping Urgent=${c2}; after untapping=${d}`);
    console.log(out.at(-1));
    await c.close();
  }
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { window.__wsu = u; return new W(u, p); }; window.WebSocket.prototype = W.prototype; });
    const pg = await c.newPage();
    await pg.goto(base + '#/');
    await sleep(3000);
    await pg.evaluate(async () => {
      const ws = new WebSocket(window.__wsu);
      await new Promise((r) => ws.addEventListener('open', r));
      window.__q = (payload) => new Promise((res) => { const id = 'q' + Math.random(); const h = (m) => { const j = JSON.parse(m.data); if (j.id === id) { ws.removeEventListener('message', h); res(j); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id, type: 'flow-stats', payload })); setTimeout(() => res({ timeout: true }), 15000); });
    });
    const ask = (payload) => pg.evaluate((pl) => window.__q(pl), payload);
    const sig = (j) => JSON.stringify([j.payload?.weekTotal, j.payload?.counts, j.payload?.split?.n]);
    const all = await ask({ days: 30 });
    const co = await ask({ days: 30, project: 'company' });
    const un = await ask({ days: 30, project: 'nope-zzz' });
    const tr = await ask({ days: 30, project: '../../etc/passwd' });
    const hu = await ask({ days: 30, project: 'x'.repeat(5000) });
    const e = (n, v) => { out.push('[server] ' + n + ': ' + v); console.log(out.at(-1)); };
    e('E7b valid project differs from all', 'differs=' + (sig(co) !== sig(all)) + ' all=' + sig(all) + ' company=' + sig(co));
    e('E7c unknown valid-shaped key (nope-zzz) numbers', sig(un) + ' echo=' + un.payload?.project + ' differs_from_all=' + (sig(un) !== sig(all)) + ' projects_list_kept=' + (un.payload?.projects?.length === all.payload?.projects?.length));
    e('E7d traversal / 5000-char keys', 'same_as_all=' + (sig(tr) === sig(all)) + '/' + (sig(hu) === sig(all)) + ' ok_reply=' + (tr.ok !== false && hu.ok !== false) + ' echo=' + JSON.stringify(tr.payload?.project));
    await c.close();
  }
} finally {
  try { await browser?.close(); } catch {}
  stop();
  fs.writeFileSync(`${OUT}/summary-b1b.md`, '# B1b Desk Project chip\n' + out.map((x) => '- ' + x).join('\n') + '\n');
}
