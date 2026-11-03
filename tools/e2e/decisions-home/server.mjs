// starts the board on a spare port with scratch HOME; writes its pid; stdout to a log file
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [,, wt, scratch, port] = process.argv;
const out = fs.openSync(path.join(scratch, 'server.log'), 'w');
const home = path.join(scratch, 'home');
const child = spawn(process.execPath, [path.join(wt, 'server/index.js'), '--port', port, '--host', '127.0.0.1', '--debug'], {
  cwd: path.join(scratch, 'wsC'), stdio: ['ignore', out, out], windowsHide: true, detached: true,
  env: { ...process.env, HOME: home, USERPROFILE: home, PORT: port, PHONE_PORT: '0', BEADS_DIR: '',
    CARDS_DIR: 'E:/Projects/learner/scripts/cards', BD_BIN: process.env.BD_BIN }
});
fs.writeFileSync(path.join(scratch, 'server.pid'), String(child.pid));
child.unref();
