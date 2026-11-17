// start/stop the board from this worktree the way production starts it (node server/index.js --host --port, inside a store folder,
// BD_BIN/BD_LITE_UPSTREAM/BDUI_BD_CONCURRENCY=4, then workspaces registered via POST /api/register-workspace), on SCRATCH copies only.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const B = 'beads-lite-1bo5.13.24.1';
const BS = String.fromCharCode(92);
export const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-13-24-1';
export const SC = `${WT}/.work/scratch/${B}`;
export const R = `${SC}/env`;
export const PROJS = `${R}/projs`;
export const OUT = `${WT}/.work/out/${B}/qa`;
const BD = `${process.env.APPDATA.split(BS).join('/')}/npm/node_modules/@beads/bd/bin/bd.exe`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function start(port) {
  const first = fs.readdirSync(PROJS)[0];
  for (const d of ['home/.beads', 'boardhome', 'flow', 'cards-empty', 'attach']) fs.mkdirSync(`${R}/${d}`, { recursive: true });
  for (const f of ['rollup.json', 'tokens.json']) {
    const s = `C:/Users/abduu/.codesters/flow/${f}`;
    if (fs.existsSync(s)) fs.copyFileSync(s, `${R}/flow/${f}`);
  }
  const log = fs.openSync(`${R}/srv.log`, 'w');
  const env = {
    ...process.env,
    USERPROFILE: `${R}/home`.split('/').join(BS),
    HOME: `${R}/home`,
    PORT: String(port),
    HOST: '127.0.0.1',
    PHONE_PORT: 'off',
    BD_BIN: BD,
    BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe',
    BDUI_BD_CONCURRENCY: '4',
    CARDS_DIR: `${R}/cards-empty`,
    BDUI_BOARD_HOME: `${R}/boardhome`,
    WAKE_ROOT: `${R}/boardhome/wake`,
    WAKE_ROUTER_OFF: '1',
    BDUI_WAKE_BIN: `${R}/no-such-wake.mjs`,
    BD_ACTOR: 'qa',
    BDUI_REPORT_ROUTES: '{}',
    BDUI_ATTACH_ROOT: `${R}/attach`,
    FLOW_HOME: `${R}/flow`
  };
  const srv = spawn('node', [`${WT}/server/index.js`, '--host', '127.0.0.1', '--port', String(port)], { cwd: `${PROJS}/${first}`, env, stdio: ['ignore', log, log], windowsHide: true });
  fs.writeFileSync(`${R}/node.pid`, String(srv.pid));
  const reg = spawnSync('node', [`${SC}/register.mjs`, `http://127.0.0.1:${port}`, '120', `${PROJS}/${first}`, '', PROJS], { encoding: 'utf8', windowsHide: true, env });
  console.log('register:', reg.stdout.trim().split('\n').slice(-2).join(' | '));
  return srv.pid;
}
export function stop() {
  let pid;
  try {
    pid = fs.readFileSync(`${R}/node.pid`, 'utf8').trim();
  } catch {
    return;
  }
  if (pid) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true });
}
