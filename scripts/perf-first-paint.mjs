/* global process, console */
// Slow-link first-paint guard (beads-lite-1bo5.6.31). Starts the board on a
// spare port against a COPY of a workspace, puts a throttling TCP proxy in
// front (400 ms RTT, 50 KB/s down, websocket included, which CDP throttling
// does not cover), drives headless Chromium and reports:
//   cold   first .card (new profile), static bytes on the wire, socket bytes
//   repeat first .card (same profile, reload)
// usage: FIXTURE=<dir with ws/<name>/.beads and home/> PLAYWRIGHT_CORE=<path>
//        [EXE=<chromium>] node scripts/perf-first-paint.mjs [port=4500] [--assert]
// It never touches :3000/:3001; it stops what it started by PID/handle.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = process.env.FIXTURE;
if (!Q || !process.env.PLAYWRIGHT_CORE) {
  console.error('set FIXTURE and PLAYWRIGHT_CORE (see header)');
  process.exit(2);
}
const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE)(
  'playwright-core'
);
const port = Number(process.argv.find((a) => /^\d+$/.test(a)) || 4500);
if (port === 3000 || port === 3001) process.exit(2);
const assert = process.argv.includes('--assert');
const RTT_MS = Number(process.env.RTT_MS || 400);
const BPS = Number(process.env.BPS || 50 * 1024);
const sleep = (/** @type {number} */ ms) =>
  new Promise((r) => setTimeout(r, ms));

// ---- throttling proxy: proxyPort -> port ----------------------------------
let lastEnd = 0; // shared downlink clock, ms
const stats = { ws_down: 0, http_down: 0 };
/** @param {number} proxyPort */
function startProxy(proxyPort) {
  const srv = net.createServer((c) => {
    const up = net.connect(port, '127.0.0.1');
    let isWs = false;
    c.on('data', (d) => {
      if (/^GET [^ ]*\/ws\?/.test(d.toString('latin1', 0, 80))) isWs = true;
      setTimeout(() => up.writable && up.write(d), RTT_MS / 2);
    });
    up.on('data', (d) => {
      const now = Date.now();
      const start = Math.max(now + RTT_MS / 2, lastEnd);
      lastEnd = start + (d.length / BPS) * 1000;
      if (isWs && !/^HTTP\/1.1 101/.test(d.toString('latin1', 0, 12)))
        stats.ws_down += d.length;
      else if (!isWs) stats.http_down += d.length;
      setTimeout(() => c.writable && c.write(d), lastEnd - now);
    });
    // close only after everything queued has been delivered
    up.on('close', () =>
      setTimeout(() => c.end(), Math.max(0, lastEnd - Date.now()) + RTT_MS / 2)
    );
    c.on('close', () => setTimeout(() => up.end(), RTT_MS / 2));
    c.on('error', () => up.destroy());
    up.on('error', () => c.destroy());
  });
  return new Promise((r) => srv.listen(proxyPort, '127.0.0.1', () => r(srv)));
}

// ---- server ---------------------------------------------------------------
const wsDirs = fs.readdirSync(`${Q}/ws`);
const env = {
  ...process.env,
  PORT: String(port),
  PHONE_PORT: 'off',
  BD_BIN:
    process.env.BD_BIN ||
    `${process.env.APPDATA}/npm/node_modules/@beads/bd/bin/bd.exe`,
  USERPROFILE: `${Q}/home`,
  HOME: `${Q}/home`
};
const log = fs.openSync(`${Q}/perf-srv.log`, 'w');
const srv = spawn(process.execPath, [`${root}/server/index.js`], {
  cwd: `${Q}/ws/${wsDirs[0]}`,
  env,
  stdio: ['ignore', log, log],
  windowsHide: true
});
const proxy = await startProxy(port + 1);
let browser;
const out = { rtt_ms: RTT_MS, bytes_per_s: BPS };
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/workspaces`)).ok) break;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  // warm the server (bundle, bd cache) so we measure the link, not first-boot work
  await fetch(`http://127.0.0.1:${port}/main.bundle.js`)
    .then((r) => r.arrayBuffer())
    .catch(() => {});
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EXE
  });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  /** @param {string} label */
  async function visit(label) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    /** @type {Map<string, string>} */ const urls = new Map();
    /** @type {Array<[string, number]>} */ const files = [];
    cdp.on('Network.requestWillBeSent', (e) =>
      urls.set(e.requestId, e.request.url)
    );
    const tl = [];
    let t0 = Date.now();
    cdp.on('Network.loadingFinished', (e) => {
      files.push([urls.get(e.requestId) || '?', e.encodedDataLength]);
      tl.push(
        `${Date.now() - t0}ms done ${new URL(urls.get(e.requestId) || 'http://x/?').pathname}`
      );
    });
    cdp.on('Network.webSocketCreated', () =>
      tl.push(`${Date.now() - t0}ms ws created`)
    );
    cdp.on('Network.webSocketFrameReceived', (e) =>
      tl.push(`${Date.now() - t0}ms ws frame ${e.response.payloadData.length}`)
    );
    stats.ws_down = 0;
    stats.http_down = 0;
    t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port + 1}/#/board`, {
      waitUntil: 'commit',
      timeout: 120000
    });
    const msgs = [];
    page.on('console', (m) =>
      msgs.push(m.type() + ' ' + m.text().slice(0, 200))
    );
    page.on('pageerror', (e) =>
      msgs.push('pageerror ' + String(e).slice(0, 200))
    );
    try {
      await page.waitForSelector('.card', {
        timeout: Number(process.env.TIMEOUT_MS || 120000)
      });
    } catch (e) {
      console.error(
        'no card:',
        (await page.evaluate(() => document.body.innerText)).slice(0, 400),
        msgs.slice(0, 10)
      );
      throw e;
    }
    const first_card_ms = Date.now() - t0;
    await sleep(1500);
    const static_bytes = files
      .filter(([u]) => !/\/ws/.test(u))
      .reduce((a, [, n]) => a + n, 0);
    const res = {
      first_card_ms,
      static_wire_bytes: static_bytes,
      http_wire_bytes: stats.http_down,
      socket_wire_bytes: stats.ws_down,
      timeline: tl.slice(0, 40),
      files: files.map(([u, n]) => `${new URL(u).pathname} ${n}`)
    };
    await page.close();
    return { label, ...res };
  }
  out.cold = await visit('cold');
  out.repeat = await visit('repeat');
} finally {
  await browser?.close().catch(() => {});
  proxy.close();
  try {
    process.kill(srv.pid);
  } catch {
    /* gone */
  }
}
console.log(JSON.stringify(out, null, 1));
if (assert) {
  const bad = [];
  if (out.cold.first_card_ms > 5000) bad.push('cold first card > 5s');
  if (out.repeat.first_card_ms > 2000) bad.push('repeat first card > 2s');
  if (out.cold.static_wire_bytes > 120 * 1024) bad.push('static > 120KB');
  if (out.cold.socket_wire_bytes > 60 * 1024) bad.push('socket > 60KB');
  if (bad.length) {
    console.error('FAIL: ' + bad.join('; '));
    process.exitCode = 1;
  }
}
process.exit(process.exitCode || 0);
