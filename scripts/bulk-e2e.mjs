#!/usr/bin/env node
/**
 * End-to-end check of the bulk API (beads-lite-1bo5.6.63.1, acceptance 2-8)
 * against a COPY of a project's .beads. Starts a board server on a free port,
 * drives it over the real websocket, asserts with `bd`, stops it by PID.
 *
 *   node scripts/bulk-e2e.mjs <project-copy-dir> <out-dir>   (BD_BIN = real bd.exe)
 *
 * Never point it at a live project: it creates and closes tasks.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createBulkApi } from '../app/ui/data/bulk.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proj = path.resolve(process.argv[2] || '');
const out = path.resolve(process.argv[3] || '');
if (!fs.existsSync(path.join(proj, '.beads')) || !process.argv[3]) {
  console.error('usage: bulk-e2e.mjs <project-copy-dir> <out-dir>');
  process.exit(2);
}
if (!process.env.BD_BIN) {
  console.error('set BD_BIN to the real bd.exe');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const BD = process.env.BD_BIN;
const rows = [];
const check = (name, ok, detail = '') => {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
};

function bd(args, env = {}) {
  return spawnSync(BD, args, {
    cwd: proj,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env }
  });
}
function show(id) {
  const r = bd(['show', id, '--json']);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0];
}
function create(title, extra = []) {
  const r = bd(['create', title, '-t', 'task', '-p', '3', '--json', ...extra]);
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).id;
}
function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {any} */ (s.address()).port;
      s.close(() => res(p));
    });
  });
}

const port = await freePort();
if (port === 3000 || port === 3001) throw new Error('refusing port');
const server = spawn(
  process.execPath,
  [path.join(root, 'server', 'index.js')],
  {
    cwd: proj,
    env: {
      ...process.env,
      PORT: String(port),
      PHONE_PORT: 'off',
      BDUI_BOARD_HOME: path.join(out, 'board-home')
    },
    stdio: [
      'ignore',
      fs.openSync(path.join(out, 'server.log'), 'w'),
      'inherit'
    ],
    windowsHide: true
  }
);
const pid = server.pid;
let ws;
const pending = new Map();
let seq = 0;
const send = (type, payload) =>
  new Promise((res) => {
    const id = 'e' + ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, type, payload }));
  });

