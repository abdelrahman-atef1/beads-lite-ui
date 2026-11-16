#!/usr/bin/env node
/**
 * Every v3 route opens at phone and PC width (beads-lite-1bo5.6.59.19).
 * Starts the board from this tree on a free port (never 3000/3001) against a COPY
 * of a project's .beads folder, drives a headless browser it starts and closes, and
 * stops the server by PID. Per route it checks: the screen's marker is on the page,
 * no console error or page error, and what the page fetched (js requests and gzip
 * bytes of the first load vs the screen's own chunks). Writes <out>/summary.md.
 *
 *   node app/ui/e2e/routes-e2e.mjs <beads-dir-to-copy> <out-dir>
 *   env: PLAYWRIGHT_CORE (a file next to a node_modules with playwright-core),
 *        BROWSER_EXE (a chromium / headless-shell exe), BD_LITE_UPSTREAM if bd needs it
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const [beadsSrc, out] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!out || !process.env.PLAYWRIGHT_CORE || !process.env.BROWSER_EXE) {
  console.error(
    'usage: routes-e2e.mjs <beads-dir> <out-dir>; env PLAYWRIGHT_CORE, BROWSER_EXE'
  );
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)(
  'playwright-core'
);
const sleep = (/** @type {number} */ ms) =>
  new Promise((r) => setTimeout(r, ms));
const rows = /** @type {string[]} */ ([]);
let failed = 0;
const check = (
  /** @type {string} */ name,
  /** @type {any} */ ok,
  detail = ''
) => {
  if (!ok) failed++;
  const line = (ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : '');
  rows.push(line);
  console.log(line);
};
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {any} */ (s.address()).port;
      s.close(() => res(p));
    });
  });

// A copy of the project's .beads (never the original), without lock files.
const data = path.join(out, 'data');
const proj = path.join(data, 'proj');
fs.rmSync(data, { recursive: true, force: true }); // this script's own folder
fs.mkdirSync(path.join(proj, '.beads'), { recursive: true });
for (const e of fs.readdirSync(beadsSrc, { withFileTypes: true })) {
  if (!e.isFile() || /\.lock$/.test(e.name)) continue;
  fs.copyFileSync(
    path.join(beadsSrc, e.name),
    path.join(proj, '.beads', e.name)
  );
}
const boardHome = path.join(data, 'board-home');
fs.mkdirSync(boardHome, { recursive: true });

