/**
 * Finding bd without BD_BIN (beads-lite-1bo5.6.59.21): each branch of the
 * lookup, then a real server started with no BD_BIN that answers a list call
 * from a throwaway bd project in the temp folder (no store above it).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import WebSocket from 'ws';
import { findBdBin, getBdBin, resetBdBin } from './bd.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRLF = String.fromCharCode(13, 10);
const none = () => {
  throw new Error('not on PATH');
};

describe('findBdBin', () => {
  test('PATH hit: takes the .exe, skips the npm .cmd shim (Windows)', () => {
    const r = findBdBin({
      platform: 'win32',
      lookup: () =>
        ['C:/npm/bd', 'C:/npm/bd.cmd', 'C:/tools/bd.exe'].join(CRLF),
      exists: () => true
    });
    expect(r).toEqual({ bin: 'C:/tools/bd.exe', via: 'path' });
  });

  test('PATH hit off Windows: first line', () => {
    const r = findBdBin({ platform: 'linux', lookup: () => '/usr/bin/bd\n' });
    expect(r).toEqual({ bin: '/usr/bin/bd', via: 'path' });
  });

  test('only a .cmd shim on PATH: falls to the npm package binary', () => {
    const r = findBdBin({
      platform: 'win32',
      appdata: 'C:/A',
      lookup: () => 'C:/npm/bd.cmd' + CRLF,
      exists: () => true
    });
    expect(r.via).toBe('package');
    expect(path.normalize(r.bin)).toBe(
      path.normalize('C:/A/npm/node_modules/@beads/bd/bin/bd.exe')
    );
  });

  test('lookup fails and package missing: plain bd', () => {
    expect(
      findBdBin({ platform: 'win32', lookup: none, exists: () => false })
    ).toEqual({ bin: 'bd', via: 'fallback' });
  });
});

describe('getBdBin', () => {
  test('BD_BIN set wins, is read live, and no lookup logs', () => {
    const prev = process.env.BD_BIN;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.BD_BIN = 'X:/real/bd.exe';
    resetBdBin();
    expect(getBdBin()).toBe('X:/real/bd.exe');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    if (prev) process.env.BD_BIN = prev;
    else delete process.env.BD_BIN;
  });

  test('without BD_BIN resolves once and logs one line', () => {
    const prev = process.env.BD_BIN;
    delete process.env.BD_BIN;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    resetBdBin();
    const a = getBdBin();
    const b = getBdBin();
    expect(a).toBe(b);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(
      /^bd: using .+ \((path|package|fallback)\)$/
    );
    log.mockRestore();
    if (prev) process.env.BD_BIN = prev;
  });
});

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = /** @type {net.AddressInfo} */ (s.address()).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

describe('server with no BD_BIN', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdresolve-'));
  const proj = path.join(tmp, 'tres');
  const env = { ...process.env };
  delete env.BD_BIN;
  env.BD_ACTOR = 'swe';
  const bin = findBdBin().bin;
  const have =
    spawnSync(bin, ['--version'], { windowsHide: true }).status === 0;
  if (!have)
    console.warn('bd-resolve: no runnable bd, server test NOT exercised');
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let child;
  let out = '';

  beforeAll(() => {
    if (!have) return;
    fs.mkdirSync(proj, { recursive: true });
    const run = (/** @type {string} */ c, /** @type {string[]} */ a) =>
      spawnSync(c, a, { cwd: proj, env, windowsHide: true, encoding: 'utf8' });
    run('git', ['init', '-q', '.']);
    run('git', ['config', 'beads.role', 'maintainer']);
    run(bin, ['init', '--prefix', 'tres', '--non-interactive']);
    run(bin, ['create', 'resolve probe', '-t', 'task', '-p', '2', '--silent']);
  }, 60000);

  afterAll(() => {
    if (child?.pid)
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true
      });
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // temp cleanup is best effort
    }
  });

  test('starts, logs the choice, answers one list call', async () => {
    if (!have) return;
    const port = await freePort();
    expect([3000, 3001]).not.toContain(port);
    child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
      cwd: proj,
      env: { ...env, PORT: String(port), HOST: '127.0.0.1', PHONE_PORT: 'off' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (out += d));
    // The page carries the per-launch token the socket must present.
    let page = '';
    for (let i = 0; i < 80 && !page; i++) {
      try {
        page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const token = /name="board-token" content="([0-9a-f]+)"/.exec(page)?.[1];
    expect(token).toBeTruthy();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    const reply = await new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('no list answer: ' + out)),
        20000
      );
      let tries = 0;
      const open = () => {
        ws.on('message', (m) => {
          const j = JSON.parse(String(m));
          if (
            j.type === 'snapshot' ||
            (j.type === 'subscribe-list' && j.ok === false)
          ) {
            clearTimeout(t);
            resolve(j);
          }
        });
        ws.send(
          JSON.stringify({
            id: 'r1',
            type: 'subscribe-list',
            payload: { id: 'c1', type: 'all-issues' }
          })
        );
      };
      ws.on('open', open);
      ws.on('error', (e) => {
        if (++tries > 40) reject(e);
      });
    });
    ws.close();
    expect(JSON.stringify(reply)).toContain('resolve probe');
    expect(out).toMatch(/bd: using .+ \((path|package)\)/);
    expect(out.match(/bd: using /g)).toHaveLength(1);
  }, 40000);
});