async function main() {
  let token = '';
  for (let i = 0; i < 80 && !token; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      token = (html.match(/name="board-token" content="([^"]+)"/) || [])[1];
    } catch {
      // not up yet
    }
  }
  if (!token) throw new Error('server did not start');
  ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  const apply = (action, ids, params, take_over = false) =>
    send('bulk-apply', { action, ids, params, take_over });

  // Acceptance 2: close 5 with a reason, marker on each close.
  const five = Array.from({ length: 5 }, (_, i) => create('bk close ' + i));
  let r = await apply('close', five, { reason: 'batch done' });
  check('2 reply ok, 5 results', r.ok && r.payload.results.length === 5);
  check(
    '2 all five ok',
    r.payload.results.every((x) => x.ok)
  );
  const batch = r.payload.batch;
  check(
    '2 each closed with reason + bulk marker',
    five.every((id) => {
      const s = show(id);
      return (
        s.status === 'closed' && s.close_reason === `[bulk:${batch}] batch done`
      );
    })
  );
  const hist = bd(['history', five[0], '--events']).stdout;
  check('2 closed event carries marker', hist.includes(`bulk:${batch}`));

  // Acceptance 3: mixed batch.
  const ok3 = Array.from({ length: 3 }, (_, i) => create('bk mix ' + i));
  const parent = create('bk parent');
  create('bk child', ['--parent', parent]);
  const done = create('bk already');
  bd(['close', done, '-r', 'x']);
  r = await apply('close', [...ok3, parent, done], { reason: 'mixed' });
  const byId = Object.fromEntries(r.payload.results.map((x) => [x.id, x]));
  check(
    '3 three closed',
    ok3.every((id) => byId[id].ok && show(id).status === 'closed')
  );
  check(
    '3 parent refused children',
    byId[parent].reason === 'children' && show(parent).status === 'open'
  );
  check(
    '3 closed one refused already_closed',
    byId[done].reason === 'already_closed'
  );

  // Acceptance 4: move 4 + relabel 4.
  const mv = Array.from({ length: 4 }, (_, i) =>
    create('bk move ' + i, ['-l', 'bk-old'])
  );
  r = await apply('move', mv, { status: 'blocked' });
  check(
    '4 move: 4 ok',
    r.payload.results.every((x) => x.ok)
  );
  check(
    '4 move event carries marker',
    bd(['history', mv[0], '--events']).stdout.includes(
      '"bulk":"' + r.payload.batch + '"'
    )
  );
  check(
    '4 move: bd show agrees',
    mv.every((id) => show(id).status === 'blocked')
  );
  r = await apply('label', mv, { add: ['bk-new'], remove: ['bk-old'] });
  check(
    '4 label: 4 ok',
    r.payload.results.every((x) => x.ok)
  );
  check(
    '4 label: bd show agrees',
    mv.every((id) => {
      const l = show(id).labels || [];
      return l.includes('bk-new') && !l.includes('bk-old');
    })
  );
  // "After a reload": the board reads the list; it must agree with bd show.
  const listed = (label) =>
    bd(['list', '--json', '-n', '0', '-l', label]).stdout;
  check(
    '4 reload: list by label agrees for all 4',
    mv.every(
      (id) => listed('bk-new').includes(id) && !listed('bk-old').includes(id)
    )
  );
  r = await apply('label', mv, { add: ['bk-extra'], remove: [] });
  const lb = r.payload.batch;
  check(
    '4 add one label to 4',
    mv.every((id) => (show(id).labels || []).includes('bk-extra'))
  );
  await send('bulk-undo', { batch: lb });
  check(
    '4 undo of label add',
    mv.every((id) => !(show(id).labels || []).includes('bk-extra'))
  );
  r = await apply('assign', mv, { assignee: 'qa' });
  check(
    'assign 4 to a role',
    r.payload.results.every((x) => x.ok) &&
      mv.every((id) => show(id).assignee === 'qa')
  );
  await send('bulk-undo', { batch: r.payload.batch });
  check(
    'assign undo clears',
    mv.every((id) => !show(id).assignee)
  );
  r = await apply('move', mv, { status: 'blocked' });
  check(
    '4 move to same status refused same',
    r.payload.results.every((x) => x.reason === 'same')
  );

  // Acceptance 5: defer.
  const df = Array.from({ length: 3 }, (_, i) => create('bk defer ' + i));
  const until = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  r = await apply('defer', df, { until });
  check(
    '5 defer: 3 ok',
    r.payload.results.every((x) => x.ok)
  );
  const ready = bd(['ready', '--json', '-n', '0']).stdout;
  check(
    '5 deferred and out of ready',
    df.every((id) => show(id).status === 'deferred' && !ready.includes(id)),
    df.map((id) => show(id).status).join(',')
  );
  r = await apply('defer', [create('bk defer open-ended')], { until: '' });
  check('5 defer without date ok', r.payload.results[0].ok);
  r = await apply('move', df, { status: 'open' });
  check(
    '5 reopen via move returns them',
    df.every((id) => show(id).status === 'open')
  );

  // Acceptance 6: guards.
  const dec = create('bk decision');
  bd(['update', dec, '--status', 'owner_decision']);
  const live = create('bk live');
  bd(['update', live, '--claim'], {
    BEADS_ACTOR: 'other-agent',
    BD_ACTOR: 'other-agent'
  });
  r = await apply('close', [dec, live], { reason: 'guard' });
  const g = Object.fromEntries(r.payload.results.map((x) => [x.id, x]));
  check(
    '6 owner_decision refused',
    g[dec].reason === 'decision' && show(dec).status === 'owner_decision'
  );
  check(
    '6 live lease skipped',
    g[live].reason === 'live' && show(live).status === 'in_progress',
    JSON.stringify(g[live])
  );
  r = await apply('close', [dec], { reason: 'guard' }, true);
  check(
    '6 owner_decision refused even with take over',
    r.payload.results[0].reason === 'decision'
  );
  r = await apply('close', [live], { reason: 'taken' }, true);
  check(
    '6 take over closes live task',
    r.payload.results[0].ok && show(live).status === 'closed',
    JSON.stringify(r.payload.results[0])
  );

  // Acceptance 7: undo restores status + labels (checked against pre-state).
  const u = Array.from({ length: 3 }, (_, i) =>
    create('bk undo ' + i, ['-l', 'keepme'])
  );
  bd(['update', u[0], '--status', 'blocked']);
  const snap = () =>
    u.map((id) => ({
      id,
      status: show(id).status,
      labels: (show(id).labels || []).sort()
    }));
  const before = snap();
  r = await apply('close', u, { reason: 'undo me' });
  const ub = r.payload.batch;
  r = await apply('label', u, { add: [], remove: ['keepme'] });
  const ub2 = r.payload.batch;
  const u1 = await send('bulk-undo', { batch: ub2 });
  check('7 undo label restored 3', u1.payload.restored === 3);
  const u2 = await send('bulk-undo', { batch: ub });
  check('7 undo close restored 3', u2.payload.restored === 3);
  const after = snap();
  check(
    '7 status+labels equal prior state',
    JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify(after)
  );
  const u3 = await send('bulk-undo', { batch: ub });
  check('7 second undo of same batch restores 0', u3.payload.restored === 0);
  const late = await apply('close', [u[1]], { reason: 'late' });
  await new Promise((r2) => setTimeout(r2, 15500));
  const u4 = await send('bulk-undo', { batch: late.payload.batch });
  check(
    '7 undo after expiry restores 0',
    u4.payload.restored === 0 && show(u[1]).status === 'closed'
  );

  // Acceptance 8: cap.
  const keep = create('bk cap');
  const ids51 = [keep, ...Array.from({ length: 50 }, (_, i) => 'nope-' + i)];
  r = await apply('close', ids51, { reason: 'cap' });
  check(
    '8 51 ids refused, nothing applied',
    !r.ok && r.error.code === 'too_many' && show(keep).status === 'open',
    JSON.stringify(r.error)
  );
  r = await apply('close', [keep], { reason: '' });
  check('bad: empty reason refused', !r.ok && show(keep).status === 'open');
  r = await apply('close', ['nope-1'], { reason: 'x' });
  check('missing id reported', r.payload.results[0].reason === 'missing');

  // UI adapter on the real socket (fixture mode off): same mapping the board uses.
  const api = createBulkApi({
    transport: async (type, payload) => {
      const m = await send(type, payload);
      if (!m.ok) throw new Error(m.error?.code || 'error');
      return m.payload;
    }
  });
  const ui = [create('bk ui 0'), create('bk ui 1'), parent];
  const ur = await api.apply(
    { action: 'close', ids: ui, params: { reason: 'ui' }, take_over: false },
    []
  );
  check(
    'UI adapter live: preview false, 2 ok, parent refused children',
    ur.preview === false &&
      ur.ok.length === 2 &&
      ur.refused[0]?.reason === 'children'
  );
  check(
    'UI adapter undo restores 2',
    (await api.undo(ur.batch)) === 2 &&
      ui.slice(0, 2).every((id) => show(id).status === 'open')
  );

  // Speed: 20-task close.
  const twenty = Array.from({ length: 20 }, (_, i) => create('bk speed ' + i));
  const t0 = Date.now();
  r = await apply('close', twenty, { reason: 'speed' });
  const ms = Date.now() - t0;
  check(
    'perf 20-task close under 3 s',
    r.payload.results.every((x) => x.ok) && ms < 3000,
    ms + ' ms'
  );
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  check('script ran to the end', false, String(e?.stack || e));
} finally {
  try {
    ws?.close();
  } catch {
    // ignore
  }
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true
  });
}
const bad = rows.filter((x) => !x.ok);
fs.writeFileSync(
  path.join(out, 'summary.md'),
  `# bulk e2e (copy of a project)\n\n${rows.length - bad.length}/${rows.length} passed\n\n` +
    rows
      .map(
        (x) =>
          `- ${x.ok ? 'PASS' : 'FAIL'} ${x.name}${x.detail ? ' (' + x.detail + ')' : ''}`
      )
      .join('\n') +
    '\n'
);
process.exit(bad.length || failed ? 1 : 0);
