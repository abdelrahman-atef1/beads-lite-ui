// QA wave 6, A: the OLD board (no ?ui=3) on 87edf2d ("new") against the same checks on 7f4806d ("base", before .59.19). Both from prebuilt bundles like production.
import { test, expect } from '@playwright/test';
import fs from 'node:fs'; import zlib from 'node:zlib';
import { bd, base, OUT, LOG } from './lib.mjs';
import { WT, BASE_WT } from './paths.mjs';
fs.mkdirSync(OUT + '/shots', { recursive: true });
const TREE = { new: WT, base: BASE_WT };
const N = 'legacy-notes.txt';
const ROUTES = [['decisions', '#/'], ['list', '#/issues'], ['epics', '#/epics'], ['board', '#/board'], ['releases', '#/releases'], ['detail', '#/issues?issue=beads-lite-1bo5.6.24']];
const META = (t) => JSON.stringify({ ask_ar: 'اختبار', card_q: 'Which colour for the logo?', asked_at: new Date().toISOString(), title_ar: 'اختبار', card_back: 'swe', card_opts: '[{"l":"Red"},{"l":"Blue","rec":true}]', card_show: 'Red or blue.', card_class: 'tap', card_thing: 'true', card_blocks: 'nothing', card_effect: 'Changes the logo colour.', card_title: t });
const showJson = (srv, id) => { const o = bd(srv, ['show', id, '--json']).stdout; return JSON.parse(o.slice(o.indexOf('[')))[0]; };
const pngBytes = () => {
  const w = 360, h = 240; const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 240; raw[o + 1] = 240; raw[o + 2] = 250; } }
  const crc = (b) => { let c; const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
async function mk(browser, srv, w) {
  const c = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, hasTouch: w < 500, locale: 'en-US' });
  await c.addInitScript(() => { try { localStorage.setItem('beads-ui.lang', 'en'); localStorage.setItem('beads-ui.theme', 'light'); } catch { /* none */ } });
  const page = await c.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/\/att\//.test(m.location().url) && errs.push('console: ' + m.text().slice(0, 150)));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/att\/|favicon/.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  return { c, page, errs };
}
for (const srv of ['new', 'base']) {
  for (const w of [390, 1440]) test(`A-1/A-7/A-8 every legacy screen opens, refresh keeps the route, no v3 [${srv} ${w}]`, async ({ browser }) => {
    const { c, page, errs } = await mk(browser, srv, w); const reqs = [];
    page.on('request', (r) => reqs.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
    const rows = [];
    for (const [name, hash] of ROUTES) {
      await page.goto(base(srv, w < 500 ? 'phone' : 'pc') + '/' + hash); await page.waitForSelector('#shell', { timeout: 30000 }); await page.waitForTimeout(2500);
      const r = await page.evaluate(() => ({ len: document.body.innerText.length, v3: document.querySelectorAll('.u3, [data-ui="3"]').length + (document.documentElement.getAttribute('data-ui') ? 1 : 0), hscroll: document.documentElement.scrollWidth > innerWidth + 1,
        classes: [...new Set([...document.querySelectorAll('#shell *, #app *')].flatMap((e) => [...e.classList]))].sort(), rows: document.querySelectorAll('.card, .row, .issue-row, .qcard, tr').length }));
      await page.reload(); await page.waitForSelector('#shell', { timeout: 30000 }); await page.waitForTimeout(800);
      const hashAfter = await page.evaluate(() => location.hash);
      await page.screenshot({ path: `${OUT}/shots/legacy-${srv}-${w}-${name}.png` });
      rows.push({ name, hash, hashAfter, ...r, nclasses: r.classes.length });
    }
    const v3Req = reqs.filter((u) => /ui=3|\/u3|flow-|mention/.test(u)); const js = reqs.filter((u) => /\.js(\?|$)/.test(u));
    fs.writeFileSync(`${OUT}/legacy-${srv}-${w}-routes.json`, JSON.stringify({ rows, js_requests: js.length, js_unique: [...new Set(js)].length, v3Req, errs }, null, 1));
    for (const r of rows) LOG(N, `A-1 ${srv} ${w} ${r.name}: len=${r.len} rows=${r.rows} classes=${r.nclasses} v3nodes=${r.v3} hscroll=${r.hscroll} refresh_hash_kept=${r.hashAfter === r.hash}`);
    LOG(N, `A-7 ${srv} ${w}: js requests=${js.length} unique=${[...new Set(js)].length} v3 requests=${JSON.stringify(v3Req)} errs=${JSON.stringify(errs)}`);
    for (const r of rows) { expect(r.len, r.name).toBeGreaterThan(r.name === 'epics' ? 50 : 200); expect(r.v3, r.name + ' v3 nodes').toBe(0); expect(r.hashAfter, r.name + ' refresh').toBe(r.hash); if (w < 500) expect(r.hscroll, r.name + ' hscroll').toBe(false); }
    expect(v3Req).toEqual([]); expect(errs).toEqual([]); await c.close();
  });
  test(`A-2 decision answers: option then Confirm records the answer [${srv}]`, async ({ browser }) => {
    const r = bd(srv, ['create', `QA6 card ${srv}`, '-t', 'task', '-a', 'abdelrahman', '--metadata', META('qa6'), '--silent']);
    const id = r.stdout.split(/\s+/).filter((x) => /^beads-lite-/.test(x)).pop(); bd(srv, ['update', id, '--status', 'owner_decision']);
    const { c, page, errs } = await mk(browser, srv, 1440);
    await page.goto(base(srv) + '/#/'); const card = page.locator(`.qcard[data-issue-id="${id}"]`); await card.waitFor({ timeout: 30000 });
    await card.locator('.opts button').first().click(); await page.waitForTimeout(300);
    const btns = await card.locator('button').allInnerTexts(); LOG(N, `A-2 ${srv} buttons after select=${JSON.stringify(btns)}`);
    await page.screenshot({ path: `${OUT}/shots/legacy-${srv}-decision-selected.png` });
    await card.locator('button.btn--primary').last().click();
    await expect(card).toHaveCount(0, { timeout: 20000 });
    const shown = showJson(srv, id); shown.comments = [bd(srv, ['comments', id]).stdout.replace(/\s+/g, ' ')];
    const cm = JSON.stringify(shown.comments || []).slice(0, 220); LOG(N, `A-2 ${srv} ${id} status=${shown.status} assignee=${shown.assignee} comments=${cm}`);
    expect(shown.status).not.toBe('owner_decision'); expect(JSON.stringify(shown)).toMatch(/OWNER DECISION|Answered|answered/);
    expect(errs).toEqual([]); await c.close();
  });
  for (const w of [390, 1440]) test(`A-3 bell opens, lists items, closes [${srv} ${w}]`, async ({ browser }) => {
    const { c, page, errs } = await mk(browser, srv, w); await page.goto(base(srv, w < 500 ? 'phone' : 'pc') + '/#/'); await page.waitForSelector('.nt-bell'); await page.waitForTimeout(2500);
    const dot = await page.locator('.nt-dot').count(); await page.locator('.nt-bell').click(); await page.waitForSelector('.nt-panel');
    const items = await page.locator('.nt-item').count(); const unread = await page.locator('.nt-unread').count(); const txt = (await page.locator('.nt-panel').innerText()).replace(/\s+/g, ' ').slice(0, 160);
    await page.screenshot({ path: `${OUT}/shots/legacy-${srv}-${w}-bell.png` });
    LOG(N, `A-3 ${srv} ${w}: dot=${dot} items=${items} unread=${unread} panel="${txt}"`);
    await page.locator('.nt-x').click(); await expect(page.locator('.nt-panel')).toHaveCount(0); expect(errs).toEqual([]); await c.close();
  });
  for (const w of [390, 1440]) test(`A-4 report with drawing: attach, draw, send [${srv} ${w}]`, async ({ browser }) => {
    const { c, page, errs } = await mk(browser, srv, w); await page.goto(base(srv, w < 500 ? 'phone' : 'pc') + '/#/'); await page.waitForSelector('.rpt-open'); await page.waitForTimeout(1500);
    const file = `${OUT}/qa-shot.png`; fs.writeFileSync(file, pngBytes());
    await page.locator('.rpt-open').click(); await page.waitForSelector('.rpt'); await page.waitForTimeout(600);
    await page.locator('input[name=version]').fill('qa6-' + srv);
    await page.locator('.rpt input[type=file]').first().setInputFiles(file); await page.waitForSelector('.rpt-edit', { timeout: 15000 });
    await page.locator('.rpt-edit').click(); await page.waitForSelector('.rpt-edcanvas');
    const cv = page.locator('.rpt-edcanvas'); const bb = await cv.boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.3); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.6, { steps: 8 }); await page.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.3, { steps: 8 }); await page.mouse.up();
    const px = await cv.evaluate((el) => { const x = el.getContext('2d').getImageData(0, 0, el.width, el.height).data; let n = 0; for (let i = 0; i < x.length; i += 4) if (!(x[i] === 240 && x[i + 1] === 240 && x[i + 2] === 250)) n++; return n; });
    await page.screenshot({ path: `${OUT}/shots/legacy-${srv}-${w}-draw.png` }); expect(px, 'drawn pixels').toBeGreaterThan(50);
    await page.locator('.rpt-done').click(); await page.waitForTimeout(400);
    await page.locator('textarea[name=text]').fill('QA wave6 legacy report with drawing ' + srv);
    const reqP = page.waitForRequest((r) => r.url().includes('/api/report'), { timeout: 20000 });
    await page.locator('.rpt-send').click(); const req = await reqP; const resp = await req.response(); const len = (req.postDataBuffer() || Buffer.alloc(0)).length;
    await page.waitForSelector('.rpt-msg.rpt-ok, .rpt-msg.rpt-err', { timeout: 20000 }); const msg = await page.locator('.rpt-msg').innerText();
    await page.screenshot({ path: `${OUT}/shots/legacy-${srv}-${w}-report-sent.png` });
    LOG(N, `A-4 ${srv} ${w}: drawn_px=${px} POST /api/report status=${resp?.status()} body=${len}B msg="${msg}"`);
    expect(resp.status()).toBe(200); expect(len).toBeGreaterThan(300); expect(await page.locator('.rpt-msg.rpt-ok').count()).toBe(1); expect(errs).toEqual([]); await c.close();
  });
  test(`A-5/A-6 service worker registers, updates, offline refresh [${srv}]`, async ({ browser }) => {
    const bundle = TREE[srv] + '/app/main.bundle.js'; const orig = fs.readFileSync(bundle);
    const { c, page, errs } = await mk(browser, srv, 390);
    try {
      await page.goto(base(srv, 'phone') + '/#/'); await page.waitForSelector('#shell');
      const info = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; const keys = await caches.keys(); const urls = []; for (const k of keys) urls.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return { scope: reg.scope, state: reg.active?.state, keys, urls }; });
      const sw1 = await page.evaluate(() => fetch('/sw.js').then((r) => r.text())); const v1 = (/const VERSION = '([^']+)'/.exec(sw1) || [])[1]; const shell = JSON.parse((/JSON\.parse\('(.+?)'\)/.exec(sw1) || [])[1] || '[]');
      const bad = []; for (const u of shell) { const r = await page.evaluate((u) => fetch(u).then((r) => r.status), u); if (r !== 200) bad.push(u + ' ' + r); }
      LOG(N, `A-5 ${srv}: scope=${info.scope} state=${info.state} caches=${JSON.stringify(info.keys)} cached=${info.urls.length} shell=${shell.length} version=${v1} chunks_in_shell=${shell.filter((u) => u.startsWith('/chunks/')).length} bad=${JSON.stringify(bad)}`);
      expect(info.state).toBe('activated'); expect(info.urls.length).toBe(shell.length); expect(bad).toEqual([]);
      await page.reload(); await page.waitForSelector('#shell'); await page.waitForTimeout(1000);
      await c.setOffline(true);
      const assetOffline = await page.evaluate(() => fetch('/main.bundle.js').then((r) => r.status).catch((e) => 'ERR ' + e.message));
      let nav = 'ok'; try { await page.reload({ timeout: 8000 }); nav = 'loaded:' + (await page.title()) + ' shell=' + (await page.locator('#shell').count()); } catch (e) { nav = 'fail: ' + e.message.split('\n')[0].slice(0, 90); }
      LOG(N, `A-6 ${srv}: offline asset /main.bundle.js=${assetOffline}; offline reload=${nav}`);
      await c.setOffline(false); await page.goto(base(srv, 'phone') + '/#/'); await page.waitForSelector('#shell'); await page.waitForTimeout(1500);
      const back = await page.evaluate(() => document.body.innerText.length); LOG(N, `A-6 ${srv}: back online, text=${back}`); expect(back).toBeGreaterThan(200);
      fs.appendFileSync(bundle, '\n//qa6-update\n');
      const up = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; await reg.update(); await new Promise((r) => setTimeout(r, 4000)); const keys = await caches.keys(); return { active: reg.active?.state, installing: reg.installing?.state || null, waiting: reg.waiting?.state || null, keys }; });
      const sw2 = await page.evaluate(() => fetch('/sw.js').then((r) => r.text())); const v2 = (/const VERSION = '([^']+)'/.exec(sw2) || [])[1];
      LOG(N, `A-5 ${srv}: update: v1=${v1} v2=${v2} active=${up.active} installing=${up.installing} waiting=${up.waiting} caches=${JSON.stringify(up.keys)}`);
      expect(v2).not.toBe(v1); expect(up.keys).toEqual(['board-shell-' + v2]); expect(up.active).toBe('activated');
      await page.reload(); await page.waitForSelector('#shell'); await page.waitForTimeout(1000); expect(await page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(200);
      expect(errs.filter((e) => !/Failed to load resource|net::ERR/.test(e))).toEqual([]);
    } finally { fs.writeFileSync(bundle, orig); await c.close(); }
  });
}
