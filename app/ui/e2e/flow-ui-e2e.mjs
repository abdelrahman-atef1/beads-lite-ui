#!/usr/bin/env node
/**
 * Headless-browser and push check of the experiment view, the weekly digest card and the
 * weekly push (beads-lite-1bo5.6.66.7). Runs against COPIES of the flow outputs
 * (rollup.json, exp/*.json, the weekly YYYY-Www.md) on a board server it starts on a free
 * port (never 3000/3001) and stops by PID; drives a headless browser it starts and closes.
 * No real push is sent: the board home is a temporary folder with no subscriber, and the
 * push check uses a fake web-push library. Writes <out>/summary.md and screenshots.
 *
 *   node app/ui/e2e/flow-ui-e2e.mjs <flow-dir> <digest-dir> <out-dir>
 *     flow-dir:   rollup.json + exp/*.json (copied, never written)
 *     digest-dir: weekly YYYY-Www.md files (copied)
 *   env: PLAYWRIGHT_CORE (a file next to a node_modules with playwright-core), BROWSER_EXE
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const [flowSrc, digestSrc, outArg] = process.argv
  .slice(2)
  .map((p) => p && path.resolve(p));
if (!outArg || !process.env.PLAYWRIGHT_CORE || !process.env.BROWSER_EXE) {
  console.error(
    'usage: flow-ui-e2e.mjs <flow-dir> <digest-dir> <out-dir>; env PLAYWRIGHT_CORE, BROWSER_EXE'
  );
  process.exit(2);
}
const out = outArg;
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)(
  'playwright-core'
);
const sleep = (/** @type {number} */ ms) =>
  new Promise((r) => setTimeout(r, ms));
const rows =
  /** @type {{ name: string, ok: boolean, detail: string }[]} */ ([]);
const check = (
  /** @type {string} */ name,
  /** @type {any} */ ok,
  detail = ''
) => {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' - ' + detail : ''));
};
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {any} */ (s.address()).port;
      s.close(() => res(p));
    });
  });
const copyDir = (/** @type {string} */ a, /** @type {string} */ b) => {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(a, e.name), path.join(b, e.name));
    else fs.copyFileSync(path.join(a, e.name), path.join(b, e.name));
  }
};

// ---- data: copies ---------------------------------------------------------------------------
const data = path.join(out, 'data');
const flowHome = path.join(data, 'flow');
const digestHome = path.join(data, 'digest');
const boardHome = path.join(data, 'board-home');
const proj = path.join(data, 'proj');
// a re-run starts from clean copies (this folder is the script's own)
fs.rmSync(data, { recursive: true, force: true });
copyDir(flowSrc, flowHome);
copyDir(digestSrc, digestHome);
fs.mkdirSync(proj, { recursive: true });
fs.mkdirSync(boardHome, { recursive: true });

// A 300-bead month: the first 300 closed beads of the rollup, closed times spread over 28 days.
const roll = JSON.parse(
  fs.readFileSync(path.join(flowSrc, 'rollup.json'), 'utf8')
);
const closed = Object.values(roll.beads)
  .filter((/** @type {any} */ b) => b.closed)
  .slice(0, 300);
const now = Date.now();
/** @type {Record<string, any>} */
const small = {};
closed.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
  small[b.id] = {
    ...b,
    closed: now - ((i % 28) + 0.5) * 86_400_000,
    running: false
  };
});
const flow300 = path.join(data, 'flow300');
fs.mkdirSync(flow300, { recursive: true });
fs.writeFileSync(
  path.join(flow300, 'rollup.json'),
  JSON.stringify({
    ...roll,
    built_at: new Date(now).toISOString(),
    beads: small
  })
);
copyDir(path.join(flowHome, 'exp'), path.join(flow300, 'exp'));

