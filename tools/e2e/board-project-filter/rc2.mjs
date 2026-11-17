// RC b9e6cba: diagnose ar-dark version list and Open link with long waits. Scratch stores only.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { start, stop, sleep, SC, OUT } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const port = process.argv[2] || '39131';
const base = `http://127.0.0.1:${port}/`;
const out = [];
const say = (s) => { out.push(s); console.log(s); };
let browser;
try {
  await start(port);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [lang, theme] of [['ar', 'dark'], ['en', 'light']]) {
    const tag = `${lang}-${theme}`;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(([a, b]) => { try { localStorage.setItem('beads-ui.lang', a); localStorage.setItem('beads-ui.theme', b); } catch {} }, [lang, theme]);
    const p = await c.newPage();
    p.setDefaultTimeout(60000);
    p.on('response', async (r) => { if (r.url().includes('report-versions')) say(`[${tag}] ${r.url().split('/api')[1]} -> ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
    // version list, polled
    await p.goto(base + '#/report');
    await p.waitForSelector('select[name=project]');
    await p.selectOption('select[name=project]', 'beads-lite');
    for (let i = 1; i <= 6; i++) {
      await sleep(2500);
      const opts = await p.$$eval('select[name=version-pick] option', (e) => e.map((x) => x.textContent.trim()));
      say(`[${tag}] after ${i * 2.5}s options=${opts.length}: ${opts.slice(0, 4).join(' | ')}`);
      if (opts.length > 1) break;
    }
    // Releases detail Open
    await p.goto(base + '#/releases');
    await p.locator('text=App install 1.4.2+7').first().waitFor({ timeout: 40000 });
    await sleep(1000);
    await p.locator('text=App install 1.4.2+7').first().click();
    for (let i = 1; i <= 6; i++) {
      await sleep(2000);
      const n = await p.locator('.rl3-open').count();
      const href = n ? await p.locator('.rl3-open').first().getAttribute('href') : '';
      say(`[${tag}] after ${i * 2}s Open links=${n} ${href}`);
      if (n) break;
    }
    await p.screenshot({ path: `${OUT}/shots3/rc2-detail-${tag}.png` });
    await c.close();
  }
} catch (e) {
  say('script error ' + String(e).split('\n')[0]);
} finally {
  try { await browser?.close(); } catch {}
  stop();
  fs.writeFileSync(`${OUT}/summary-rc2.md`, '# RC b9e6cba diagnose\n' + out.map((x) => '- ' + x).join('\n') + '\n');
}
