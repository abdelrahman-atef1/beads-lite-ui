// QA prep: npm ci, build bundle, copy ALL registered stores (no backup dir, no locks) into scratch. Explicit paths only.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const WT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-13-24-1';
const S = `${WT}/.work/scratch/beads-lite-1bo5.13.24.1/env/projs`;
const BS = String.fromCharCode(92);
const win = (p) => p.split('/').join(BS);
const REAL = {
  company: 'C:/Users/abduu/company',
  fatura: 'E:/Projects/fatura',
  rayeh: 'E:/Projects/rayeh',
  'whisper-flow': 'E:/Projects/whisper-flow',
  codestsers_landing: 'E:/Projects/Codesters/codestsers_landing',
  'abduu-tasks': 'E:/Projects/abduu-tasks',
  'brother-exams': 'E:/Projects/brother-exams',
  'workout-tracker': 'E:/Projects/workout-tracker',
  'beads-lite': 'E:/Projects/beads-lite',
  'beads-lite-ui': 'E:/Projects/beads-lite-ui',
  'patient-record': 'E:/Projects/patient-record',
  'My Personal Brand': 'E:/Projects/My Personal Brand',
  filmmaker: 'E:/Projects/filmmaker',
  learner: 'E:/Projects/learner',
  'abo-ali-market': 'E:/Projects/abo-ali-market'
};
const run = (c, a, o = {}) => {
  const r = spawnSync(c, a, { cwd: WT, stdio: 'inherit', windowsHide: true, shell: false, ...o });
  console.log(c, a.join(' ').slice(0, 90), '->', r.status);
  return r.status;
};
console.log('PREP START', new Date().toISOString());
run('C:/Program Files/nodejs/npm.cmd', ['ci', '--no-audit', '--no-fund'], { shell: true });
run('node', ['scripts/build-frontend.js']);
fs.rmSync(S, { recursive: true, force: true });
for (const [n, p] of Object.entries(REAL)) {
  const dst = `${S}/${n}/.beads`;
  fs.mkdirSync(dst, { recursive: true });
  const s = run('robocopy', [win(`${p}/.beads`), win(dst), '/E', '/XD', 'backup', '/XF', '*.lock', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1']);
  if (s >= 8) console.log('COPY FAIL', n);
}
console.log('PREP END', new Date().toISOString());