const port = await freePort();
if (port === 3000 || port === 3001) throw new Error('refusing port');
const log = fs.openSync(path.join(out, `server-${port}.log`), 'w');
const srv = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  cwd: proj,
  env: {
    ...process.env,
    PORT: String(port),
    PHONE_PORT: 'off',
    BDUI_BOARD_HOME: boardHome
  },
  stdio: ['ignore', log, log],
  windowsHide: true
});
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  check('server on a free port', port !== 3000 && port !== 3001, String(port));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXE
  });

  // marker = a selector that exists only when that screen is mounted
  const ROUTES = [
    ['desk', '#/', '.dk3'],
    ['tasks', '#/issues', '[data-view="tasks"]'],
    ['tasks-board', '#/board', '[data-view="tasks"]'],
    ['task', '#/issues?issue=beads-lite-1bo5.6.59.19', '[data-view="task"]'],
    ['releases', '#/releases', '[data-view="releases"]'],
    ['projects', '#/projects', '[data-view="projects"]'],
    ['settings', '#/settings', '[data-view="settings"]'],
    ['time', '#/time', '[data-view="time"]'],
    ['ui-kit', '#/ui-kit', '[data-view="kit"]']
  ];
  const SIZES = [
    ['phone390', { width: 390, height: 844 }, 'dark'],
    ['pc1440', { width: 1440, height: 900 }, 'dark'],
    ['pc1440-light', { width: 1440, height: 900 }, 'light']
  ];
  /** @type {string[]} */
  let deskJs = [];
  for (const [sname, vp, scheme] of SIZES) {
    const ctx = await browser.newContext({
      viewport: vp,
      colorScheme: /** @type {'dark'|'light'} */ (scheme)
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('beads-ui.lang', 'ar');
      localStorage.setItem('bl.ui', '3');
    });
    for (const [name, hash, marker] of ROUTES) {
      const p = await ctx.newPage();
      /** @type {string[]} */
      const errs = [];
      /** @type {{ url: string, gz: number }[]} */
      const js = [];
      p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('response', async (r) => {
        const u = r.url();
        if (/\/(main\.[\w.]+|chunks\/[\w-]+)\.js$/.test(u)) {
          const len = Number(r.headers()['content-length'] || 0);
          js.push({ url: u.replace(/^.*\//, ''), gz: len });
        }
      });
      await p.goto(`http://127.0.0.1:${port}/${hash}`, {
        waitUntil: 'domcontentloaded'
      });
      let ok = true;
      try {
        await p.waitForSelector(marker, { timeout: 20000 });
      } catch {
        ok = false;
      }
      await sleep(300);
      const chunkReqs = js.filter((j) => j.url.startsWith('main.') === false);
      check(
        `${sname} ${name} opens`,
        ok && errs.length === 0,
        `js requests ${js.length}, wire bytes ${js.reduce((a, j) => a + j.gz, 0)}` +
          (errs.length ? `, errors: ${errs.slice(0, 2).join(' | ')}` : '') +
          (chunkReqs.length ? '' : ', no chunks')
      );
      if (name === 'desk') deskJs = js.map((j) => j.url);
      if (name === 'task') {
        // the task screen is its own chunk: not in the desk's first load
        const extra = js.filter((j) => !deskJs.includes(j.url));
        check(
          `${sname} task chunk loads on demand, not with the desk`,
          extra.length > 0 && deskJs.length > 0,
          `${extra.length} more js file(s), ${extra.reduce((x, j) => x + j.gz, 0)} bytes on the wire`
        );
      }
      // icon set C (1bo5.6.59.32 / 13.9 / 13.6): icons drawn on every screen, none broken
      const ic = await p.evaluate(() => ({
        icons: document.querySelectorAll('.u3 .u3-ic svg').length,
        emptyIcons: [...document.querySelectorAll('.u3 .u3-ic')].filter(
          (e) => !e.querySelector('svg path, svg circle, svg rect')
        ).length,
        brokenProj: [...document.querySelectorAll('img.u3-proj__img')].filter(
          (i) =>
            i instanceof HTMLImageElement && i.complete && i.naturalWidth === 0
        ).length,
        projImgs: document.querySelectorAll('img.u3-proj__img').length,
        priIcons: document.querySelectorAll('.u3-val [data-icon^="p_"]').length,
        stIcons: document.querySelectorAll('.u3-val [data-icon^="s_"]').length
      }));
      check(
        `${sname} ${name} icons drawn, none empty or broken`,
        ic.icons > 0 && ic.emptyIcons === 0 && ic.brokenProj === 0,
        JSON.stringify(ic)
      );
      if (name === 'task') {
        check(
          `${sname} task shows status and priority as icons`,
          ic.priIcons > 0 && ic.stIcons > 0,
          JSON.stringify(ic)
        );
      }
      {
        await p.screenshot({
          path: path.join(out, `${sname}-${name}.png`),
          fullPage: false
        });
      }
      await p.close();
    }
    // route switch in one page: chunks load on first open, the last click wins
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}/#/`, {
      waitUntil: 'domcontentloaded'
    });
    await p.waitForSelector('.dk3', { timeout: 20000 });
    await p.evaluate(() => {
      location.hash = '#/releases';
      location.hash = '#/projects';
    });
    let landed = true;
    try {
      await p.waitForSelector('[data-view="projects"]', { timeout: 20000 });
    } catch {
      landed = false;
    }
    await sleep(500);
    const stale = await p.$('[data-view="releases"]');
    check(`${sname} fast route switch lands on the last one`, landed && !stale);
    await p.close();
    await ctx.close();
  }
} finally {
  await browser?.close();
  if (srv.pid) {
    try {
      process.kill(srv.pid);
    } catch {
      // already gone
    }
  }
  fs.writeFileSync(
    path.join(out, 'summary.md'),
    `# routes e2e\n\n${rows.map((r) => '- ' + r).join('\n')}\n\n${failed ? failed + ' FAILED' : 'all passed'}\n`
  );
}
process.exit(failed ? 1 : 0);
