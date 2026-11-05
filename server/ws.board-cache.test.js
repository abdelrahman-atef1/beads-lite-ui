import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';

// beads-lite-1bo5.6.45: board snapshots are cached per project. A PC on
// project A and a phone on project B each hit their own cache; a write or a
// watcher event in one never evicts or reloads the other. Only `bd` is mocked:
// list-adapters and board-data are the real ones.

/** @type {string[]} */
const ROOTS = [];
/** bd list/ready/blocked spawns per cwd. @type {Record<string, number>} */
const spawns = {};
/** Title served per project; bumped to simulate a change. @type {Record<string, string>} */
const titles = {};

vi.mock('./bd.js', () => ({
  runBd: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
  runBdJson: vi.fn(
    async (/** @type {string[]} */ args, /** @type {any} */ o) => {
      const name = path.basename(String(o?.cwd || ''));
      if (args[0] === 'list' && !args.includes('closed')) {
        spawns[name] = (spawns[name] || 0) + 1;
        return {
          code: 0,
          stdoutJson: [
            {
              id: `${name}-1`,
              title: titles[name] || 'v1',
              status: 'open',
              updated_at: `2026-01-01T00:00:0${(titles[name] || 'v1').slice(1)}Z`
            }
          ]
        };
      }
      return { code: 0, stdoutJson: [] };
    }
  ),
  getGitUserName: vi.fn(async () => 'tester')
}));

vi.mock('./registry-watcher.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    getAvailableWorkspaces: () =>
      ROOTS.map((p) => ({ path: p, database: path.join(p, '.beads', 'x.db') }))
  };
});

/** @param {string} name */
function makeProject(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bdui-cache-${name}-`));
  fs.mkdirSync(path.join(root, '.beads'));
  fs.writeFileSync(path.join(root, '.beads', 'x.db'), '');
  ROOTS.push(root);
  return root;
}

function makeSock() {
  return {
    sent: /** @type {any[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(JSON.parse(String(msg)));
    }
  };
}

let n = 0;
/**
 * @param {any} sock
 * @param {string} type
 * @param {unknown} payload
 */
async function call(sock, type, payload) {
  const id = `r${++n}`;
  await handleMessage(sock, Buffer.from(JSON.stringify({ id, type, payload })));
  return sock.sent.find((/** @type {any} */ m) => m.id === id);
}

const snapshotOf = (/** @type {any} */ s, /** @type {string} */ id) =>
  s.sent.find((m) => m.type === 'snapshot' && m.payload.id === id);

describe('per-project board cache over ws', () => {
  /** @type {string} */
  let a;
  /** @type {string} */
  let b;
  /** @type {ReturnType<typeof attachWsServer>} */
  let srv;

  let na = '';
  let nb = '';

  beforeAll(() => {
    a = makeProject('pca');
    b = makeProject('phb');
    na = path.basename(a);
    nb = path.basename(b);
    srv = attachWsServer(createServer(), {
      path: '/ws',
      heartbeat_ms: 100000,
      refresh_debounce_ms: 5,
      root_dir: a,
      watch_project: () => () => undefined
    });
  });

  afterAll(() => {
    srv.wss.close();
    for (const r of ROOTS) fs.rmSync(r, { recursive: true, force: true });
  });

  test('PC and phone on different projects: resubscribing hits each cache, then a write in one reloads only that one', async () => {
    const phone = makeSock();
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(phone, 'set-workspace', { path: b });
    await call(pc, 'get-workspace', {});

    // Page loads on both (fresh snapshots).
    await call(pc, 'subscribe-list', { id: 'c1', type: 'all-issues' });
    await call(phone, 'subscribe-list', { id: 'p1', type: 'all-issues' });
    expect(snapshotOf(pc, 'c1').payload.issues[0].id).toBe(`${na}-1`);
    expect(snapshotOf(phone, 'p1').payload.issues[0].id).toBe(`${nb}-1`);
    const base = { ...spawns };
    expect(base[na]).toBe(1);
    expect(base[nb]).toBe(1);

    // Both clients load again, alternating: all from cache (the old single
    // slot would have reloaded on every switch).
    for (let i = 0; i < 3; i++) {
      await call(pc, 'subscribe-list', { id: `c2${i}`, type: 'all-issues' });
      await call(phone, 'subscribe-list', { id: `p2${i}`, type: 'all-issues' });
    }
    expect(spawns).toEqual(base);

    // A write in B: B reloads (fresh data, no stale), A keeps its cache.
    titles[nb] = 'v2';
    await call(phone, 'update-status', { id: `${nb}-1`, status: 'closed' });
    await new Promise((r) => setTimeout(r, 700));
    await call(phone, 'subscribe-list', { id: 'p3', type: 'all-issues' });
    await call(pc, 'subscribe-list', { id: 'c3', type: 'all-issues' });
    expect(snapshotOf(phone, 'p3').payload.issues[0].title).toBe('v2');
    expect(spawns[nb]).toBeGreaterThan(base[nb]);
    expect(spawns[na]).toBe(base[na]);

    // A change in A (watcher path): A reloads and its client sees it live; B stays cached.
    const before_b = spawns[nb];
    titles[na] = 'v2';
    const db_a = (await call(pc, 'get-workspace', {})).payload.db_path;
    pc.sent.length = 0;
    scheduleListRefresh(db_a);
    await new Promise((r) => setTimeout(r, 300));
    expect(spawns[na]).toBeGreaterThan(base[na]);
    expect(spawns[nb]).toBe(before_b);
    const up = pc.sent.find((m) => m.type === 'upsert');
    expect(up?.payload.issue.title).toBe('v2');
  });
});
