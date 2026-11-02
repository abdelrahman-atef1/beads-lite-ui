// Black-box run of the REAL board (server/index.js from this worktree) on spare ports with COPY stores,
// temp BDUI_BOARD_HOME, the real web-push lib and real encryption; only the last https hop is cut
// (intercept.cjs) so nothing reaches a push service. Writes board.json into QA_OUT. Company-1bo5.6.16.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { pathToFileURL } from 'node:url';
import { OUT, decodeVapid, decryptPush, makeSub, recorder, sleep } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const S = process.env.QA_SCRATCH; // scratch with roots/{alpha,beta,gamma}/.beads copies
const PORT = 3440, PHONE = 3441;
const BD = path.join(process.env.APPDATA, 'npm/node_modules/@beads/bd/bin/bd.exe');
const HOME = path.join(S, 'home-board');
const PUSHLOG = path.join(S, 'board-push.jsonl');
const BOARDLOG = path.join(S, 'board.log');
const LOGIN = 'qa-owner@example.test';
const PHONE_HOST = 'abdelrahman.tail8a4e50.ts.net';
const R = recorder('board');
const REALHOME = path.join(os.homedir(), '.codesters', 'board');
const realBefore = fs.readdirSync(REALHOME).map((f) => [f, fs.statSync(path.join(REALHOME, f)).mtimeMs]);

fs.rmSync(HOME, { recursive: true, force: true });
fs.writeFileSync(PUSHLOG, '');
fs.writeFileSync(BOARDLOG, '');
const dir = (n) => path.join(S, 'roots', n);

const rules = await import(pathToFileURL(path.join(os.homedir(), 'company/scripts/cards/rules.mjs')).href);
const bd = (cwd, args, actor = 'qa') =>
  execFileSync(BD, ['--actor', actor, ...args], { cwd, env: { ...process.env, BD_ACTOR: actor, BEADS_ACTOR: actor }, encoding: 'utf8', timeout: 120000, windowsHide: true }).trim();
const META = (title, extra = {}) =>
  JSON.stringify({
    ask_ar: 'اختبار', card_q: 'SECRET-QUESTION-TEXT: which colour for the logo?', asked_at: new Date().toISOString(), title_ar: 'اختبار',
    card_back: 'swe', card_opts: '[{"l":"Red SECRET-OPTION"},{"l":"Blue","rec":true}]', card_show: 'Red or blue SECRET-SHOW.',
    card_class: 'tap', card_thing: 'true', card_blocks: 'nothing', card_effect: 'Changes the logo colour.', card_title: title, ...extra
  });
function mkCard(project, title, { desk = false, invalid = false, actor = 'qa', parent = null } = {}) {
  const meta = invalid ? JSON.stringify({ note: 'no card fields' }) : META(title);
  const args = ['create', `QA fixture ${title}`, '-t', 'task', '-a', 'abdelrahman', '--metadata', meta, '--silent'];
  if (desk) args.push('-l', 'deploy');
  if (parent) args.push('--id', `${parent}.1`);
  const id = bd(dir(project), args, actor).split(/\s+/).pop();
  const tStart = Date.now(); // the board may see the change before bd update returns
  bd(dir(project), ['update', id, '--status', 'owner_decision'], actor);
  const shown = JSON.parse(bd(dir(project), ['show', id, '--json']))[0];
  const okCard = rules.parseCard(shown).ok;
  R.check('FIX-' + id, `fixture ${title} is ${invalid ? 'an INVALID' : 'a VALID'} card per the real card core`, okCard === !invalid, okCard ? '' : JSON.stringify(rules.parseCard(shown).errors));
  return { id, t: tStart };
}

