// QA (company-1bo5.6.6): real browser (chrome-headless-shell, 390x844) -> proxy that mimics `tailscale serve`
// (adds Host + Tailscale-User-Login, rewrites Origin to https) -> REAL board phone door on spare ports,
// temp HOME, temp COPY workspaces. Checks the report sheet's project picker and files a report with a screenshot.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const WT = 'E:/Projects/beads-lite-ui-wt-qa-company-1bo5-6-6';
const SC = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const WS = createRequire(WT + '/package.json')('ws');
const RUN = path.join(SC, 'brun-' + Date.now());
const HOME = path.join(RUN, 'home');
const ATT = path.join(RUN, 'att');
const PROJS = ['pqone', 'pqtwo', 'pqthree'].map((n) => path.join(RUN, n));
const PC = 3961, PH = 3962, PX = 3963, CDP = 3964;
const TS = 'abdelrahman.tail8a4e50.ts.net';
const OWNER = 'owner@example.com';
const BDX = 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe';
const CHROME = 'C:/Users/abduu/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const pids = [];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(id, name, ok, detail = '') { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' :: ' + detail : ''}`); }
function bd(cwd, args) { const r = spawnSync(BDX, args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: 'qa' } }); return (r.stdout || '') + (r.stderr || ''); }
async function waitPort(port, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const ok = await new Promise((res) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); }); if (ok) return true; await sleep(250); } return false; }
function kill(pid) { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); }

