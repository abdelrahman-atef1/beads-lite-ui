import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchListForSubscription } from './list-adapters.js';
import { registerWorkspace } from './registry-watcher.js';
import { registry } from './subscriptions.js';
import { watchDb } from './watcher.js';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn(),
  getGitUserName: vi.fn()
}));
vi.mock('./list-adapters.js', () => ({ fetchListForSubscription: vi.fn() }));

/** Comment adds made "from a shell": bd bumps comment_count, not updated_at. */
let comment_count = 0;
/** @type {string} */
let dir = '';

beforeEach(() => {
  registry.clear();
  comment_count = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-outside-'));
  vi.mocked(fetchListForSubscription).mockImplementation(async () => ({
    ok: true,
    items: [{ id: 'T-1', updated_at: 1, closed_at: null, comment_count }]
  }));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** @param {() => boolean} cond */
async function waitFor(cond, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

describe('comment added from outside while a bead is open', () => {
  test('reaches the open detail within seconds, even right after another change', async () => {
    const db_file = path.join(dir, 'x.db');
    fs.writeFileSync(db_file, '0');
    registerWorkspace({ path: dir, database: db_file });
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} m */
      send(m) {
        this.sent.push(String(m));
      }
    };
    const { wss } = attachWsServer(createServer(), {
      path: '/ws',
      heartbeat_ms: 10000
    });
    wss.clients.add(/** @type {any} */ (sock));
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'ws1',
          type: 'set-workspace',
          payload: { path: dir }
        })
      )
    );
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'sub1',
          type: 'subscribe-list',
          payload: {
            id: 'detail:T-1',
            type: 'issue-detail',
            params: { id: 'T-1' }
          }
        })
      )
    );
    const counts = () =>
      sock.sent
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'snapshot' || m.type === 'upsert')
        .map((m) => (m.payload.issue || m.payload.issues[0]).comment_count);
    expect(counts().at(-1)).toBe(0);

    // The key the server files this connection's project under.
    const ws_db = JSON.parse(sock.sent[0]).payload.workspace.db_path;
    const w = watchDb(dir, () => scheduleListRefresh(ws_db), {
      explicit_db: db_file
    });
    try {
      // First outside write, then a second one inside the watcher's cooldown.
      comment_count = 1;
      fs.writeFileSync(db_file, '1');
      expect(await waitFor(() => counts().at(-1) === 1, 3000)).toBe(true);
      comment_count = 2;
      fs.writeFileSync(db_file, '2');
      expect(await waitFor(() => counts().at(-1) === 2, 4000)).toBe(true);
    } finally {
      w.close();
    }
  });
});
