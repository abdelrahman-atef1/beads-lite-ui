// QA seed for beads-lite-1bo5.6.26: 3 throwaway workspaces + a scratch HOME registry.
// usage: node seed.mjs <scratchDir>   (never touches real dbs; wsC is a copy made by the caller)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const home = path.join(root, 'home');
const ws = { A: path.join(root, 'wsA'), B: path.join(root, 'wsB'), C: path.join(root, 'wsC') };
const bd = (cwd, ...a) => execFileSync(process.env.BD_BIN, a, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, BEADS_DIR: '' } });

for (const k of ['A', 'B']) {
  fs.rmSync(ws[k], { recursive: true, force: true });
  fs.mkdirSync(ws[k], { recursive: true });
  execFileSync('git', ['init', '-q', '.'], { cwd: ws[k], windowsHide: true });
  execFileSync(process.env.BD_BIN, ['init', '--prefix', k === 'A' ? 'qaa' : 'qbb', '--quiet', '--non-interactive'], {
    cwd: ws[k], windowsHide: true, env: { ...process.env, BEADS_DIR: path.join(ws[k], '.beads') }
  });
}
for (const k of ['A', 'B', 'C']) bd(ws[k], 'config', 'set', 'status.custom', 'owner_decision,waiting_for_test');

const ar = (q, o, extra = {}) => ({
  card_class: 'tap', card_back: 'swe', card_lang: 'ar', card_q: q,
  card_effect: 'التطبيق يتغير', card_blocks: 'أندل (SWE) واقف على ردك',
  card_opts: JSON.stringify(o), ...extra
});
const en = (q, o, extra = {}) => ar(q, o, { card_lang: 'en', card_effect: 'The build changes', card_blocks: 'swe is waiting on your answer', ...extra });
const yn = [{ l: 'Yes', rec: true }, { l: 'No' }];
const ynAr = [{ l: 'نعم', rec: true }, { l: 'لا' }];

const seeds = [
  ['A', 'A zero card', 0, ar('نكمل بالخطة الأولى؟', ynAr, { title_ar: 'خطة أولى' })],
  ['A', 'A two card', 2, en('Ship build A now?', yn)],
  ['A', 'A type card', 1, en('What should the tagline say?', [{ l: 'Type your reply' }], { card_class: 'type', card_norec: 'true', card_show: 'Option one: Free forever. Option two: Free for good.' })],
  ['B', 'B one card', 1, en('Pick the B colour?', [{ l: 'Blue', rec: true }, { l: 'Green' }])],
  ['B', 'B INVALID no card_q', 1, { card_class: 'tap', card_back: 'swe' }],
  ['B', 'B DESK card', 1, en('Desk only?', yn, { card_class: 'desk' })],
  ['B', 'B SECRET card', 1, en('Use key sk-live-abcdefghijklmnop123456?', yn)],
  ['C', 'C copy card', 2, en('Merge the C branch?', yn)]
];
const ids = {};
for (const [k, title, p, meta] of seeds) {
  const out = JSON.parse(bd(ws[k], 'create', title, '-t', 'task', '-p', String(p), '--assignee', 'abdelrahman', '--metadata', JSON.stringify(meta), '--json'));
  const id = out.id || out[0]?.id;
  bd(ws[k], 'update', id, '--status', 'owner_decision');
  ids[title] = id;
}
fs.mkdirSync(path.join(home, '.beads'), { recursive: true });
fs.writeFileSync(path.join(home, '.beads', 'registry.json'), JSON.stringify(
  Object.values(ws).map((p) => ({ workspace_path: p, socket_path: '', database_path: path.join(p, '.beads'), pid: 0, version: 'qa', started_at: new Date().toISOString() }))
));
fs.writeFileSync(path.join(root, 'ids.json'), JSON.stringify({ ws, ids }, null, 1));
console.log(JSON.stringify(ids));
