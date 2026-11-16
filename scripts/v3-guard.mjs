#!/usr/bin/env node
/**
 * Board v3 guard (beads-lite-1bo5.6.59, retargeted at cutover 59.17).
 * v3 is the only shell, so the old "legacy files untouched" diff check is gone.
 * What it protects now, from the tree alone (no git needed):
 *  1. No retired legacy file comes back (styles.css, the old css, the old views,
 *     the ?ui flag).
 *  2. Every relative import in app/ resolves (a deleted file still imported
 *     fails here, not in a user's browser).
 *  3. index.html links only u3-*.css files that exist, and has no old shell.
 *
 * Usage: node scripts/v3-guard.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve('app');
/** @type {string[]} */
const bad = [];

const RETIRED = [
  'styles.css',
  ...[
    'tokens',
    'shell',
    'nav',
    'priority',
    'decisions',
    'board',
    'list',
    'detail',
    'notifications',
    'report',
    'outputs',
    'releases',
    'ask'
  ].map((n) => `css/${n}.css`),
  ...[
    'ask',
    'board',
    'card-panel',
    'decisions',
    'detail',
    'detail-header',
    'epics',
    'issue-dialog',
    'issue-row',
    'list',
    'nav',
    'new-issue-dialog',
    'registry',
    'releases',
    'top-search',
    'workspace-picker'
  ].map((n) => `views/${n}.js`),
  'ui/flag.js'
];
for (const f of RETIRED) {
  if (fs.existsSync(path.join(app, f)))
    bad.push(`retired file is back: app/${f}`);
}

/** @param {string} d @param {string[]} out */
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'chunks') walk(p, out);
    } else if (/\.(js|mjs)$/.test(e.name) && !/main\.bundle/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
for (const f of walk(app)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const p = path.resolve(path.dirname(f), m[1]);
    if (
      !fs.existsSync(p) &&
      !fs.existsSync(p + '.js') &&
      !fs.existsSync(p.replace(/\.js$/, '.ts'))
    ) {
      bad.push(`${path.relative('.', f)}: import ${m[1]} does not exist`);
    }
  }
}

const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
for (const m of html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)) {
  if (!/^css\/u3-[\w-]+\.css$/.test(m[1])) bad.push(`index.html links ${m[1]}`);
  else if (!fs.existsSync(path.join(app, m[1])))
    bad.push(`index.html links a missing file: ${m[1]}`);
}
if (/id="shell"|id="top-nav"/.test(html))
  bad.push('index.html has the old shell');

if (bad.length) {
  console.error('v3-guard FAILED');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(
  'v3-guard OK: no retired file, every import resolves, index.html clean'
);