// ---- expected values, from the files themselves ------------------------------------------------
const expFiles = fs
  .readdirSync(path.join(flowHome, 'exp'))
  .filter((f) => f.endsWith('.json'))
  .map((f) =>
    JSON.parse(fs.readFileSync(path.join(flowHome, 'exp', f), 'utf8'))
  );
const weekName =
  fs
    .readdirSync(digestHome)
    .filter((f) => /^\d{4}-W\d{2}\.md$/.test(f))
    .sort()
    .pop() || '';
const head = fs
  .readFileSync(path.join(digestHome, weekName), 'utf8')
  .split(/\r?\n/);
const LABELS = ['Title:', 'Done since last:', 'Next:', 'Needs you:', 'Risks:'];
const wantLines = LABELS.map((l) =>
  (head.find((x) => x.startsWith(l)) || '').replace(
    /\[([^\]]+)\]\([^)]*\)/g,
    '$1'
  )
);
/** @param {any} e */
const wantPill = (e) =>
  e.confounded
    ? 'confounded'
    : e.verdict === 'ADOPT'
      ? 'ADOPT'
      : e.verdict === 'ROLL BACK'
        ? 'ROLL BACK'
        : e.verdict === 'INCONCLUSIVE'
          ? 'inconclusive'
          : /^too few to tell/i.test(e.reason)
            ? 'too few to tell'
            : 'EXTEND';

// ---- server -----------------------------------------------------------------------------------
/** @param {string} flowDir */
async function startServer(flowDir) {
  const port = await freePort();
  if (port === 3000 || port === 3001) throw new Error('refusing port');
  const log = fs.openSync(path.join(out, `server-${port}.log`), 'w');
  const srv = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
    cwd: proj,
    env: {
      ...process.env,
      PORT: String(port),
      PHONE_PORT: 'off',
      FLOW_HOME: flowDir,
      FLOW_DIGEST_DIR: digestHome,
      BDUI_BOARD_HOME: boardHome
    },
    stdio: ['ignore', log, log],
    windowsHide: true
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return { port, pid: /** @type {number} */ (srv.pid), srv };
}

