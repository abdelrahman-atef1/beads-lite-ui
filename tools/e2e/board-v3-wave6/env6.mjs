// QA wave 6 env: servers on free ports (never 3000/3001), db copies, phone-door proxy. Writes env.json. Run in background; stop by PID.
// srv "new" = 87edf2d tree (WT); srv "base" = 7f4806d-equivalent tree (BASE_WT) with its own db copy.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import net from 'node:net'; import http from 'node:http';
import { WT, BASE_WT, SC, BD } from './paths.mjs';
const free = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const TN = 'abdelrahman.tail8a4e50.ts.net';
async function start(tag, tree, withPhone) {
  const pc = await free(), ph = withPhone ? await free() : 0;
  for (const p of [pc, ph]) if (p === 3000 || p === 3001) throw new Error('bad port');
  const proj = `${SC}/proj-${tag}`; fs.mkdirSync(proj, { recursive: true });
  if (!fs.existsSync(proj + '/.beads')) fs.cpSync(SC + '/proj/.beads', proj + '/.beads', { recursive: true });
  fs.mkdirSync(`${SC}/home-${tag}`, { recursive: true });
  const env = { ...process.env, PORT: String(pc), PHONE_PORT: withPhone ? String(ph) : 'off', BD_ACTOR: 'qa', BD_BIN: BD,
    BDUI_OWNER_LOGIN: 'qa-owner@example.test', BDUI_BOARD_HOME: `${SC}/home-${tag}/board`, BDUI_PHONE_CONFIG: `${SC}/home-${tag}/phone.json`, BDUI_ATTACH_ROOT: `${SC}/home-${tag}/attach`,
    BDUI_WAKE_BIN: SC + '/nowake.mjs', FLOW_HOME: `${SC}/home-${tag}/flow`, FLOW_DIGEST_DIR: `${SC}/home-${tag}/digest`, WAKE_ROOT: `${SC}/home-${tag}/wake`, BDUI_FLOW_PUSH: '0' };
  fs.mkdirSync(env.BDUI_BOARD_HOME, { recursive: true });
  const srv = spawn(process.execPath, [tree + '/server/index.js'], { cwd: proj, env, stdio: ['ignore', fs.openSync(`${SC}/server-${tag}.log`, 'w'), fs.openSync(`${SC}/server-${tag}.err`, 'w')], windowsHide: true });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${pc}/`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  return { pc, ph, server_pid: srv.pid, proj };
}
const N = await start('new', WT, true);
const B = await start('base', BASE_WT, true);
const hdr = (h) => ({ ...h, host: TN, 'tailscale-user-login': 'qa-owner@example.test', ...(h.origin ? { origin: 'https://' + TN } : {}) });
async function proxy(ph) {
  const px = await free();
  const p = http.createServer((req, res) => {
    const u = http.request({ host: '127.0.0.1', port: ph, path: req.url, method: req.method, headers: hdr(req.headers) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    u.on('error', () => { res.statusCode = 502; res.end(); }); req.pipe(u);
  });
  p.on('upgrade', (req, sock, head) => {
    const up = net.connect(ph, '127.0.0.1', () => { const h = hdr(req.headers); up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  p.listen(px, '127.0.0.1'); return px;
}
N.px = await proxy(N.ph); B.px = await proxy(B.ph);
fs.writeFileSync(SC + '/env.json', JSON.stringify({ new: N, base: B, env_pid: process.pid }));
console.log('ready', JSON.stringify({ new: N, base: B }));
setInterval(() => {}, 1e6);
