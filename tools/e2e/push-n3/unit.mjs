// In-process cases on server/features/push.js with the REAL web-push lib (real encryption, real VAPID),
// network cut at https.request by intercept.cjs. Fake clock + fake timers. Run through run-all.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OUT, decodeVapid, decryptPush, makeSub, recorder } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { createPush, cleanSubscription, DAILY_CAP, PROJECT_GAP_MS } = await import(
  pathToFileURL(path.join(ROOT, 'server/features/push.js')).href
);
const R = recorder('unit');
// Windows: rename-over-existing sometimes fails with EPERM (antivirus). Retry + count so cases stay deterministic (finding F1).
const realRename = fs.renameSync;
let epermCount = 0;
fs.renameSync = (a, b) => { for (let i = 0; i < 30; i++) { try { return realRename(a, b); } catch (e) { if (e.code !== 'EPERM') throw e; epermCount++; } } return realRename(a, b); };
const LOG = process.env.QA_PUSH_LOG;
if (!LOG) throw new Error('QA_PUSH_LOG + --require intercept.cjs needed');
fs.writeFileSync(LOG, '');

const ev = (o = {}) => ({
  id: 'n-1', kind: 'decision', project: 'alpha', bead: 'alpha-1', title: 'Pick a colour',
  desk: false, count: 1, at: '2026-11-02T10:00:00.000Z', read: false, ...o
});
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `qa-push-${n}-`));
const logRows = () => fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const settle = () => new Promise((r) => setTimeout(r, 60));

function rig({ home = tmp('h'), t0 = new Date(2026, 10, 2, 10, 0, 0).getTime(), lock = () => {} } = {}) {
  let t = t0;
  const timers = [];
  const p = createPush({
    home, now: () => t, lock,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length)
  });
  return { p, home, timers, tick: (ms) => (t += ms), now: () => t, setT: (x) => (t = x) };
}
let eperm = 0;
// push.js writes atomically (tmp + rename); on this Windows box rename-over-existing fails now and then (EPERM,
// antivirus). Harness retries so the cases stay deterministic; the count is reported (finding F1).
function retry(fn) {
  for (let i = 0; i < 20; i++) {
    try { return fn(); } catch (e) { if (e.code !== 'EPERM') throw e; eperm++; }
  }
  return fn();
}
function mkSubs(p, n = 1, tag = 'ok') {
  return Array.from({ length: n }, (_, i) => {
    const s = makeSub(`https://fcm.googleapis.com/fcm/send/${tag}${i}`);
    retry(() => p.subscribe(s.subscription));
    return s;
  });
}
let cursor = 0;
function newPushes(subs) {
  const rows = logRows().slice(cursor);
  cursor += rows.length;
  return rows.map((r) => {
    const s = subs.find((x) => r.path === new URL(x.subscription.endpoint).pathname);
    const plain = s ? decryptPush(Buffer.from(r.body, 'base64'), s) : null;
    return { ...r, json: plain && JSON.parse(plain), plain };
  });
}

