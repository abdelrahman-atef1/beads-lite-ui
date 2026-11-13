#!/usr/bin/env node
/**
 * Board v3 guard (beads-lite-1bo5.6.59): a v3 task may only touch app/ui/**,
 * app/css/u3-*.css, app/fonts/**, scripts/legacy-untouched.mjs and
 * scripts/payload-v3.mjs, plus two narrow edits: app/main.js (only the lines of
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
  /^scripts\/payload-v3\.mjs$/
];
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
