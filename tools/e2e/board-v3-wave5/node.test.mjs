// QA wave 5 node checks: B-1/B-2 (.59.21), P-1 (.16.1), X-3 (.66.7 weekly push, fake sender), X-4 (sw.js flow text)
import test from 'node:test'; import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import net from 'node:net'; import path from 'node:path'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21';
const SC = WT + '/.work/scratch/qa5';
const T = SC + '/node-t'; fs.rmSync(T, { recursive: true, force: true }); fs.mkdirSync(T, { recursive: true });
const imp = (p) => import(pathToFileURL(WT + '/' + p).href);
const free = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const WS = (await import(pathToFileURL(WT + '/node_modules/ws/wrapper.mjs').href)).default;

async function serverNoBdBin({ withBin }) {
  const port = await free(); assert.ok(![3000, 3001].includes(port));
  const NPM = 'C:/Users/abduu/AppData/Roaming/npm';
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', PHONE_PORT: 'off', BD_ACTOR: 'qa', BDUI_BOARD_HOME: T + '/bh' + port,
    PATH: [NPM, 'C:/Windows/System32', 'C:/Windows', path.dirname(process.execPath)].join(';') };
  if (withBin) env.BD_BIN = NPM + '/node_modules/@beads/bd/bin/bd.exe'; else delete env.BD_BIN;
  let out = '';
  const child = spawn(process.execPath, [WT + '/server/index.js'], { cwd: SC + '/proj', env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
  try {
    let page = ''; for (let i = 0; i < 80 && !page; i++) { try { page = await (await fetch(`http://127.0.0.1:${port}/`)).text(); } catch { await new Promise(r => setTimeout(r, 250)); } }
    const token = /name="board-token" content="([0-9a-f]+)"/.exec(page)?.[1]; assert.ok(token, 'token');
    const ws = new WS(`ws://127.0.0.1:${port}/ws?t=${token}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    const reply = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no list answer: ' + out)), 25000);
      ws.on('open', () => { ws.on('message', m => { const j = JSON.parse(String(m)); if (j.type === 'snapshot' || (j.type === 'subscribe-list' && j.ok === false)) { clearTimeout(t); res(j); } });
        ws.send(JSON.stringify({ id: 'r1', type: 'subscribe-list', payload: { id: 'c1', type: 'all-issues' } })); }); ws.on('error', rej); });
    ws.close();
    return { out, reply: JSON.stringify(reply), pid: child.pid };
  } finally { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); }
}

test('B-1 .59.21: no BD_BIN, npm shim first on PATH: finds bd.exe, one log line, serves a list', async () => {
  const r = await serverNoBdBin({ withBin: false });
  fs.writeFileSync(T + '/B1-server-output.txt', r.out);
  const lines = r.out.split(/\r?\n/).filter(l => /bd: using/.test(l));
  assert.equal(lines.length, 1, r.out); assert.match(lines[0], /bd: using .*bd\.exe \((path|package)\)/);
  assert.match(r.reply, /beads-lite-1bo5/);
  console.log('B-1 line:', lines[0]);
});
test('B-2 .59.21: BD_BIN set is used, no lookup line', async () => {
  const r = await serverNoBdBin({ withBin: true }); assert.equal((r.out.match(/bd: using/g) || []).length, 0, r.out); assert.match(r.reply, /beads-lite-1bo5/);
});

test('P-1 .16.1 push log: one line per attempt, no endpoint/keys/error text', async () => {
  const { createPush } = await imp('server/features/push.js');
  const EP = 'https://fcm.googleapis.com/fcm/send/SECRET-endpoint-token-QA5';
  const b64u = b => b.toString('base64url');
  const sub = { endpoint: EP, keys: { p256dh: b64u(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])), auth: b64u(Buffer.alloc(16, 9)) } };
  const home = T + '/pushlog'; fs.mkdirSync(home, { recursive: true });
  let i = 0, t = new Date(2026, 10, 2, 10).getTime();
  const script = [() => ({ statusCode: 201 }), () => { throw Object.assign(new Error('gone ' + EP), { statusCode: 410 }); }, () => { throw Object.assign(new Error('boom ' + EP + ' <script>'), { code: 'ETIMEDOUT' }); }, () => { throw Object.assign(new Error('x'), { code: 'weird label; DROP' }); }];
  const p = createPush({ home, now: () => (t += 180000), lock: () => {}, webpush: { generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }), sendNotification: async () => script[i++]() } });
  p.subscribe(sub, 'phone');
  for (const b of ['a-1', 'a-2', 'a-3', 'a-4']) { p.subscribe(sub, 'phone'); await p.send({ kind: 'decision', project: 'a', bead: b, title: 't', desk: false, count: 1, at: new Date(t).toISOString() }); }
  const raw = fs.readFileSync(home + '/push-log.jsonl', 'utf8'); const ls = raw.trim().split('\n').map(l => JSON.parse(l));
  console.log(ls.length, 'lines:', ls.map(l => l.result).join(','));
  assert.equal(ls.length, 4, 'one line per attempt'); assert.ok(!/SECRET|fcm|p256dh|auth|script|DROP|boom/.test(raw), 'secret in log');
  for (const l of ls) assert.deepEqual(Object.keys(l).sort(), ['at', 'bead', 'kind', 'ms', 'result', 'sub']);
  assert.ok(ls.map(l => String(l.result)).every(r => /^(\d{3}|[A-Za-z_]{1,32})$/.test(r)));
});

const DAY = 864e5; const NOW = Date.now();
function week(dir, name, risks, tOff = 0) { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name);
  fs.writeFileSync(f, `# Flow review ${name}\n\nTitle: Flow ${name}: x\nDone since last: nothing to report\nNext: none\nNeeds you: nothing\nRisks: ${risks}\n`);
  const t = new Date(NOW + tOff); fs.utimesSync(f, t, t); return f; }
test('X-3 .66.7 weekly push: fake sender; one a week; none without findings; none stale; muted flag passed; no digest text', async () => {
  const { pushWeeklyDigest, readDigest } = await imp('server/features/flow.js');
  const calls = []; const fake = (ret = 'sent') => ({ send: async (payload, o) => { calls.push({ payload, o }); return ret; } });
  const run = (dir, state, extra = {}) => pushWeeklyDigest({ dir, state, push: fake(), now: NOW, ...extra });
  const real = SC + '/digest'; const rd = readDigest(real); console.log('real flow-weekly digest on db copies: findings =', rd.findings, rd.file);
  const st0 = T + '/st0.json';
  assert.equal(await run(real, st0), 'no-findings'); assert.equal(calls.length, 0, 'no findings: nothing sent');
  assert.equal(await run(real, st0), 'already');
  const D = T + '/d1'; fs.mkdirSync(D, { recursive: true });
  fs.copyFileSync('E:/Projects/beads-lite-ui/.work/out/beads-lite-1bo5.6.66.7/qa/data/digest/2026-W46.md', D + '/2026-W46.md');
  assert.equal(readDigest(D).findings, true);
  const st = T + '/st1.json';
  assert.equal(await run(D, st), 'sent'); assert.equal(calls.length, 1);
  const pl = calls[0].payload; const js = JSON.stringify(pl);
  assert.equal(pl.kind, 'flow'); assert.ok(!/Risks|swe bug|median|faster/.test(js), 'payload carries no digest text: ' + js);
  assert.equal(await run(D, st), 'already'); assert.equal(calls.length, 1, 'repeat trigger sends none');
  week(D, '2026-W47.md', 'swe task: slower (+20%)', 1000);
  assert.equal(await run(D, st), 'week-cap'); assert.equal(calls.length, 1, 'second file inside 6 days sends none');
  week(D, '2026-W48.md', 'sre task: slower (+30%)', 7 * DAY);
  assert.equal(await pushWeeklyDigest({ dir: D, state: st, push: fake(), now: NOW + 7 * DAY + 1000 }), 'sent'); assert.equal(calls.length, 2, 'next week sends one more');
  // stale: file older than 8 days
  const D2 = T + '/d2'; week(D2, '2026-W40.md', 'swe: bad', -9 * DAY);
  assert.equal(await run(D2, T + '/st2.json'), 'stale'); assert.equal(calls.length, 2);
  // muted flag passed through, refusal leaves file unmarked (retry later)
  const D3 = T + '/d3'; week(D3, '2026-W49.md', 'swe: bad'); const st3 = T + '/st3.json';
  assert.equal(await pushWeeklyDigest({ dir: D3, state: st3, push: fake('muted'), now: NOW, muted: true }), 'muted'); assert.equal(calls.at(-1).o.muted, true);
  assert.equal(await pushWeeklyDigest({ dir: D3, state: st3, push: fake('sent'), now: NOW, muted: false }), 'sent', 'a refusal leaves the file unmarked so a later run retries');
  // no file at all
  assert.equal(await run(T + '/empty', T + '/st4.json'), 'no-file');
});

test('X-4 .66.7 sw.js: push kind flow gets its own words (en, ar) and opens #/time', async () => {
  const src = fs.readFileSync(WT + '/app/sw.js', 'utf8').replace(/__SW_SHELL__/g, '[]');
  for (const lang of ['en-US', 'ar-EG']) {
    const shown = []; const handlers = {};
    const self = { navigator: { language: lang }, location: { origin: 'https://x.test' }, registration: { showNotification: (t, o) => { shown.push({ t, o }); return Promise.resolve(); } }, addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting() {}, clients: { claim() {}, matchAll: () => Promise.resolve([]), openWindow() {} } };
    vm.runInNewContext(src, { self, caches: {}, fetch() {}, URL, console, Promise });
    const run = (p) => handlers.push({ data: { json: () => p }, waitUntil() {} });
    run({ kind: 'flow', project: 'flow', bead: null, title: null, count: 1, at: 'x' });
    run({ kind: 'weird-new-kind', project: 'p', bead: null, title: null, count: 1, at: 'x' });
    console.log(lang, JSON.stringify(shown.map(s => [s.t, s.o.body, s.o.data.url])));
    assert.match(shown[0].o.body, lang.startsWith('ar') ? /مراجعة التدفق/ : /Weekly flow review/); assert.equal(shown[0].o.data.url, '/#/time');
    assert.match(shown[1].o.body, lang.startsWith('ar') ? /المزيد/ : /More on the board/); assert.equal(shown[1].o.data.url, '/#/decisions');
  }
});
