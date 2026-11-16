// QA for beads-lite-1bo5.6.59.37.1 (follow-ups) and .37.2 (Stats assistant).
// Real headless Chrome at 390x844, Arabic, board started the production way
// (node <install>/server/index.js --host 127.0.0.1 --port <free>) on scratch data.
// Servers: stub (claude.exe stand-in that logs argv+stdin), real (the board's own claude login).
// Usage: node tools/e2e/ask-37.mjs <outdir> <scratch> [--real]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [outdir, SP, ...flags] = process.argv.slice(2);
const REAL = flags.includes('--real');
const BOARD = path.join(outdir, 'board');
const STUB = path.join(SP, 'stub', 'claude.exe');
const CALLS = path.join(SP, 'stub', 'calls.jsonl');
const WS = path.join(SP, 'qa');
const BD = path.join(process.env.APPDATA, 'npm', 'node_modules', '@beads', 'bd', 'bin', 'bd.exe');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chromium } = await import(pathToFileURL('E:/Projects/handy/node_modules/playwright-core/index.mjs').href);
fs.mkdirSync(path.join(outdir, 'shots'), { recursive: true });
fs.mkdirSync(path.join(outdir, 'logs'), { recursive: true });

const results = [];
const R = (id, ok, detail = '') => {
  results.push({ id, status: ok === null ? 'NOT EXERCISED' : ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 600) });
  console.log(`${ok === null ? 'NOTEX' : ok ? 'PASS ' : 'FAIL '} ${id} ${String(detail).slice(0, 200)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pids = [];

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

async function startServer(name, { stub = true, flow = 'flow', debug = false, extra = {} } = {}) {
  const port = await freePort();
  const log = path.join(outdir, 'logs', `server-${name}.log`);
  const fd = fs.openSync(log, 'w');
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    APPDATA: process.env.APPDATA,
    USERPROFILE: path.join(SP, 'home'), HOME: path.join(SP, 'home'), // keep the registry, push keys and flow home off the owner's profile
    BD_BIN: BD, PHONE_PORT: 'off', FLOW_HOME: path.join(SP, flow), CARDS_DIR: path.join(SP, 'cards'),
    ASK_CLAUDE_CACHE_DIR: path.join(SP, 'cache'),
    BDUI_WAKE_BIN: path.join(SP, 'wake-stub.mjs'), BDUI_ATTACH_ROOT: path.join(SP, 'attach'), BDUI_REPORT_ROUTES: JSON.stringify({ qa: { store: 'qa', parent: 'qa-fbe' } }),
    ...(stub
      ? { ASK_CLAUDE_BIN: STUB, ASK_CLAUDE_CONFIG_DIR: path.join(SP, 'cfg') }
      : { ASK_CLAUDE_CONFIG_DIR: 'I:\\Claude Files\\data\\ask-claude-config', ASK_CLAUDE_BIN: path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe') }),
    ...extra
  };
  const args = [path.join(BOARD, 'server', 'index.js'), '--host', '127.0.0.1', '--port', String(port), ...(debug ? ['--debug'] : [])];
  const child = spawn(process.execPath, args, { cwd: WS, env, stdio: ['ignore', fd, fd], windowsHide: true });
  pids.push(child.pid);
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/ask/status`); if (r.ok) break; } catch {}
    await sleep(500);
  }
  return { port, pid: child.pid, base: `http://127.0.0.1:${port}`, log, name };
}
function stopServer(s) {
  if (!s || !pids.includes(s.pid)) return;
  spawnSync('taskkill', ['/PID', String(s.pid), '/T', '/F'], { windowsHide: true });
}