const servers = /** @type {any[]} */ ([]);
let browser;
try {
  const A = await startServer(flowHome);
  servers.push(A);
  check(
    'server A on a free port',
    A.port !== 3000 && A.port !== 3001,
    String(A.port)
  );
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXE
  });

  const MATRIX = [
    ['phone390-ar-dark', { width: 390, height: 844 }, 'ar', 'dark'],
    ['phone390-ar-light', { width: 390, height: 844 }, 'ar', 'light'],
    ['pc1440-ar-dark', { width: 1440, height: 900 }, 'ar', 'dark'],
    ['pc1440-ar-light', { width: 1440, height: 900 }, 'ar', 'light'],
    ['pc1440-en-dark', { width: 1440, height: 900 }, 'en', 'dark']
  ];
  for (const [label, vp, lang, theme] of MATRIX) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
    await ctx.addInitScript(
      ([l, th]) => {
        localStorage.setItem('beads-ui.lang', l);
        localStorage.setItem('beads-ui.theme', th);
      },
      [lang, theme]
    );
    const p = await ctx.newPage();
    /** @type {string[]} */
    const errs = [];
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('pageerror', (e) => errs.push(String(e)));
    const t0 = Date.now();
    await p.goto(`http://127.0.0.1:${A.port}/?ui=3#/time`);
    await p.locator('.u3-wd__line').first().waitFor({ timeout: 20000 });
    await p.locator('.u3-ex__item').first().waitFor({ timeout: 20000 });
    check(
      `${label}: digest and experiments drawn`,
      true,
      `${Date.now() - t0} ms`
    );

    const lines = await p.locator('.u3-wd__line').allInnerTexts();
    check(
      `${label}: digest shows the 5 lines as written`,
      lines.length === 5 &&
        lines.every(
          (l, i) =>
            l.replace(/\s+/g, ' ').trim() ===
            wantLines[i].replace(/\s+/g, ' ').trim()
        ),
      `${lines.length} lines`
    );

    const items = await p.locator('.u3-ex__item').count();
    check(
      `${label}: one list item per verdict file`,
      items === expFiles.length,
      `${items}/${expFiles.length}`
    );

    let allOk = true;
    for (const e of expFiles) {
      await p.locator(`.u3-ex__item[data-slug="${e.slug}"]`).click();
      const d = p.locator(`.u3-ex__detail[data-slug="${e.slug}"]`);
      await d.waitFor({ timeout: 3000 });
      const pill = (await d.locator('.u3-ex__pill').innerText()).trim();
      const arms = d.locator('.u3-ex__arm');
      const armTxt = await arms.allInnerTexts();
      const qCounts = await arms.evaluateAll((els) =>
        els.map((a) => a.querySelectorAll('.u3-ex__arm-q li').length)
      );
      const okPill = lang === 'en' ? pill === wantPill(e) : pill.length > 0;
      const okN =
        armTxt.length === 2 &&
        armTxt[0].includes(String(e.n_base)) &&
        armTxt[1].includes(String(e.n_treat));
      const okQ =
        qCounts.length === 2 && qCounts.every((n) => n === e.guardrails.length);
      const okG =
        (await d.locator('.u3-ex__g').count()) === e.guardrails.length;
      const okScript = /flow-exp/.test(await d.innerText());
      const ok = okPill && okN && okQ && okG && okScript;
      if (!ok) allOk = false;
      check(
        `${label}: ${e.slug}: pill, arms with n, quality counters in both arms, guardrails, computed by script`,
        ok,
        `pill=${pill} n=${okN} q=${okQ} g=${okG} script=${okScript}`
      );
      if (lang === 'en') {
        await p.screenshot({
          path: path.join(out, `${label}-${e.slug}.png`),
          fullPage: true
        });
      }
    }
    // screenshot of the first experiment, whole screen
    await p.locator('.u3-ex__item').first().click();
    await p.screenshot({
      path: path.join(out, `${label}.png`),
      fullPage: true
    });

    const noBtn = await p.evaluate(() =>
      Array.from(
        document.querySelectorAll('.u3-ex button, .u3-wd button')
      ).every(
        (b) =>
          !/adopt|اعتماد الآن|تثبيت|new experiment|تجربة جديدة/i.test(
            b.textContent || ''
          ) || b.classList.contains('u3-ex__item')
      )
    );
    const noInput = await p.evaluate(
      () =>
        document.querySelectorAll('.u3-ex input, .u3-ex textarea, .u3-wd input')
          .length === 0
    );
    check(
      `${label}: no adopt button, no input`,
      noBtn && noInput && allOk !== undefined
    );

    const m = await p.evaluate(() => ({
      dir:
        document.documentElement.dir ||
        document.documentElement.getAttribute('dir'),
      theme: document.documentElement.getAttribute('data-theme'),
      sw: document.documentElement.scrollWidth,
      bw: document.body.scrollWidth,
      iw: window.innerWidth,
      mainOver: Array.from(
        document.querySelectorAll('.u3-ex, .u3-wd, .u3-tms')
      ).some((e) => e.scrollWidth > e.clientWidth + 1)
    }));
    check(
      `${label}: no horizontal scroll`,
      m.sw <= m.iw && m.bw <= m.iw && !m.mainOver,
      JSON.stringify(m)
    );
    check(
      `${label}: ${lang === 'ar' ? 'RTL' : 'LTR'}, ${theme} theme`,
      (lang === 'ar' ? m.dir === 'rtl' : m.dir !== 'rtl') && m.theme === theme,
      `${m.dir}/${m.theme}`
    );
    check(
      `${label}: no console errors`,
      errs.length === 0,
      errs.slice(0, 2).join(' | ')
    );
    // digits are Western in both languages
    const digits = await p.locator('.u3-ex__detail').innerText();
    check(`${label}: Western digits`, !/[٠-٩]/.test(digits));
    await ctx.close();
  }

  // empty states: no digest folder, no exp folder
  {
    const B0 = await startServer(path.join(data, 'empty-flow'));
    servers.push(B0);
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    await ctx.addInitScript(() => localStorage.setItem('beads-ui.lang', 'ar'));
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${B0.port}/?ui=3#/time`);
    await p.locator('.u3-tms__title').waitFor({ timeout: 20000 });
    await sleep(800);
    const t = await p.locator('.u3-tms').innerText();
    check(
      'no flow files: the screen draws with empty lines (ar)',
      /مفيش/.test(t),
      'digest and experiments empty'
    );
    await ctx.close();
  }

  // 300-bead month under 2 s (rollup read, role cards, digest, experiments), phone RTL
  {
    const B = await startServer(flow300);
    servers.push(B);
    const times = [];
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }
      });
      await ctx.addInitScript(() =>
        localStorage.setItem('beads-ui.lang', 'ar')
      );
      const p = await ctx.newPage();
      const t0 = Date.now();
      await p.goto(`http://127.0.0.1:${B.port}/?ui=3#/time`);
      await p.locator('.u3-tmr').first().waitFor({ timeout: 20000 });
      await p.locator('.u3-ex__item').first().waitFor({ timeout: 20000 });
      times.push(Date.now() - t0);
      if (i === 0) {
        const n = await p.locator('.u3-tmr').count();
        check('300-bead month: role cards drawn', n > 0, `${n} roles`);
      }
      await ctx.close();
    }
    check(
      '300-bead month renders under 2 s (cold page, 3 runs)',
      Math.max(...times) < 2000,
      times.join(', ') + ' ms'
    );
  }

  // server A pushed nothing real: no subscriber, so the boot check left no state
  await sleep(17000);
  check(
    'server A: no push state written (no subscriber, nothing sent)',
    !fs.existsSync(path.join(boardHome, 'flow-push.json')) &&
      !fs.existsSync(path.join(boardHome, 'push-subs.json'))
  );

  // ---- push, in this process, with a fake web-push library ----------------------------------
  const { createPush } = await import(
    pathToFileURL(path.join(root, 'server/features/push.js')).href
  );
  const { pushWeeklyDigest } = await import(
    pathToFileURL(path.join(root, 'server/features/flow.js')).href
  );
  const home = path.join(data, 'push-home');
  /** @type {any[]} */
  const sent = [];
  const fakeWp = {
    generateVAPIDKeys: () => ({
      publicKey: 'P'.padEnd(87, 'A'),
      privateKey: 'K'.padEnd(43, 'A')
    }),
    sendNotification: async (
      /** @type {any} */ sub,
      /** @type {string} */ body
    ) => {
      sent.push({
        endpoint: new URL(sub.endpoint).hostname,
        body: JSON.parse(body)
      });
    }
  };
  const b64 = (/** @type {number} */ n) =>
    crypto.randomBytes(n).toString('base64url');
  let clock = Date.now();
  const push = createPush({
    home,
    webpush: fakeWp,
    lock: () => {},
    now: () => clock
  });
  push.subscribe(
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: b64(65), auth: b64(16) }
    },
    'test phone'
  );
  const wk = path.join(data, 'push-weeks');
  fs.mkdirSync(wk, { recursive: true });
  const st = path.join(data, 'push-state', 'flow-push.json');
  const findingsText = fs.readFileSync(path.join(digestHome, weekName), 'utf8');
  fs.writeFileSync(path.join(wk, weekName), findingsText);
  const o = { dir: wk, state: st, push, muted: false };
  check(
    'push: the real weekly file has findings',
    /^Risks: (?!none)/m.test(findingsText),
    weekName
  );
  const r1 = await pushWeeklyDigest(o);
  const r2 = await pushWeeklyDigest(o);
  check(
    'push: sends once for the weekly file, never again',
    r1 === 'sent' && r2 === 'already' && sent.length === 1,
    `${r1}/${r2}/${sent.length}`
  );
  check(
    'push: payload is kind flow, no digest text, only the fake sender was used',
    sent[0] &&
      sent[0].body.kind === 'flow' &&
      sent[0].body.title === null &&
      !JSON.stringify(sent[0].body).includes('swe') &&
      sent[0].endpoint === 'fcm.googleapis.com',
    JSON.stringify(sent[0] && sent[0].body)
  );
  // next week, no findings: nothing
  const later = Date.now() + 7 * 86_400_000;
  const nofind = findingsText
    .replace(/^Risks:.*$/m, 'Risks: none')
    .replace(
      /W(\d\d)/g,
      (_m, n) => 'W' + String(Number(n) + 1).padStart(2, '0')
    );
  const nextName = weekName.replace(
    /W(\d\d)/,
    (_m, n) => 'W' + String(Number(n) + 1).padStart(2, '0')
  );
  fs.writeFileSync(path.join(wk, nextName), nofind);
  fs.utimesSync(path.join(wk, nextName), later / 1000, later / 1000);
  const r3 = await pushWeeklyDigest({ ...o, now: later });
  check(
    'push: a week with no findings sends nothing',
    r3 === 'no-findings' && sent.length === 1,
    `${r3}/${sent.length}`
  );
  // the week after, findings again, 14 days on: one more
  const later2 = Date.now() + 14 * 86_400_000;
  const thirdName = weekName.replace(
    /W(\d\d)/,
    (_m, n) => 'W' + String(Number(n) + 2).padStart(2, '0')
  );
  fs.writeFileSync(path.join(wk, thirdName), findingsText);
  fs.utimesSync(path.join(wk, thirdName), later2 / 1000, later2 / 1000);
  clock = later2;
  const r4 = await pushWeeklyDigest({ ...o, now: later2 });
  check(
    'push: next weekly file with findings sends one more',
    r4 === 'sent' && sent.length === 2,
    `${r4}/${sent.length}`
  );
  // the board sender's own caps still apply: muted sends nothing
  const fourth = weekName.replace(
    /W(\d\d)/,
    (_m, n) => 'W' + String(Number(n) + 3).padStart(2, '0')
  );
  const later3 = Date.now() + 21 * 86_400_000;
  fs.writeFileSync(path.join(wk, fourth), findingsText);
  fs.utimesSync(path.join(wk, fourth), later3 / 1000, later3 / 1000);
  clock = later3;
  const r5 = await pushWeeklyDigest({ ...o, now: later3, muted: true });
  check(
    'push: owner mute is honoured through the board sender',
    r5 === 'muted' && sent.length === 2,
    `${r5}/${sent.length}`
  );
} catch (e) {
  check(
    'script ran to the end',
    false,
    String((e && /** @type {any} */ (e).stack) || e).slice(0, 300)
  );
} finally {
  await Promise.race([browser && browser.close(), sleep(5000)]).catch(() => {});
  for (const s of servers) {
    try {
      process.kill(s.pid);
    } catch {
      // gone
    }
  }
  const bad = rows.filter((r) => !r.ok);
  const md = [
    '# Flow UI e2e (beads-lite-1bo5.6.66.7)',
    '',
    `${rows.length - bad.length} PASS, ${bad.length} FAIL, run ${new Date().toISOString()}`,
    '',
    ...rows.map(
      (r) =>
        `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' - ' + r.detail : ''}`
    )
  ].join('\n');
  fs.writeFileSync(path.join(out, 'summary.md'), md + '\n');
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(rows, null, 1)
  );
  console.log(bad.length ? `FAIL ${bad.length}` : 'ALL PASS');
  process.exit(bad.length ? 1 : 0);
}