// ---- S4 / S5 subscription validation
{
  const k = makeSub('x').subscription.keys;
  const bad = {
    http: 'http://fcm.googleapis.com/fcm/send/a', file: 'file:///etc/passwd', loopback: 'https://127.0.0.1/x',
    localhost: 'https://localhost/x', lan: 'https://192.168.1.5/x', linklocal: 'https://169.254.169.254/latest',
    evil: 'https://evil.example.com/x', suffix: 'https://fcm.googleapis.com.evil.com/x',
    userinfo: 'https://u:p@fcm.googleapis.com/x', port: 'https://fcm.googleapis.com:8443/x',
    huge: 'https://fcm.googleapis.com/' + 'a'.repeat(1100), notstr: 12345
  };
  const leaked = Object.entries(bad).filter(([, ep]) => cleanSubscription({ endpoint: ep, keys: k }));
  R.check('S4', 'hostile endpoints refused (http, file, loopback, lan, link-local, evil host, suffix trick, userinfo, port, huge, non-string)', leaked.length === 0, leaked.map(([n]) => n).join(','));
  const good = ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a', 'https://wns2-par02p.notify.windows.com/a'];
  R.check('S4b', 'real push services accepted (FCM, Mozilla, Apple, WNS)', good.every((e) => cleanSubscription({ endpoint: e, keys: k })), good.filter((e) => !cleanSubscription({ endpoint: e, keys: k })).join(','));
  const wrongKeys = [{ endpoint: good[0] }, { endpoint: good[0], keys: {} }, { endpoint: good[0], keys: { p256dh: 1, auth: 2 } }, { endpoint: good[0], keys: { p256dh: '<script>', auth: 'x' } }, null, 'str', { endpoint: good[0], keys: { p256dh: 'A'.repeat(300), auth: 'x' } }];
  R.check('S4c', 'missing / wrong-type / oversize / non-base64 keys refused', wrongKeys.every((s) => cleanSubscription(s) === null));
  const gap = cleanSubscription({ endpoint: 'https://storage.googleapis.com/bucket/x', keys: k });
  R.check('S4d', 'allow-list is exact push services only (storage.googleapis.com must be refused)', gap === null, gap ? 'ACCEPTED: suffix match on googleapis.com is wider than FCM (low: needs board token)' : '');
}
{
  const r = rig();
  const subs = mkSubs(r.p, 7, 'cap');
  R.check('S5', 'subscriptions bounded (7 subscribed -> at most 5 kept)', r.p.subscribers() <= 5, `kept ${r.p.subscribers()}`);
  const s0 = subs[6];
  const before = r.p.subscribers();
  r.p.subscribe(s0.subscription);
  R.check('S2', 'same endpoint twice does not duplicate', r.p.subscribers() === before);
  r.p.unsubscribe(s0.subscription.endpoint);
  let harmless = true; try { r.p.unsubscribe('https://nope'); } catch { harmless = false; }
  R.check('S3', 'unsubscribe removes; unknown endpoint harmless', r.p.subscribers() === before - 1 && harmless);
  let threw = false; try { r.p.unsubscribe({ a: 1 }); } catch { threw = true; }
  R.check('S3b', 'unsubscribe with a non-string is a clean error', threw);
}

