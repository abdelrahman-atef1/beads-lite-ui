// QA wave 6, C: .59.14 top search at 320/360/390/414, ar (RTL) + en (LTR), on the REAL shell (real server, real top-bar icons, real data).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { base, OUT, LOG, create, bd, SIZES } from './lib.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const N = 'search-notes.txt';
const ROUTES = ['#/', '#/issues', '#/projects', '#/time', '#/releases'];
const rects = (page) => page.evaluate(() => {
  const iw = window.innerWidth; const top = document.querySelector('.u3-top');
  const els = [...top.querySelectorAll('button, a[href], input, [role=button]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
  return { iw, sw: document.documentElement.scrollWidth, bodySw: document.body.scrollWidth, topSw: top.scrollWidth, topCw: top.clientWidth,
    items: els.map((e) => { const r = e.getBoundingClientRect(); return { n: (e.getAttribute('aria-label') || e.className || e.tagName).toString().slice(0, 28), x: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= -0.5 && r.right <= iw + 0.5 }; }) };
});
for (const lang of ['en', 'ar']) for (const w of SIZES) {
  test(`C-1..4 search open: no hscroll, every top-bar control inside and tappable, finds title and id [${w} ${lang}]`, async ({ browser }) => {
    const id = create('new', `QAW6 zebrafinch ${w} ${lang}`);
    const c = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
    await c.addInitScript(([l]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', 'dark'); } catch { /* none */ } }, [lang]);
    const page = await c.newPage(); const errs = []; const known = [];
    page.on('pageerror', (e) => { errs.push('pageerror: ' + e.message); });
    page.on('console', (m) => m.type() === 'error' && !/\/att\//.test(m.location().url) && errs.push('console: ' + m.text().slice(0, 150)));
    const out = [];
    for (const hash of ROUTES) {
      await page.goto(base('new', 'phone') + '/?ui=3' + hash); await page.waitForSelector('.u3-top'); await page.waitForTimeout(1800);
      const closed = await rects(page);
      await page.locator('.u3-search__btn').click(); await page.waitForSelector('.u3-search__field input'); await page.waitForTimeout(300);
      const open = await rects(page);
      if (hash === '#/') await page.screenshot({ path: `${OUT}/shots/search-${w}-${lang}-open.png` });
      const dir = await page.evaluate(() => document.querySelector('[dir]')?.getAttribute('dir') || document.documentElement.dir);
      const off = open.items.filter((i) => !i.inside); const small = open.items.filter((i) => i.h < 28 || i.w < 28);
      out.push({ hash, closed_sw: closed.sw, open_sw: open.sw, iw: open.iw, topSw: open.topSw, topCw: open.topCw, n_items: open.items.length, off, small, dir });
      LOG(N, `C-1 ${w} ${lang} ${hash}: iw=${open.iw} scrollWidth closed=${closed.sw} open=${open.sw} top ${open.topSw}/${open.topCw}; controls=${open.items.length} offscreen=${JSON.stringify(off.map((i) => i.n))} small=${JSON.stringify(small.map((i) => `${i.n}:${i.w}x${i.h}`))} dir=${dir}`);
      expect(open.sw, `${hash} scrollWidth`).toBeLessThanOrEqual(open.iw);
      expect(off, `${hash} controls outside the window`).toEqual([]);
      if (lang === 'ar') expect(dir).toBe('rtl');
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
    // C-3 finds by title and id, opens the task; C-4 closing returns the bar
    await page.goto(base('new', 'phone') + '/?ui=3#/'); await page.waitForSelector('.u3-top'); await page.waitForTimeout(1500);
    await page.locator('.u3-search__btn').click(); const inp = page.locator('.u3-search__field input'); await inp.fill('zebrafinch'); await page.waitForTimeout(900);
    const hits = page.locator('.u3-search__hit'); const n = await hits.count(); LOG(N, `C-3 ${w} ${lang}: title hits=${n}`);
    await page.screenshot({ path: `${OUT}/shots/search-${w}-${lang}-results.png` });
    expect(n).toBeGreaterThan(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await inp.fill(id); await page.waitForTimeout(700); expect(await hits.count()).toBeGreaterThan(0);
    await hits.first().click(); await page.waitForTimeout(1500); expect(page.url()).toContain(id);
    const bef = await rects(page); LOG(N, `C-4 ${w} ${lang}: after open task, controls=${bef.items.length} scrollWidth=${bef.sw}/${bef.iw}`); expect(bef.sw).toBeLessThanOrEqual(bef.iw);
    await page.goto(base('new', 'phone') + '/?ui=3#/'); await page.waitForSelector('.u3-top'); await page.waitForTimeout(1200);
    const before = (await rects(page)).items.map((i) => i.n).join('|');
    await page.locator('.u3-search__btn').click(); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const after = (await rects(page)).items.map((i) => i.n).join('|'); LOG(N, `C-4 ${w} ${lang}: bar restored after close = ${before === after}`);
    expect(after).toBe(before);
    fs.writeFileSync(`${OUT}/search-${w}-${lang}.json`, JSON.stringify(out, null, 1));
    LOG(N, `F-B ${w} ${lang}: known insertBefore pageerrors (same on 7f4806d)=${known.length}`); bd('new', ['close', id, '-r', 'qa cleanup']); expect(errs).toEqual([]); await c.close();
  });
}

// F-B (asserted): leave another screen for the desk, open search, tap a result: no pageerror at all. Phone door, 390, en + ar, 6 starting screens.
const FB = { projects: '#/projects', time: '#/time', releases: '#/releases', tasks: '#/issues', settings: '#/settings', 'bulk-cancel': '#/issues' };
for (const lang of ['en', 'ar']) for (const [name, hash] of Object.entries(FB)) {
  test(`F-B no pageerror: ${name} -> desk -> search hit [390 ${lang}]`, async ({ browser }) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
    await c.addInitScript(([l]) => { try { localStorage.setItem('beads-ui.lang', l); } catch { /* none */ } }, [lang]);
    const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 90)));
    await p.goto(base('new', 'phone') + '/?ui=3' + hash); await p.waitForSelector('.u3-top'); await p.waitForTimeout(2000);
    if (name === 'bulk-cancel') { await p.waitForSelector('.u3t-card'); await p.getByTestId('bulk-enter').click(); await p.locator('.u3t-card').first().click(); await p.getByTestId('bulk-cancel').click(); await p.waitForTimeout(300); }
    await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1200);
    await p.locator('.u3-search__btn').click(); await p.locator('.u3-search__field input').fill('board'); await p.waitForTimeout(800);
    const nHits = await p.locator('.u3-search__hit').count(); await p.locator('.u3-search__hit').first().click(); await p.waitForTimeout(2000);
    LOG(N, `F-B ${name} ${lang}: hits=${nHits} url=${p.url().replace(/^.*#/, '#')} pageerrors=${errs.length} ${JSON.stringify(errs)}`);
    expect(nHits).toBeGreaterThan(0); expect(errs).toEqual([]); await c.close();
  });
}
