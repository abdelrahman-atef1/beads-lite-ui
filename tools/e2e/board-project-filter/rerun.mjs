// Quiet-machine re-run of the cases that flaked in run/run3 (baseline taken before the feed settled; selectors). Scratch stores only.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { start, stop, sleep, SC, OUT } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const port = process.argv[2] || '39129';
const base = `http://127.0.0.1:${port}/`;
const rows = [];
const ok = (n, p, d = '') => { rows.push({ n, p: !!p, d: typeof d === 'string' ? d : JSON.stringify(d) }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${typeof d === 'string' ? d : JSON.stringify(d)}`); };
const keyOf = (id) => id.replace(/-[a-z0-9]{2,6}(\.\d+)*$/i, '');
let browser;
try {
  await start(port);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    const tag = `${lang}-${theme}`;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(([a, b]) => { localStorage.setItem('beads-ui.lang', a); localStorage.setItem('beads-ui.theme', b); }, [lang, theme]);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.setDefaultTimeout(60000);
    const cards = () => p.$$eval('.dk3-main .u3-cd', (e) => e.length);
    const stable = async () => { let last = -1, same = 0; for (let i = 0; i < 60 && same < 4; i++) { const n = await cards(); same = n === last ? same + 1 : 0; last = n; await sleep(700); } return last; };
    const ids = () => p.$$eval('.dk3-main a[href*="issue="]', (a) => a.map((x) => decodeURIComponent(x.getAttribute('href').split('issue=')[1].split('&')[0])));
    await p.goto(base + '#/decisions');
    await p.reload();
    await p.waitForSelector('.dk3-main .u3-cd', { timeout: 120000 });
    const n0 = await stable();
    ok(`B1 ${tag} Project chip on a direct load/reload (13.24.1 fix)`, !!(await p.$('.u3t-menu[data-name=project]')), { n0 });
    ok(`B1 ${tag} search + Filters + Urgent also there`, !!(await p.$('.u3t-search')) && !!(await p.$('[data-testid=filters-btn]')) && !!(await p.$('[data-quick=u3_tk_p01]')));
    const projs = [...new Set((await ids()).map(keyOf))];
    await p.click('[data-testid=filters-btn]'); await sleep(700);
    ok(`B2 ${tag} sheet has no Status`, !(await p.$('.u3t-sh__sec[data-dim=status]')));
    await p.click('.u3t-sh__sec[data-dim=project] .u3t-sh__hb'); await sleep(400);
    const target = projs.find((k) => k !== 'company') || projs[0];
    await p.click(`.u3t-sh__sec[data-dim=project] .u3t-sh__opt[data-v="${target}"]`); await sleep(900);
    await p.keyboard.press('Escape'); await sleep(900);
    const ids1 = await ids();
    ok(`B3 ${tag} desk narrowed to ${target}`, ids1.length > 0 && ids1.every((i) => keyOf(i) === target) && ids1.length < n0, { n: ids1.length, was: n0 });
    await p.click('.u3t-ac__x[data-remove=project]'); await sleep(900);
    const n2 = await stable();
    ok(`B4 ${tag} x removes chip and widens back to the full list`, n2 === n0 && !(await p.$('.u3t-ac')), { n: n2, was: n0 });
    await p.click('[data-testid=filters-btn]'); await sleep(600);
    await p.click('.u3t-sh__sec[data-dim=project] .u3t-sh__hb'); await sleep(300);
    await p.click(`.u3t-sh__sec[data-dim=project] .u3t-sh__opt[data-v="${target}"]`); await sleep(700);
    await p.keyboard.press('Escape'); await sleep(700);
    await p.click('[data-testid=chips-clear-all]'); await sleep(900);
    const n3 = await stable();
    ok(`B5b ${tag} Clear restores the list`, n3 === n0, { n: n3, was: n0 });
    // tasks: two projects
    await p.goto(base + '#/issues'); await p.evaluate(() => localStorage.removeItem('u3.tasks.filters'));
    await p.reload();
    await p.waitForSelector('[data-testid=filters-btn]'); await p.waitForSelector('.u3t-card', { timeout: 90000 }); await sleep(3000);
    await p.click('[data-testid=filters-btn]'); await sleep(700);
    await p.click('.u3t-sh__sec[data-dim=project] .u3t-sh__hb'); await sleep(500);
    const opts = await p.$$eval('.u3t-sh__sec[data-dim=project] .u3t-sh__opt', (e) => e.map((x) => x.dataset.v));
    const pick = ['rayeh', 'fatura'].filter((k) => opts.includes(k));
    for (const k of pick) await p.click(`.u3t-sh__sec[data-dim=project] .u3t-sh__opt[data-v="${k}"]`);
    await sleep(800); await p.keyboard.press('Escape'); await sleep(2500);
    const got = await p.$$eval('.u3t-card__id', (e) => e.map((x) => x.textContent.trim().replace(/\s+/g, '')));
    ok(`C1 ${tag} Tasks Project filter ${pick.join('+')}`, pick.length === 2 && got.length > 0 && got.every((i) => pick.includes(keyOf(i))), { n: got.length, opts: opts.length });
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|').slice(0, 150));
    await c.close();
  }
} catch (e) { ok('script', false, String(e).split('\n')[0]); }
finally {
  try { await browser?.close(); } catch {}
  stop();
  fs.writeFileSync(`${OUT}/summary-rerun.md`, '# Quiet re-run of flaky cases\n' + rows.map((r) => `- ${r.p ? 'PASS' : 'FAIL'} ${r.n} ${r.d}`).join('\n') + '\n');
}