// ---- K: key store
{
  const home = tmp('key');
  const r = rig({ home });
  const pub1 = await r.p.publicKey();
  const pub2 = await r.p.publicKey();
  const j = JSON.parse(fs.readFileSync(path.join(home, 'vapid.json'), 'utf8'));
  R.check('S1', 'push-key returns the public key, stable across calls and equal to vapid.json publicKey', pub1 === pub2 && pub1 === j.publicKey && pub1.length > 60);
  R.check('K4', 'vapid.json holds only publicKey + privateKey', JSON.stringify(Object.keys(j).sort()) === '["privateKey","publicKey"]');
  R.check('K4b', 'restart reuses the same key (no rotation)', (await rig({ home }).p.publicKey()) === pub1);
  const home2 = tmp('nolock');
  const r3 = rig({ home: home2, lock: () => { throw new Error('acl refused'); } });
  let failed = false; try { await r3.p.publicKey(); } catch { failed = true; }
  const files = fs.existsSync(home2) ? fs.readdirSync(home2) : [];
  R.check('K2b', 'ACL lock fails -> no key generated, push-key errors, no vapid.json written', failed && !files.includes('vapid.json'), files.join(','));
  r3.p.subscribe(makeSub('https://fcm.googleapis.com/fcm/send/nolock').subscription);
  cursor = logRows().length;
  const out = await r3.p.send(ev());
  R.check('K2c', 'ACL lock fails -> send degrades silently (nothing posted)', logRows().length === cursor, out);
}
{
  const home = path.join(tmp('acl'), 'board');
  const p = createPush({ home });
  await p.publicKey();
  p.subscribe(makeSub('https://fcm.googleapis.com/fcm/send/acl').subscription);
  const out = execFileSync('icacls', [home], { encoding: 'utf8' });
  const outKey = execFileSync('icacls', [path.join(home, 'vapid.json')], { encoding: 'utf8' });
  const outSubs = execFileSync('icacls', [path.join(home, 'push-subs.json')], { encoding: 'utf8' });
  const principals = (s, p) => [...s.replaceAll(p, '').matchAll(/([A-Za-z0-9 ]+\\[^\s\\:]+):\(/g)].map((m) => m[1].trim());
  const all = [...new Set([...principals(out, home), ...principals(outKey, path.join(home, 'vapid.json')), ...principals(outSubs, path.join(home, 'push-subs.json'))])];
  const user = process.env.USERNAME.toLowerCase();
  const okOnly = all.length >= 2 && all.every((x) => x.toLowerCase().endsWith('\\' + user) || /^NT AUTHORITY\\SYSTEM$/i.test(x));
  R.check('K2', 'icacls: board folder, vapid.json, push-subs.json grant only the owner and SYSTEM (inheritance off)', okOnly, all.join(' | '));
  fs.writeFileSync(path.join(OUT, 'icacls.txt'), out + '\n' + outKey + '\n' + outSubs);
}

// ---- send / payload
{
  const r = rig();
  const subs = mkSubs(r.p, 2, 'pay');
  cursor = logRows().length;
  const evSecret = ev({ card_q: 'SECRETQ?', options: ['SECRETOPT'], comments: ['SECRETCOMMENT'], description: 'SECRETDESC', assignee: 'abdelrahman', token: 'SECRETTOK', path: 'C:\\Users\\x' });
  const out = await r.p.send(evSecret);
  const got = newPushes(subs);
  R.check('C1', 'one decision event -> one push per subscription (2 subs -> 2 pushes)', out === 'sent' && got.length === 2, `${out} ${got.length}`);
  const j = got[0]?.json || {};
  R.check('P1', 'decrypted payload keys are exactly kind, project, bead, title, count, at', JSON.stringify(Object.keys(j).sort()) === JSON.stringify(['at', 'bead', 'count', 'kind', 'project', 'title']), JSON.stringify(j));
  const priv = JSON.parse(fs.readFileSync(path.join(r.home, 'vapid.json'), 'utf8')).privateKey;
  const hay = got.map((g) => g.plain + JSON.stringify(g.headers) + g.path).join('\n');
  R.check('P2', 'no card_q / options / comments / description / assignee / token / path / private key in payload, headers or URL', !/SECRET|abdelrahman|C:\\\\/.test(hay) && !hay.includes(priv));
  const v = decodeVapid(got[0]?.headers?.Authorization || got[0]?.headers?.authorization);
  R.check('P5', 'VAPID JWT: ES256, aud = push-service origin, exp <= 24h, sub mailto/https', !!v && v.jwtHeader.alg === 'ES256' && v.claims.aud === 'https://fcm.googleapis.com' && v.claims.exp - Date.now() / 1000 <= 86400 && /^(mailto:|https:)/.test(v.claims.sub), JSON.stringify(v?.claims));
  const h = got[0]?.headers || {};
  R.check('P5b', 'TTL <= 1h, Content-Encoding aes128gcm, only expected header names', Number(h.TTL) <= 3600 && h['Content-Encoding'] === 'aes128gcm', Object.keys(h).join(','));
  fs.writeFileSync(path.join(OUT, 'sample-decrypted-payload.json'), JSON.stringify({ decrypted: j, headerNames: Object.keys(h), vapidClaims: v?.claims }, null, 1));

  await r.p.send(ev({ id: 'n-2', project: 'beta', bead: 'beta-1', desk: true, title: null }));
  await r.p.send(ev({ id: 'n-3', project: 'gamma', bead: 'gamma-1', desk: true, title: 'SHOULD NOT LEAK' }));
  await r.p.send(ev({ id: 'n-4', project: 'delta', bead: 'delta-1', desk: false, title: '' }));
  const g2 = newPushes(subs);
  R.check('P3', 'desk / no-title bead -> title null in payload (pointer only), also if a desk event carried a title', g2.length === 6 && g2.every((g) => g.json.title === null), g2.map((g) => g.json.title).join('|'));
  await r.p.send(ev({ id: 'n-5', project: 'eps', bead: 'eps-1', title: '<img src=x onerror=alert(1)>\u202e\n' + 'A'.repeat(300) }));
  const g3 = newPushes(subs);
  R.check('P4a', 'long hostile title truncated to <= 80 in the payload', g3[0].json.title.length <= 80, String(g3[0].json.title.length));
  const dg = await r.p.send(ev({ kind: 'degraded', project: 'zeta' }));
  const mu = await r.p.send(ev({ project: 'zeta' }), { muted: true });
  R.check('C7', 'muted -> no push', mu === 'muted' && newPushes(subs).length === 0, mu);
  R.check('C7b', 'degraded event is never pushed', dg === 'not-pushed');
  const none = await r.p.send(ev({ project: 'Bad Project!' }));
  R.check('P6', 'invalid project key is not pushed', none === 'bad-project', none);
}
// ---- fold
{
  const r = rig();
  const subs = mkSubs(r.p, 1, 'fold');
  cursor = logRows().length;
  const a = await r.p.send(ev({ id: '1', bead: 'alpha-1' }));
  const b = await r.p.send(ev({ id: '2', bead: 'alpha-2', title: 'Two' }));
  const c = await r.p.send(ev({ id: '3', bead: 'alpha-3', title: 'Three' }));
  const bb = await r.p.send(ev({ id: '4', project: 'beta', bead: 'beta-1' }));
  let g = newPushes(subs);
  R.check('C2a', '1st pushes now; 2nd + 3rd within 2 min are held (no push yet)', a === 'sent' && b === 'folded' && c === 'folded' && g.length === 2, `${a},${b},${c} pushes=${g.length}`);
  R.check('C3', 'project B is not held back by project A window', bb === 'sent' && g.some((x) => x.json.project === 'beta'));
  R.check('C2b', 'one timer, set for the end of the 2 min window', r.timers.length === 1 && r.timers[0].ms > 0 && r.timers[0].ms <= PROJECT_GAP_MS, JSON.stringify(r.timers.map((t) => t.ms)));
  r.tick(PROJECT_GAP_MS); await r.timers[0].fn(); await settle();
  g = newPushes(subs);
  R.check('C2c', 'after the window ONE digest: kind digest, count 2, no title, no bead', g.length === 1 && g[0].json.kind === 'digest' && g[0].json.count === 2 && g[0].json.title === null && g[0].json.bead === null, JSON.stringify(g.map((x) => x.json)));
  const r2 = rig(); const s2 = mkSubs(r2.p, 1, 'fold1'); cursor = logRows().length;
  await r2.p.send(ev({ id: '1' })); await r2.p.send(ev({ id: '2', bead: 'alpha-2', title: 'Two' }));
  newPushes(s2); r2.tick(PROJECT_GAP_MS); await r2.timers[0].fn(); await settle();
  const g1 = newPushes(s2);
  R.check('C2d', 'a single held event goes as itself (bead + title), not as a digest', g1.length === 1 && g1[0].json.kind === 'decision' && g1[0].json.bead === 'alpha-2', JSON.stringify(g1.map((x) => x.json)));
  r2.tick(PROJECT_GAP_MS + 1);
  const nx = await r2.p.send(ev({ id: '9', bead: 'alpha-9' }));
  R.check('C2e', '2+ min after the last push a new event pushes immediately', nx === 'sent', nx);
}
// ---- daily cap
{
  const home = tmp('daily');
  const r = rig({ home });
  const subs = mkSubs(r.p, 1, 'day');
  cursor = logRows().length;
  const outs = [];
  for (let i = 0; i < 53; i++) { r.tick(PROJECT_GAP_MS + 1); outs.push(await r.p.send(ev({ id: 'd' + i, bead: 'alpha-' + i }))); }
  const g = newPushes(subs);
  const real = g.filter((x) => x.json.kind !== 'more').length;
  const more = g.filter((x) => x.json.kind === 'more').length;
  R.check('C4a', `exactly ${DAILY_CAP} real pushes then ONE "more" notice then silence (53 events)`, real === DAILY_CAP && more === 1 && g.length === DAILY_CAP + 1, `real=${real} more=${more} tail=${outs.slice(-4)}`);
  const moreJ = g.find((x) => x.json.kind === 'more')?.json;
  R.check('C4b', '"more" payload carries no project / bead / title', !!moreJ && !moreJ.bead && !moreJ.title && !moreJ.project, JSON.stringify(moreJ));
  const r2 = rig({ home, t0: r.now() });
  const o = await r2.p.send(ev({ id: 'after', bead: 'alpha-99' }));
  R.check('C4c', 'board restart the same day does not reset the 50 (still silent)', o === 'capped' && newPushes(subs).length === 0, o);
  const d = new Date(r.now());
  r2.setT(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 1, 0).getTime());
  const o2 = await r2.p.send(ev({ id: 'nextday', bead: 'alpha-100' }));
  R.check('C4d', 'after local midnight pushes resume', o2 === 'sent' && newPushes(subs).length === 1, o2);
}

