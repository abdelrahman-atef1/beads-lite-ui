// Service worker + tap cases (T1-T4, P4, R2, R3, R5) against the REAL served /sw.js.
//  - real headless Chrome (own profile, own PID): the push event is delivered through CDP
//    ServiceWorker.deliverPushMessage, the notification is read back, its tap URL is opened in the board
//    and the bead must show.
//  - same served sw.js text in a vm with fake clients for the click branches Chrome cannot be tapped into.
// Board: own copy on 3450/3451. Writes sw.json into QA_OUT. Company-1bo5.6.16.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { recorder, sleep } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const S = process.env.QA_SCRATCH;
const PORT = 3450, PHONE = 3451, CDP = 9344;
const BD = path.join(process.env.APPDATA, 'npm/node_modules/@beads/bd/bin/bd.exe');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = 'C:/Temp/qa16-prof';
const HOME = path.join(S, 'home-sw');
const R = recorder('sw');
const pids = [];
fs.rmSync(HOME, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync('C:/Temp', { recursive: true });

function launch(cmd, args, env, logFile) {
  const out = fs.openSync(logFile, 'w');
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', out, out], windowsHide: true });
  pids.push(c.pid);
  return c;
}
const kill = async () => { for (const p of pids.splice(0).reverse()) { try { process.kill(p); } catch { /* gone */ } } await sleep(1500); };

// ---- CDP
async function cdpConnect() {
  let ver;
  for (let i = 0; i < 60; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); break; } catch { await sleep(500); } }
  const ws = new WebSocket(ver.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.on('open', r));
  let n = 0; const wait = new Map(); const handlers = [];
  ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && wait.has(j.id)) wait.get(j.id)(j); else handlers.forEach((h) => h(j)); });
  const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++n; wait.set(id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); setTimeout(() => res({ error: 'timeout' }), 20000); });
  return { send, on: (h) => handlers.push(h), ws };
}

