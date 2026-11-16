import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SC, OUT, BD, UPSTREAM, CHROME } from './paths.mjs';
export { OUT, SC, CHROME };
export const E = () => JSON.parse(fs.readFileSync(SC + '/env.json', 'utf8'));
export const bd = (store, args) => spawnSync(BD, args, { cwd: `${SC}/stores/${store}`, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: 'qa', BD_LITE_UPSTREAM: UPSTREAM } });
export const show = (store, id) => { const o = bd(store, ['show', id, '--json']).stdout; return JSON.parse(o.slice(o.indexOf('[')))[0]; };
export const comments = (store, id) => bd(store, ['comments', id]).stdout;
export const base = (door) => { const e = E(); return door === 'phone' ? `http://127.0.0.1:${e.px}` : `http://127.0.0.1:${e.pc}`; };
export const LOG = (f, s) => fs.appendFileSync(`${OUT}/${f}`, s + '\n');
export const FAST3G = { offline: false, latency: 562, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
export const COMBOS = [
  { w: 390, lang: 'ar', theme: 'dark', tag: '390-ar-dark' },
  { w: 1440, lang: 'ar', theme: 'dark', tag: '1440-ar-dark' },
  { w: 1440, lang: 'en', theme: 'light', tag: '1440-en-light' },
  { w: 390, lang: 'en', theme: 'dark', tag: '390-en-dark' }
];
export const door = (C) => (C.w < 500 ? 'phone' : 'pc');
export function watch(page, errs, okRe = /$^/) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !okRe.test(m.text()) && errs.push('console: ' + m.text().slice(0, 160)));
  page.on('response', (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url()) && !okRe.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
  });
}
export function postCard(title, extra = {}, store = 'beads-lite') {
  const r = bd(store, ['create', title, '-t', 'task', '-a', 'swe', '--silent']);
  const id = r.stdout.split(/\s+/).filter((x) => new RegExp('^' + store + '-').test(x)).pop();
  const e = E();
  const input = { repo: store, bead: id, by: 'swe', class: 'tap', q: 'Which colour for the logo?', effect: 'Changes the logo colour.', blocks: 'nothing', opts: [{ l: 'Red' }, { l: 'Blue', rec: true }], show: 'Red or blue.', title, ...extra };
  const res = spawnSync(process.execPath, ['E:/Projects/learner/scripts/cards/card.mjs', 'post'], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, env: { ...process.env, USERPROFILE: e.home, BDUI_ATTACH_ROOT: e.attach, BD_BIN: 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe', BD_ACTOR: 'qa', BD_LITE_UPSTREAM: 'I:/Claude Files/data/tools/bd/bd-upstream-1.3.1/bd.exe' } });
  return { id, out: (res.stdout || res.stderr || '').trim().slice(0, 120) };
}
