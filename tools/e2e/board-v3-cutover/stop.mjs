import fs from 'node:fs';
import { SC } from './paths.mjs';
const e = JSON.parse(fs.readFileSync(SC + '/env.json', 'utf8'));
for (const pid of [e.server_pid, e.env_pid]) { try { process.kill(pid); console.log('stopped', pid); } catch (x) { console.log('gone', pid); } }
