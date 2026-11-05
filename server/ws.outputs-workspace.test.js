import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { attachWsServer, handleMessage } from './ws.js';

// beads-lite-1bo5.6.51: the server was started in project A; a socket that
// selected project B must get B's beads from the outputs handlers.

/** @type {string[]} */
const ROOTS = [];

// `bd export` answers with a bead named after the folder it runs in
vi.mock('./bd.js', () => ({
  runBd: vi.fn(async (/** @type {string[]} */ _a, /** @type {any} */ o) => {
    const name = path.basename(String(o?.cwd || ''));
    return {
      code: 0,
      stdout:
        JSON.stringify({
          _type: 'issue',
          id: `${name}-1`,
          title: `bead of ${name}`,
          status: 'open',
          updated_at: '2026-11-05T10:00:00Z',
          comments: []
        }) + '\n',
      stderr: ''
    };
  }),
  runBdJson: vi.fn(async () => ({ code: 0, stdoutJson: [] })),
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `bdui-out-${name}-`));
  fs.mkdirSync(path.join(root, '.beads'));
  fs.writeFileSync(path.join(root, '.beads', 'x.db'), '');
  ROOTS.push(root);
  return root;
}

let n = 0;
/** @param {any} sock @param {string} type @param {unknown} payload */
async function call(sock, type, payload) {
  const id = `r${++n}`;
  await handleMessage(sock, Buffer.from(JSON.stringify({ id, type, payload })));
  return sock.sent.find((/** @type {any} */ m) => m.id === id);
}

describe('outputs handlers follow the socket workspace', () => {
  /** @type {string} */
  let a;
  /** @type {string} */
  let b;
  /** @type {ReturnType<typeof attachWsServer>} */
  let srv;

  beforeAll(() => {
    a = makeProject('start');
    b = makeProject('other');
    srv = attachWsServer(createServer(), {
      path: '/ws',
      heartbeat_ms: 100000,
      root_dir: a,
      watch_project: () => () => {}
    });
  });

  afterAll(() => {
    srv.wss.close();
    for (const r of ROOTS) fs.rmSync(r, { recursive: true, force: true });
  });

  test('outputs-project and outputs-get read the selected project, not the start folder', async () => {
    const sock = {
      sent: /** @type {any[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} m */
      send(m) {
        this.sent.push(JSON.parse(String(m)));
      }
    };
    srv.wss.clients.add(/** @type {any} */ (sock));
    const before = await call(sock, 'outputs-project', {});
    expect(before.payload.beads.map((/** @type {any} */ x) => x.title)).toEqual(
      [`bead of ${path.basename(a)}`]
    );
    await call(sock, 'set-workspace', { path: b });
    const after = await call(sock, 'outputs-project', {});
    expect(after.ok).toBe(true);
    expect(after.payload.beads.map((/** @type {any} */ x) => x.title)).toEqual([
      `bead of ${path.basename(b)}`
    ]);
    const one = await call(sock, 'outputs-get', {
      id: `${path.basename(b)}-1`
    });
    expect(one.ok).toBe(true);
  });
});
