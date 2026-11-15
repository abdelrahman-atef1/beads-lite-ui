#!/usr/bin/env node
/**
 * Board v3 guard (beads-lite-1bo5.6.59): a v3 task may only touch app/ui/**,
 * app/css/u3-*.css, app/fonts/**, scripts/legacy-untouched.mjs and
 * scripts/payload-v3.mjs, server/features/outputs.test.js (timeouts only), the create-issue lines of server/ws.js and its tests, the bulk feature files (server/features/bulk*.js, scripts/bulk-e2e.mjs) and its registration lines in server/features/index.js and types.js, the @mention files (server/features/mention*.js, board-posted.js, scripts/mention-*.mjs) with their seam lines in index.js, types.js, notifier.js and ws.js, the push log (server/features/push.js and push-log.test.js), server/bd-resolve.test.js, the chunk-split hunks of the build/perf/app/sw server files (59.19, exact hunks) and four exact hunks of server/bd.js (the bd lookup), the weekly flow push lines of app/sw.js, plus two narrow edits: app/main.js (only the lines of
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
  /^scripts\/bulk-e2e\.mjs$/,
  // @mentions (beads-lite-1bo5.6.64.1): these exact files only.
  /^server\/features\/mention(\.test)?\.js$/,
  /^server\/features\/board-posted\.js$/,
  /^scripts\/mention-(scan|e2e)\.mjs$/,
  // Time screens (beads-lite-1bo5.6.59.12): the read-only flow-rollup handler and its test, these exact files only.
  /^server\/features\/flow(\.test)?\.js$/,
  // Push log (beads-lite-1bo5.6.16.1): these exact files only.
  /^server\/features\/push(-log\.test)?\.js$/,
  // Board finds bd itself (beads-lite-1bo5.6.59.21): its test, this exact file only.
  /^server\/bd-resolve\.test\.js$/,
  // Per-screen chunks (beads-lite-1bo5.6.59.19): the tests of the two server files only; the files themselves are exact hunks in SEAM below.
  /^server\/sw\.test\.js$/,
  /^server\/features\/perf\.test\.js$/
];
// Narrow edits to the feature seam (1bo5.6.63.1): the exact lines that register
// the bulk feature. Nothing else may be added; the one removed line is the
// trailing-comma rewrite of the previous array entry.
const SEAM = {
  // Weekly flow push text and click target (beads-lite-1bo5.6.66.7): two message lines and the url ternary of app/sw.js only.
  'app/sw.js': {
    hunks: ['@@ -86,0 +87 @@', '@@ -100,0 +102 @@', '@@ -130,3 +132,5 @@'],
    add: [
      "flow: () => 'Weekly flow review has findings',",
      "flow: () => 'مراجعة التدفق الأسبوعية فيها ملاحظات',",
      ": kind === 'flow'",
      "? '/#/time'",
      ': bead',
      "? '/#/issues?issue=' + encodeURIComponent(bead)",
      ": '/#/decisions'"
    ],
    del: [
      ': bead',
      "? '/#/issues?issue=' + encodeURIComponent(bead)",
      ": '/#/decisions'"
    ]
  },
  // Per-screen chunks (beads-lite-1bo5.6.59.19): the exact hunks that build, serve and precache the split chunks, nothing else of these legacy files.
  '.gitignore': {
    hunks: ['@@ -4,0 +5 @@'],
    add: ['app/chunks/'],
    del: []
  },
  'eslint.config.js': {
    hunks: ['@@ -15 +15,2 @@'],
    add: ["'app/main.bundle.js.map',", "'app/chunks/**'"],
    del: ["'app/main.bundle.js.map'"]
  },
  'package.json': {
    hunks: ['@@ -34 +34 @@', '@@ -68,0 +69 @@'],
    add: [
      '"postpack": "rm -rf app/main.bundle.js app/main.bundle.js.map app/chunks"',
      '"app/chunks",'
    ],
    del: ['"postpack": "rm app/main.bundle.js app/main.bundle.js.map"']
  },
  'scripts/build-frontend.js': {
    hunks: [
      '@@ -5 +5,2 @@',
      '@@ -11 +12 @@',
      '@@ -13,0 +15 @@',
      '@@ -26 +27,0 @@',
      '@@ -29,0 +31,3 @@',
      '@@ -38 +42,5 @@',
      '@@ -47 +55,4 @@'
    ],
    add: [
      '* - Produces `app/main.bundle.js` plus `app/chunks/*.js` (one chunk per',
      '*   screen opened by import(), beads-lite-1bo5.6.59.19) with external maps.',
      "import { mkdirSync, rmSync } from 'node:fs';",
      "import { inlineLegacyViews } from '../server/features/perf.js';",
      "// The chunk folder is this script's own output: start it empty so a stale",
      '// chunk from an older build is never shipped.',
      "rmSync(path.join(app_dir, 'chunks'), { recursive: true, force: true });",
      'splitting: true,',
      'outdir: app_dir,',
      "entryNames: 'main.bundle',",
      "chunkNames: 'chunks/[hash]',",
      'plugins: [inlineLegacyViews],',
      'log(',
      "'built %s',",
      "path.relative(repo_root, path.join(app_dir, 'main.bundle.js'))",
      ');'
    ],
    del: [
      '* - Produces `app/main.bundle.js` with an external source map.',
      "import { mkdirSync } from 'node:fs';",
      "const outfile = path.join(app_dir, 'main.bundle.js');",
      'outfile,',
      "log('built %s', path.relative(repo_root, outfile));"
    ]
  },
  'server/app.js': {
    hunks: ['@@ -141,0 +142 @@'],
    add: ['app.get(/^\\/chunks\\/[\\w-]+\\.js$/, perf.chunkHandler);'],
    del: []
  },
  'server/sw.js': {
    hunks: ['@@ -23,0 +24,8 @@'],
    add: [
      '// Split screens (import() chunks): precached with the shell so a screen',
      '// opened offline, or on a flaky link, is already on the phone.',
      "const chunks = path.join(app_dir, 'chunks');",
      'if (fs.existsSync(chunks)) {',
      'for (const f of fs.readdirSync(chunks).sort()) {',
      "if (/^[\\w-]+\\.js$/.test(f)) urls.push('/chunks/' + f);",
      '}'
    ],
    del: []
  },
  'server/features/perf.js': {
    hunks: [
      '@@ -9,0 +10,5 @@',
      '@@ -28,0 +34,4 @@',
      '@@ -44,0 +54,32 @@',
      '@@ -110,0 +152 @@',
      '@@ -117,0 +160,30 @@',
      '@@ -134,0 +207,6 @@',
      '@@ -141,0 +220,5 @@',
      '@@ -151 +234,2 @@',
      '@@ -152,0 +237,4 @@',
      '@@ -207,0 +296,17 @@',
      '@@ -260,0 +366,6 @@',
      '@@ -336,0 +448 @@'
    ],
    add: [
      '*   Screens behind import() are split into /chunks/<hash>.js (esbuild',
      '*   splitting, beads-lite-1bo5.6.59.19): the page loads the shell and the',
      "*   desk, a screen's chunk loads when it first opens. Chunk names are content",
      '*   hashes, so they are immutable; old ones stay in memory so an open page',
      '*   racing a rebuild still finds its chunk.',
      'const CHUNK_NAME = /^[\\w-]+\\.js$/;',
      '// A static import of a split chunk in esbuild\'s minified output (from"./chunks/X.js",',
      '// import"./X.js"); a dynamic import("...") has a parenthesis and does not match.',
      'const STATIC_CHUNK = /(?:from|import)\\s*"\\.\\/(?:chunks\\/)?([\\w-]+\\.js)"/g;',
      '/**',
      "* esbuild plugin (beads-lite-1bo5.6.59.19): the old board's view registry",
      '* (app/views/registry.js) stays in the main file, as it did before splitting.',
      '* Left alone, each of its ten import() calls becomes a chunk that shares code',
      '* with the entry, and the entry then imports about twenty more chunk files',
      '* statically: a phone on a slow link pays a round trip for each. Only the v3',
      '* screens opened from app/ui/boot.js are split. Remove with the legacy views.',
      '*',
      "* @type {import('esbuild').Plugin}",
      '*/',
      'export const inlineLegacyViews = {',
      "name: 'inline-legacy-views',",
      'setup(build) {',
      'build.onLoad({ filter: /[\\\\/]app[\\\\/]views[\\\\/]registry\\.js$/ }, (args) => {',
      "let head = '';",
      'let n = 0;',
      'const body = fs',
      ".readFileSync(args.path, 'utf8')",
      ".replace(/import\\('(\\.[^']+)'\\)/g, (_all, spec) => {",
      'n++;',
      "head += `import * as __view${n} from '${spec}';\\n`;",
      'return `Promise.resolve(__view${n})`;',
      '});',
      'return {',
      'contents: head + body,',
      "loader: 'js',",
      'resolveDir: path.dirname(args.path)',
      '};',
      '}',
      "const chunks_dir = path.join(app_dir, 'chunks');",
      '/** @type {Map<string, Packed>} chunk file name -> packed (never evicted: bounded by rebuilds) */',
      'const chunks = new Map();',
      '/** @param {string} name - @param {Buffer} raw */',
      'async function addChunk(name, raw) {',
      'if (!chunks.has(name)) chunks.set(name, await pack(raw));',
      '* Names of every split chunk the entry loads statically (its imports, and theirs).',
      '* @param {Packed} entry',
      '* @returns {string[]}',
      'function staticChunkNames(entry) {',
      '/** @type {Set<string>} */',
      'const seen = new Set();',
      '/** @param {Buffer} raw */',
      'const visit = (raw) => {',
      "for (const m of raw.toString('utf8').matchAll(STATIC_CHUNK)) {",
      'const n = m[1];',
      'if (seen.has(n)) continue;',
      'seen.add(n);',
      'const c = chunks.get(n);',
      'if (c) visit(c.raw);',
      'visit(entry.raw);',
      'return [...seen];',
      'if (fs.existsSync(chunks_dir)) {',
      'for (const f of fs.readdirSync(chunks_dir)) {',
      'if (CHUNK_NAME.test(f))',
      'await addChunk(f, fs.readFileSync(path.join(chunks_dir, f)));',
      'splitting: true,',
      'outdir: app_dir,',
      "entryNames: 'main.bundle',",
      "chunkNames: 'chunks/[hash]',",
      'plugins: [inlineLegacyViews],',
      'const outs = result.outputFiles || [];',
      "const out = outs.find((o) => path.basename(o.path) === 'main.bundle.js');",
      'for (const o of outs) {',
      'if (o !== out && path.dirname(o.path) === chunks_dir)',
      'await addChunk(path.basename(o.path), Buffer.from(o.contents));',
      '/** One split chunk: the name is its content hash, so it is immutable. */',
      "/** @type {import('express').RequestHandler} */",
      'async function chunkHandler(req, res, next) {',
      'try {',
      'await getBundle(); // makes sure the chunks of the current build exist',
      'const name = path.basename(req.path);',
      'const p = CHUNK_NAME.test(name) ? chunks.get(name) : undefined;',
      'if (!p) {',
      'next();',
      'return;',
      "sendPacked(req, res, p, 'application/javascript; charset=utf-8', YEAR);",
      '} catch (err) {',
      'next(err);',
      '// Preload what the entry imports statically, all at once: a phone fetches',
      '// them in one round instead of one level of imports at a time.',
      'const links = staticChunkNames(p)',
      '.map((n) => `<link rel="modulepreload" href="/chunks/${n}" />`)',
      ".join('\\n    ');",
      "if (links) out = out.replace('</head>', `\\n    ${links}\\n  </head>`);",
      'chunkHandler,'
    ],
    del: ['const out = result.outputFiles && result.outputFiles[0];']
  },
  // Board finds bd itself (beads-lite-1bo5.6.59.21): these four hunks of server/bd.js only.
  'server/bd.js': {
    hunks: [
      '@@ -1 +1,4 @@',
      '@@ -54 +57,57 @@',
      '@@ -63 +122,6 @@',
      '@@ -65,0 +130,3 @@'
    ],
    add: [
      "import { execFileSync, spawn } from 'node:child_process';",
      "import fs from 'node:fs';",
      "import os from 'node:os';",
      "import path from 'node:path';",
      '* Find bd without BD_BIN (beads-lite-1bo5.6.59.21; same order as company',
      '* scripts/flow/bd-bin.mjs). On Windows the npm `bd` on PATH is a .cmd shim that',
      '* spawn() cannot start without a shell, so take a real bd.exe: first the one',
      '* where.exe/which finds on PATH, then the @beads/bd package binary, else "bd".',
      '*',
      '* @param {{ platform?: string, appdata?: string, lookup?: () => string, exists?: (p: string) => boolean }} [deps]',
      "* @returns {{ bin: string, via: 'path' | 'package' | 'fallback' }}",
      '*/',
      'export function findBdBin(deps = {}) {',
      "const win = (deps.platform || process.platform) === 'win32';",
      'const lookup =',
      'deps.lookup ||',
      '(() =>',
      "execFileSync(win ? 'where.exe' : 'which', ['bd'], {",
      "encoding: 'utf8',",
      'windowsHide: true,',
      "stdio: ['ignore', 'pipe', 'ignore']",
      '}));',
      'try {',
      'const hit = String(lookup())',
      '.split(/\\r?\\n/)',
      '.map((l) => l.trim())',
      '.find((l) => l && (!win || /\\.exe$/i.test(l)));',
      'if (hit) {',
      "return { bin: hit, via: 'path' };",
      '}',
      '} catch {',
      '// not on PATH',
      'const pkg = path.join(',
      'deps.appdata ||',
      'process.env.APPDATA ||',
      "path.join(os.homedir(), 'AppData', 'Roaming'),",
      "'npm',",
      "'node_modules',",
      "'@beads',",
      "'bd',",
      "'bin',",
      "'bd.exe'",
      ');',
      'if ((deps.exists || fs.existsSync)(pkg)) {',
      "return { bin: pkg, via: 'package' };",
      "return { bin: 'bd', via: 'fallback' };",
      '/** @type {string | undefined} */',
      'let found_bd_bin;',
      '/** Forget the looked-up path (tests only). */',
      'export function resetBdBin() {',
      'found_bd_bin = undefined;',
      '/**',
      '* Resolve the bd executable path. BD_BIN wins and is read live; otherwise the',
      '* lookup runs once (at start-up, see the call below) and logs its choice.',
      'if (!found_bd_bin) {',
      'const { bin, via } = findBdBin();',
      'found_bd_bin = bin;',
      'console.log(`bd: using ${bin} (${via})`);',
      'return found_bd_bin;',
      '// Resolve once at start-up, not on the first request.',
      'getBdBin();'
    ],
    del: [
      "import { spawn } from 'node:child_process';",
      '* Resolve the bd executable path.',
      "return 'bd';"
    ]
  },

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
      ');',
      "import { markBoardPosted } from './features/board-posted.js';",
      '// @mentions (beads-lite-1bo5.6.64.1, sec M1): remember the comment this server just posted',
      '{',
      'const mine = comment_list',
      '.filter(',
      '(/** @type {any} */ c) =>',
      'c && c.text === text.trim() && (!author || c.author === author)',
      ')',
      '.pop();',
      "if (mine && typeof mine.id === 'string') markBoardPosted(mine.id);",
      '}'
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
  // @mentions (beads-lite-1bo5.6.64): one bell method and its module export, no deletions.
  'server/features/notifier.js': {
    add: [
      '/**',
      '* @mention of the owner in a comment (beads-lite-1bo5.6.64): one bell',
      '* event, no title (no comment text), never a wake file.',
      '* @param {string} project @param {string} bead',
      '*/',
      'raiseMention(project, bead) {',
      'const at = new Date(now()).toISOString();',
      'emit({',
      'id: `n-${sha(`mention|${project}|${bead}|${at}`).slice(0, 12)}`,',
      "kind: 'mention',",
      'project,',
      'bead,',
      'title: null,',
      'desk: false,',
      'count: 1,',
      'at,',
      'read: false',
      '});',
      'saveStore();',
      '},',
      '* Bell event for an @owner mention (beads-lite-1bo5.6.64).',
      'export function raiseMention(project, bead) {',
      '(live ||= createNotifier()).raiseMention(project, bead);',
      '}'
    ],
    del: []
  },
  'server/features/index.js': {
    add: [
      "import * as bulk from './bulk.js';",
      'bulk,',
      // @mentions (beads-lite-1bo5.6.64.1)
      "import * as mention from './mention.js';",
      'ask,',
      'mention',
      // Time screens (beads-lite-1bo5.6.59.12)
      "import * as flow from './flow.js';",
      'flow,'
    ],
    del: ['ask']
  },
  'server/features/types.js': {
    add: [
      "'releases-get',",
      '// bulk select on the board (beads-lite-1bo5.6.63.1)',
      "'bulk-apply',",
      "'bulk-undo',",
      '// @mentions (beads-lite-1bo5.6.64.1)',
      "'mention-roles',",
      "'mention-scan',",
      "'mention-chips',",
      '// Time screens (beads-lite-1bo5.6.59.12)',
      "'flow-rollup',",
      // Experiment view and weekly digest (beads-lite-1bo5.6.66.7)
      '// Experiment view and weekly digest (beads-lite-1bo5.6.66.7)',
      "'flow-digest'"
    ],
    del: ["'releases-get'", "'bulk-undo'", "'mention-chips'", "'flow-rollup'"]
  }
};
const HOOK = [
  '// v3 returns before the tab state below exists (TDZ throw, 59.25).',
  'if (!legacy_mounted) return;',
  'let legacy_mounted = false;',
  '// v3 resolves moved ids and switches project itself (59.24).',
  'legacy_mounted = true;',
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
      // A seam with `hunks` allows only those exact hunks (header up to the context text).
      if (l.startsWith('@@')) {
        const h = (l.match(/^@@ [^@]*@@/) || [''])[0];
        if (SEAM[f].hunks && !SEAM[f].hunks.includes(h))
          bad.push(`${f}: a hunk outside the allowed ones: ${h}`);
        continue;
      }
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
