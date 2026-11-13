#!/usr/bin/env node
/**
 * First-load payload (js bundle + joined css, gzip) of the tree it runs in.
 * Budget (board v3 plan): v3 <= legacy + 10%. Run it in a tree at the legacy
 * commit for the legacy number, and in the v3 tree for the v3 number.
 * Usage: node scripts/payload-v3.mjs
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const app = path.resolve(process.argv[2] || 'app');
const out = await build({
  entryPoints: [path.join(app, 'main.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  write: false,
  outfile: 'x.js'
});
const js = gzipSync(out.outputFiles[0].contents).length;
const html = readFileSync(path.join(app, 'index.html'), 'utf8');
const files = [
  ...html.matchAll(
    /<link rel="stylesheet" href="\.\/((?:css\/)?[\w-]+\.css)" \/>/g
  )
].map((m) => m[1]);
const css = gzipSync(
  Buffer.concat(files.map((f) => readFileSync(path.join(app, f))))
).length;
console.log(
  JSON.stringify({
    js_gzip: js,
    css_gzip: css,
    total_gzip: js + css,
    css_files: files.length
  })
);
