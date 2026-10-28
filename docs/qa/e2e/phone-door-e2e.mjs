// QA e2e for the phone door (company-1bo5.6.5, re-run for 1bo5.6.6). Real board process, spare ports, temp home.
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
const RUN = path.join(SC, 'run-' + Date.now());
const PROJ = path.join(RUN, 'pq');
fs.mkdirSync(PROJ, { recursive: true });
const HOME = path.join(RUN, 'home');
const ATT = path.join(RUN, 'att');
const PC = 3957;
const PH = 3958;
const TS = 'abdelrahman.tail8a4e50.ts.net';
const OWNER = 'owner@example.com';
const results = [];
const pids = [];

function rec(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BDX = 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe';
function bd(args, actor = 'qa') {
  const r = spawnSync('C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe', args, { cwd: PROJ, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: actor } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
}
function bdJson(args) {
  const r = bd([...args, '--json']);
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function startServer(extraEnv = {}, ports = { PORT: PC, PHONE_PORT: PH }) {
  fs.mkdirSync(HOME, { recursive: true });
  const logf = fs.openSync(path.join(SC, `server-${Date.now()}.log`), 'a');
  const env = { ...process.env };
  for (const k of ['BDUI_OWNER_LOGIN', 'BDUI_PHONE_CONFIG', 'BDUI_ALLOWED_HOSTS']) delete env[k];
  Object.assign(env, {
    USERPROFILE: HOME, HOME, PORT: String(ports.PORT), PHONE_PORT: String(ports.PHONE_PORT),
    BDUI_ATTACH_ROOT: ATT, BD_BIN: 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe', BDUI_WAKE_BIN: path.join(SC, 'wake-stub.mjs'), BD_ACTOR: 'qa'
  }, extraEnv);
  const child = spawn(process.execPath, [WT + '/server/index.js'], { cwd: PROJ, env, windowsHide: true, stdio: ['ignore', logf, logf] });
  pids.push(child.pid);
  return child;
}
function stop(child) {
  if (!child || child.exitCode !== null) return;
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
}
async function waitPort(port, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await new Promise((res) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
    if (ok) return true;
    await sleep(250);
  }
  return false;
}

function req(port, method, p, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers, setHost: false, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0) }));
    if (body) r.write(body);
    r.end();
  });
}
const phoneH = (extra = {}) => ({ Host: TS, 'Tailscale-User-Login': OWNER, ...extra });
const pcH = (extra = {}) => ({ Host: `127.0.0.1:${PC}`, ...extra });
// raw socket request, lets us send a repeated header
function raw(port, lines) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    s.on('data', (d) => (buf += d));
    s.on('close', () => resolve(buf));
    s.on('error', () => resolve(buf));
    s.write(lines.join('\r\n') + '\r\n\r\n');
    setTimeout(() => s.destroy(), 1500);
  });
}
const tokenOf = (html) => /name="board-token" content="([0-9a-f]+)"/.exec(html)?.[1];

