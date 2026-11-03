// Idempotent patch of the installed (already board-patched) beads-ui bundle: Epic > Story > Task tree (company-8ce8.3).
// Replaces the Epics view with the tree from bdui-tree-view.js (source: beads-lite-ui branch swe/8ce8-3, app/views/epics.js),
// feeds it from the all-issues list (client id tab:tree), makes the empty hash open it, renames the tab "Tree".
// Run after bdui-patch-board.mjs; restart not needed (static files), hard-reload the page.  Usage: node bdui-patch-tree.mjs [root] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || process.env.BDUI_ROOT || 'E:/Tools/beads-ui-t032';
const MARK = 'CODESTERS-TREE-PATCH';
const bf = path.join(root, 'app/main.bundle.js');
const cf = path.join(root, 'app/styles.css');
let s = fs.readFileSync(bf, 'utf8');
let css = fs.readFileSync(cf, 'utf8');
if (s.includes(MARK)) { console.log('already patched'); process.exit(0); }
if (process.argv.includes('--check')) { console.log('NOT patched'); process.exit(1); }
const one = (str, from, to) => {
  const n = str.split(from).length - 1;
  if (n < 1) throw new Error('no match for ' + from.slice(0, 60));
  return str.split(from).join(to);
};
// 1. replace the epics view function
const endAt = s.indexOf('function mi(t){let e=document.createElement("dialog");e.id="fatal-error-dialog"');
const startRe = /function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+),([\w$]+)=void 0,([\w$]+)=void 0\)\{let [\w$]+=\[\],[\w$]+=new Set,[\w$]+=new Set,[\w$]+=new Map,[\w$]+=[\w$]+\?[\w$]+\([\w$]+\):null;function [\w$]+\([\w$]+\)\{return!/g;
let m, st = null;
while ((m = startRe.exec(s)) && m.index < endAt) st = m;
if (!st || endAt < 0) throw new Error('epics view function not found');
const body = s.slice(st.index, endAt);
const render = /\{([\w$]+)\([\w$]+\(\),[\w$]+\)\}/.exec(body)[1];
const html = /return [\w$]+\.length\?([\w$]+)`\$\{/.exec(body)[1];
const repeat = /\$\{([\w$]+)\([\w$]+,[\w$]+=>String\([\w$]+\.epic\?\.id/.exec(body)[1];
let src = fs.readFileSync(path.join(here, 'bdui-tree-view.js'), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export function createEpicsView(', 'function ' + st[1] + '(');

const fnStart = src.indexOf('function ' + st[1] + '(');
const braceOpen = src.indexOf('{\n', src.indexOf(') {', fnStart) >= 0 ? src.indexOf(') {', fnStart) : fnStart);
src = src.slice(0, braceOpen + 1) + `const html=${html},render=${render},repeat=${repeat};` + src.slice(braceOpen + 1);
s = s.slice(0, st.index) + '/*' + MARK + '*/' + src.slice(fnStart) + '\n' + s.slice(endAt);
// 2. subscription: all issues, own store id
s = one(s, '"tab:epics"', '"tab:tree"');
s = one(s, '{type:"epics"}', '{type:"all-issues"}');
// 3. empty hash opens the tree
s = one(s, String.raw`let e=String(t||"");return/^#\/epics(\b|\/|$)/.test(e)?"epics"`, String.raw`let e=String(t||"");return e===""||e==="#"||e==="#/"||/^#\/epics(\b|\/|$)/.test(e)?"epics"`);
// 4. tab label
s = one(s, '>Epics</a', '>Tree</a');
css += `
/* ${MARK}: Epic > Story > Task tree */
.tree-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border, #8884); cursor: pointer; }
.tree-row:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
.tree-caret { width: 1em; flex: none; }
.tree-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-meta { flex: none; font-size: 12px; }
.tree-id { flex: none; font-size: 12px; }
.tree-kids { margin-left: 22px; }
.tree-d0 > .tree-row { font-weight: 600; }
`;
if (!fs.existsSync(bf + '.pre-tree')) fs.copyFileSync(bf, bf + '.pre-tree');
if (!fs.existsSync(cf + '.pre-tree')) fs.copyFileSync(cf, cf + '.pre-tree');
fs.writeFileSync(bf, s);
fs.writeFileSync(cf, css);
console.log('tree patch applied (names: html=%s render=%s repeat=%s view=%s)', html, render, repeat, st[1]);
