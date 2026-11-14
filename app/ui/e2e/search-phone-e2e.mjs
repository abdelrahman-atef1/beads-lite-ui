#!/usr/bin/env node
/**
 * Headless check (beads-lite-1bo5.6.59.14 fix): with the top search open on a
 * phone, the page must not scroll sideways and the search field must take the
 * bar. Bundles the real app/ui/search.js with esbuild, mounts it in the real
 * u3 header markup with the real u3 CSS, and compares document scrollWidth to
 * innerWidth at 320/360/390/414, LTR and RTL. Starts and closes its own
 * browser.
 *
 *   node app/ui/e2e/search-phone-e2e.mjs <out-dir>
 *   env: PLAYWRIGHT_CORE (path of playwright-core/package.json),
 *        BROWSER_EXE (msedge.exe or chrome.exe)
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const out = path.resolve(process.argv[2] || '');
if (
  !process.argv[2] ||
  !process.env.PLAYWRIGHT_CORE ||
  !process.env.BROWSER_EXE
) {
  console.error(
    'usage: search-phone-e2e.mjs <out-dir>; env PLAYWRIGHT_CORE, BROWSER_EXE'
  );
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)(
  'playwright-core'
);
fs.mkdirSync(out, { recursive: true });

const entry = path.join(out, 'entry.js');
fs.writeFileSync(
  entry,
  `import { mountSearch } from ${JSON.stringify(path.join(root, 'app/ui/search.js').split(path.sep).join('/'))};
const base = { subscriptions: { subscribeList: async () => () => {} },
  sub_issue_stores: { getStore: () => ({}), register() {}, unregister() {}, isLoaded: () => true,
    snapshotFor: () => [], subscribeFor: () => () => {} } };
mountSearch(document.querySelector('[data-slot="search"]'), base);`
);
const js = (
  await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife'
  })
).outputFiles[0].text;
const css = ['u3-tokens', 'u3-base', 'u3-shell', 'u3-projects']
  .map((n) => fs.readFileSync(path.join(root, 'app/css', n + '.css'), 'utf8'))
  .join('\n');

const page_html = (
  /** @type {string} */ dir
) => `<!doctype html><html dir="${dir}" lang="${dir === 'rtl' ? 'ar' : 'en'}">
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body><div class="u3"><div class="u3-col"><header class="u3-top">
<h1 class="u3-top__title">A rather long page title for the bar</h1>
<span class="u3-top__slot" data-slot="search"></span>
<span class="u3-top__slot" data-slot="bell"><span style="display:flex;gap:8px">
<button class="u3-btn u3-btn--ghost" style="width:44px">1</button>
<button class="u3-btn u3-btn--ghost" style="width:44px">2</button>
<button class="u3-btn u3-btn--ghost" style="width:44px">3</button></span></span>
</header></div></div><script>${js}</script></body></html>`;

const rows = [];
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXE,
  headless: true
});
try {
  for (const dir of ['ltr', 'rtl']) {
    for (const w of [320, 360, 390, 414]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 800 }
      });
      const page = await ctx.newPage();
      await page.setContent(page_html(dir));
      const m = () =>
        page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: window.innerWidth,
          bell: /** @type {HTMLElement} */ (
            document.querySelector('[data-slot=bell]')
          ).getBoundingClientRect().width,
          input: /** @type {HTMLElement} */ (
            document.querySelector('.u3-search__input')
          ).getBoundingClientRect().width
        }));
      const closed = await m();
      await page.click('.u3-search__btn');
      await page.fill('.u3-search__input', 'x');
      const open = await m();
      const ok =
        closed.sw <= closed.iw &&
        open.sw <= open.iw &&
        open.bell === 0 &&
        open.input > w / 2;
      rows.push({ dir, w, ok, closed, open });
      console.log(
        (ok ? 'PASS ' : 'FAIL ') +
          dir +
          ' ' +
          w +
          ' ' +
          JSON.stringify({ closed, open })
      );
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(rows, null, 1));
process.exit(rows.every((r) => r.ok) ? 0 : 1);
