#!/usr/bin/env node
/**
 * Board v3 guard (beads-lite-1bo5.6.59): a v3 task may only touch app/ui/**,
 * app/css/u3-*.css, app/fonts/**, scripts/legacy-untouched.mjs and
 * scripts/payload-v3.mjs, server/features/outputs.test.js (timeouts only), the create-issue lines of server/ws.js and its tests, the bulk feature files (server/features/bulk*.js, scripts/bulk-e2e.mjs) and its registration lines in server/features/index.js and types.js, plus two narrow edits: app/main.js (only the lines of
 * the one v3 hook, no deletions) and app/index.html (only u3-*.css link
 * lines, no deletions). Anything else = legacy touched = exit 1.
 *
 * Usage: node scripts/legacy-untouched.mjs [base-ref]   (default origin/swe/board-v3)
 */
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'origin/swe/board-v3';
const git = (/** @type {string[]} */ a) =>
  execFileSync('git', a, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1 << 26
  });

const ALLOWED = [
  /^app\/ui\//,
  /^app\/css\/u3-[\w-]+\.css$/,
  /^app\/fonts\//,
  /^scripts\/legacy-untouched\.mjs$/,
  /^scripts\/payload-v3\.mjs$/,
  /^server\/features\/outputs\.test\.js$/,
  // Bulk select server feature (1bo5.6.63.1): these exact files only.
  /^server\/features\/bulk(\.test)?\.js$/,
  /^scripts\/bulk-e2e\.mjs$/
];
// Narrow edits to the feature seam (1bo5.6.63.1): the exact lines that register
// the bulk feature. Nothing else may be added; the one removed line is the
// trailing-comma rewrite of the previous array entry.
const SEAM = {
  // create-issue takes parent and assignee and echoes the id (1bo5.6.59.7):
  // the exact lines of that one handler and its two tests (blank lines ok).
  'server/ws.js': {
    add: [
      'const { title, type, priority, description, parent, assignee } =',
      '/** @type {any} */ (req.payload || {});',
      '// Board v3 new-task dialog: every bead has a parent. Bounded and shaped',
      '// like an id / a name so neither can smuggle a flag into bd.',
      'const ok_parent =',
      "typeof parent === 'string' &&",
      '/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(parent)',
      '? parent',
      ": '';",
      'const ok_assignee =',
      "typeof assignee === 'string' &&",
      '/^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/.test(assignee)',
      '? assignee',
      "if (ok_parent) args.push('--parent', ok_parent);",
      "if (ok_assignee) args.push('--assignee', ok_assignee);",
      '// `--silent` prints the new id; echo it with what was applied so a client',
      '// need not guess the id from the title.',
      "const new_id = String(res.stdout || '')",
      '.trim()',
      '.split(/\\s+/)[0];',
      'ws.send(',
      'JSON.stringify(',
      'makeOk(req, {',
      'created: true,',
      'wake,',
      '...(new_id ? { id: new_id } : {}),',
      '...(ok_parent ? { parent: ok_parent } : {}),',
      '...(ok_assignee ? { assignee: ok_assignee } : {})',
      '})',
      ')',
      ');'
    ],
    del: [
      'const { title, type, priority, description } = /** @type {any} */ (',
      'req.payload || {}',
      ');',
      'ws.send(JSON.stringify(makeOk(req, { created: true, wake })));'
    ]
  },
  'server/ws.mutations.test.js': {
    add: [
      "test('create-issue passes parent and assignee to bd and echoes the id', async () => {",
      "const mRun = /** @type {import('vitest').Mock} */ (runBd);",
      "mRun.mockResolvedValueOnce({ code: 0, stdout: 'UI-97', stderr: '' });",
      'const ws = makeStubSocket();',
      'await handleMessage(',
      '/** @type {any} */ (ws),',
      'Buffer.from(',
      'JSON.stringify({',
      "id: 'r9',",
      "type: 'create-issue',",
      "payload: { title: 'T', parent: 'UI-1', assignee: 'swe' }",
      '})',
      ')',
      ');',
      'const args = mRun.mock.calls[mRun.mock.calls.length - 1][0];',
      "expect(args).toContain('--parent');",
      "expect(args[args.indexOf('--parent') + 1]).toBe('UI-1');",
      "expect(args[args.indexOf('--assignee') + 1]).toBe('swe');",
      'const obj = JSON.parse(ws.sent[ws.sent.length - 1]);',
      'expect(obj.payload).toMatchObject({',
      'created: true,',
      "id: 'UI-97',",
      "parent: 'UI-1',",
      "assignee: 'swe'",
      '});',
      "test('create-issue ignores a parent or assignee shaped like a flag', async () => {",
      "mRun.mockResolvedValueOnce({ code: 0, stdout: 'UI-96', stderr: '' });",
      "id: 'r10',",
      "payload: { title: 'T', parent: '--force', assignee: '-x' }",
      "expect(args).not.toContain('--parent');",
      "expect(args).not.toContain('--assignee');"
    ],
    del: []
  },
  'server/features/index.js': {
    add: ["import * as bulk from './bulk.js';", 'bulk,'],
    del: []
  },
  'server/features/types.js': {
    add: [
      "'releases-get',",
      '// bulk select on the board (beads-lite-1bo5.6.63.1)',
      "'bulk-apply',",
      "'bulk-undo'"
    ],
    del: ["'releases-get'"]
  }
};
const HOOK = [
  "import { bootV3 } from './ui/boot.js';",
  "import { resolveUi } from './ui/flag.js';",
  '// Board v3 (?ui=3, stored as bl.ui): same store, client and data layer, no',
  '// legacy views. Flag off = this block does nothing.',
  'if (resolveUi(window.location.search, window.localStorage) === 3) {',
  'ready = bootV3(root_element, {',
  'store,',
  'client,',
  'send: transport,',
  'router,',
  'data: createDataLayer(transport),',
  'subscriptions,',
  'sub_issue_stores,',
  'listSelectors',
  '});',
  'return { ready };',
  '}',
  ''
];