const calls = () => (fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const lastCall = () => calls().at(-1);
const q = (s) => (s.stdin.match(/<question>\n([\s\S]*?)\n<\/question>/) || [])[1] || '';

let browser;
async function newPage(srv, { w = 390, h = 844 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-EG',
    serviceWorkers: 'block'
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('beads-ui.lang', 'ar'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.token = null;
  page.on('request', (r) => { const t = r.headers()['x-board-token']; if (t) page.token = t; });
  page.errs = errs;
  page.base = srv.base;
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(outdir, 'shots', name + '.png') });
async function openSheet(page) {
  await page.waitForSelector('.u3-ask__head', { timeout: 20000 });
  await page.click('.u3-ask__head');
  await page.waitForSelector('.u3-ask__sheet textarea', { timeout: 5000 });
}
async function ask(page, text, { wait = 30000 } = {}) {
  const before = await page.locator('.u3-ask__answer').count();
  await page.fill('.u3-ask__ta', text);
  await page.click('form .u3-ask__btn--primary');
  await page.waitForFunction(() => document.querySelector('.u3-ask__sheet')?.dataset.phase === 'wait', null, { timeout: 1500 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('.u3-ask__sheet')?.dataset.phase !== 'wait', null, { timeout: wait }).catch(() => {});
  await sleep(150);
  return { answers: await page.locator('.u3-ask__answer').count(), banner: (await page.locator('.u3-ask__banner').allInnerTexts()).join(' | ') };
}
const lastAnswer = (page) => page.locator('.u3-ask__answer').last().innerText();
const geom = (page) => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const out = { vw, vh, docW: document.documentElement.scrollWidth, bad: [] };
  for (const sel of ['.u3-ask__panel', '.u3-ask__ta', '.u3-ask__btn--primary', '.u3-ask__x']) {
    const e = document.querySelector(sel); if (!e) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) out.bad.push(`${sel} x ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (r.width && r.height && (r.height < 30 && sel !== '.u3-ask__panel')) out.bad.push(`${sel} h ${Math.round(r.height)}`);
  }
  const p = document.querySelector('.u3-ask__panel'); if (p) { out.panelScroll = p.scrollHeight > p.clientHeight; }
  return out;
});
const post = (page, body, token) => page.evaluate(async ([base, b, t]) => {
  const r = await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-board-token': t }, body: JSON.stringify(b) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, ra: r.headers.get('retry-after') };
}, [page.base, body, token]);

const TASK = '#/issues?issue=qa-8i6';
const EXPECT_ARGV_TAIL = /^-p --model (haiku|sonnet) --tools\s+--safe-mode --no-session-persistence --disable-slash-commands --strict-mcp-config --setting-sources\s+--system-prompt .* --output-format json$/;

browser = await chromium.launch({ executablePath: CHROME, headless: true });
let srvA, srvB, srvC, srvD, srvR, srvG, srvE;
let page;
try {
  fs.rmSync(CALLS, { force: true });
  // ================= Server B: rate limit + cap, one timeline =================
  fs.rmSync(CALLS, { force: true });
  srvB = await startServer('B-rate');
  page = await newPage(srvB);
  await page.goto(srvB.base + '/' + TASK);
  await openSheet(page);
  const t0 = Date.now();
  for (let i = 1; i <= 5; i++) await ask(page, `R${i} quick`);
  const typed = 'R6 this one hits the limit';
  const a6 = await ask(page, typed);
  const rl = a6.banner;
  const kept = await page.locator('.u3-ask__ta').inputValue();
  R('F9a 6th question in a minute: honest rate message with seconds, thread intact, typed text kept', /\d/.test(rl) && (await page.locator('.u3-ask__q').count()) === 5 && kept === typed && calls().length === 5, `banner="${rl}" kept=${kept === typed} spawns=${calls().length}`);
  await shot(page, 'f9-rate-limited');
  const secsTxt = rl.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/d+/); const wait = ((secsTxt ? Number(secsTxt[0]) : 60) + 4) * 1000; // honest retry-after, plus slack
  await sleep(wait);
  const a6b = await ask(page, typed);
  const a7 = await ask(page, 'R7 seventh');
  const a8 = await ask(page, 'R8 eighth');
  const capped = (await page.locator('.u3-ask__ta').count()) === 0 && /اكتملت/.test(await page.locator('.u3-ask__note').allInnerTexts().then((x) => x.join(' ')));
  const before = calls().length;
  const last = calls().at(-1);
  const histLines = (last.stdin.match(/<history>\n([\s\S]*?)\n<\/history>/) || [])[1]?.split('\n').length;
  R('F9b after the wait the same question goes through (no dead end)', a6b.answers === 6, `answers=${a6b.answers}`);
  R('F5 8 questions then "chat is full": form removed, no 9th request possible, New chat offered; client sends only newest 6 turns', a8.answers === 8 && capped && (await page.locator('[data-act="new-chat"]').count()) === 1 && histLines === 6 && calls().length === before, `answers=${a8.answers} capped=${capped} history lines on 8th=${histLines}`);
  await shot(page, 'f5-chat-full');
  const g5 = await geom(page);
  R('F5/F12 full-chat state fits 390 wide', g5.docW <= 391 && g5.bad.length === 0, JSON.stringify(g5));
  await page.click('[data-act="new-chat"]');
  R('F5b New chat after full re-opens the form', (await page.locator('.u3-ask__ta').count()) === 1, '');
  await page.context().close();
  stopServer(srvB); srvB = null;

} catch (e) {
  R('HARNESS ERROR', false, e.stack || e);
} finally {
  await browser.close().catch(() => {});
  for (const s of [srvA, srvB, srvC, srvD, srvE, srvG, srvR]) stopServer(s);
  const fail = results.filter((r) => r.status === 'FAIL').length;
  fs.writeFileSync(path.join(outdir, 'results-b.json'), JSON.stringify({ ran: new Date().toISOString(), pass: results.filter((r) => r.status === 'PASS').length, fail, notExercised: results.filter((r) => r.status === 'NOT EXERCISED').length, results }, null, 1));
  setTimeout(() => process.exit(0), 500).unref?.();
  console.log(`done: pass=${results.filter((r) => r.status === 'PASS').length} fail=${fail}`);
}
