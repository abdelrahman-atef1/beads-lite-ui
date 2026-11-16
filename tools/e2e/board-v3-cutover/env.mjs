// QA wave 6 cutover env: ONE server started like start-beads-ui.sh (no BD_BIN) from the installed build, on free ports (never 3000/3001),
// scratch copies of three stores, phone-door proxy with the tailnet Host + owner login header. Writes env.json. Stop it by the recorded PID (stop.mjs).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { SC, OUT, BD, UPSTREAM, HOMEC, STORES, TN } from './paths.mjs';

const NL = String.fromCharCode(10);
const free = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const bd = (store, args) => spawnSync(BD, args, { cwd: `${SC}/stores/${store}`, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: 'qa', BD_LITE_UPSTREAM: UPSTREAM } });
fs.mkdirSync(OUT, { recursive: true });
const HOME = SC + '/home';
const ATTACH = 'I:/Claude Files/cache/qa-board-cutover-59-17/attach';
fs.rmSync(HOME, { recursive: true, force: true });
fs.rmSync(ATTACH, { recursive: true, force: true });
fs.mkdirSync(ATTACH, { recursive: true });
for (const d of ['board', 'wake', 'attach', 'flow', 'digest', '.codesters/cards']) fs.mkdirSync(`${HOME}/${d}`, { recursive: true });