const names = git(['diff', '--name-only', base, '--'])
  .split('\n')
  .filter(Boolean);
// New untracked files count too.
for (const f of git(['ls-files', '--others', '--exclude-standard'])
  .split('\n')
  .filter(Boolean)) {
  if (!names.includes(f)) names.push(f);
}
const bad = [];
for (const f of names) {
  if (ALLOWED.some((re) => re.test(f))) continue;
  if (SEAM[f]) {
    for (const l of git(['diff', '-U0', base, '--', f]).split('\n')) {
      if (l.startsWith('---') || l.startsWith('+++')) continue;
      const t = l.slice(1).trim();
      if (l.startsWith('+') && t === '') continue;
      if (l.startsWith('-') && !SEAM[f].del.includes(t))
        bad.push(`${f}: deletes a line: ${t}`);
      else if (l.startsWith('+') && !SEAM[f].add.includes(t))
        bad.push(`${f}: adds a line outside the allowed edit: ${t}`);
    }
    continue;
  }
  if (f === 'app/main.js' || f === 'app/index.html') {
    const lines = git(['diff', '-U0', base, '--', f]).split('\n');
    for (const l of lines) {
      if (l.startsWith('---') || l.startsWith('+++')) continue;
      if (l.startsWith('-')) bad.push(`${f}: deletes a line: ${l}`);
      else if (l.startsWith('+')) {
        const s = l.slice(1).trim();
        const ok =
          f === 'app/main.js'
            ? HOOK.includes(s)
            : /^<link rel="stylesheet" href="\.\/css\/u3-[\w-]+\.css" \/>$/.test(
                s
              );
        if (!ok) bad.push(`${f}: adds a line outside the allowed edit: ${s}`);
      }
    }
    continue;
  }
  bad.push(`${f}: outside the v3 allowlist`);
}
if (bad.length) {
  console.error('legacy-untouched FAILED against ' + base);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(
  `legacy-untouched OK against ${base}: ${names.length} changed path(s), all inside the v3 allowlist`
);