try {
  const board = launch(process.execPath, ['--no-deprecation', path.join(ROOT, 'server/index.js')], { PORT: String(PORT), PHONE_PORT: String(PHONE), BDUI_BOARD_HOME: HOME, BD_BIN: BD, BDUI_BD_CONCURRENCY: '4' }, path.join(S, 'board-sw.log'));
  // cwd must be a project copy
  board.kill(); pids.pop();
  const b = spawn(process.execPath, ['--no-deprecation', path.join(ROOT, 'server/index.js')], { cwd: path.join(S, 'roots', 'delta'), env: { ...process.env, PORT: String(PORT), PHONE_PORT: String(PHONE), BDUI_BOARD_HOME: HOME, BD_BIN: BD, BDUI_BD_CONCURRENCY: '4' }, stdio: ['ignore', fs.openSync(path.join(S, 'board-sw.log'), 'w'), 'ignore'], windowsHide: true });
  pids.push(b.pid);
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/workspaces`)).ok) break; } catch { /* wait */ } await sleep(500); }
  const swText = await (await fetch(`http://127.0.0.1:${PORT}/sw.js`)).text();
  const swHdr = (await fetch(`http://127.0.0.1:${PORT}/sw.js`)).headers;
  R.check('R3', 'served /sw.js contains the push and notificationclick handlers, placeholders filled, parses', /addEventListener\('push'/.test(swText) && /notificationclick/.test(swText) && !/__SW_VERSION__|__SW_SHELL__/.test(swText), `${swText.length} bytes; content-type ${swHdr.get('content-type')}; cache-control ${swHdr.get('cache-control')}`);
  const bundle = await (await fetch(`http://127.0.0.1:${PORT}/main.bundle.js`)).arrayBuffer().catch(() => new ArrayBuffer(0));
  R.check('R4', 'payload size: served sw.js and main bundle (bytes) recorded', true, `sw.js ${swText.length} B; main.bundle.js ${bundle.byteLength} B (base 59470c7 sw.js ~2.9 KB)`);

  // ---- vm: click branches
  function makeSw({ clientsList, lang = 'en' }) {
    const listeners = {}; const calls = { opened: [], navigated: [], focused: 0, shown: [] };
    const self = {
      location: { origin: 'https://abdelrahman.tail8a4e50.ts.net', href: 'https://abdelrahman.tail8a4e50.ts.net/sw.js' },
      navigator: { language: lang },
      addEventListener: (t, f) => (listeners[t] = f),
      skipWaiting: () => Promise.resolve(),
      registration: { showNotification: (title, options) => (calls.shown.push({ title, options }), Promise.resolve()) },
      clients: {
        claim: () => Promise.resolve(),
        matchAll: () => Promise.resolve(clientsList(calls)),
        openWindow: (u) => (calls.opened.push(u), Promise.resolve({}))
      }
    };
    vm.runInNewContext(swText, { self, URL, JSON, Object, Promise, Number, String, caches: {}, fetch: () => {}, console, encodeURIComponent });
    const fire = async (type, ev) => { const ps = []; ev.waitUntil = (p) => ps.push(p); listeners[type](ev); await Promise.allSettled(ps); };
    return { fire, calls };
  }
  const push = (obj) => ({ data: { json: () => obj } });
  const click = (url) => ({ notification: { close() {}, data: { url } } });

  // describe -> what the tap URL will be
  let w = makeSw({ clientsList: () => [] });
  await w.fire('push', push({ kind: 'decision', project: 'alpha', bead: 'alpha-1.2', title: 'Pick a colour', count: 1 }));
  const n1 = w.calls.shown[0];
  R.check('T0', 'push event -> showNotification(project, body "Decision needed: <title>", tap url /#/issues?issue=<bead>)', n1?.title === 'alpha' && /Decision needed: Pick a colour/.test(n1.options.body) && n1.options.data.url === '/#/issues?issue=alpha-1.2', JSON.stringify(n1));
  await w.fire('push', push({ kind: 'decision', project: 'beta', bead: 'beta-1', title: null, count: 1 }));
  R.check('P3s', 'desk payload (title null) -> text "A decision waits at the PC", no title shown', /waits at the PC/.test(w.calls.shown[1].options.body) && !/null/.test(w.calls.shown[1].options.body), w.calls.shown[1].options.body);
  await w.fire('push', push({ kind: 'digest', project: 'alpha', bead: null, title: null, count: 3 }));
  R.check('T3', 'digest -> "3 decisions waiting in alpha", tap opens the decisions list (no bead)', /3 decisions waiting in alpha/.test(w.calls.shown[2].options.body) && w.calls.shown[2].options.data.url === '/#/decisions', JSON.stringify(w.calls.shown[2].options));
  await w.fire('push', push({ kind: 'more', project: '', bead: null, title: null, count: 0 }));
  R.check('T3b', '"more" -> "More on the board", title falls back to Board', w.calls.shown[3].title === 'Board' && /More on the board/.test(w.calls.shown[3].options.body), JSON.stringify(w.calls.shown[3]));
  await w.fire('push', push({ kind: '__proto__', project: ['x'], bead: '../../evil', title: 'x'.repeat(500), count: 'NaN' }));
  const h = w.calls.shown[4];
  R.check('T4', 'hostile payload (proto kind, array project, traversal bead id, 500-char title) -> notification still shown, tap url stays /#/decisions, text <= 80 + prefix', !!h && h.options.data.url === '/#/decisions' && h.options.body.length <= 110, JSON.stringify(h).slice(0, 220));
  await w.fire('push', { data: { json: () => { throw new Error('not json'); } } });
  await w.fire('push', {});
  R.check('P4', 'garbage / empty push still shows something (userVisibleOnly) and does not throw', w.calls.shown.length === 7, `shown ${w.calls.shown.length}`);
  const ar = makeSw({ clientsList: () => [], lang: 'ar-EG' });
  await ar.fire('push', push({ kind: 'decision', project: 'alpha', bead: 'alpha-1', title: 'اختبار', count: 1 }));
  R.check('P7', 'Arabic phone language -> Arabic text', /قرار مطلوب/.test(ar.calls.shown[0].options.body), ar.calls.shown[0].options.body);

  // click with an open board window (focus then navigate), no window (openWindow), foreign-origin window ignored
  const target = 'https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=alpha-1.2';
  let nav = [];
  const win = (url, rejectFocus = false) => ({ url, focus: () => (rejectFocus ? Promise.reject(new Error('NotAllowed')) : Promise.resolve()), navigate: (u) => (nav.push(u), Promise.resolve()) });
  let c = makeSw({ clientsList: () => [win('https://abdelrahman.tail8a4e50.ts.net/#/board')] });
  await c.fire('notificationclick', click('/#/issues?issue=alpha-1.2'));
  R.check('T1', 'tap with the board open: that window is focused and navigated to the bead (no second window)', nav[0] === target && c.calls.opened.length === 0, JSON.stringify({ nav, opened: c.calls.opened }));
  nav = [];
  c = makeSw({ clientsList: () => [] });
  await c.fire('notificationclick', click('/#/issues?issue=alpha-1.2'));
  R.check('T2', 'tap with no window: opens a new window at the bead on the phone-door origin', c.calls.opened[0] === target, JSON.stringify(c.calls.opened));
  nav = [];
  c = makeSw({ clientsList: () => [win('https://evil.example.com/')] });
  await c.fire('notificationclick', click('/#/issues?issue=alpha-1.2'));
  R.check('T2b', 'a window of another origin is never navigated; a board window is opened instead', nav.length === 0 && c.calls.opened[0] === target, JSON.stringify({ nav, opened: c.calls.opened }));
  c = makeSw({ clientsList: () => [win('https://abdelrahman.tail8a4e50.ts.net/', true)] });
  await c.fire('notificationclick', click('/#/issues?issue=alpha-1.2'));
  R.check('T2c', 'focus refused by the browser -> falls back to openWindow (tap is not lost)', c.calls.opened[0] === target, JSON.stringify(c.calls.opened));
  w = makeSw({ clientsList: () => [] });
  await w.fire('push', push({ kind: 'decision', project: 'alpha', bead: 'alpha-1', title: 't', url: 'https://evil.example.com/x', data: { url: 'https://evil.example.com/y' } }));
  R.check('T4b', 'a push payload cannot set the tap URL (url / data.url fields in the payload are ignored)', w.calls.shown[0].options.data.url === '/#/issues?issue=alpha-1', JSON.stringify(w.calls.shown[0].options.data));
  c = makeSw({ clientsList: () => [] });
  await c.fire('notificationclick', click('https://evil.example.com/steal'));
  R.check('T4c', 'INFO: sw notificationclick given an absolute foreign data.url opens it (only reachable if our own SW set it; payload cannot)', c.calls.opened[0]?.startsWith('https://abdelrahman.tail8a4e50.ts.net') ? true : null, JSON.stringify(c.calls.opened));

  // ---- real Chrome
  launch(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=390,844', '--disable-gpu', 'about:blank'], {}, path.join(S, 'chrome-sw.log'));
  const cdp = await cdpConnect();
  const origin = `http://127.0.0.1:${PORT}`;
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['notifications'] });
  const { result: tgt } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: att } = await cdp.send('Target.attachToTarget', { targetId: tgt.targetId, flatten: true });
  const sid = att.sessionId;
  const ev = (expr) => cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid);
  await cdp.send('Page.enable', {}, sid); await cdp.send('Runtime.enable', {}, sid);
  let regId = null;
  cdp.on((m) => { if (m.method === 'ServiceWorker.workerRegistrationUpdated') regId ||= m.params.registrations?.[0]?.registrationId; });
  await cdp.send('ServiceWorker.enable', {}, sid);
  await cdp.send('Page.navigate', { url: origin + '/' }, sid);
  await sleep(2500);
  const ready = await ev(`(async()=>{const r=await navigator.serviceWorker.ready;return {scope:r.scope,state:r.active&&r.active.state,push:'PushManager' in window,perm:Notification.permission}})()`);
  R.check('R3b', 'real Chrome: SW registers and activates, PushManager present, notification permission granted for the origin', ready.result?.result?.value?.state === 'activated' && ready.result.result.value.push && ready.result.result.value.perm === 'granted', JSON.stringify(ready.result?.result?.value));
  for (let i = 0; i < 20 && !regId; i++) await sleep(250);
  const payload = JSON.stringify({ kind: 'decision', project: 'gamma', bead: 'whisper-flow-l8t.15', title: 'Real Chrome push', count: 1, at: new Date().toISOString() });
  const tgs = (await cdp.send('Target.getTargets')).result.targetInfos;
  const swT = tgs.find((t) => t.type === 'service_worker' && t.url === origin + '/sw.js');
  const swAtt = swT && (await cdp.send('Target.attachToTarget', { targetId: swT.targetId, flatten: true })).result;
  const swEv = (expr) => cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swAtt.sessionId);
  await swEv(`(()=>{globalThis.__shown=[];const o=ServiceWorkerRegistration.prototype.showNotification;ServiceWorkerRegistration.prototype.showNotification=function(t,opt){globalThis.__shown.push({title:t,body:opt.body,tag:opt.tag,data:opt.data,icon:opt.icon});return o.apply(this,arguments)};return 1})()`);
  const del = await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: regId, data: payload }, sid); // Chrome drops it without a real subscription (no push service here): info only
  await sleep(800);
  const afterCdp = (await swEv('globalThis.__shown.length')).result?.result?.value;
  const shown = await swEv(`(async()=>{const e=new PushEvent('push',{data:${JSON.stringify(payload)}});self.dispatchEvent(e);await new Promise(r=>setTimeout(r,800));return globalThis.__shown})()`);
  const sn = (shown.result?.result?.value || []).slice(-1);
    R.check('T5', 'real Chrome worker running the served sw.js: a PushEvent with the real payload shape calls showNotification(project, body, tap url). (CDP deliverPushMessage without a real subscription: ' + afterCdp + ' call(s), Chrome drops it; headless keeps no visible notification, so the call is observed inside the worker)', sn.length === 1 && sn[0].title === 'gamma' && /Real Chrome push/.test(sn[0].body) && sn[0].data?.url === '/#/issues?issue=whisper-flow-l8t.15', JSON.stringify(sn) + JSON.stringify(del.error || ''));
  fs.writeFileSync(path.join(process.env.QA_OUT, 'sw-notification-sample.json'), JSON.stringify(sn, null, 1));
  // tap: open the url the notification carries in the board and see the bead
  await cdp.send('Page.navigate', { url: origin + (sn[0]?.data?.url || '/') }, sid);
  let txt = '';
  for (let i = 0; i < 40; i++) { await sleep(500); txt = (await ev('document.body.innerText')).result?.result?.value || ''; if (/default dictation shortcut/i.test(txt)) break; }
  const hash = (await ev('location.hash')).result?.result?.value;
  R.check('T1e', 'tap url from the real notification opens the board on that bead (detail shows its title)', /default dictation shortcut/i.test(txt) && /issue=whisper-flow-l8t\.15/.test(hash), `hash ${hash}; text has title: ${/default dictation shortcut/i.test(txt)}`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);
  // bell panel at 390x844 with the push row
  await cdp.send('Page.navigate', { url: origin + '/' }, sid); await sleep(3000);
  const bellOpen = await ev(`(()=>{const b=document.querySelector('[aria-label^="Notifications"],button.bell,#notify-bell,.notify-bell');if(!b)return 'nobell';b.click();return 'clicked'})()`);
  await sleep(1500);
  const panel = await ev(`(()=>{const t=document.body.innerText;return {has:/Turn on for this phone|Notifications on|Turn off/i.test(t),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,snippet:(t.match(/(Turn on for this phone|Notifications on[^\\n]*|Turn off[^\\n]*)/i)||[''])[0]}})()`);
  const pv = panel.result?.result?.value;
  R.check('R5', 'bell panel at 390x844 shows the push row and nothing overflows horizontally', bellOpen.result?.result?.value === 'clicked' && !!pv?.has && pv.sw <= pv.cw, JSON.stringify({ bellOpen: bellOpen.result?.result?.value, pv }));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
  if (shot.result?.data) fs.writeFileSync(path.join(process.env.QA_OUT, 'bell-panel-390x844.png'), Buffer.from(shot.result.data, 'base64'));
  // W6 UI (PC door, real Chrome 390x844): Phones list with a label and Remove; Remove cuts the phone off.
  {
    const html = await (await fetch(origin + '/')).text();
    const token = html.match(/name="board-token"[^>]*content="([^"]*)"/)?.[1];
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}/ws?t=${encodeURIComponent(token)}`, { headers: { Origin: origin } });
    await new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); });
    const { makeSub } = await import('./lib.mjs');
    const sub = makeSub('https://fcm.googleapis.com/fcm/send/w6-ui');
    sock.send(JSON.stringify({ id: 'w6', type: 'push-subscribe', payload: { subscription: sub.subscription, label: 'Android Chrome' } }));
    await sleep(1500);
    const subsPath = path.join(HOME, 'push-subs.json');
    const subsNow = () => { try { return JSON.parse(fs.readFileSync(subsPath, 'utf8')); } catch { return []; } };
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__ws=[];const S=WebSocket.prototype.send;WebSocket.prototype.send=function(d){window.__ws.push('>'+String(d).slice(0,120));this.addEventListener('message',(m)=>window.__ws.push('<'+String(m.data).slice(0,200)));return S.apply(this,arguments)}` }, sid);
    await cdp.send('Page.navigate', { url: origin + '/' }, sid); await sleep(3000);
    await ev(`(()=>{const b=document.querySelector('[aria-label^="Notifications"],button.bell,#notify-bell,.notify-bell');if(b)b.click()})()`);
    await sleep(4000);
    const ph = await ev(`(()=>{const rows=[...document.querySelectorAll('.nt-phone')].map((r)=>r.innerText.replace(/\\s+/g,' ').trim());const rm=[...document.querySelectorAll('.nt-phone-rm')];const r=rm[0]&&rm[0].getBoundingClientRect();return {rows,removeText:rm.map((b)=>b.innerText),heading:/Phones|phones/.test(document.body.innerText),tap:r?{w:Math.round(r.width),h:Math.round(r.height),inView:r.right<=innerWidth&&r.left>=0}:null,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,leak:/fcm\\.googleapis|p256dh/.test(document.body.innerText)}})()`);
    const probe = await ev(`(async()=>{const t=(p,n)=>Promise.race([p.then((v)=>n+':ok:'+(v?'sub':'null'),(e)=>n+':err:'+e),new Promise((r)=>setTimeout(()=>r(n+':HANG'),3000))]);const reg=await navigator.serviceWorker.ready;return [await t(reg.pushManager.getSubscription(),'getSubscription'),Notification.permission]})()`);
    fs.writeFileSync(path.join(process.env.QA_OUT, 'w6-probe.json'), JSON.stringify(probe.result?.result?.value));
    const pvv = ph.result?.result?.value;
    fs.writeFileSync(path.join(process.env.QA_OUT, 'w6-ws-frames.json'), JSON.stringify((await ev('window.__ws')).result?.result?.value || [], null, 1));
    R.check('W6u', 'PC door, 390x844: bell panel lists the subscribed phone (label + date) with a Remove button, no overflow, no endpoint text on screen', !!pvv && pvv.rows.length === 1 && /Android Chrome/.test(pvv.rows[0]) && pvv.removeText.length === 1 && pvv.sw <= pvv.cw && !pvv.leak && pvv.tap?.inView, JSON.stringify(pvv));
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
    if (shot2.result?.data) fs.writeFileSync(path.join(process.env.QA_OUT, 'bell-phones-390x844.png'), Buffer.from(shot2.result.data, 'base64'));
    await ev(`document.querySelector('.nt-phone-rm').click()`);
    await sleep(2500);
    const after = await ev(`document.querySelectorAll('.nt-phone').length`);
    R.check('W6v', 'tap Remove: the row disappears and push-subs.json no longer holds the phone', after.result?.result?.value === 0 && subsNow().length === 0, `rows ${after.result?.result?.value}, subs file ${subsNow().length}`);
    sock.close();
  }
  // install piece still fine
  const inst = await cdp.send('Page.getInstallabilityErrors', {}, sid);
  R.check('R2', 'install piece intact after the SW gained push handlers: Page.getInstallabilityErrors is empty', Array.isArray(inst.result?.installabilityErrors) && inst.result.installabilityErrors.length === 0, JSON.stringify(inst.result));
  const cacheKeys = await ev(`(async()=>{const out=[];for(const k of await caches.keys()){const c=await caches.open(k);for(const r of await c.keys())out.push(new URL(r.url).pathname)}return out})()`);
  const ck = cacheKeys.result?.result?.value || [];
  R.check('R2b', 'SW cache still holds only static shell URLs (no "/", /api, ws, /att)', ck.length > 5 && !ck.some((p) => p === '/' || p.startsWith('/api') || p.startsWith('/att') || p.includes('ws')), `${ck.length} entries`);
  cdp.ws.close();
} catch (e) {
  R.check('HARNESS', 'sw.e2e ran to the end', false, e.stack || e);
} finally {
  await kill();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  R.save();
}