function wsOpen(port, token, headers) {
  return new Promise((resolve) => {
    const w = new WS(`ws://127.0.0.1:${port}/ws?t=${token}`, { headers });
    const frames = [];
    w.frames = frames;
    w.on('message', (d) => { try { frames.push(JSON.parse(d.toString())); } catch { frames.push({ raw: d.toString() }); } });
    w.on('open', () => resolve({ ok: true, w }));
    w.on('unexpected-response', (_q, res) => resolve({ ok: false, status: res.statusCode }));
    w.on('error', () => resolve({ ok: false, status: 'error' }));
  });
}
let seq = 0;
async function call(w, type, payload, ms = 70000) {
  const id = `q${++seq}`;
  w.send(JSON.stringify({ id, type, payload }));
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = w.frames.find((x) => x.id === id && (x.ok !== undefined));
    if (f) return f;
    await sleep(40);
  }
  return null;
}
const allText = (w) => JSON.stringify(w.frames);
const png = () => {
  const crc = (buf) => { let c, crcv = 0xffffffff; for (const b of buf) { c = (crcv ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcv = (crcv >>> 8) ^ c; } return (crcv ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0, 0, 0, 0].slice(0, 14)); // 2 rows * (1 + 6) = 14
  const idat = zlib.deflateSync(Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, Math.floor(Math.random() * 256)]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0SECRETEXIF')), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
};
function reportBody(meta, img) {
  const m = Buffer.from(JSON.stringify(meta));
  const l = Buffer.alloc(4); l.writeUInt32BE(m.length);
  return Buffer.concat([l, m, img || Buffer.alloc(0)]);
}
const reportH = (token, extra = {}) => phoneH({ Origin: `https://${TS}`, 'X-Bdui-Report': '1', 'X-Board-Token': token, 'Content-Type': 'application/x-bdui-report', ...extra });

const ids = {};
function setup() {
  spawnSync('git', ['init', '-q', '.'], { cwd: PROJ, windowsHide: true });
  const i = bd(['init', '--prefix', 'qa', '--quiet']);
  console.log('INFO init', i.code);
  const mk = (title, extra, actor = 'qa') => { const r = spawnSync(BDX, ['create', title, '--json', ...extra], { cwd: PROJ, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: actor } }); return JSON.parse(r.stdout).id; };
  ids.normal = mk('NORMAL open task SECRETNORMAL', ['-d', 'normal body visible', '-p', '2']);
  ids.sec = mk('DESK security SECRETDESK1', ['-d', 'desk body SECRETDESKBODY1', '-p', '1', '-l', 'security']);
  ids.card = mk('DESK cardclass SECRETDESK2', ['-d', 'SECRETDESKBODY2', '-p', '1', '--metadata', '{"card_class":"desk"}']);
  ids.seccr = mk('SEC created SECRETDESK3', ['-d', 'SECRETDESKBODY3'], 'sec');
  ids.legal = mk('LEGAL assigned SECRETDESK4', ['-d', 'SECRETDESKBODY4', '-a', 'legal']);
  bd(['dep', 'add', ids.normal, ids.sec]);
  bd(['comments', 'add', ids.sec, 'SECRETCOMMENT desk']);
  bd(['comments', 'add', ids.normal, 'normal comment visible']);
  console.log('INFO ids', JSON.stringify(ids));
}
const SECRETS = ['SECRETDESK', 'SECRETCOMMENT', 'SECRETEDIT'];
const leak = (w) => SECRETS.filter((s) => allText(w).includes(s));

