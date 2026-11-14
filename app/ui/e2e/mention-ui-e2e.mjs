#!/usr/bin/env node
/**
 * Headless-browser check of the @mention composer (beads-lite-1bo5.6.59.13 and
 * .64 acceptance 1-2) against a COPY of a project's .beads and a TEMPORARY wake
 * queue. Starts a board server on a free port, drives headless Edge/Chromium
 * that this script starts and closes, stops the server by PID.
 *
 *   node app/ui/e2e/mention-ui-e2e.mjs <project-copy-dir> <out-dir>
 *   env: BD_BIN, MENTION_WAKE_SCRIPT, PLAYWRIGHT_CORE (path of playwright-core),
 *        BROWSER_EXE (msedge.exe or chrome.exe)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const proj = path.resolve(process.argv[2] || '');
const out = path.resolve(process.argv[3] || '');
const need = [
  'BD_BIN',
  'MENTION_WAKE_SCRIPT',
  'PLAYWRIGHT_CORE',
  'BROWSER_EXE'
];
if (
  !fs.existsSync(path.join(proj, '.beads')) ||
  !process.argv[3] ||
  need.some((k) => !process.env[k])
) {
  console.error(
    'usage: mention-ui-e2e.mjs <project-copy-dir> <out-dir>; env ' +
      need.join(', ')
  );
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)(
  'playwright-core'
);
fs.mkdirSync(out, { recursive: true });
const wakeRoot = path.join(out, 'wake-queue');
const projects = path.join(out, 'projects.list');
fs.writeFileSync(projects, `# test\n${proj.replace(/\\/g, '/')}\n`);
const env = {
  ...process.env,
  WAKE_ROOT: wakeRoot,
  WAKE_PROJECTS_LIST: projects,
  BDUI_BOARD_HOME: path.join(out, 'board-home')
};
const rows = [];
const check = (name, ok, detail = '') => {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pendingFiles = () => {
  try {
    return fs.readdirSync(path.join(wakeRoot, 'pending'));
  } catch {
    return [];
  }
};
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const c = spawnSync(
  process.env.BD_BIN,
  ['create', 'mention ui e2e', '-t', 'task', '-p', '3', '--json'],
  {
    cwd: proj,
    encoding: 'utf8',
    windowsHide: true,
    env
  }
);
const id = JSON.parse(c.stdout.slice(c.stdout.indexOf('{'))).id;
const port = await freePort();
if (port === 3000 || port === 3001) throw new Error('refusing port');
const server = spawn(
  process.execPath,
  [path.join(root, 'server', 'index.js')],
  {
    cwd: proj,
    env: { ...env, PORT: String(port), PHONE_PORT: 'off' },
    stdio: [
      'ignore',
      fs.openSync(path.join(out, 'server.log'), 'w'),
      'inherit'
    ],
    windowsHide: true
  }
);
const pid = server.pid;
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/workspaces`)).ok) break;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXE
  });
  for (const [label, vp, lang] of [
    ['phone390-ar-dark', { width: 390, height: 844 }, 'ar'],
    ['pc1440-en-dark', { width: 1440, height: 900 }, 'en']
  ]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: 'dark' });
    await ctx.addInitScript((l) => {
      localStorage.setItem('beads-ui.lang', l);
    }, lang);
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}/?ui=3#/issues?issue=${id}`);
    const ta = p.locator('#u3-ts-in');
    await ta.waitFor({ timeout: 20000 });
    await ta.click();
    await ta.pressSequentially('@');
    const opts = p.locator('[role=option]');
    await opts.first().waitFor({ timeout: 5000 });
    const names = await opts.locator('.u3-mn__r').allInnerTexts();
    check(
      `1 ${label}: "@" lists roles and @owner`,
      names.includes('@qa') &&
        names.includes('@swe') &&
        names.includes('@owner'),
      `${names.length} rows`
    );
    await p.screenshot({ path: path.join(out, `${label}-picker.png`) });
    await ta.pressSequentially('sw');
    check(
      `1 ${label}: typing filters`,
      (await opts.count()) === 1 &&
        (await opts.first().innerText()).includes('@swe')
    );
    await ta.press('Enter');
    check(
      `1 ${label}: Enter inserts "@swe "`,
      (await ta.inputValue()) === '@swe '
    );
    check(
      `1 ${label}: list closes after pick`,
      (await p.locator('[role=option]').count()) === 0
    );
    await ta.fill('');
    await ta.pressSequentially('see @');
    await p.locator('[role=option]').first().waitFor();
    const row = p.locator('[role=option]', { hasText: '@qa' });
    const box = await row.boundingBox();
    check(
      `1 ${label}: row is thumb-sized (>= 44px)`,
      box && box.height >= 44,
      String(box && box.height)
    );
    await row.dispatchEvent('pointerdown');
    check(
      `1 ${label}: tapping a row inserts it`,
      (await ta.inputValue()) === 'see @qa '
    );
    await ta.pressSequentially('check the phone layout');
    await ta.fill('```\n@');
    await sleep(200);
    check(
      `3 ${label}: no picker inside a code fence`,
      (await p.locator('[role=option]').count()) === 0
    );
    await ta.fill('> quoted @');
    await sleep(200);
    check(
      `3 ${label}: no picker inside a quote`,
      (await p.locator('[role=option]').count()) === 0
    );
    const who = label.startsWith('phone') ? 'qa' : 'ux'; // a 2nd mention of one role within 10 min is merged by design
    await ta.fill(`@${who} check the phone layout`);
    await p.getByRole('button', { name: /post comment|ابعت التعليق/i }).click();
    await p.locator('[data-chip=waiting]').first().waitFor({ timeout: 10000 });
    check(
      `2 ${label}: chip waiting under the comment`,
      (await p.locator('[data-chip=waiting]').count()) >= 1
    );
    const f = pendingFiles();
    const evs = f
      .map((n) =>
        JSON.parse(fs.readFileSync(path.join(wakeRoot, 'pending', n), 'utf8'))
      )
      .filter((e) => e.bead === id && e.role === who);
    check(
      `2 ${label}: one wake event, bead + role, no text`,
      evs.length === 1 && !JSON.stringify(evs[0]).includes('phone'),
      String(evs.length)
    );
    if (label.startsWith('phone')) {
      // the router hands it to a chat: file moves to claimed; chip becomes woke after reload
      const n = f.find(
        (x) =>
          JSON.parse(fs.readFileSync(path.join(wakeRoot, 'pending', x), 'utf8'))
            .role === 'qa'
      );
      fs.mkdirSync(path.join(wakeRoot, 'claimed'), { recursive: true });
      fs.renameSync(
        path.join(wakeRoot, 'pending', n),
        path.join(wakeRoot, 'claimed', n)
      );
      await p.reload();
      await p.locator('[data-chip=woke]').first().waitFor({ timeout: 10000 });
      check(`2 ${label}: chip says woke after the router claims it`, true);
    }
    await p.screenshot({
      path: path.join(out, `${label}-chips.png`),
      fullPage: false
    });
    await ctx.close();
  }
} catch (e) {
  check('run', false, String(e && e.stack ? e.stack : e));
} finally {
  try {
    await browser?.close();
  } catch {
    // closing
  }
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true
  });
}
fs.writeFileSync(
  path.join(out, 'mention-ui-e2e.json'),
  JSON.stringify(rows, null, 2)
);
const bad = rows.filter((x) => !x.ok).length;
console.log(`${rows.length - bad}/${rows.length} pass`);
process.exit(bad ? 1 : 0);
