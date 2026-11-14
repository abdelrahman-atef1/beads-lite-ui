#!/usr/bin/env node
/**
 * End-to-end check of @mentions (beads-lite-1bo5.6.64.1, acceptance 2-4, 8-10)
 * against a COPY of a project's .beads. Starts a board server on a free port,
 * drives it over the real websocket with a TEMPORARY wake queue (never the live
 * one), asserts with `bd` and wake.mjs, stops the server by PID.
 *
 *   node scripts/mention-e2e.mjs <project-copy-dir> <out-dir>
 *   env: BD_BIN (real bd.exe), MENTION_WAKE_SCRIPT (wake.mjs with kind mention)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proj = path.resolve(process.argv[2] || '');
const out = path.resolve(process.argv[3] || '');
if (!fs.existsSync(path.join(proj, '.beads')) || !process.argv[3]) {
  console.error('usage: mention-e2e.mjs <project-copy-dir> <out-dir>');
  process.exit(2);
}
if (!process.env.BD_BIN || !process.env.MENTION_WAKE_SCRIPT) {
  console.error('set BD_BIN and MENTION_WAKE_SCRIPT');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const BD = process.env.BD_BIN;
const WAKE = process.env.MENTION_WAKE_SCRIPT;
const wakeRoot = path.join(out, 'wake-queue');
const projects = path.join(out, 'projects.list');
fs.writeFileSync(projects, `# test\n${proj.replace(/\\/g, '/')}\n`);
const env = {
  ...process.env,
  WAKE_ROOT: wakeRoot,
  WAKE_PROJECTS_LIST: projects,
  MENTION_WAKE_SCRIPT: WAKE,
  BDUI_BOARD_HOME: path.join(out, 'board-home')
};
const rows = [];
const check = (name, ok, detail = '') => {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
};
const bd = (args, extra = {}) =>
  spawnSync(BD, args, {
    cwd: proj,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...env, ...extra }
  });
const wakeList = () =>
  spawnSync(process.execPath, [WAKE, 'list'], {
    encoding: 'utf8',
    windowsHide: true,
    env
  }).stdout;
const pendingFiles = () => {
  try {
    return fs.readdirSync(path.join(wakeRoot, 'pending'));
  } catch {
    return [];
  }
};
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {any} */ (s.address()).port;
      s.close(() => res(p));
    });
  });

const port = await freePort();
if (port === 3000 || port === 3001) throw new Error('refusing port');
const server = spawn(
  process.execPath,
  [path.join(root, 'server', 'index.js')],
  {
    cwd: proj,
    env: { ...env, PORT: String(port), PHONE_PORT: 'off' },
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
  const c = bd(['create', 'mention e2e', '-t', 'task', '-p', '3', '--json']);
  const id = JSON.parse(c.stdout.slice(c.stdout.indexOf('{'))).id;
  const say = async (text) => {
    const r = await send('add-comment', { id, text });
    if (!r.ok) throw new Error('add-comment failed ' + JSON.stringify(r));
    return send('mention-scan', { id });
  };

  // 1 picker list
  let r = await send('mention-roles', {});
  check(
    '1 roles list has qa and owner',
    r.ok && r.payload.roles.includes('qa') && r.payload.owner
  );

  // 2 one mention, one event, bead and role only
  r = await say('@qa check the phone layout');
  check(
    '2 scan ok, one result waiting',
    r.ok &&
      r.payload.results.length === 1 &&
      r.payload.results[0].chip === 'waiting',
    JSON.stringify(r.payload)
  );
  const files = pendingFiles();
  check('2 exactly one pending file', files.length === 1);
  const ev = JSON.parse(
    fs.readFileSync(path.join(wakeRoot, 'pending', files[0]), 'utf8')
  );
  check(
    '2 event has bead + role qa, no text',
    ev.bead === id &&
      ev.role === 'qa' &&
      ev.kind === 'mention' &&
      !JSON.stringify(ev).includes('phone')
  );
  check('2 wake.mjs list shows it', wakeList().includes(id));

  // 3 fences, quotes, unknown names, rescan
  const before = pendingFiles().length;
  await say('```\n@swe in a fence\n```\n> @pm quoted\n@nobody');
  check('3 fence/quote/unknown: no event', pendingFiles().length === before);
  r = await send('mention-scan', { id });
  check('3 rescan fires nothing', r.ok && r.payload.results.length === 0);

  // 4 five roles: 3 wake, 2 limit
  r = await say('@pm @cos @swe @ux @sre');
  const chips = r.payload.results.map((x) => x.chip).join(',');
  check(
    '4 five roles: 3 waiting 2 limit',
    chips === 'waiting,waiting,waiting,limit,limit',
    chips
  );
  r = await say('@qa again');
  check(
    '4 same role within 10 min merged',
    r.payload.results[0].verdict === 'merged'
  );

  // 9 owner bell
  r = await say('@owner please look');
  check('9 owner chip seen', r.payload.results[0].chip === 'seen');
  const nl = await send('notify-list', {});
  check(
    '9 bell has a mention event',
    nl.ok &&
      nl.payload.events.some((e) => e.kind === 'mention' && e.bead === id)
  );
  check('9 no wake file for owner', !wakeList().includes('owner'));

  // agent door (CLI): qa was woken by the owner, legal is woken by qa, legal may not wake qa
  const sc = () =>
    spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'mention-scan.mjs'), proj, id],
      { encoding: 'utf8', windowsHide: true, env }
    );
  bd(['comments', 'add', id, 'agent reply, over to @legal'], {
    BD_ACTOR: 'qa'
  });
  const a = sc();
  check(
    'agent comment scanned by the CLI',
    a.status === 0 && /legal /.test(a.stdout),
    a.stdout.trim() + a.stderr.trim()
  );
  bd(['comments', 'add', id, 'back to you @qa'], { BD_ACTOR: 'legal' });
  const b = sc();
  check(
    'loop: legal cannot wake qa (loop verdict)',
    /qa limit loop/.test(b.stdout),
    b.stdout.trim()
  );

  // 8 router.off
  fs.writeFileSync(path.join(wakeRoot, 'router.off'), '');
  const n2 = pendingFiles().length;
  r = await say('@analytics hello');
  check(
    '8 router.off: paused, nothing emitted',
    r.payload.results[0].chip === 'paused' && pendingFiles().length === n2
  );
  fs.rmSync(path.join(wakeRoot, 'router.off'));

  // 10 audit
  const lg = fs.readFileSync(path.join(wakeRoot, 'router.log'), 'utf8');
  const lines = (lg.match(/ mention /g) || []).length;
  const pv = fs
    .readFileSync(path.join(out, 'board-home', 'mention-log.jsonl'), 'utf8')
    .trim()
    .split('\n');
  check('10 router.log has a line per mention', lines >= 8, String(lines));
  check(
    '10 one provenance record per router.log mention line',
    pv.length === lines,
    `${pv.length} vs ${lines}`
  );
}

try {
  await main();
} catch (e) {
  check('run', false, String(e && e.stack ? e.stack : e));
} finally {
  try {
    ws?.close();
  } catch {
    // closing
  }
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true
  });
}
fs.writeFileSync(
  path.join(out, 'mention-e2e.json'),
  JSON.stringify(rows, null, 2)
);
const bad = rows.filter((x) => !x.ok).length;
console.log(`${rows.length - bad}/${rows.length} pass`);
process.exit(bad ? 1 : 0);
