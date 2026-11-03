// Idempotent patch of the globally installed beads-ui (tested on 0.12.6) for the Codesters board.
// Owner, 2026-10-22: ready -> "TODO", closed -> "Done", plus columns "Owner decision",
// "Waiting for test", "Waiting for merge" (bd custom statuses owner_decision, waiting_for_test,
// waiting_for_merge). bd and beads-ui have no config for column names, so this edits the installed
// files (originals saved as *.orig). Re-run after any `npm update -g beads-ui`, then restart bdui
// (server files changed). Bead rayeh-2l6v.   Usage: node bdui-patch-board.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.BDUI_ROOT || path.join(process.env.APPDATA, 'npm', 'node_modules', 'beads-ui');
const check = process.argv.includes('--check');
const MARK = 'CODESTERS-BOARD-PATCH';

// id = short key, type = server subscription type, st = bd status, label, v = client store var, g = window slot
const COLS = [
  { id: 'odec', type: 'owner-decision-issues', st: 'owner_decision', label: 'Owner decision', v: 'Od', g: '__od' },
  { id: 'wtest', type: 'waiting-test-issues', st: 'waiting_for_test', label: 'Waiting for test', v: 'Wt', g: '__wt' },
  { id: 'wmerge', type: 'waiting-merge-issues', st: 'waiting_for_merge', label: 'Waiting for merge', v: 'Wm', g: '__wm' }
];

function patch(rel, edits) {
  const f = path.join(root, rel);
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(MARK)) { console.log(rel + ': already patched'); return; }
  if (check) { console.log(rel + ': NOT patched'); process.exitCode = 1; return; }
  fs.copyFileSync(f, f + '.orig');
  for (const [from, to] of edits) {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(rel + ': expected 1 match, got ' + n + ' for ' + from.slice(0, 70));
    s = s.split(from).join(to);
  }
  const cmt = rel.endsWith('.css') ? '/* ' + MARK + ' */\n' : '// ' + MARK + '\n';
  fs.writeFileSync(f, cmt + s);
  console.log(rel + ': patched');
}

patch('server/validators.js', [
  ["  'closed-issues',\n", "  'closed-issues',\n" + COLS.map((c) => `  '${c.type}',\n`).join('')]
]);
patch('server/list-adapters.js', [
  ["    case 'closed-issues': {",
    COLS.map((c) => `    case '${c.type}': {\n      return ['list', '--json', '--tree=false', '--status', '${c.st}', '--limit', '0'];\n    }\n`).join('') +
    "    case 'closed-issues': {"]
]);

const reg = (c) =>
  `if(!${c.v}&&!se.has("tab:board:${c.id}")){try{_.register("tab:board:${c.id}",{type:"${c.type}"})}catch(h){}se.add("tab:board:${c.id}"),I.subscribeList("tab:board:${c.id}",{type:"${c.type}"}).then(h=>${c.v}=h).catch(h=>{}).finally(()=>{se.delete("tab:board:${c.id}")})}`;
const unreg = (c) => `if(${c.v}){${c.v}().catch(()=>{}),${c.v}=null;try{_.unregister("tab:board:${c.id}")}catch(h){}}`;
const clear = (c) => `${c.v}&&(${c.v}().catch(()=>{}),${c.v}=null),`;
const ids = COLS.map((c) => `"tab:board:${c.id}"`).join(',');

patch('app/main.bundle.js', [
  ['${k("Ready","ready-col",a)}', '${k("TODO","ready-col",a)}'],
  ['${k("Closed","closed-col",d)}',
    COLS.map((c) => '${k("' + c.label + '","' + c.id + '-col",window.' + c.g + '||[])}\n        ').join('') + '${k("Done","closed-col",d)}'],
  ['case"open":return"Open";', 'case"open":return"TODO";'],
  ['case"closed":return"Closed";', 'case"closed":return"Done";'],
  ['"in-progress-col":"in_progress","closed-col":"closed"}',
    '"in-progress-col":"in_progress",' + COLS.map((c) => `"${c.id}-col":"${c.st}",`).join('') + '"closed-col":"closed"}'],
  ['"tab:board:in-progress","tab:board:closed"];function Rs', '"tab:board:in-progress",' + ids + ',"tab:board:closed"];function Rs'],
  ['$=b.selectBoardColumn("tab:board:closed","closed"),N=',
    '$=b.selectBoardColumn("tab:board:closed","closed"),' + 'zz_=(' + COLS.map((c) => `window.${c.g}=b.selectBoardColumn("tab:board:${c.id}","${c.st}")`).join(',') + '),N='],
  ['if(!ne&&!se.has("tab:board:closed")){', COLS.map(reg).join('') + 'if(!ne&&!se.has("tab:board:closed")){'],
  ['te=null,Ue=null,ne=null,Ie=null,Ge=null,se=new Set;', 'te=null,Ue=null,ne=null,Ie=null,Ge=null,' + COLS.map((c) => `${c.v}=null,`).join('') + 'se=new Set;'],
  ['if(ne){ne().catch(()=>{}),ne=null;', COLS.map(unreg).join('') + 'if(ne){ne().catch(()=>{}),ne=null;'],
  ['ne&&(ne().catch(()=>{}),ne=null),Ie&&', 'ne&&(ne().catch(()=>{}),ne=null),' + COLS.map(clear).join('') + 'Ie&&'],
  ['"tab:board:in-progress","tab:board:closed","tab:b', '"tab:board:in-progress",' + ids + ',"tab:board:closed","tab:b']
]);
patch('app/styles.css', [
  ['grid-template-columns: repeat(4, 1fr);\n  gap: var(--space-8);', 'grid-template-columns: repeat(7, minmax(0, 1fr));\n  gap: var(--space-4);']
]);

// rayeh-yed5 (2026-10-25): no beads-ui bd call may outlive a bound. A bd child that never exits holds the
// embedded Dolt gate lock and freezes every bd writer on the machine (one hang = 20 min, all projects).
// No caller passes timeout_ms, so default it (BDUI_BD_TIMEOUT_MS, default 90000; a normal list is 9-12 s)
// and kill the whole process tree (taskkill /T /F; child.kill alone leaves grandchildren on Windows).
patch('server/bd.js', [
  ["    if (options.timeout_ms && options.timeout_ms > 0) {\n      timer = setTimeout(() => {\n        child.kill('SIGKILL');\n      }, options.timeout_ms);",
   "    let timed_out = false;\n    const eff_timeout = options.timeout_ms ?? (Number(process.env.BDUI_BD_TIMEOUT_MS) || 90000);\n    if (eff_timeout > 0) {\n      timer = setTimeout(() => {\n        timed_out = true;\n        log('bd timed out after %d ms, killing pid %s (args=%o)', eff_timeout, child.pid, final_args);\n        try {\n          if (process.platform === 'win32' && child.pid) {\n            spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });\n          }\n        } catch {}\n        child.kill('SIGKILL');\n      }, eff_timeout);"],
  ["        code: Number(code || 0),\n        stdout", "        code: timed_out ? 124 : Number(code || 0),\n        stdout"]
]);