// scratch copies of three stores (db + config only), maintainer role, no planning route
fs.rmSync(SC + '/stores', { recursive: true, force: true });
for (const s of STORES) {
  const d = SC + '/stores/' + s;
  fs.mkdirSync(d + '/.beads', { recursive: true });
  for (const f of ['beads.db', 'config.yaml', 'metadata.json']) { try { fs.copyFileSync('E:/Projects/' + s + '/.beads/' + f, d + '/.beads/' + f); } catch { /* none */ } }
  const cfg = d + '/.beads/config.yaml';
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').split(NL).filter((l) => !/additional:|beads-planning/.test(l)).join(NL));
  for (const g of [['init', '-q', '.'], ['config', 'beads.role', 'maintainer'], ['config', 'user.email', 'qa@example.test'], ['config', 'user.name', 'qa']]) spawnSync('git', g, { cwd: d, windowsHide: true });
}
// real flow rollup copied (read only) so Stats and Time have numbers
const REALFLOW = 'C:/Users/abduu/.codesters/flow';
for (const f of ['rollup.json', 'tokens.json']) { try { fs.copyFileSync(`${REALFLOW}/${f}`, `${HOME}/flow/${f}`); } catch { /* none */ } }
// png helper
const crc = (b) => { let c; const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const png = (w, h, rgb) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2] ^ (x > w / 2 ? 90 : 0); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const month = new Date().toISOString().slice(0, 7);
const attNames = ['aaaaaaaaaaaaaaa1.png', 'aaaaaaaaaaaaaaa2.png'];
fs.mkdirSync(`${ATTACH}/beads-lite/${month}`, { recursive: true });
fs.writeFileSync(`${ATTACH}/beads-lite/${month}/${attNames[0]}`, png(640, 360, [200, 60, 60]));
fs.writeFileSync(`${ATTACH}/beads-lite/${month}/${attNames[1]}`, png(360, 640, [40, 120, 200]));
// push: one subscription with a structurally valid but not-on-curve key, so web-push fails locally (no outbound traffic) and the board still logs the attempt
const b64u = (b) => b.toString('base64url');
fs.writeFileSync(`${HOME}/board/push-subs.json`, JSON.stringify([{ endpoint: 'https://fcm.googleapis.com/fcm/send/QA-LOCAL-ONLY-endpoint-token', keys: { p256dh: b64u(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])), auth: b64u(Buffer.alloc(16, 9)) }, at: new Date().toISOString(), label: 'qa phone' }]));
// ---- seed beads
const idOf = (r) => r.stdout.split(/\s+/).filter((x) => /^[a-z0-9]+(-[a-z0-9]+)+(\.[0-9]+)*$/i.test(x)).pop();
const seed = {};
// real card tool (card.mjs post): ASK comment + card metadata + stored attachments, exactly what an agent does. Config and attach root are scratch.
fs.writeFileSync(HOME + '/.codesters/cards/config.json', JSON.stringify({ owner: 'abdelrahman', repos: STORES.map((n) => ({ name: n, path: SC + '/stores/' + n })) }));
const cardEnv = { ...process.env, USERPROFILE: HOME, BDUI_ATTACH_ROOT: ATTACH, BD_BIN: BD, BD_ACTOR: 'qa', BD_LITE_UPSTREAM: UPSTREAM };
const png1 = SC + '/att-wide.png';
const png2 = SC + '/att-tall.png';
fs.writeFileSync(png1, png(640, 360, [200, 60, 60]));
fs.writeFileSync(png2, png(360, 640, [40, 120, 200]));
const post = (title, extra = {}, store = 'beads-lite') => {
  const r = bd(store, ['create', title, '-t', 'task', '-a', 'swe', '--silent']);
  const id = idOf(r);
  const input = { repo: store, bead: id, by: 'swe', class: 'tap', q: 'Which colour for the logo?', effect: 'Changes the logo colour.', blocks: 'nothing', opts: [{ l: 'Red' }, { l: 'Blue', rec: true }], show: 'Red or blue.', title, ...extra };
  const res = spawnSync(process.execPath, ['E:/Projects/learner/scripts/cards/card.mjs', 'post'], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, env: cardEnv });
  seed['post_' + id] = (res.stdout || res.stderr || '').trim().slice(0, 160);
  return id;
};
seed.q_pc = post('QA6 card pc answer');
seed.q_phone = post('QA6 card phone-door answer');
seed.q_stale = post('QA6 card stale and double');
seed.q_offline = post('QA6 card offline answer');
seed.q_type = post('QA6 typed answer card', { class: 'type', opts: [{ l: 'Name it' }], q: 'What should the project be called?' });
seed.q_att = post('QA6 card with attachments', { thing: true, att: [{ file: png1, n: 'Wide shot' }, { file: png2, n: 'Tall shot', h: 'https://' + TN + '/#/issues?issue=beads-lite-1' }] });
// a card whose att list holds items outside the allowed shape, written straight into metadata: the card tool refuses it, the board must never draw it either way
seed.q_badatt = (() => { const r = bd('beads-lite', ['create', 'QA6 card with bad attachments', '-t', 'task', '-a', 'abdelrahman', '--metadata', JSON.stringify({ card_class: 'tap', card_back: 'swe', card_lang: 'en', card_q: 'Bad att?', card_effect: 'x', card_blocks: 'x', card_opts: '[{"l":"A"},{"l":"B"}]', card_thing: 'true', card_att: JSON.stringify([{ a: 'https://evil.example/x.png', n: 'outside' }, { a: '../../etc/passwd.png' }]) }), '--silent']); const id = idOf(r); bd('beads-lite', ['update', id, '--status', 'owner_decision']); return id; })();
const t = bd('beads-lite', ['create', 'QA6 plain task for links', '-t', 'task', '-p', '2', '--description', 'Plain description line.', '--design', 'Design section text.', '--notes', 'Notes section text.', '--acceptance', 'Acceptance text.', '--silent']);
seed.plain = idOf(t);
for (const n of [1, 2, 3]) bd('beads-lite', ['comments', 'add', seed.plain, `QA6 comment number ${n}`]);
// releases: a build with a real file (download) and a deploy with a link, through the company outputs tool
fs.mkdirSync(`${SC}/stores/beads-lite/.work/out/qa6`, { recursive: true });
const apk = Buffer.concat([Buffer.from('PK\x03\x04QA6-FAKE-APK'), Buffer.alloc(4096, 65)]);
fs.writeFileSync(`${SC}/stores/beads-lite/.work/out/qa6/qa6-test.apk`, apk);
const outp = (args) => spawnSync(process.execPath, [`${HOMEC}/scripts/outputs/output.mjs`, ...args], { cwd: `${SC}/stores/beads-lite`, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_BIN: BD, BD_ACTOR: 'qa', BD_LITE_UPSTREAM: UPSTREAM } });
const o1 = outp(['add', seed.plain, '--kind', 'build', '--ref', '.work/out/qa6/qa6-test.apk', '--label', 'QA6 test apk', '--commit', 'c1627f6']);
const o2 = outp(['add', seed.plain, '--kind', 'deploy', '--ref', `https://${TN}/`, '--label', 'QA6 board deploy', '--commit', 'c1627f6']);
seed.out = [(o1.stdout + o1.stderr).slice(0, 200), (o2.stdout + o2.stderr).slice(0, 200)];
seed.apk_bytes = apk.length;
seed.apk_sha = crypto.createHash('sha256').update(apk).digest('hex');
// ---- server (production way: installed build, no BD_BIN, cwd = first store copy)
const pc = await free();
const ph = await free();
const env = { ...process.env, PORT: String(pc), PHONE_PORT: String(ph), BD_ACTOR: 'qa', BD_LITE_UPSTREAM: UPSTREAM, CARDS_DIR: 'E:/Projects/learner/scripts/cards', BDUI_BD_CONCURRENCY: '4',
  USERPROFILE: HOME, HOME, BDUI_OWNER_LOGIN: 'qa-owner@example.test', BDUI_BOARD_HOME: `${HOME}/board`, BDUI_ATTACH_ROOT: `${ATTACH}`, WAKE_ROOT: `${HOME}/wake`, WAKE_ROUTER_OFF: '1',
  BDUI_WAKE_BIN: `${HOMEC}/scripts/wake/wake.mjs`, OUTPUTS_DIR: `${HOMEC}/scripts/outputs`, FLOW_HOME: `${HOME}/flow`, FLOW_DIGEST_DIR: `${HOME}/digest`, BDUI_FLOW_PUSH: '0' };