let boardPid = 0;
function startBoard(cwdProject) {
  const out = fs.openSync(BOARDLOG, 'a');
  const child = spawn(process.execPath, ['--no-deprecation', '--require', path.join(ROOT, 'tools/e2e/push-n3/intercept.cjs'), path.join(ROOT, 'server/index.js')], {
    cwd: dir(cwdProject),
    env: { ...process.env, PORT: String(PORT), PHONE_PORT: String(PHONE), BDUI_BOARD_HOME: HOME, BD_BIN: BD, BDUI_BD_CONCURRENCY: '4', BDUI_OWNER_LOGIN: LOGIN, QA_PUSH_LOG: PUSHLOG, DEBUG: 'beads-ui:*' },
    stdio: ['ignore', out, out], windowsHide: true, detached: false
  });
  boardPid = child.pid;
  fs.writeFileSync(path.join(S, 'board.pid'), String(boardPid));
  return child;
}
async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/workspaces`); if (r.ok) return; } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error('board did not start');
}
async function stopBoard() {
  if (!boardPid) return;
  try { process.kill(boardPid); } catch { /* gone */ }
  for (let i = 0; i < 40; i++) { try { process.kill(boardPid, 0); await sleep(250); } catch { break; } }
  boardPid = 0;
}

const events = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'notified.json'), 'utf8')).events || []; } catch { return []; } };
const pushes = () => fs.readFileSync(PUSHLOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const subsFile = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'push-subs.json'), 'utf8')); } catch { return []; } };
async function waitFor(fn, ms, step = 500) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}

// fetch() cannot set Host; node:http can (the phone door checks Host)
function httpGet(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, headers }, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, text: b }));
    });
    r.on('error', reject); r.end();
  });
}
async function connect(door) {
  const phone = door === 'phone';
  const port = phone ? PHONE : PORT;
  const host = phone ? PHONE_HOST : `127.0.0.1:${port}`;
  const baseHeaders = phone ? { Host: host, 'Tailscale-User-Login': LOGIN } : {};
  const html = (await httpGet(port, '/', baseHeaders)).text;
  const token = html.match(/name="board-token"[^>]*content="([^"]*)"/)?.[1];
  return { token, port, host, baseHeaders, origin: phone ? `https://${host}` : `http://127.0.0.1:${port}` };
}
function open(c, { token = c.token, origin = c.origin, headers = c.baseHeaders } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${c.port}/ws?t=${encodeURIComponent(token ?? '')}`, { headers: { ...headers, Origin: origin } });
    let n = 0; const wait = new Map(); const frames = [];
    ws.on('message', (m) => { const j = JSON.parse(m); frames.push(j); if (j.id && wait.has(j.id)) wait.get(j.id)(j); });
    ws.on('open', () => resolve({ ws, frames, rpc: (type, payload) => new Promise((res) => { const id = 'q' + ++n; wait.set(id, res); ws.send(JSON.stringify({ id, type, payload })); setTimeout(() => res({ timeout: true }), 15000); }) }));
    ws.on('unexpected-response', (_q, r) => resolve({ refused: r.statusCode }));
    ws.on('error', () => resolve({ refused: 'error' }));
  });
}

try {
  // ------------------------------------------------------------ start
  startBoard('alpha');
  await waitUp();
  await sleep(8000); // initial rescan + digest for pre-existing cards
  const ev0 = events();
  R.check('B6a', 'cold start: the one pre-existing parked card of the cwd project gives exactly one bell event', ev0.filter((e) => e.project === 'alpha').length === 1, JSON.stringify(ev0.map((e) => [e.project, e.kind, e.count])));

  // ------------------------------------------------------------ socket + door guards (S1, S6)
  const pc = await connect('pc');
  const ph = await connect('phone');
  const noTok = await open(pc, { token: 'x'.repeat(10) });
  const badOrigin = await open(pc, { origin: 'http://evil.example.com' });
  const phNoId = await open(ph, { headers: { Host: ph.host } });
  const phWrongId = await open(ph, { headers: { Host: ph.host, 'Tailscale-User-Login': 'someone@else.test' } });
  const phPcTok = await open(ph, { token: pc.token });
  R.check('S6', 'ws refused: bad token, foreign Origin, phone door without identity / wrong identity / PC token', [noTok, badOrigin, phNoId, phWrongId, phPcTok].every((x) => x.refused), JSON.stringify([noTok, badOrigin, phNoId, phWrongId, phPcTok].map((x) => x.refused)));
  const phone = await open(ph);
  const pcSock = await open(pc);
  const k = await phone.rpc('push-key', {});
  const keyOnDisk = JSON.parse(fs.readFileSync(path.join(HOME, 'vapid.json'), 'utf8'));
  const kPc = await pcSock.rpc('push-key', {});
  R.check('S1', 'push-key over the phone door and the PC door returns the PUBLIC key only (equal to vapid.json publicKey)', k.ok && kPc.ok && (k.payload?.key === keyOnDisk.publicKey) && !JSON.stringify([k, kPc]).includes(keyOnDisk.privateKey), JSON.stringify(k).slice(0, 160));

  // ------------------------------------------------------------ subscribe / unsubscribe over the socket (S2, S3, S4)
  const live = makeSub('https://fcm.googleapis.com/fcm/send/live-e2e');
  const gone = makeSub('https://updates.push.services.mozilla.com/wpush/v2/gone410');
  const evil = await phone.rpc('push-subscribe', { subscription: { endpoint: 'https://evil.example.com/x', keys: live.subscription.keys } });
  const ssrf = await phone.rpc('push-subscribe', { subscription: { endpoint: 'https://127.0.0.1:3000/x', keys: live.subscription.keys } });
  const nothing = await phone.rpc('push-subscribe', {});
  R.check('S4e', 'evil host / loopback endpoint / empty payload refused over the real socket and nothing stored', !evil.ok && !ssrf.ok && !nothing.ok && subsFile().length === 0, JSON.stringify([evil.error?.code, ssrf.error?.code, nothing.error?.code]));
  const s1 = await phone.rpc('push-subscribe', { subscription: live.subscription });
  const s1b = await phone.rpc('push-subscribe', { subscription: live.subscription });
  R.check('S2e', 'valid subscription stored over the phone door; repeat does not duplicate', s1.ok && s1b.ok && subsFile().length === 1, JSON.stringify(subsFile().map((s) => s.endpoint)));
  const u0 = await pcSock.rpc('push-unsubscribe', { endpoint: live.subscription.endpoint });
  const u1 = await pcSock.rpc('push-unsubscribe', { endpoint: live.subscription.endpoint });
  R.check('S3e', 'unsubscribe removes it; second unsubscribe is harmless', u0.ok && u1.ok && subsFile().length === 0);
  await phone.rpc('push-subscribe', { subscription: live.subscription });
  const bellBefore = (await phone.rpc('notify-list', {})).payload?.events?.length;

  // ------------------------------------------------------------ B1: cwd project card -> bell + push
  const c1 = mkCard('alpha', 'Pick a colour');
  const e1 = await waitFor(() => events().find((e) => e.bead === c1.id), 60000);
  const lat1 = e1.v ? Date.now() - c1.t : null;
  const p1 = await waitFor(() => pushes().find((p) => p.path.endsWith('live-e2e') && p.at > c1.t), 30000);
  const latP1 = p1.v ? p1.v.at - c1.t : null;
  const lat = (x) => (x.v ? `${((Date.now() - c1.t - (x.ms ? 0 : 0)) / 1000).toFixed(1)}s` : 'never');
  R.check('B1', 'cwd project: valid parked card -> bell event within 30 s', !!e1.v && lat1 <= 30000, lat1 ? `bell event ${(lat1 / 1000).toFixed(1)}s after the card was written` : 'never (60 s)');
  R.check('C1e', 'same card -> one push to the subscription within 30 s of the bell event', !!p1.v && pushes().filter((p) => p.path.endsWith('live-e2e')).length === 1, latP1 ? `push ${(latP1 / 1000).toFixed(1)}s after the card was written` : 'no push');
  const pj = p1.v ? JSON.parse(decryptPush(Buffer.from(p1.v.body, 'base64'), live)) : {};
  R.check('P1e', 'real decrypted payload: only kind/project/bead/title/count/at, title = card_title, bead = the card', JSON.stringify(Object.keys(pj).sort()) === '["at","bead","count","kind","project","title"]' && pj.kind === 'decision' && pj.project === 'alpha' && pj.bead === c1.id && pj.title === 'Pick a colour', JSON.stringify(pj));
  const hay1 = (p1.v ? Buffer.from(p1.v.body, 'base64').toString('latin1') : '') + JSON.stringify(p1.v?.headers) + p1.v?.path + JSON.stringify(pj);
  R.check('P2e', 'nothing of the question / options / show text or the private key anywhere in the request (plain + headers + url)', !/SECRET|colour for the logo|Blue/.test(JSON.stringify(pj) + JSON.stringify(p1.v?.headers) + p1.v?.path) && !hay1.includes(keyOnDisk.privateKey));
  const vv = decodeVapid(p1.v?.headers?.Authorization);
  R.check('P5e', 'VAPID: public key in the request equals the board key, aud = fcm origin', vv?.k === keyOnDisk.publicKey && vv?.claims?.aud === 'https://fcm.googleapis.com', JSON.stringify(vv?.claims));
  const bellNow = (await phone.rpc('notify-list', {})).payload?.events?.length;
  fs.writeFileSync(path.join(OUT, 'board-sample-event.json'), JSON.stringify({ bellEvent: e1.v, decryptedPush: pj, bellBefore, bellNow }, null, 1));

  // ------------------------------------------------------------ B3: project registered AFTER start by POST
  for (const n of ['beta', 'gamma']) {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/register-workspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: dir(n), database: path.join(dir(n), '.beads', 'beads.db') }) });
    if (!r.ok) R.check('B3-setup', `register ${n}`, false, r.status);
  }
  await sleep(3000);
  const c2 = mkCard('beta', 'Beta decision');
  const e2 = await waitFor(() => events().find((e) => e.bead === c2.id), 60000);
  const lat2 = e2.v ? Date.now() - c2.t : null;
  R.check('B3', 'project registered later by POST /api/register-workspace: its parked card fills the bell within 30 s WITHOUT anyone opening the bell first (no notify-list call in between)', !!e2.v && lat2 <= 30000, e2.v ? `after ${(lat2 / 1000).toFixed(1)}s` : 'never (60 s)');
  const p2 = await waitFor(() => pushes().find((p) => p.at > c2.t && p.path.endsWith('live-e2e')), 15000);
  const pj2 = p2.v ? JSON.parse(decryptPush(Buffer.from(p2.v.body, 'base64'), live)) : {};
  R.check('B3p', 'and it pushes, project beta, title from the card', pj2.project === 'beta' && pj2.title === 'Beta decision', JSON.stringify(pj2));
  R.check('C3e', 'beta push was not held by alpha window (different project, within 2 min of the alpha push)', !!p2.v && p2.v.at - p1.v.at < 120000, p2.v && p1.v ? `${((p2.v.at - p1.v.at) / 1000).toFixed(0)}s apart` : '');

  // ------------------------------------------------------------ B4 invalid card, desk card
  const nPush0 = pushes().length, nEv0 = events().length;
  const bad = mkCard('gamma', 'Invalid one', { invalid: true });
  await sleep(20000);
  R.check('B4', 'invalid card (no card fields) in gamma: no bell event, no push', !events().some((e) => e.bead === bad.id) && pushes().length === nPush0 && events().length === nEv0, `events ${events().length - nEv0} pushes ${pushes().length - nPush0}`);
  const desk = mkCard('gamma', 'TOP SECRET DESK TITLE', { desk: true });
  const e3 = await waitFor(() => events().find((e) => e.bead === desk.id), 40000);
  const p3 = await waitFor(() => pushes().find((p) => p.at > desk.t && p.path.endsWith('live-e2e')), 15000);
  const pj3 = p3.v ? JSON.parse(decryptPush(Buffer.from(p3.v.body, 'base64'), live)) : null;
  R.check('P3e', 'desk-label bead (deploy): bell event and push carry NO title (pointer only)', !!e3.v && e3.v.title == null && !!pj3 && pj3.title === null && !/SECRET/.test(JSON.stringify(pj3) + JSON.stringify(e3.v)), JSON.stringify({ bell: e3.v?.title, push: pj3 }));

  // ------------------------------------------------------------ C2e: fold (alpha: 2nd and 3rd within the window)
  if (!p1.v) throw new Error('no first push; later cases need it');
  const t1 = p1.v.at;
  const c3 = mkCard('alpha', 'Fold two');
  await sleep(7000);
  const c4 = mkCard('alpha', 'Fold three');
  const e4 = await waitFor(() => events().find((e) => e.bead === c4.id), 40000);
  const alphaPushesNow = pushes().filter((p) => p.path.endsWith('live-e2e') && p.at > t1 && JSON.parse(decryptPush(Buffer.from(p.body, 'base64'), live)).project === 'alpha');
  R.check('C2e2', 'two more alpha cards inside the 2 min window: bell has both, push not sent individually', !!events().find((e) => e.bead === c3.id) && !!e4.v && alphaPushesNow.length === 0, `alpha pushes since first: ${alphaPushesNow.length}`);
  const dg = await waitFor(() => pushes().find((p) => p.at > t1 && JSON.parse(decryptPush(Buffer.from(p.body, 'base64'), live)).kind === 'digest'), 150000, 2000);
  const dj = dg.v ? JSON.parse(decryptPush(Buffer.from(dg.v.body, 'base64'), live)) : null;
  R.check('C2f', 'at the end of the 2 min window ONE digest push: "2 decisions waiting in alpha" (kind digest, count 2, no title)', !!dj && dj.project === 'alpha' && dj.count === 2 && dj.title === null, JSON.stringify(dj) + (dg.v ? ` at +${((dg.v.at - t1) / 1000).toFixed(0)}s` : ''));

  // ------------------------------------------------------------ C7 mute, C5 410 cleanup, B5 switch off
  const until = new Date(Date.now() + 10 * 60000).toISOString();
  await pcSock.rpc('notify-mute', { until });
  const nP = pushes().length;
  const c5 = mkCard('beta', 'While muted');
  const e5 = await waitFor(() => events().find((e) => e.bead === c5.id), 40000);
  await sleep(3000);
  R.check('C7e', 'mute on: bell still fills, no push', !!e5.v && pushes().length === nP, `new pushes ${pushes().length - nP}`);
  await pcSock.rpc('notify-mute', { until: null });
  await phone.rpc('push-subscribe', { subscription: gone.subscription });
  R.check('C5pre', 'second subscription (will answer 410) stored', subsFile().length === 2);
  const c6 = mkCard('gamma', 'Clean up gone');
  await waitFor(() => pushes().find((p) => p.path.endsWith('gone410')), 40000);
  await sleep(2000);
  const left = subsFile().map((s) => s.endpoint);
  R.check('C5e', 'real run: push service answers 410 -> that subscription is removed from push-subs.json; the healthy one stays', left.length === 1 && left[0].endsWith('live-e2e'), left.join(','));
  const sw = await pcSock.rpc('notify-set', { project: 'beta', on: false });
  const nE = events().length, nP2 = pushes().length;
  mkCard('beta', 'Switched off');
  await sleep(20000);
  R.check('B5', 'project switched off: new card -> no bell event and no push', events().length === nE && pushes().length === nP2, `events +${events().length - nE} pushes +${pushes().length - nP2}`);
  await pcSock.rpc('notify-set', { project: 'beta', on: true });

  // W3 (SEC): desk gate fails closed for a card created by sec, and for a child of a PC-only-labelled parent
  const wSec = mkCard('gamma', 'SEC MADE SECRET TITLE', { actor: 'sec' });
  const eSec = await waitFor(() => events().find((e) => e.bead === wSec.id), 40000);
  const pSec = await waitFor(() => pushes().find((p) => p.at > wSec.t && p.path.endsWith('live-e2e')), 15000);
  const jSec = pSec.v ? JSON.parse(decryptPush(Buffer.from(pSec.v.body, 'base64'), live)) : null;
  R.check('W3b', 'SEC W3: card created by role sec (no label) -> bell carries no title, any push has none (push may be held by the 2 min window, so it can be absent)', !!eSec.v && eSec.v.title == null && (!jSec || jSec.title === null), JSON.stringify({ bell: eSec.v?.title, push: jSec }));
  const epic = bd(dir('gamma'), ['create', 'PC only epic', '-t', 'epic', '-l', 'owner-pc-only', '--silent']).split(/\s+/).pop();
  const wPar = mkCard('gamma', 'PARENT LABEL SECRET TITLE', { parent: epic });
  const ePar = await waitFor(() => events().find((e) => e.bead === wPar.id), 40000);
  const pPar = await waitFor(() => pushes().find((p) => p.at > wPar.t && p.path.endsWith('live-e2e')), 15000);
  const jPar = pPar.v ? JSON.parse(decryptPush(Buffer.from(pPar.v.body, 'base64'), live)) : null;
  const gateRetired = rules.gate({}, {}, {}).ok === true && rules.gate({}, {}, { parentLabels: ['owner-pc-only'] }).ok === true;
  R.check('W3c', 'SEC W3/N7: child of a parent labelled owner-pc-only -> no title in bell, any push has none (push may be held by the 2 min window)', gateRetired ? null : !!ePar.v && ePar.v.title == null && (!jPar || jPar.title === null), JSON.stringify({ bell: ePar.v?.title, push: jPar }));

  // ------------------------------------------------------------ K: secrets, files, logs, git
  const home = fs.readdirSync(HOME);
  const logTxt = fs.readFileSync(BOARDLOG, 'utf8');
  const subsTxt = fs.readFileSync(path.join(HOME, 'push-subs.json'), 'utf8');
  const priv = keyOnDisk.privateKey;
  R.check('K1', 'key/subs/state files exist only under BDUI_BOARD_HOME; no push file appeared in the real ~/.codesters/board', ['vapid.json', 'push-subs.json', 'push-state.json'].every((f) => home.includes(f)) && !['vapid.json', 'push-subs.json', 'push-state.json'].some((f) => fs.existsSync(path.join(REALHOME, f))), home.join(','));
  R.check('K3a', 'board stdout/stderr (debug on) never contains the private key', !logTxt.includes(priv), `log ${logTxt.length} bytes`);
  const p256 = live.subscription.keys.p256dh, auth = live.subscription.keys.auth;
  R.check('K5', 'board log never contains a subscription endpoint, p256dh or auth secret', !/live-e2e|gone410|fcm\.googleapis\.com\/fcm\/send/.test(logTxt) && !logTxt.includes(p256) && !logTxt.includes(auth), '');
  const leakReplies = JSON.stringify([k, kPc, s1, s1b, u0, u1, (await pcSock.rpc('notify-list', {})), (await phone.rpc('notify-list', {}))]);
  R.check('K3b', 'no socket reply (push-key, subscribe, unsubscribe, notify-list) contains the private key or an endpoint', !leakReplies.includes(priv) && !leakReplies.includes('live-e2e'), '');
  const served = [];
  for (const [c, u] of [[pc, '/sw.js'], [pc, '/'], [pc, '/main.bundle.js'], [pc, '/api/workspaces'], [ph, '/sw.js'], [ph, '/']]) {
    try { served.push((await httpGet(c.port, u, c.baseHeaders)).text); } catch { /* skip */ }
  }
  R.check('K3c', 'sw.js, index, bundle, /api/workspaces (both doors) never contain the private key or an endpoint', served.length >= 5 && served.every((t) => !t.includes(priv) && !t.includes('live-e2e')), `${served.length} bodies`);
  const gitLog = execFileSync('git', ['-C', ROOT, 'log', '--all', '-S' + priv, '--oneline'], { encoding: 'utf8' }).trim();
  const gitGrep = (() => { try { return execFileSync('git', ['-C', ROOT, 'grep', '-l', priv], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
  R.check('K3d', 'private key not in git history or tracked files', gitLog === '' && gitGrep === '');
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' });
  R.check('K1b', 'no vapid.json / push-subs.json / push-state.json tracked in the repo', !/vapid\.json|push-subs|push-state/.test(tracked.replace(/server\/features\/push[^\n]*/g, '')));
  const aclOut = execFileSync('icacls', [HOME], { encoding: 'utf8' });
  const aclKey = execFileSync('icacls', [path.join(HOME, 'vapid.json')], { encoding: 'utf8' });
  const ids = [...(aclOut + aclKey).replaceAll(path.join(HOME, 'vapid.json'), '').replaceAll(HOME, '').matchAll(/([A-Za-z0-9 ]+\\[^\s\\:]+):\(/g)].map((m) => m[1].trim());
  const user = process.env.USERNAME.toLowerCase();
  R.check('K2e', 'real board run: icacls on the live board folder and vapid.json = owner + SYSTEM only', ids.length >= 2 && ids.every((x) => x.toLowerCase().endsWith('\\' + user) || /^NT AUTHORITY\\SYSTEM$/i.test(x)), [...new Set(ids)].join(' | '));
  fs.writeFileSync(path.join(OUT, 'board-icacls.txt'), aclOut + '\n' + aclKey);
  phone.ws.close(); pcSock.ws.close();

  // ------------------------------------------------------------ B6 / C10: restart after downtime
  const evBefore = events().length;
  const keysBefore = JSON.parse(fs.readFileSync(path.join(HOME, 'notified.json'), 'utf8')).keys;
  const lastAlpha = JSON.parse(fs.readFileSync(path.join(HOME, 'push-state.json'), 'utf8')).last.alpha;
  await sleep(Math.max(0, lastAlpha + 125000 - Date.now()));
  await stopBoard();
  mkCard('alpha', 'Down one'); mkCard('alpha', 'Down two');
  const pBefore = pushes().length;
  startBoard('alpha');
  await waitUp();
  await waitFor(() => events().length > evBefore, 60000, 1000);
  await sleep(10000);
  const newEv = events().slice(0, events().length - evBefore);
  R.check('B6', 'restart after downtime with 2 new alpha cards: exactly ONE new digest event (count 2), nothing re-announced for the already-notified cards', newEv.length === 1 && newEv[0].kind === 'digest' && newEv[0].count === 2, JSON.stringify(newEv.map((e) => [e.project, e.kind, e.count, e.bead])));
  const pAfter = pushes().slice(pBefore);
  const pjR = pAfter.length ? JSON.parse(decryptPush(Buffer.from(pAfter[0].body, 'base64'), live)) : null;
  R.check('B6p', 'and that digest is pushed once (or folded by the persisted 2 min window) with no card text', pAfter.length <= 1 && (!pjR || (pjR.kind === 'digest' && pjR.title === null)), `${pAfter.length} push(es) ${JSON.stringify(pjR)}`);
  R.check('C10', 'duplicate protection: notified.json keys survive restart and no event repeats', Object.keys(keysBefore).every((x) => x in JSON.parse(fs.readFileSync(path.join(HOME, 'notified.json'), 'utf8')).keys));
} catch (e) {
  R.check('HARNESS', 'board.e2e ran to the end', false, e.stack || e);
} finally {
  await stopBoard();
  R.save();
}
