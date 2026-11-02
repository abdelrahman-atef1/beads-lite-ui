// Fresh COPY stores for the QA boards (never the live ones): alpha=whisper-flow, beta=fatura, gamma/delta=whisper-flow.
// Pre-existing owner_decision cards are reopened in beta/gamma/delta so only cards the test creates can notify.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const S = process.env.QA_SCRATCH;
const BD = path.join(process.env.APPDATA, 'npm/node_modules/@beads/bd/bin/bd.exe');
const src = { alpha: 'whisper-flow', beta: 'fatura', gamma: 'whisper-flow', delta: 'whisper-flow' };
for (const [n, s] of Object.entries(src)) {
  const d = path.join(S, 'roots', n, '.beads');
  fs.rmSync(path.join(S, 'roots', n), { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const f of ['beads.db', 'config.yaml', 'metadata.json', 'issues.jsonl']) fs.copyFileSync(path.join('E:/Projects', s, '.beads', f), path.join(d, f));
  if (n === 'alpha') continue;
  const run = (a) => execFileSync(BD, a, { cwd: path.join(S, 'roots', n), env: { ...process.env, BD_ACTOR: 'qa' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  for (const b of JSON.parse(run(['list', '--status', 'owner_decision', '--json']))) run(['update', b.id, '--status', 'open']);
}
console.log('roots ready');