async function main() {
  setup();
  fs.mkdirSync(HOME + '/.bdui', { recursive: true });
  fs.writeFileSync(path.join(HOME, '.bdui', 'phone.json'), JSON.stringify({ owner_login: OWNER }));
  fs.writeFileSync(path.join(SC, 'wake-stub.mjs'), 'process.exit(0)\n');
  fs.mkdirSync(ATT, { recursive: true });

  const srv = startServer();
  const up = (await waitPort(PC)) && (await waitPort(PH));
  rec('C12a', 'both doors up on spare ports', up);
  if (!up) { stop(srv); return; }
  const ns = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true }).stdout.split('\n').filter((l) => /LISTENING/.test(l) && new RegExp(`:(${PH}|${PC})\\s`).test(l)).join('\n');
  console.log(ns.trim());
  rec('C12b', 'phone listener is 127.0.0.1 only', new RegExp(`127\\.0\\.0\\.1:${PH}\\s`).test(ns) && !new RegExp(`(0\\.0\\.0\\.0|\\[::\\]):${PH}\\s`).test(ns));

  // ---- identity matrix (HTTP)
  let r = await req(PH, 'GET', '/', phoneH());
  rec('C01', 'owner identity + tailnet Host -> 200', r.status === 200, `status ${r.status}, ${r.body.length} bytes`);
  const phoneIndexBytes = r.body.length;
  const ptok = tokenOf(r.body.toString());
  r = await req(PC, 'GET', '/', pcH());
  const pctok = tokenOf(r.body.toString());
  rec('C11', 'two different tokens, per door', !!ptok && !!pctok && ptok !== pctok);
  r = await req(PH, 'GET', '/', { Host: TS });
  rec('C02', 'no identity -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/', { Host: TS, 'Tailscale-User-Login': 'someone@else.com' });
  rec('C03', 'other login -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/', { Host: TS, 'Tailscale-User-Login': OWNER.toUpperCase() });
  console.log('INFO C04 upper-case owner login ->', r.status);
  rec('C04', 'case-insensitive login is accepted (recorded)', r.status === 200, `status ${r.status}`);
  const dup = await raw(PH, ['GET / HTTP/1.1', `Host: ${TS}`, `Tailscale-User-Login: ${OWNER}`, 'Tailscale-User-Login: evil@x.com', 'Connection: close']);
  rec('C05', 'repeated identity header -> refused', /^HTTP\/1.1 (403|400)/.test(dup), dup.split('\r\n')[0]);
  r = await req(PH, 'GET', '/', { Host: `127.0.0.1:${PH}`, 'Tailscale-User-Login': OWNER });
  rec('C08a', 'identity + loopback Host -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/', { Host: 'evil.example', 'Tailscale-User-Login': OWNER });
  rec('C08b', 'identity + foreign Host -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/', phoneH({ Origin: `http://${TS}` }));
  rec('C09a', 'GET with http Origin -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/', phoneH({ Origin: 'https://evil.example' }));
  rec('C09b', 'GET with foreign Origin -> 403', r.status === 403, `status ${r.status}`);
  r = await req(PH, 'GET', '/api/workspaces', phoneH());
  { const wj = (() => { try { return JSON.parse(r.body.toString()); } catch { return {}; } })();
    console.log('INFO C13a /api/workspaces phone body:', r.body.toString());
    rec('C13a', '/api/workspaces on phone, owner identity -> 200 ok:true, lists the project', r.status === 200 && wj.ok === true && Array.isArray(wj.workspaces) && wj.workspaces.some((w) => /[\\/]pq$/i.test(w.path || '')), `status ${r.status}`);
    const pcw = await req(PC, 'GET', '/api/workspaces', pcH());
    rec('C13a2', 'phone /api/workspaces body identical to PC door body (no extra data)', pcw.body.toString() === r.body.toString());
    const extra = (wj.workspaces || []).flatMap((w) => Object.keys(w).filter((k) => !['path', 'database'].includes(k)));
    const abs = (wj.workspaces || []).filter((w) => /^[A-Za-z]:[\\/]/.test(w.path || '') || /^[A-Za-z]:[\\/]/.test(w.database || '')).length;
    console.log(`FLAG C13a3 phone /api/workspaces exposes: absolute local path(s) in ${abs} entr(ies) (path+database), extra fields [${[...new Set(extra)]}]. Report sheet needs only the folder name.`);
    const lw0 = await (async () => { const o = await wsOpen(PH, ptok, { Host: TS, Origin: `https://${TS}`, 'Tailscale-User-Login': OWNER }); if (!o.ok) return null; const f = await call(o.w, 'list-workspaces', {}); o.w.close(); return f; })();
    console.log('INFO C13a3 ws list-workspaces reply on phone:', JSON.stringify(lw0?.payload ?? lw0).slice(0, 400));
    rec('C13a3', 'phone ws list-workspaces carries the same absolute paths (so HTTP route adds nothing new)', !!lw0 && JSON.stringify(lw0.payload ?? lw0).includes('pq'));
    const r0 = await req(PH, 'GET', '/api/workspaces', { Host: TS });
    rec('C13a4', '/api/workspaces on phone, no identity -> 403', r0.status === 403, `status ${r0.status}`);
    const r1 = await req(PH, 'GET', '/api/workspaces', { Host: TS, 'Tailscale-User-Login': 'x@y.com' });
    rec('C13a5', '/api/workspaces on phone, other login -> 403', r1.status === 403, `status ${r1.status}`);
    const r2 = await req(PH, 'GET', '/api/workspaces', { Host: `127.0.0.1:${PH}`, 'Tailscale-User-Login': OWNER });
    rec('C13a6', '/api/workspaces on phone, loopback Host -> 403', r2.status === 403, `status ${r2.status}`);
    const r3 = await req(PH, 'POST', '/api/workspaces', phoneH({ Origin: `https://${TS}`, 'Content-Type': 'application/json' }), Buffer.from('{}'));
    rec('C13a7', 'POST /api/workspaces on phone is not a success', r3.status >= 400, `status ${r3.status}`);
    const r4 = await req(PH, 'DELETE', '/api/workspaces', phoneH({ Origin: `https://${TS}` }));
    rec('C13a8', 'DELETE /api/workspaces on phone is not a success', r4.status >= 400, `status ${r4.status}`);
  }
  r = await req(PH, 'POST', '/api/register-workspace', phoneH({ 'Content-Type': 'application/json', Origin: `https://${TS}` }), Buffer.from('{"path":"C:/x"}'));
  rec('C13b', '/api/register-workspace on phone -> 404', r.status === 404, `status ${r.status}`);
  r = await req(PC, 'GET', '/api/workspaces', pcH());
  rec('C80a', 'PC /api/workspaces still 200', r.status === 200, `status ${r.status}`);

  // ---- WS upgrade matrix
  const good = { Host: TS, Origin: `https://${TS}`, 'Tailscale-User-Login': OWNER };
  const cases = [
    ['no identity', ptok, { Host: TS, Origin: `https://${TS}` }],
    ['other identity', ptok, { ...good, 'Tailscale-User-Login': 'x@y.com' }],
    ['bad token', 'a'.repeat(48), good],
    ['PC token on phone door', pctok, good],
    ['http Origin', ptok, { ...good, Origin: `http://${TS}` }],
    ['loopback Host', ptok, { ...good, Host: `127.0.0.1:${PH}`, Origin: `https://127.0.0.1:${PH}` }],
    ['no Origin', ptok, { Host: TS, 'Tailscale-User-Login': OWNER }]
  ];
  for (const [n, t, h] of cases) {
    const o = await wsOpen(PH, t, h);
    if (o.ok) o.w.close();
    rec('C10', `WS refused: ${n}`, !o.ok, `status ${o.status}`);
  }
  const pcOnPhoneTok = await wsOpen(PC, ptok, { Host: `127.0.0.1:${PC}`, Origin: `http://127.0.0.1:${PC}` });
  if (pcOnPhoneTok.ok) pcOnPhoneTok.w.close();
  rec('C10', 'WS refused: phone token on PC door', !pcOnPhoneTok.ok, `status ${pcOnPhoneTok.status}`);

  // ---- phone socket
  const ph = await wsOpen(PH, ptok, good);
  rec('C10', 'WS good identity+token connects', ph.ok);
  const p = ph.w;
  const pc = (await wsOpen(PC, pctok, { Host: `127.0.0.1:${PC}`, Origin: `http://127.0.0.1:${PC}` })).w;
  rec('C20a', 'ping', (await call(p, 'ping', {}))?.ok === true);
  const sub = await call(p, 'subscribe-list', { id: 'all', type: 'all-issues' });
  rec('C70a', 'subscribe-list all-issues ok', sub?.ok === true, JSON.stringify(sub).slice(0, 400));
  await sleep(500);
  const snap = p.frames.find((f) => f.type === 'snapshot');
  const items = snap?.payload?.issues || [];
  console.log('snapshot ids', items.map((i) => `${i.id}${i.pointer ? '(ptr)' : ''}`).join(','));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  rec('C43', 'normal bead delivered in full', byId[ids.normal]?.title?.includes('SECRETNORMAL') && !byId[ids.normal]?.pointer);
  for (const [k, id] of Object.entries(ids)) {
    if (k === 'normal') continue;
    const it = byId[id];
    rec('C40', `desk bead ${k} (${id}) is pointer only`, !!it?.pointer && !it.description && !/SECRET/.test(JSON.stringify(it)), it ? Object.keys(it).join(',') : 'missing');
  }
  const nested = JSON.stringify(byId[ids.normal]?.dependencies || []);
  rec('C41', 'desk bead nested in normal bead dependencies is pointer', !nested.includes('SECRETDESK'), nested.slice(0, 150));
  rec('C40z', 'no secret strings in any phone frame so far', leak(p).length === 0, leak(p).join() + ' ' + (leak(p).length ? JSON.stringify(p.frames).match(/.{120}SECRET(DESK|COMMENT|EDIT).{60}/)?.[0] : ''));
  const pcsub = await call(pc, 'subscribe-list', { id: 'all', type: 'all-issues' });
  await sleep(500);
  const pcsnap = pc.frames.find((f) => f.type === 'snapshot');
  rec('C80b', 'PC socket sees full desk text', JSON.stringify(pcsnap || pc.frames).includes('SECRETDESK1'));

  // detail
  for (const id of [ids.sec, ids.normal]) {
    p.frames.length = 0;
    const d = await call(p, 'subscribe-list', { id: 'd-' + id, type: 'issue-detail', params: { id } });
    await sleep(500);
    const txt = allText(p);
    if (id === ids.sec) rec('C42a', 'issue-detail on desk bead: no secret text', d?.ok !== false && leak(p).length === 0, `ok=${d?.ok} leak=${leak(p)}`);
    else rec('C42b', 'issue-detail on normal bead (nested desk dep redacted)', !txt.includes('SECRETDESK') && txt.includes('normal body visible'), `leak=${leak(p)}`);
  }
  // comments
  let c = await call(p, 'get-comments', { id: ids.normal });
  rec('C20b', 'get-comments normal bead', c?.ok === true && JSON.stringify(c).includes('normal comment visible'));
  c = await call(p, 'get-comments', { id: ids.sec });
  rec('C26a', 'get-comments desk bead refused', c?.ok === false && !JSON.stringify(c).includes('SECRETCOMMENT'), JSON.stringify(c?.error));
  c = await call(p, 'get-comments', { id: 'qa-nope' });
  rec('C27', 'get-comments unknown bead refused', c?.ok === false, JSON.stringify(c?.error));
  for (const bad of ['--help', 'qa-c4n --x', '../x', '']) {
    c = await call(p, 'get-comments', { id: bad });
    rec('C29', `get-comments injection id ${JSON.stringify(bad)} refused`, c?.ok === false);
  }
  const before = bd(['comments', ids.sec]).out;
  c = await call(p, 'add-comment', { id: ids.sec, text: 'PHONE-ATTEMPT' });
  rec('C26b', 'add-comment on desk refused', c?.ok === false && !bd(['comments', ids.sec]).out.includes('PHONE-ATTEMPT'), JSON.stringify(c?.error));
  c = await call(p, 'add-comment', { id: ids.normal, text: 'phone comment ok' });
  await sleep(500);
  rec('C20c', 'add-comment on normal ok', c?.ok === true && bd(['comments', ids.normal]).out.includes('phone comment ok'), JSON.stringify(c?.error));

  // refusals; compare bead state before/after
  const snapState = () => JSON.stringify([ids.normal, ids.sec, ids.card].map((i) => bdJson(['show', i])));
  const st0 = snapState();
  const refusals = [
    ['delete-issue', { id: ids.normal }, 'C21a'],
    ['delete-issue', { id: ids.sec }, 'C21b'],
    ['label-remove', { id: ids.sec, label: 'security' }, 'C22a'],
    ['label-add', { id: ids.normal, label: 'security' }, 'C22b'],
    ['update-status', { id: ids.normal, status: 'closed' }, 'C23a'],
    ['update-priority', { id: ids.normal, priority: 0 }, 'C23b'],
    ['update-assignee', { id: ids.normal, assignee: 'x' }, 'C23c'],
    ['update-type', { id: ids.normal, type: 'bug' }, 'C23d'],
    ['edit-text', { id: ids.normal, field: 'title', value: 'HACKED' }, 'C23e'],
    ['dep-add', { a: ids.normal, b: ids.card, view_id: ids.normal }, 'C23f'],
    ['set-workspace', { path: 'C:/Windows' }, 'C24a'],
    ['register-workspace', { path: 'C:/Windows' }, 'C24b'],
    ['totally-unknown', {}, 'C24c'],
    ['report-submit', {}, 'C24d']
  ];
  for (const [t, pl, id] of refusals) {
    const f = await call(p, t, pl);
    rec(id, `${t} refused on phone`, f?.ok === false, JSON.stringify(f?.error));
  }
  rec('C21c', 'no bead changed by refused requests (state identical)', snapState() === st0);
  // C28 create-issue trying to smuggle labels
  const cr = await call(p, 'create-issue', { title: 'phone made task', description: 'from phone', priority: 2, labels: ['owner-pc-only'], assignee: 'sec', created_by: 'sec', metadata: { card_class: 'desk' } });
  rec('C20d', 'create-issue ok', cr?.ok === true, JSON.stringify(cr?.payload || cr?.error));
  await sleep(500);
  const mine = (bdJson(['list', '--all', '--limit', '0']) || []).find((b) => b.title === 'phone made task');
  const full = mine && bdJson(['show', mine.id])?.[0];
  rec('C28', 'smuggled labels/assignee/created_by/metadata not applied', !!full && !(full.labels || []).length && full.assignee !== 'sec' && full.created_by !== 'sec' && full.metadata?.card_class !== 'desk', JSON.stringify({ l: full?.labels, a: full?.assignee, cb: full?.created_by, m: full?.metadata }));
  // ---- live updates
  p.frames.length = 0;
  console.log('INFO live edits via PC socket', JSON.stringify([ (await call(pc, 'edit-text', { id: ids.sec, field: 'title', value: 'SECRETEDIT live title' }))?.ok, (await call(pc, 'edit-text', { id: ids.normal, field: 'title', value: 'NORMAL live visible' }))?.ok ]));
  await sleep(1500);
  const ups = p.frames.filter((f) => f.type === 'upsert');
  console.log('INFO sample PC upsert', JSON.stringify(pc.frames.find((f) => f.type === 'upsert')).slice(0, 300));
  await sleep(2500);
  console.log('INFO phone readyState', p.readyState, 'frames', p.frames.length);
  console.log('INFO phone frame types after PC edits:', p.frames.map((f) => f.type).join(','), '| pc:', pc.frames.slice(-8).map((f) => f.type).join(','));
  rec('C42c', 'desk edit at PC reaches phone as pointer only', leak(p).length === 0, `leak=${leak(p)}; upserts=${ups.length}`);
  for (let i = 0; i < 60 && !allText(p).includes('NORMAL live visible'); i++) await sleep(500);
  rec('C70b', 'normal edit reaches phone live (within 30 s)', allText(p).includes('NORMAL live visible'));
  p.frames.length = 0;
  console.log('INFO flip', JSON.stringify([(await call(pc, 'label-add', { id: ids.normal, label: 'security' }))?.ok, (await call(pc, 'edit-text', { id: ids.normal, field: 'title', value: 'SECRETDESK now flipped' }))?.ok]));
  await sleep(1500);
  rec('C44', 'bead turned desk at PC is pointer on next frame', !allText(p).includes('SECRETDESK now flipped'), `leak=${leak(p)}`);
  await call(pc, 'label-remove', { id: ids.normal, label: 'security' });
  await call(pc, 'edit-text', { id: ids.normal, field: 'title', value: 'NORMAL open task SECRETNORMAL' });
  await sleep(800);
  // PC-side full view
  rec('C81', 'concurrent PC socket got full desk edit text', JSON.stringify(pc.frames).includes('SECRETEDIT live title'));
  console.log('INFO phone socket state before malformed', p.readyState);
  // malformed
  p.send('not json');
  p.send(JSON.stringify({ nope: 1 }));
  p.send('x'.repeat(2_000_000));
  await sleep(500);
  r = await req(PH, 'GET', '/', phoneH());
  rec('C25', 'malformed/huge frames: process still serves', r.status === 200);
  const errLeak = p.frames.filter((f) => f.ok === false).map((f) => JSON.stringify(f)).join('');
  rec('C45', 'error frames carry no paths/stderr', !/[A-Za-z]:[\\/]|stderr|\.js:|at /.test(errLeak), errLeak.slice(0, 200));

  const lw = await call(p, 'list-workspaces', {});
  rec('C71a', 'list-workspaces ok', lw?.ok === true);
  const gw = await call(p, 'get-workspace', {});
  rec('C71b', 'get-workspace ok', gw?.ok === true);
  const phoneFramesBytes = Buffer.byteLength(JSON.stringify(snap));
  console.log(`INFO C90 phone index ${phoneIndexBytes} B, snapshot(5 beads) ${phoneFramesBytes} B`);

  // ---- report flow
  const img = png();
  const meta = { project: 'pq', text: 'Button hidden on my phone', version: '1.2.3' };
  r = await req(PH, 'POST', '/api/report', reportH(ptok, { 'Content-Length': String(reportBody(meta, img).length) }), reportBody(meta, img));
  const rj = (() => { try { return JSON.parse(r.body.toString()); } catch { return {}; } })();
  rec('C61', 'report + screenshot through phone door -> 200', r.status === 200 && rj.ok && !!rj.image, `${r.status} ${r.body.toString().slice(0, 160)}`);
  const rb = rj.id && bdJson(['show', rj.id])?.[0];
  rec('C60', 'report bead exists with Screenshot link', !!rb && /\/att\/pq\//.test(rb.description || ''), rb ? `${rb.id} labels=${rb.labels} meta=${JSON.stringify(rb.metadata)}` : 'none');
  if (rj.image) {
    const a = await req(PH, 'GET', '/att/' + rj.image, phoneH());
    rec('C62a', '/att link opens through phone door (png bytes, image/png)', a.status === 200 && a.headers['content-type'] === 'image/png' && a.body.subarray(0, 4).toString('hex') === '89504e47', `status ${a.status} ct ${a.headers['content-type']} ${a.body.length} B`);
    rec('C62b', 'EXIF/tEXt stripped from stored image', !a.body.includes('SECRETEXIF'));
    const a2 = await req(PH, 'GET', '/att/' + rj.image, { Host: TS });
    rec('C53', '/att without identity -> 403', a2.status === 403, `status ${a2.status}`);
    const a3 = await req(PC, 'GET', '/att/' + rj.image, pcH());
    rec('C80c', '/att on PC door still 200', a3.status === 200);
    // now flip the owning bead to desk -> phone 404
    console.log('INFO label add', bd(['label', 'add', rj.id, 'security']).out.trim());
    const a4 = await req(PH, 'GET', '/att/' + rj.image, phoneH());
    rec('C51', '/att for a bead that is now desk -> 404 on phone', a4.status === 404, `status ${a4.status}`);
    const a5 = await req(PC, 'GET', '/att/' + rj.image, pcH());
    rec('C51b', '/att for desk bead still 200 on PC door', a5.status === 200);
    bd(['label', 'remove', rj.id, 'security']);
    // orphan
    const orphan = rj.image.replace(/[0-9a-f]{16}\.png$/, 'deadbeefdeadbeef.png');
    fs.copyFileSync(path.join(ATT, rj.image), path.join(ATT, orphan));
    const a6 = await req(PH, 'GET', '/att/' + orphan, phoneH());
    rec('C52a', '/att orphan file (no owner bead) -> 404 on phone', a6.status === 404, `status ${a6.status}`);
    const a7 = await req(PH, 'GET', '/att/pq/..%2F..%2Fphone.json', phoneH());
    rec('C52b', '/att traversal -> 404/403', [403, 404].includes(a7.status), `status ${a7.status}`);
  }
  // report without screenshot
  r = await req(PH, 'POST', '/api/report', reportH(ptok), reportBody({ ...meta, text: 'text only report' }, null));
  rec('C60b', 'report text only -> 200', r.status === 200, `${r.status} ${r.body.toString().slice(0, 100)}`);
  r = await req(PH, 'POST', '/api/report', reportH(pctok), reportBody(meta, null));
  rec('C63a', 'report with PC token on phone door -> 403', r.status === 403, `${r.status}`);
  r = await req(PH, 'POST', '/api/report', reportH(ptok, { 'X-Bdui-Report': '0' }), reportBody(meta, null));
  rec('C63b', 'report without custom header -> 403', r.status === 403);
  r = await req(PH, 'POST', '/api/report', { ...reportH(ptok), 'Tailscale-User-Login': 'x@y.com' }, reportBody(meta, null));
  rec('C63c', 'report with other identity -> 403', r.status === 403);
  r = await req(PH, 'POST', '/api/report', reportH(ptok, { Origin: `http://${TS}` }), reportBody(meta, null));
  rec('C63d', 'report with http Origin -> 403', r.status === 403);
  r = await req(PH, 'POST', '/api/report', reportH(ptok, { 'Content-Type': 'application/json' }), reportBody(meta, null));
  rec('C63e', 'report wrong content-type refused (PC door does the same: json parser first)', r.status === 415 || r.status === 400, `${r.status}`);
  const listBefore = (bdJson(['list', '--all', '--limit', '0']) || []).length;
  r = await req(PH, 'POST', '/api/report', reportH(ptok), reportBody(meta, Buffer.from('this is not an image')));
  rec('C64a', 'non-image bytes -> 415 bad_image, no bead', r.status === 415 && (bdJson(['list', '--all', '--limit', '0']) || []).length === listBefore, `${r.status} ${r.body.toString().slice(0, 80)}`);
  r = await req(PH, 'POST', '/api/report', reportH(ptok), reportBody(meta, Buffer.alloc(4 * 1024 * 1024 + 10, 1)));
  { const big = reportBody(meta, Buffer.alloc(4 * 1024 * 1024 + 10, 1)); const pcr = await req(PC, 'POST', '/api/report', { Host: '127.0.0.1:' + PC, Origin: 'http://127.0.0.1:' + PC, 'X-Bdui-Report': '1', 'X-Board-Token': pctok, 'Content-Type': 'application/x-bdui-report' }, big); console.log('INFO oversize: phone', r.status, 'pc', pcr.status); rec('C64b', 'oversize image refused (413, or connection closed early as on PC door)', (r.status === 413 || r.status === 0) && (r.status === pcr.status), r.status + '/' + pcr.status); }

  p.close(); pc.close();
  stop(srv);
  await sleep(500);

  // ---- PC door standalone behaviours (delete etc. still work on PC) are run on a fresh server below
  const srv2 = startServer();
  await waitPort(PC);
  const pc2 = (await wsOpen(PC, tokenOf((await req(PC, 'GET', '/', pcH())).body.toString()), { Host: `127.0.0.1:${PC}`, Origin: `http://127.0.0.1:${PC}` })).w;
  const tmp = bdJson(['create', 'throwaway', '-d', 'x']);
  const tid = tmp?.id;
  const d1 = await call(pc2, 'label-add', { id: tid, label: 'foo' });
  const d1b = await call(pc2, 'label-remove', { id: tid, label: 'foo' });
  const d2 = await call(pc2, 'delete-issue', { id: tid });
  rec('C80d', 'PC door: label-add/remove/delete-issue still work', d1?.ok && d1b?.ok && d2?.ok, JSON.stringify([d1?.ok, d1b?.ok, d2?.ok]));
  const rpc = await req(PC, 'GET', '/', { Host: TS });
  console.log('INFO PC door with ts.net Host, no identity ->', rpc.status);
  pc2.close();
  stop(srv2);
  await sleep(500);

  // ---- fail-closed config variants
  const variants = [
    ['C06 missing phone.json', { BDUI_PHONE_CONFIG: path.join(SC, 'nope', 'phone.json') }],
    ['C07a malformed phone.json', { BDUI_PHONE_CONFIG: path.join(SC, 'bad.json') }, '{not json'],
    ['C07b empty owner_login', { BDUI_PHONE_CONFIG: path.join(SC, 'empty.json') }, JSON.stringify({ owner_login: '' })],
    ['C07c owner_login not a string', { BDUI_PHONE_CONFIG: path.join(SC, 'num.json') }, JSON.stringify({ owner_login: 5 })]
  ];
  for (const [name, env, content] of variants) {
    if (content) fs.writeFileSync(env.BDUI_PHONE_CONFIG, content);
    const s = startServer(env);
    await waitPort(PH);
    const a = await req(PH, 'GET', '/', phoneH());
    const b = await req(PH, 'GET', '/att/pq/2026-10/0000000000000000.png', phoneH());
    const w = await wsOpen(PH, 'a'.repeat(48), { Host: TS, Origin: `https://${TS}`, 'Tailscale-User-Login': OWNER });
    const c = await req(PC, 'GET', '/', pcH());
    rec(name.split(' ')[0], `${name}: phone / ${a.status}, /att ${b.status}, ws ${w.status}; PC still ${c.status}`, a.status === 403 && b.status === 403 && !w.ok && c.status === 200);
    stop(s);
    await sleep(400);
  }
  // owner login via env var
  const sE = startServer({ BDUI_OWNER_LOGIN: 'env@owner.com', BDUI_PHONE_CONFIG: path.join(SC, 'nope.json') });
  await waitPort(PH);
  const e1 = await req(PH, 'GET', '/', { Host: TS, 'Tailscale-User-Login': 'env@owner.com' });
  const e2 = await req(PH, 'GET', '/', phoneH());
  rec('C06b', 'env BDUI_OWNER_LOGIN honoured; file owner refused', e1.status === 200 && e2.status === 403, `${e1.status}/${e2.status}`);
  stop(sE);
  await sleep(400);

  // ---- PHONE_PORT off / busy
  const sOff = startServer({}, { PORT: PC, PHONE_PORT: 'off' });
  await waitPort(PC);
  const offUp = await new Promise((res) => { const s = net.connect(PH, '127.0.0.1', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
  rec('C12c', 'PHONE_PORT=off: phone port not listening, PC up', !offUp && (await req(PC, 'GET', '/', pcH())).status === 200);
  stop(sOff);
  await sleep(400);
  const blocker = net.createServer().listen(PH, '127.0.0.1');
  await sleep(200);
  const sBusy = startServer();
  await waitPort(PC);
  await sleep(500);
  const alive = sBusy.exitCode === null && (await req(PC, 'GET', '/', pcH())).status === 200;
  rec('C12d', 'phone port busy: PC door stays up', alive);
  stop(sBusy);
  blocker.close();
}

try { await main(); } catch (e) { console.log('SCRIPT ERROR', e); }
finally {
  for (const pid of pids) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  const f = results.filter((r) => !r.ok);
  console.log(`\nTOTAL ${results.length}, FAIL ${f.length}`);
  for (const x of f) console.log('  FAIL', x.id, x.name);
  process.exit(0);
}
