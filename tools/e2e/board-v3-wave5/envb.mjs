import { spawn } from 'node:child_process'; import fs from 'node:fs'; import net from 'node:net';
const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21'; const SC = WT + '/.work/scratch/qa5';
const free = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const pb = await free(); if (pb === 3000 || pb === 3001) throw new Error('bad port');
fs.mkdirSync(SC + '/board-homeB', { recursive: true });
const env = { ...process.env, PORT: String(pb), PHONE_PORT: 'off', BD_ACTOR: 'qa', BD_BIN: 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe',
  BDUI_BOARD_HOME: SC + '/board-homeB', FLOW_HOME: SC + '/flowB', FLOW_DIGEST_DIR: SC + '/digestB', WAKE_ROOT: SC + '/wakeB', BDUI_FLOW_PUSH: '0', BDUI_OWNER_LOGIN: 'qa-owner@example.test' };
const srv = spawn(process.execPath, [WT + '/server/index.js'], { cwd: SC + '/proj', env, stdio: ['ignore', fs.openSync(SC + '/serverB.log', 'w'), fs.openSync(SC + '/serverB.err', 'w')], windowsHide: true });
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${pb}/`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
fs.writeFileSync(SC + '/envb.json', JSON.stringify({ pb, server_pid: srv.pid, env_pid: process.pid }));
console.log('ready', pb); setInterval(() => {}, 1e6);
