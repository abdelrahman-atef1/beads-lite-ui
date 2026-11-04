import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { runBd } from './bd.js';
import { fetchListForSubscription } from './list-adapters.js';
import { attachWsServer, handleMessage } from './ws.js';

// Beads-lite-1bo5.6.34: the project is per connection, not per server. A phone
// and a PC tab on different projects must never move each other.

/** @type {string[]} */
const ROOTS = [];

vi.mock('./bd.js', () => ({
  runBd: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
  runBdJson: vi.fn(async () => ({ code: 0, stdoutJson: [] })),
  getGitUserName: vi.fn(async () => 'tester')
}));

// Only the two temp projects are "registered" (the real registry is the
// owner's ~/.beads/registry.json and must not be touched by a test).
vi.mock('./registry-watcher.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    getAvailableWorkspaces: () =>
      ROOTS.map((p) => ({ path: p, database: path.join(p, '.beads', 'x.db') }))
  };
});

// Each project has its own issue ids, taken from the cwd the call is made in.
let version = 1;
/** Milliseconds the list call stalls (to hold a subscribe in flight). */
let stall_ms = 0;
vi.mock('./list-adapters.js', () => ({
  fetchListForSubscription: vi.fn(
    async (/** @type {any} */ _spec, /** @type {any} */ opts) => {
      const name = path.basename(String(opts?.cwd || ''));
      if (stall_ms) await new Promise((r) => setTimeout(r, stall_ms));
      return {
        ok: true,
        items: [{ id: `${name}-1`, updated_at: version, closed_at: null }]
      };
    }
  )
}));

/** @param {string} name */
function makeProject(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bdui-iso-${name}-`));
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

describe('per-connection workspace', () => {
  /** @type {string} */
  let a;
  /** @type {string} */
  let b;
  /** @type {ReturnType<typeof attachWsServer>} */
  let srv;
  const watched = /** @type {string[]} */ ([]);
  const released = /** @type {string[]} */ ([]);

  beforeAll(() => {
    a = makeProject('alpha');
    b = makeProject('beta');
    srv = attachWsServer(createServer(), {
      path: '/ws',
      heartbeat_ms: 100000,
      refresh_debounce_ms: 5,
      root_dir: a,
      watch_project: (_root, db) => {
        watched.push(db);
        return () => released.push(db);
      }
    });
  });

  afterAll(() => {
    srv.wss.close();
    for (const r of ROOTS) fs.rmSync(r, { recursive: true, force: true });
  });

  test('set-workspace on one socket leaves the other where it was', async () => {
    const phone = makeSock();
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    srv.wss.clients.add(/** @type {any} */ (pc));

    const r1 = await call(phone, 'set-workspace', { path: b });
    expect(r1.ok).toBe(true);
    expect(r1.payload.changed).toBe(true);
    expect(r1.payload.workspace.root_dir).toBe(path.resolve(b));

    const g_phone = await call(phone, 'get-workspace', {});
    const g_pc = await call(pc, 'get-workspace', {});
    expect(g_phone.payload.root_dir).toBe(path.resolve(b));
    // The PC never chose: it is still on the server default.
    expect(g_pc.payload.root_dir).toBe(a);
    // And nobody was told to switch.
    expect(pc.sent.some((m) => m.type === 'workspace-changed')).toBe(false);
    expect(phone.sent.some((m) => m.type === 'workspace-changed')).toBe(false);

    // list-workspaces reports each socket's own current project
    const l_pc = await call(pc, 'list-workspaces', {});
    expect(l_pc.payload.current.root_dir).toBe(a);
  });

  test('a subscribe still loading when the socket switches project is dropped quietly (1bo5.6.34)', async () => {
    const sock = makeSock();
    srv.wss.clients.add(/** @type {any} */ (sock));
    stall_ms = 150;
    const id = `r${++n}`;
    const pending = handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id,
          type: 'subscribe-list',
          payload: { id: 'stale', type: 'all-issues' }
        })
      )
    );
    // The reload restores the saved project while the first list is loading.
    await call(sock, 'set-workspace', { path: b });
    await pending;
    stall_ms = 0;
    const reply = sock.sent.find((/** @type {any} */ m) => m.id === id);
    // Not an error the client treats as fatal, and nothing attached/published.
    expect(reply.ok).toBe(true);
    expect(
      sock.sent.some((m) => m.type === 'snapshot' && m.payload.id === 'stale')
    ).toBe(false);
    // The re-subscribe the client sends next fills from the NEW project.
    await call(sock, 'subscribe-list', { id: 'fresh', type: 'all-issues' });
    const snap = sock.sent.find(
      (m) => m.type === 'snapshot' && m.payload.id === 'fresh'
    );
    expect(snap.payload.issues[0].id).toBe(`${path.basename(b)}-1`);
  });

  test('each socket lists and refreshes its own project only', async () => {
    const phone = makeSock();
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(phone, 'set-workspace', { path: b });

    await call(phone, 'subscribe-list', { id: 'p', type: 'all-issues' });
    await call(pc, 'subscribe-list', { id: 'c', type: 'all-issues' });
    const snap = (/** @type {any} */ s, /** @type {string} */ id) =>
      s.sent.find((m) => m.type === 'snapshot' && m.payload.id === id);
    expect(
      snap(phone, 'p').payload.issues.map((/** @type {any} */ i) => i.id)
    ).toEqual([`${path.basename(b)}-1`]);
    expect(
      snap(pc, 'c').payload.issues.map((/** @type {any} */ i) => i.id)
    ).toEqual([`${path.basename(a)}-1`]);

    // A write in project B refreshes B only: upserts reach the phone, never the PC.
    phone.sent.length = 0;
    pc.sent.length = 0;
    version = 2;
    const mock = /** @type {import('vitest').Mock} */ (runBd);
    mock.mockClear();
    await call(phone, 'update-status', { id: 'beta-1', status: 'closed' });
    expect(mock.mock.calls[0][1].cwd).toBe(path.resolve(b));
    await new Promise((r) => setTimeout(r, 700));
    expect(phone.sent.some((m) => m.type === 'upsert')).toBe(true);
    expect(
      pc.sent.some(
        (/** @type {any} */ m) => m.type === 'upsert' || m.type === 'snapshot'
      )
    ).toBe(false);
    version = 1;
  });

  test('a project change refreshes only that project (watcher path)', async () => {
    const phone = makeSock();
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(phone, 'set-workspace', { path: b });
    await call(phone, 'subscribe-list', { id: 'p2', type: 'all-issues' });
    await call(pc, 'subscribe-list', { id: 'c2', type: 'all-issues' });
    phone.sent.length = 0;
    pc.sent.length = 0;
    version = 3;
    const db_a = (await call(pc, 'get-workspace', {})).payload.db_path;
    const { scheduleListRefresh } = await import('./ws.js');
    scheduleListRefresh(db_a);
    await new Promise((r) => setTimeout(r, 150));
    expect(pc.sent.some((m) => m.type === 'upsert')).toBe(true);
    expect(phone.sent.length).toBe(0);
    version = 1;
    expect(fetchListForSubscription).toHaveBeenCalled();
  });

  test('watcher is held while a socket is on the project, closed with the last', async () => {
    const solo = makeSock();
    const c = makeProject('gamma');
    // A real connection joins the default; emulate by moving onto gamma then away.
    await call(solo, 'set-workspace', { path: c });
    const db_c = (await call(solo, 'get-workspace', {})).payload.db_path;
    expect(watched).toContain(db_c);
    expect(released).not.toContain(db_c);
    await call(solo, 'set-workspace', { path: a });
    expect(released).toContain(db_c);
  });
});