delete env.BD_BIN;
const srv = spawn(process.execPath, [`${SC}/inst/server/index.js`, '--host', '127.0.0.1', '--port', String(pc)], { cwd: `${SC}/stores/beads-lite`, env, stdio: ['ignore', fs.openSync(`${SC}/server.log`, 'w'), fs.openSync(`${SC}/server.err`, 'w')], windowsHide: true });
for (let i = 0; i < 240; i++) { try { const r = await fetch(`http://127.0.0.1:${pc}/api/workspaces`); if (r.ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
for (const s of STORES) {
  const p = `${SC}/stores/${s}`;
  const r = await fetch(`http://127.0.0.1:${pc}/api/register-workspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: p, database: p + '/.beads' }) });
  seed['reg_' + s] = r.status;
}
// phone-door proxy
const hdr = (h) => ({ ...h, host: TN, 'tailscale-user-login': 'qa-owner@example.test', ...(h.origin ? { origin: 'https://' + TN } : {}) });
const px = await free();
const p = http.createServer((req, res) => {
  const u = http.request({ host: '127.0.0.1', port: ph, path: req.url, method: req.method, headers: hdr(req.headers) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  u.on('error', () => { res.statusCode = 502; res.end(); });
  req.pipe(u);
});
p.on('upgrade', (req, sock, head) => {
  const up = net.connect(ph, '127.0.0.1', () => { const h = hdr(req.headers); up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head); up.pipe(sock); sock.pipe(up); });
  up.on('error', () => sock.destroy());
  sock.on('error', () => up.destroy());
});
p.listen(px, '127.0.0.1');
fs.writeFileSync(SC + '/env.json', JSON.stringify({ attach: ATTACH, pc, ph, px, server_pid: srv.pid, env_pid: process.pid, seed, home: HOME }));
console.log('ready', JSON.stringify({ pc, ph, px, server_pid: srv.pid, seed }));
setInterval(() => {}, 1e6);
