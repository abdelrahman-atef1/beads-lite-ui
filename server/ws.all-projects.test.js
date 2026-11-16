import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { validateSubscribeListPayload } from './validators.js';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';

// beads-lite-1bo5.13.8.1: params.scope = 'all' lists every registered project
// in one subscription. Only `bd` and the registry are mocked.

/** @type {string[]} */
const ROOTS = [];
/** Projects that start failing mid-test. @type {Set<string>} */
const BROKEN = new Set();
/** Title served per project; bumped to simulate a change. @type {Record<string, string>} */
const titles = {};

vi.mock('./bd.js', () => ({
  runBd: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
  runBdJson: vi.fn(
    async (/** @type {string[]} */ args, /** @type {any} */ o) => {
      const name = path.basename(String(o?.cwd || ''));
      if (name.includes('bad') || BROKEN.has(name)) {
        return { code: 1, stderr: 'database is locked' };
      }
      if (args[0] === 'list' && args.includes('closed')) {
        return {
          code: 0,
          stdoutJson: [1, 2].map((n) => ({
            id: `${name}-c${n}`,
            title: 'done',
            status: 'closed',
            updated_at: '2026-01-01T00:00:00Z',
            closed_at: `2026-01-0${n}T00:00:00Z`
          }))
        };
      }
      if (args[0] === 'list') {
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bdui-all-${name}-`));
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

const snap = (/** @type {any} */ s, /** @type {string} */ id) =>
  s.sent.find((m) => m.type === 'snapshot' && m.payload.id === id);

describe('All projects list (scope all)', () => {
  /** @type {string} */
  let a;
  /** @type {string} */
  let b;
  /** @type {string} */
  let bad;
  /** @type {ReturnType<typeof attachWsServer>} */
  let srv;

  beforeAll(() => {
    a = makeProject('pa');
    b = makeProject('pb');
    bad = makeProject('bad');
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

  test('validator keeps scope only on list types that support it', () => {
    const ok = (/** @type {any} */ p) => validateSubscribeListPayload(p);
    expect(
      ok({ id: 'x', type: 'all-issues', params: { scope: 'all' } })
    ).toMatchObject({ ok: true, spec: { params: { scope: 'all' } } });
    expect(
      ok({ id: 'x', type: 'closed-issues', params: { scope: 'all' } })
    ).toMatchObject({ ok: true, spec: { params: { scope: 'all' } } });
    expect(
      ok({ id: 'x', type: 'in-progress-issues', params: { scope: 'all' } }).ok
    ).toBe(false);
    expect(ok({ id: 'x', type: 'all-issues' })).toMatchObject({
      ok: true,
      spec: { params: undefined }
    });
  });

  test('one list holds every readable project, an unreadable one is skipped with a note', async () => {
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (pc));
    const r = await call(pc, 'subscribe-list', {
      id: 'all',
      type: 'all-issues',
      params: { scope: 'all' }
    });
    expect(r.ok).toBe(true);
    expect(r.payload.skipped).toEqual([path.basename(bad)]);
    const ids = snap(pc, 'all')
      .payload.issues.map((/** @type {any} */ i) => i.id)
      .sort();
    expect(ids).toEqual([`${path.basename(a)}-1`, `${path.basename(b)}-1`]);

    // Without scope the list is still this project only.
    await call(pc, 'subscribe-list', { id: 'one', type: 'all-issues' });
    expect(snap(pc, 'one').payload.issues).toHaveLength(1);
  });

  test('closed list of All is merged newest first', async () => {
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(pc, 'subscribe-list', {
      id: 'cl',
      type: 'closed-issues',
      params: { scope: 'all' }
    });
    const ids = snap(pc, 'cl').payload.issues.map((/** @type {any} */ i) =>
      i.id.split('-').pop()
    );
    expect(ids).toEqual(['c2', 'c2', 'c1', 'c1']);
  });

  test('a project that becomes unreadable later is named in a pushed snapshot', async () => {
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(pc, 'subscribe-list', {
      id: 'late',
      type: 'all-issues',
      params: { scope: 'all' }
    });
    const phone = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    await call(phone, 'set-workspace', { path: b });
    const db_b = (await call(phone, 'get-workspace', {})).payload.db_path;
    BROKEN.add(path.basename(b));
    pc.sent.length = 0;
    scheduleListRefresh(db_b);
    await new Promise((res) => setTimeout(res, 400));
    const push = pc.sent.find((m) => m.type === 'snapshot');
    expect(push?.payload.skipped).toContain(path.basename(b));
    // and when it is readable again the note clears (empty list, full snapshot)
    BROKEN.delete(path.basename(b));
    pc.sent.length = 0;
    scheduleListRefresh(db_b);
    await new Promise((res) => setTimeout(res, 400));
    const back = pc.sent.find((m) => m.type === 'snapshot');
    expect(back?.payload.skipped).toEqual([path.basename(bad)]);
  });

  test('a change in another project reaches an All subscriber live', async () => {
    const pc = makeSock();
    srv.wss.clients.add(/** @type {any} */ (pc));
    await call(pc, 'subscribe-list', {
      id: 'live',
      type: 'all-issues',
      params: { scope: 'all' }
    });
    // a second socket is on project B (its watcher would call scheduleListRefresh)
    const phone = makeSock();
    srv.wss.clients.add(/** @type {any} */ (phone));
    await call(phone, 'set-workspace', { path: b });
    const db_b = (await call(phone, 'get-workspace', {})).payload.db_path;
    titles[path.basename(b)] = 'v2';
    pc.sent.length = 0;
    scheduleListRefresh(db_b);
    await new Promise((res) => setTimeout(res, 400));
    const up = pc.sent.find((m) => m.type === 'upsert');
    expect(up?.payload.issue.title).toBe('v2');
  });
});