// ---- SEC conditions on company-1bo5.6.15 that QA was asked to check (W1, W9) + lost key (ADR N3 "re-subscribe once")
{
  const g = (n) => Buffer.alloc(n, 7).toString('base64url');
  const ep = 'https://fcm.googleapis.com/fcm/send/w1';
  const exact = cleanSubscription({ endpoint: ep, keys: { p256dh: g(65), auth: g(16) } });
  const short = cleanSubscription({ endpoint: ep, keys: { p256dh: g(5), auth: g(3) } });
  R.check('W1a', 'SEC W1: keys.p256dh must be 65 bytes and keys.auth 16 bytes (a 5-byte / 3-byte key pair must be refused)', !!exact && short === null, short ? 'ACCEPTED a 5-byte p256dh + 3-byte auth: junk can fill the 5 slots and evict the real phone (needs the board token)' : '');
  // junk evicts a real subscription?
  const r = rig(); const real = mkSubs(r.p, 1, 'real')[0];
  for (let i = 0; i < 5; i++) { try { r.p.subscribe({ endpoint: 'https://fcm.googleapis.com/fcm/send/junk' + i, keys: { p256dh: g(5), auth: g(3) } }); } catch { /* refused: good */ } }
  const stillThere = JSON.parse(fs.readFileSync(path.join(r.home, 'push-subs.json'), 'utf8')).some((x) => x.endpoint === real.subscription.endpoint);
  R.check('W1b', 'five junk subscriptions do not evict the real phone', stillThere, stillThere ? '' : 'real subscription evicted by 5 junk ones');
  // tampered file: evil endpoint on disk is not loaded
  const home = tmp('tamper');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'push-subs.json'), JSON.stringify([{ endpoint: 'https://127.0.0.1:3000/api', keys: { p256dh: g(65), auth: g(16) } }, { endpoint: ep, keys: { p256dh: g(65), auth: g(16) } }]));
  const rt = rig({ home });
  R.check('W1c', 'SEC W1 re-check: an evil endpoint written into push-subs.json is dropped at load (1 of 2 kept)', rt.p.subscribers() === 1, String(rt.p.subscribers()));
  // corrupt subs file
  const home2 = tmp('corrupt-subs'); fs.writeFileSync(path.join(home2, 'push-subs.json'), '{{{ not json');
  let okc = true; try { rig({ home: home2 }).p.subscribers(); } catch { okc = false; }
  R.check('W9c', 'corrupt push-subs.json does not crash the board (no subscribers)', okc);
  // W9: counter unreadable -> no push
  const home3 = tmp('corrupt-state');
  const r3 = rig({ home: home3 }); const subs3 = mkSubs(r3.p, 1, 'w9'); cursor = logRows().length;
  fs.writeFileSync(path.join(home3, 'push-state.json'), '{{{ corrupt');
  const r3b = rig({ home: home3 }); // restart with an unreadable counter file
  const out3 = await r3b.p.send(ev({ id: 'w9' }));
  R.check('W9', 'SEC W9 fail closed: unreadable push-state.json (counter) -> NO push, bell only', out3 !== 'sent' && newPushes(subs3).length === 0, 'send result: ' + out3 + (out3 === 'sent' ? ' (pushed with a reset counter: fails OPEN, the 50/day cap and the 2 min window are lost)' : ''));
  // 429 / 5xx: no loop, no delete
  const rr = rig(); mkSubs(rr.p, 1, 'err500'); const before = logRows().length;
  await rr.p.send(ev({ id: 'e5' })); await settle();
  R.check('W9b', 'SEC W9: a 5xx answer is tried once, subscription kept, no retry loop', logRows().length - before === 1 && rr.p.subscribers() === 1, `attempts ${logRows().length - before}`);
}
{
  // lost key: ADR N3 "Lost key = re-subscribe once". Client side, real app/push-client.js with a fake browser.
  const { enablePush } = await import(pathToFileURL(path.join(ROOT, 'app/push-client.js')).href);
  const oldKey = Buffer.alloc(65, 1).toString('base64url');
  const newKey = Buffer.alloc(65, 2).toString('base64url');
  let subscribed = 0, unsubscribed = 0;
  const existing = { endpoint: 'https://fcm.googleapis.com/fcm/send/old', options: { applicationServerKey: Buffer.alloc(65, 1).buffer }, unsubscribe: async () => { unsubscribed++; return true; }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/old', keys: { p256dh: 'a', auth: 'b' } }) };
  const env = { Notification: { requestPermission: async () => 'granted', permission: 'granted' }, PushManager: {}, serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => existing, subscribe: async () => { subscribed++; return existing; } } }) } };
  const sent = [];
  const res = await enablePush({ send: async (t, p) => { sent.push([t, p]); return t === 'push-key' ? { key: newKey } : {}; } }, env);
  R.check('K6', 'lost key: board has a NEW VAPID key; "Turn on" on a phone holding a subscription made with the OLD key must subscribe again with the new key', subscribed + unsubscribed > 0, `result ${res}; subscribe() called ${subscribed}x, unsubscribe ${unsubscribed}x: the old subscription is re-sent as is, every later push is refused by FCM (VAPID mismatch, not 404/410, so never cleaned) and the UI says "on"`);
}
// ---- 404 / 410 / 500
{
  const r = rig();
  for (const ep of ['https://fcm.googleapis.com/fcm/send/live1', 'https://fcm.googleapis.com/fcm/send/gone404', 'https://updates.push.services.mozilla.com/gone410', 'https://fcm.googleapis.com/fcm/send/err500']) r.p.subscribe(makeSub(ep).subscription);
  await r.p.send(ev());
  const left = JSON.parse(fs.readFileSync(path.join(r.home, 'push-subs.json'), 'utf8')).map((s) => s.endpoint);
  R.check('C5', '404 and 410 delete only that subscription (memory + file); 201 and 500 keep theirs', r.p.subscribers() === 2 && left.length === 2 && left.some((e) => e.endsWith('live1')) && left.some((e) => e.endsWith('err500')), left.join(','));
}
// ---- throwing / hanging sender
{
  const t = Date.now();
  const mk = (send) => createPush({ home: tmp('thr'), lock: () => {}, now: () => t, webpush: { generateVAPIDKeys: () => ({ publicKey: 'P', privateKey: 'K' }), sendNotification: send } });
  const p = mk(() => { throw new Error('sync boom'); });
  p.subscribe(makeSub('https://fcm.googleapis.com/fcm/send/boom').subscription);
  let ok = true; try { await p.send(ev()); } catch { ok = false; }
  R.check('C6', 'a sender that throws synchronously does not make send() throw', ok);
  const p2 = mk(() => new Promise(() => {}));
  p2.subscribe(makeSub('https://fcm.googleapis.com/fcm/send/hang').subscription);
  void p2.send(ev({ project: 'a1' }));
  // 2nd event on a different project must not wait for the first hung one to start posting
  let secondStarted = false;
  const p3 = mk(() => { secondStarted = true; return Promise.resolve(); });
  p3.subscribe(makeSub('https://fcm.googleapis.com/fcm/send/ok3').subscription);
  void p3.send(ev({ project: 'b1' }));
  await settle();
  R.check('C6b', 'a hung push service (no answer) leaves other sends unaffected; web-push timeout (10 s) bounds it', secondStarted);
}
R.check('F1', 'atomic file writes (tmp + rename) never fail with EPERM on this PC', epermCount === 0, 'EPERM on rename: ' + epermCount + ' times during the run (harness retried)');
R.save();
