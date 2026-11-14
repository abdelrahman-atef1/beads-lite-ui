#!/usr/bin/env node
/**
 * First-load payload (js + joined css, gzip) of the tree it runs in.
 * Budget (board v3 plan): v3 <= legacy + 10%. Run it in a tree at the legacy
 * commit for the legacy number, and in the v3 tree for the v3 number.
 *
 * Built the way the server builds it (esbuild splitting, one entry, screens
 * behind import()). First load = the entry plus every chunk it imports
 * statically; chunks behind import() load when their screen opens and are
 * listed apart (lazy_gzip) so the cost of opening a screen is visible.
 * Usage: node scripts/payload-v3.mjs [appDir]
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { inlineLegacyViews } from '../server/features/perf.js';

const app = path.resolve(process.argv[2] || 'app');
const out = await build({
  entryPoints: [path.join(app, 'main.js')],
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  write: false,
  metafile: true,
  outdir: path.join(app, '.payload-out'),
  entryNames: 'main',
  chunkNames: 'chunks/[hash]',
  plugins: [inlineLegacyViews]
});
const meta = out.metafile.outputs;
/** @param {string} f */
const key = (f) => path.resolve(f);
const files = new Map(out.outputFiles.map((o) => [key(o.path), o.contents]));
/** @type {Set<string>} */
const first = new Set();
/** @param {string} f - metafile output path */
function walk(f) {
  if (first.has(f)) return;
  first.add(f);
  for (const i of meta[f].imports) {
    if (i.kind === 'import-statement') walk(i.path);
  }
}
const names = Object.keys(meta);
const entry = names.find(
  (k) => path.resolve(meta[k].entryPoint || '') === path.join(app, 'main.js')
);
if (!entry) throw new Error('no entry output');
walk(entry);
/** @param {string[]} list */
const gz = (list) =>
  gzipSync(Buffer.concat(list.map((f) => files.get(key(f)) || Buffer.alloc(0))))
    .length;
const js = gz([...first]);
const lazy = names.filter((n) => !first.has(n));
const html = readFileSync(path.join(app, 'index.html'), 'utf8');
const css_files = [
  ...html.matchAll(
    /<link rel="stylesheet" href="\.\/((?:css\/)?[\w-]+\.css)" \/>/g
  )
].map((m) => m[1]);
const css = gzipSync(
  Buffer.concat(css_files.map((f) => readFileSync(path.join(app, f))))
).length;
/**
 * Per screen: the first load plus that screen's own chunks (its static
 * closure not already in the first load).
 * @type {Record<string, number>}
 */
const screens = {};
for (const n of names) {
  const ep = meta[n].entryPoint || '';
  const m = /ui\/views\/([\w-]+)\.js$/.exec(ep.replace(/\\/g, '/'));
  if (!m || first.has(n)) continue;
  const set = new Set(first);
  /** @param {string} f */
  const add = (f) => {
    if (set.has(f)) return;
    set.add(f);
    for (const i of meta[f].imports) {
      if (i.kind === 'import-statement') add(i.path);
    }
  };
  add(n);
  screens[m[1]] = gz([...set]);
}
const worst = Math.max(js, ...Object.values(screens));
console.log(
  JSON.stringify({
    js_gzip: js,
    css_gzip: css,
    total_gzip: js + css,
    css_files: css_files.length,
    js_first_files: first.size,
    lazy_chunks: lazy.length,
    lazy_gzip: lazy.length ? gz(lazy) : 0,
    screens_js_gzip: screens,
    worst_screen_total_gzip: worst + css
  })
);
