// QA env: board server (PC door), phone door, and a tailscale-serve-like proxy. Writes env.json. Run in background; kill its PID tree.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import net from 'node:net'; import http from 'node:http'; import path from 'node:path';
const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21';
const SC = WT + '/.work/scratch/qa5';
const proj = WT + '/.work/scratch/qa5/proj';
const free = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const [pc, ph, px] = [await free(), await free(), await free()];
for (const p of [pc, ph, px]) if (p === 3000 || p === 3001) throw new Error('bad port');
const TN = 'abdelrahman.tail8a4e50.ts.net';
const env = { ...process.env, PORT: String(pc), PHONE_PORT: String(ph), BD_ACTOR: 'qa',
  BD_BIN: 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe',
  BDUI_OWNER_LOGIN: 'qa-owner@example.test', BDUI_BOARD_HOME: SC + '/board-home',
  BDUI_PHONE_CONFIG: SC + '/phone.json', BDUI_ATTACH_ROOT: SC + '/attach', BDUI_WAKE_BIN: SC + '/nowake.mjs', FLOW_HOME: SC + '/flow', FLOW_DIGEST_DIR: SC + '/digest', WAKE_ROOT: SC + '/wake', MENTION_WAKE_SCRIPT: SC + '/wakestub.mjs', BDUI_FLOW_PUSH: '0' };
fs.mkdirSync(SC + '/board-home', { recursive: true });
const srv = spawn(process.execPath, [WT + '/server/index.js'], { cwd: proj, env, stdio: ['ignore', fs.openSync(SC + '/server.log', 'w'), fs.openSync(SC + '/server.err', 'w')], windowsHide: true });
// proxy: rewrites Host/Origin/identity like `tailscale serve`
const hdr = (h) => ({ ...h, host: TN, 'tailscale-user-login': 'qa-owner@example.test', ...(h.origin ? { origin: 'https://' + TN } : {}) });
const proxy = http.createServer((req, res) => {
  const u = http.request({ host: '127.0.0.1', port: ph, path: req.url, method: req.method, headers: hdr(req.headers) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  u.on('error', () => { res.statusCode = 502; res.end(); }); req.pipe(u);
});
proxy.on('upgrade', (req, sock, head) => {
  const up = net.connect(ph, '127.0.0.1', () => {
    const h = hdr(req.headers);
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head);
    up.pipe(sock); sock.pipe(up);
  });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
});
proxy.listen(px, '127.0.0.1');
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${pc}/`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
fs.writeFileSync(SC + '/env.json', JSON.stringify({ pc, ph, px, server_pid: srv.pid, env_pid: process.pid, proj }));
console.log('ready', pc, ph, px);
setInterval(() => {}, 1e6);
