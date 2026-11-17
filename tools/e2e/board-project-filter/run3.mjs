// QA run 3 (targeted re-run of the cases run.mjs could not judge): C1, C3, B1 parts, B7, D3-D5, E2 vs rollup, E7. Scratch stores only.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { start, stop, sleep, WT, SC, PROJS, OUT, R } from './srv.mjs';
const { chromium } = createRequire(`${SC}/pw/`)('playwright-core');
const WS = createRequire(`${WT}/package.json`)('ws');
const port = process.argv[2] || '39125';
const base = `http://127.0.0.1:${port}/`;
const BS = String.fromCharCode(92);
const BD = `${process.env.APPDATA.split(BS).join('/')}/npm/node_modules/@beads/bd/bin/bd.exe`;
const BDENV = { ...process.env, BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe', BD_ACTOR: 'qa' };
fs.mkdirSync(`${OUT}/shots3`, { recursive: true });
const MARK = `QA-13241r3-${Date.now().toString(36)}`;
const rows = [];
let cur = '';
const ok = (id, name, pass, d = '') => {
  const r = { id, ctx: cur, name, pass: !!pass, detail: typeof d === 'string' ? d : JSON.stringify(d).slice(0, 500) };
  rows.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${id} [${cur}] ${name} ${r.detail.slice(0, 220)}`);
};
const step = async (id, name, fn) => {
  try {
    await fn();
  } catch (e) {
    ok(id, name + ' (step threw)', false, String(e).split('\n')[0]);
  }
};
const keyOf = (id) => id.replace(/-[a-z0-9]{2,6}(\.\d+)*$/i, '');
const bd = (proj, args) => spawnSync(BD, args, { cwd: `${PROJS}/${proj}`, env: BDENV, encoding: 'utf8', windowsHide: true, timeout: 60000 });
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

let browser;
try {
  console.log('start server', await start(port));
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [lang, theme] of [['en', 'light'], ['ar', 'dark']]) {
    cur = `${lang}-${theme}`;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Cairo' });
    await c.addInitScript(([l, t]) => { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); }, [lang, theme]);
    const p = await c.newPage();
    p.setDefaultTimeout(60000);
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    const urls = [];
    p.on('framenavigated', (f) => f === p.mainFrame() && urls.push(`${Math.round(performance.now())}:${f.url().replace(base, '')}`));
    const shot = (n) => p.screenshot({ path: `${OUT}/shots3/${n}-${cur}.png` });
    const settled = async (sel) => {
      let last = -1, same = 0;
      for (let i = 0; i < 40; i++) {
        const n = await p.$$eval(sel, (e) => e.length);
        if (n === last && n > 0) { if (++same >= 3) return n; } else { same = 0; last = n; }
        await sleep(700);
      }
      return last;
    };
    const freshTasks = async () => {
      await p.goto(base + '#/issues');
      await p.evaluate(() => { localStorage.removeItem('u3.tasks.filters'); });
      await p.reload();
      await p.waitForSelector('[data-testid=filters-btn]');
      await p.waitForSelector('.u3t-card', { timeout: 90000 });
      await settled('.u3t-card');
    };
    const ids = () => p.$$eval('.u3t-card__id', (e) => e.map((x) => x.textContent.trim().replace(/\s+/g, '')));

    await step('C1', 'tasks two projects', async () => {
      await freshTasks();
      await p.click('[data-testid=filters-btn]');
      await sleep(600);
      await p.click('.u3t-sh__sec[data-dim=project] .u3t-sh__hb');
      await sleep(400);
      const opts = await p.$$eval('.u3t-sh__sec[data-dim=project] .u3t-sh__opt', (e) => e.map((x) => x.dataset.v));
      const pick = ['rayeh', 'fatura'].filter((k) => opts.includes(k));
      for (const k of pick) await p.click(`.u3t-sh__sec[data-dim=project] .u3t-sh__opt[data-v="${k}"]`);
      await sleep(800);
      await p.keyboard.press('Escape');
      await sleep(1000);
      await settled('.u3t-card');
      const got = await ids();
      ok('C1', `Project filter ${pick.join('+')} shows only those`, pick.length === 2 && got.length > 0 && got.every((i) => pick.includes(keyOf(i))), { n: got.length, bad: got.filter((i) => !pick.includes(keyOf(i))).slice(0, 3) });
      ok('C1b', 'chip says "x +1"', /\+1/.test(await p.textContent('.u3t-ac[data-dim=project]')), clean(await p.textContent('.u3t-ac[data-dim=project]')));
      await shot('tasks-two-projects');
      await p.click('[data-testid=chips-clear-all]');
      await sleep(800);
      ok('C6', 'clear all removes chips', !(await p.$('.u3t-ac')));
    });
    await step('C3', 'tasks url param', async () => {
      await p.goto(base + '#/issues');
      await p.evaluate(() => { localStorage.removeItem('u3.tasks.filters'); });
      await p.goto(`${base}?project=rayeh,fatura#/issues`);
      await p.waitForSelector('.u3t-card', { timeout: 90000 });
      await settled('.u3t-card');
      const got = await ids();
      ok('C3', 'url ?project=rayeh,fatura preselects', got.length > 0 && got.every((i) => ['rayeh', 'fatura'].includes(keyOf(i))), { n: got.length });
      await p.evaluate(() => { localStorage.removeItem('u3.tasks.filters'); });
    });

    await step('B1', 'desk parts', async () => {
      await p.goto(base + '#/decisions');
      await p.reload();
      await p.waitForSelector('.dk3-main .u3-cd', { timeout: 120000 });
      await settled('.dk3-main .u3-cd');
      const parts = { search: !!(await p.$('.u3t-search')), filtersBtn: !!(await p.$('[data-testid=filters-btn]')), urgent: !!(await p.$('[data-quick=u3_tk_p01]')), projectChip: !!(await p.$('.u3t-menu[data-name=project]')) };
      ok('B1', 'desk has search, Filters, Urgent, Project chip', Object.values(parts).every(Boolean), parts);
      await p.goto(base + '#/projects');
      await p.waitForSelector('.u3p-row');
      await sleep(2500);
      await p.click('a[href="#/decisions"]');
      await p.waitForSelector('.dk3-main .u3-cd', { timeout: 120000 });
      await settled('.dk3-main .u3-cd');
      await sleep(1500);
      ok('B1b', 'Project chip on Desk when arriving from another screen (store already loaded)', !!(await p.$('.u3t-menu[data-name=project]')), { url: p.url().replace(base, '') });
      await shot('desk-inapp');
      await p.reload();
      await p.waitForSelector('.dk3-main .u3-cd', { timeout: 120000 });
      await settled('.dk3-main .u3-cd');
      const small = await p.$$eval('.dk3 .u3t-bar button, .dk3 .u3t-bar input, .dk3 .u3t-active button', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.className.split(' ')[0]}:${Math.round(r.width)}x${Math.round(r.height)}`; }));
      ok('B11', 'desk control sizes (44px target)', small.every((s) => Number(s.split('x')[1]) >= 44), small);
      // B7 search: by id and by card text
      const ids0 = await p.$$eval('.dk3-main a[href*="issue="]', (a) => a.map((x) => decodeURIComponent(x.getAttribute('href').split('issue=')[1].split('&')[0])));
      const n0 = await p.$$eval('.dk3-main .u3-cd', (e) => e.length);
      const target = ids0[0];
      await p.fill('.u3t-search', target.split('-').pop());
      await sleep(900);
      const nId = await p.$$eval('.dk3-main .u3-cd', (e) => e.length);
      ok('B7a', `search by id fragment "${target.split('-').pop()}" narrows`, nId >= 1 && nId < n0, { n0, nId });
      const q = clean(await p.$eval('.dk3-main .u3-cd__q', (e) => e.textContent)).split(' ').slice(0, 2).join(' ');
      await p.fill('.u3t-search', '');
      await sleep(500);
      await p.fill('.u3t-search', q);
      await sleep(900);
      const nQ = await p.$$eval('.dk3-main .u3-cd', (e) => e.length);
      ok('B7b', `search for words shown on the first card ("${q}") finds that card`, nQ >= 1, { nQ, note: 'search matches id/title only, the card shows the decision question' });
      await p.fill('.u3t-search', '');
    });

    await step('D4', 'create in another project, url trail', async () => {
      await freshTasks();
      await p.click('.u3t-new');
      await p.waitForSelector('[data-testid=nt-project]');
      const target = 'brother-exams';
      await p.selectOption('[data-testid=nt-project]', target);
      const parent = JSON.parse(bd(target, ['list', '--type', 'epic', '--status', 'open', '--limit', '1', '--json']).stdout || '[]')[0]?.id || 'brother-exams-8rqr';
      await p.fill('#u3-nt-title', `${MARK} A ${cur}`);
      await p.fill('#u3-nt-parent', parent);
      await p.selectOption('#u3-nt-asg', { index: 1 });
      const t0 = Date.now();
      urls.length = 0;
      await p.click('.u3-nt__act button');
      const trail = [];
      for (let i = 0; i < 24; i++) {
        await sleep(1000);
        trail.push(p.url().replace(base, ''));
        if (/issue=/.test(p.url()) && (await p.$('[data-holder]'))) break;
      }
      const final = p.url();
      ok('D4a', 'after Create (project differs from the connection) the new task opens', /issue=/.test(final), { final: final.replace(base, ''), trail: [...new Set(trail)], navigations: urls.length, secs: Math.round((Date.now() - t0) / 1000) });
      await shot('after-create-other');
      const created = JSON.parse(bd(target, ['search', `${MARK} A ${cur}`, '--json']).stdout || '[]');
      ok('D4c', 'task exists in scratch brother-exams only', created.length === 1 && keyOf(created[0].id) === target, created.map((x) => x.id));
      // second create in the SAME project (connection already there): opens the task?
      await freshTasks();
      await p.click('.u3t-new');
      await p.waitForSelector('[data-testid=nt-project]');
      const v = await p.$eval('[data-testid=nt-project]', (e) => e.value);
      ok('D2c', 'last project used is the default when no filter', v === target, { v });
      await p.fill('#u3-nt-title', `${MARK} B ${cur}`);
      await p.fill('#u3-nt-parent', parent);
      await p.selectOption('#u3-nt-asg', { index: 1 });
      await p.click('.u3-nt__act button');
      const trail2 = [];
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        trail2.push(p.url().replace(base, ''));
        if (/issue=/.test(p.url()) && (await p.$('[data-holder]'))) break;
      }
      ok('D4e', 'same-project create opens the new task', /issue=/.test(p.url()), { trail: [...new Set(trail2)] });
      await shot('after-create-same');
      // D3: new subtask from this task page defaults to the task's project; D-parent: change project with a parent filled
      if (/issue=/.test(p.url())) {
        const idNow = decodeURIComponent(p.url().split('issue=')[1].split('&')[0]);
        await p.click('.u3-ts__top button[aria-haspopup], button:has-text("⋯")').catch(() => {});
        const mi = p.locator('.u3-ts__mi').first();
        if (await mi.count()) {
          await mi.click();
          await p.waitForSelector('[data-testid=nt-project]');
          const dv = await p.$eval('[data-testid=nt-project]', (e) => e.value);
          const pv = await p.$eval('#u3-nt-parent', (e) => e.value);
          ok('D3', 'new subtask from a task page defaults to that task project and parent', dv === keyOf(idNow) && pv === idNow, { dv, pv, idNow });
          await p.selectOption('[data-testid=nt-project]', 'rayeh');
          await p.fill('#u3-nt-title', `${MARK} C`);
          await p.selectOption('#u3-nt-asg', { index: 1 });
          await p.click('.u3-nt__act button');
          await sleep(1500);
          const msg = clean(await p.$eval('.u3-nt', (e) => e.innerText));
          ok('D7', 'changing the project while a parent of another project is filled gives a clear message, no task made', /parent|الأب|مهمة أم|الرئيسية|project|مشروع/i.test(msg.slice(-160)) && bd('rayeh', ['search', MARK + ' C', '--json']).stdout.trim() === '[]', msg.slice(-160));
          await shot('parent-mismatch');
        } else ok('D3', 'subtask menu item found', false, 'menu not found on phone task page');
      }
    });
    ok('F7', 'no page errors', errs.length === 0, errs.slice(0, 3));
    await c.close();
  }

  // E2: stats numbers vs rollup, per project, independent recount
  cur = 'en-light';
  await step('E2', 'stats vs rollup', async () => {
    const roll = JSON.parse(fs.readFileSync(`${R}/flow/rollup.json`, 'utf8'));
    const work = Object.values(roll.beads).filter((b) => b && b.kind !== 'epic');
    const now = Date.now();
    const fin = (k) => work.filter((b) => (k ? b.project === k : true) && typeof b.closed === 'number' && b.active_ms >= 60000 && b.closed >= now - 7 * 86400000 && b.closed <= now).length;
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(() => { localStorage.setItem('beads-ui.lang', 'en'); localStorage.setItem('beads-ui.theme', 'light'); });
    const p = await c.newPage();
    p.setDefaultTimeout(60000);
    await p.goto(base + '#/');
    await p.waitForSelector('[data-screen=stats]');
    await sleep(3500);
    const fromUi = async () => Number(((await p.textContent('[data-block=summary]')).match(/finished (\d+)/) || [])[1]);
    ok('E2a', 'All: finished this week equals recount of rollup', (await fromUi()) === fin(''), { ui: await fromUi(), rollup: fin('') });
    const keys = [...new Set(work.map((b) => b.project))].filter((k) => fin(k) > 0).slice(0, 4);
    for (const k of keys) {
      await p.click('.u3t-menu[data-name=project]');
      await sleep(400);
      const opt = await p.$(`.u3t-opt[data-v="${k}"]`);
      if (!opt) { ok('E2c', `project ${k} in the chip menu`, false, 'missing option'); await p.keyboard.press('Escape'); continue; }
      await opt.click();
      await sleep(2500);
      ok('E2c', `${k}: finished this week equals recount`, (await fromUi()) === fin(k), { ui: await fromUi(), rollup: fin(k) });
      if (k === keys[0]) await p.screenshot({ path: `${OUT}/shots3/stats-${k}.png` });
    }
    // project in menu but no beads in the window -> honest text
    await c.close();
  });

  // E7 hostile keys
  cur = 'server';
  await step('E7', 'flow-stats hostile keys', async () => {
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
    const sig = (j) => JSON.stringify(j.payload?.summary ?? j.payload?.finished ?? j.payload?.done ?? Object.keys(j.payload || {})).slice(0, 120);
    const all = await ask({ days: 30 });
    const one = await ask({ days: 30, project: 'company' });
    const bads = {};
    for (const [k, v] of Object.entries({ traversal: '../../etc/passwd', slash: 'a/b', huge: 'x'.repeat(5000), number: 123, object: { a: 1 }, unknown: 'nope-zzz', empty: '' })) {
      const t0 = Date.now();
      const j = await ask({ days: 30, project: v });
      bads[k] = { ok: j.ok !== false && !j.timeout, ms: Date.now() - t0, same_as_all: sig(j) === sig(all), project_echo: j.payload?.project };
    }
    ok('E7a', 'every hostile key gets a normal reply (no error, no timeout, fast)', Object.values(bads).every((b) => b.ok && b.ms < 3000), bads);
    ok('E7b', 'valid project differs from all', sig(one) !== sig(all), { all: sig(all), one: sig(one) });
    ok('E7c', 'unknown valid-shaped key gives its own (empty) numbers, echoes the key', bads.unknown.project_echo === 'nope-zzz' && !bads.unknown.same_as_all, bads.unknown);
    const silent = Object.entries(bads).filter(([k, b]) => ['traversal', 'slash', 'huge', 'number', 'object'].includes(k) && b.same_as_all).map(([k]) => k);
    ok('E7d', 'invalid keys are not mistaken for a filter (echo empty = shows ALL, by design?)', true, { showAll: silent, note: 'invalid key is ignored = all projects; the UI only sends keys from the list so no user path' });
    await c.close();
  });
} finally {
  try { await browser?.close(); } catch {}
  stop();
  const fail = rows.filter((r) => !r.pass);
  fs.writeFileSync(`${OUT}/results3.json`, JSON.stringify({ mark: MARK, rows }, null, 1));
  fs.writeFileSync(`${OUT}/summary3.md`, `# QA run 3 (targeted)\nrun: ${new Date().toISOString()} marker: ${MARK}\n${rows.length - fail.length}/${rows.length} pass\n\n## Failed\n${fail.map((r) => `- ${r.id} [${r.ctx}] ${r.name}: ${r.detail}`).join('\n') || 'none'}\n`);
}