function png64() {
  const W = 64, H = 64, rows = [];
  for (let y = 0; y < H; y++) { const row = Buffer.alloc(1 + W * 3); for (let x = 0; x < W; x++) { row[1 + x * 3] = (x * 4) & 255; row[2 + x * 3] = (y * 4) & 255; row[3 + x * 3] = 128; } rows.push(row); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// proxy that behaves like `tailscale serve`: injects identity + Host, https Origin, and handles ws upgrade
function startProxy() {
  const hdrs = (h) => { const o = { ...h, host: TS, 'tailscale-user-login': OWNER }; if (o.origin) o.origin = `https://${TS}`; return o; };
  const srv = http.createServer((req, res) => {
    const up = http.request({ host: '127.0.0.1', port: PH, method: req.method, path: req.url, headers: hdrs(req.headers), setHost: false }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  srv.on('upgrade', (req, sock, head) => {
    const up = net.connect(PH, '127.0.0.1', () => {
      const h = hdrs(req.headers);
      let s = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(h)) s += `${k}: ${v}\r\n`;
      up.write(s + '\r\n'); if (head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  srv.listen(PX, '127.0.0.1');
  return srv;
}

async function cdpConnect() {
  const list = await new Promise((res) => http.get({ host: '127.0.0.1', port: CDP, path: '/json' }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res(JSON.parse(b))); }));
  const page = list.find((t) => t.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const wait = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else events.push(m); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, events, ws };
}
const ev = async (c, expr) => { const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };

async function main() {
  fs.mkdirSync(HOME + '/.bdui', { recursive: true }); fs.mkdirSync(ATT, { recursive: true });
  fs.writeFileSync(path.join(HOME, '.bdui', 'phone.json'), JSON.stringify({ owner_login: OWNER }));
  for (const p of PROJS) { fs.mkdirSync(p, { recursive: true }); spawnSync('git', ['init', '-q', '.'], { cwd: p, windowsHide: true }); bd(p, ['init', '--prefix', path.basename(p), '--quiet']); }
  const env = { ...process.env }; for (const k of ['BDUI_OWNER_LOGIN', 'BDUI_PHONE_CONFIG', 'BDUI_ALLOWED_HOSTS']) delete env[k];
  Object.assign(env, { USERPROFILE: HOME, HOME, PORT: String(PC), PHONE_PORT: String(PH), BDUI_ATTACH_ROOT: ATT, BD_BIN: BDX, BDUI_WAKE_BIN: path.join(SC, 'wake-stub.mjs'), BD_ACTOR: 'qa' });
  const logf = fs.openSync(path.join(RUN, 'server.log'), 'a');
  const srv = spawn(process.execPath, [WT + '/server/index.js'], { cwd: PROJS[0], env, windowsHide: true, stdio: ['ignore', logf, logf] }); pids.push(srv.pid);
  rec('B00', 'board up on spare ports', (await waitPort(PC)) && (await waitPort(PH)));
  // register the other two COPY workspaces through the PC door only
  for (const p of PROJS.slice(1)) {
    const r = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: PC, method: 'POST', path: '/api/register-workspace', headers: { 'Content-Type': 'application/json', Host: `127.0.0.1:${PC}`, Origin: `http://127.0.0.1:${PC}` } }, (x) => { x.resume(); res(x.statusCode); }); q.on('error', () => res(0)); q.end(JSON.stringify({ path: p, database: path.join(p, '.beads') })); });
    console.log('INFO register', path.basename(p), '->', r);
  }
  const proxy = startProxy();
  const prof = path.join(RUN, 'chrome-profile');
  const ch = spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${prof}`, '--no-sandbox', '--window-size=390,844', 'about:blank'], { windowsHide: true, stdio: 'ignore' }); pids.push(ch.pid);
  rec('B01', 'headless chrome up', await waitPort(CDP));
  const c = await cdpConnect();
  await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('DOM.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await c.send('Network.enable');
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PX}/` });
  await sleep(3500);
  const title = await ev(c, 'document.title');
  rec('B02', 'board page loads through the phone door', !!title, 'title=' + title);
  await ev(c, "location.hash = '#/report'");
  await sleep(2500);
  const opts = await ev(c, "JSON.stringify([...document.querySelectorAll('#rpt-project option')].map(o => ({v:o.value, t:o.textContent})))");
  console.log('INFO picker options:', opts);
  const arr = JSON.parse(opts || '[]');
  rec('B10', 'report sheet picker lists the projects (not "No projects found")', arr.length >= 3 && ['pqone', 'pqtwo', 'pqthree'].every((k) => arr.some((o) => o.v === k)) && !arr.some((o) => o.v === ''), opts);
  const sheetText = await ev(c, "document.querySelector('.rpt')?.innerText || ''");
  rec('B11', 'sheet text has no "No projects found"', !/no projects found|لا توجد مشاريع/i.test(sheetText), sheetText.replace(/\s+/g, ' ').slice(0, 160));
  const domHtml = await ev(c, 'document.documentElement.outerHTML');
  rec('B12', 'no absolute local path rendered in page DOM', !/[A-Za-z]:[\\/]/.test(sheetText) && !domHtml.includes(RUN.replace(/\//g, '\\')), 'sheetMatch=' + (/[A-Za-z]:[\\/]/.exec(sheetText) || [''])[0] + ' domHasRun=' + domHtml.includes(RUN.replace(/\//g, '\\')) + ' domPathLike=' + ((domHtml.match(/.{20}[A-Za-z]:[\\/].{30}/) || [''])[0]));
  let shot = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SC, 'shot-picker.png'), Buffer.from(shot.result.data, 'base64'));
  // fill + screenshot attach + send into pqtwo (a COPY)
  await ev(c, "(()=>{const s=document.querySelector('#rpt-project'); s.value='pqtwo'; s.dispatchEvent(new Event('change',{bubbles:true}));const v=document.querySelector('#rpt-version'); v.value='9.9.9'; v.dispatchEvent(new Event('input',{bubbles:true})); const t=document.querySelector('#rpt-text'); t.value='QA picker report BTN-HIDDEN'; t.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const pngFile = path.join(RUN, 'shot.png'); fs.writeFileSync(pngFile, png64());
  const doc = await c.send('DOM.getDocument', { depth: -1 });
  const q = await c.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input.rpt-file' });
  await c.send('DOM.setFileInputFiles', { files: [pngFile], nodeId: q.result.nodeId });
  await sleep(2000);
  const hasThumb = await ev(c, "!!document.querySelector('.rpt-media img, .rpt-media canvas')");
  rec('B20', 'screenshot attached in the sheet', hasThumb === true);
  await ev(c, "document.querySelector('.rpt-send').click()");
  await sleep(6000);
  const msg = await ev(c, "document.querySelector('.rpt-msg')?.innerText || ''");
  console.log('INFO msg after send:', JSON.stringify(msg), 'sheet open:', await ev(c, '!!document.querySelector(".rpt")'));
  shot = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SC, 'shot-after-send.png'), Buffer.from(shot.result.data, 'base64'));
  const listed = bd(PROJS[1], ['list', '--json', '--all']);
  const hit = /QA picker report BTN-HIDDEN/.test(listed);
  rec('B21', 'report bead exists in the chosen COPY workspace (pqtwo)', hit, hit ? '' : listed.slice(0, 200));
  const other = bd(PROJS[0], ['list', '--json', '--all']) + bd(PROJS[2], ['list', '--json', '--all']);
  rec('B22', 'report did not land in the other workspaces', !/QA picker report/.test(other));
  const withShot = /\/att\/pqtwo\//.test(listed);
  rec('B23', 'report bead has Screenshot link', withShot);
  const attFiles = fs.existsSync(ATT) ? fs.readdirSync(ATT, { recursive: true }).filter((f) => /\.(png|jpe?g|webp)$/i.test(String(f))) : [];
  rec('B24', 'screenshot stored under the temp attach root', attFiles.length >= 1, attFiles.join());
  // direct fetch from the page (phone origin), record response shape
  const wsRes = await ev(c, "fetch('/api/workspaces').then(async r => r.status + ' ' + (await r.text()))");
  console.log('INFO page fetch /api/workspaces:', wsRes);
  const regRes = await ev(c, "fetch('/api/register-workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'C:/Windows'})}).then(r=>r.status)");
  rec('B30', 'register-workspace from the phone page still refused', regRes === 404 || regRes === 403, String(regRes));
  c.ws.close(); proxy.close();
}
try { await main(); } catch (e) { console.log('SCRIPT ERROR', e); }
finally {
  for (const pid of pids) kill(pid);
  const f = results.filter((r) => !r.ok);
  console.log(`\nTOTAL ${results.length}, FAIL ${f.length}`);
  process.exit(0);
}
