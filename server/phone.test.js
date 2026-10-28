import fs from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest';
import WebSocket from 'ws';
import { createApp } from './app.js';
import { runBd, runBdJson } from './bd.js';
import {
  getBoardToken,
  isAllowedHost,
  isAllowedOrigin,
  isValidToken
} from './guard.js';
import { fetchListForSubscription } from './list-adapters.js';
import {
  installPhoneSocket,
  isDeskIssue,
  redactFrame,
  redactIssue
} from './phone.js';
import { registerWorkspace } from './registry-watcher.js';
import { attachPhoneDoor, attachWsServer, handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn(),
  getGitUserName: vi.fn()
}));
vi.mock('./list-adapters.js', () => ({
  fetchListForSubscription: vi.fn(async () => ({ ok: true, items: [] }))
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const app_dir = path.resolve(here, '../app');
const HOST = 'abdelrahman.tail8a4e50.ts.net';
const OWNER = 'owner@example.com';
const DESK_TITLE = 'SECRET-DESK-TITLE rotate the prod key';

process.env.BDUI_OWNER_LOGIN = OWNER;

const desk_issue = {
  id: 'p-1',
  title: DESK_TITLE,
  title_ar: 'سري',
  description: 'SECRET-DESCRIPTION',
  design: 'SECRET-DESIGN',
  notes: 'SECRET-NOTES',
  status: 'owner_decision',
  priority: 1,
  issue_type: 'task',
  labels: ['secret'],
  created_by: 'cto',
  metadata: { card_title: 'قرار ينتظرك', card_q: 'SECRET-QUESTION' },
  dependencies: []
};
const sec_issue = { ...desk_issue, id: 'p-2', labels: [], created_by: 'sec' };
const plain_issue = {
  id: 'p-3',
  title: 'plain task',
  description: 'visible',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: [],
  created_by: 'cto',
  dependencies: [desk_issue]
};

describe('phone door: guard helpers', () => {
  test('tokens differ per door and do not cross', () => {
    expect(getBoardToken('phone')).not.toBe(getBoardToken('pc'));
    expect(isValidToken(getBoardToken('phone'), 'phone')).toBe(true);
    expect(isValidToken(getBoardToken('phone'), 'pc')).toBe(false);
    expect(isValidToken(getBoardToken('pc'), 'phone')).toBe(false);
  });

  test('phone host is the tailnet name only, origin must be https', () => {
    expect(isAllowedHost(HOST, 'phone')).toBe(true);
    expect(isAllowedHost('127.0.0.1:3001', 'phone')).toBe(false);
    expect(isAllowedHost('localhost', 'phone')).toBe(false);
    expect(isAllowedOrigin(`https://${HOST}`, HOST, 'phone')).toBe(true);
    expect(isAllowedOrigin(`http://${HOST}`, HOST, 'phone')).toBe(false);
    expect(isAllowedOrigin('https://evil.example', HOST, 'phone')).toBe(false);
  });

  test('desk rule: R18 labels, card_class, sec/legal creator or assignee', () => {
    expect(isDeskIssue({ labels: ['security'] })).toBe(true);
    expect(isDeskIssue({ labels: ['owner-pc-only'] })).toBe(true);
    expect(isDeskIssue({ labels: ['sec'] })).toBe(false); // exact names only
    expect(isDeskIssue({ metadata: { card_class: 'desk' } })).toBe(true);
    expect(isDeskIssue({ created_by: 'sec' })).toBe(true);
    expect(isDeskIssue({ assignee: 'legal' })).toBe(true);
    expect(isDeskIssue({ labels: [], created_by: 'cto' })).toBe(false);
    expect(isDeskIssue(null)).toBe(true);
  });
});

describe('phone door: redaction chokepoint (B4)', () => {
  const frame = (/** @type {any} */ o) => JSON.stringify(o);
  const leak = /SECRET|rotate the prod key|سري/;

  test('every outbound frame type keeps desk text out', () => {
    const clean = new Set(['r1']);
    const frames = [
      frame({
        id: 'e',
        ok: true,
        type: 'snapshot',
        payload: {
          id: 'c',
          revision: 1,
          issues: [desk_issue, sec_issue, plain_issue]
        }
      }),
      frame({
        id: 'e',
        ok: true,
        type: 'upsert',
        payload: { id: 'c', revision: 2, issue: desk_issue }
      }),
      frame({
        id: 'e',
        ok: true,
        type: 'upsert',
        payload: { id: 'c', revision: 3, issue: plain_issue }
      }),
      frame({
        id: 'e',
        ok: true,
        type: 'delete',
        payload: { id: 'c', revision: 4, issue_id: 'p-1' }
      }),
      frame({
        id: 'r1',
        ok: true,
        type: 'get-comments',
        payload: [{ text: 'fine' }]
      }),
      frame({
        id: 'r2',
        ok: true,
        type: 'get-comments',
        payload: [{ text: 'SECRET-COMMENT' }]
      }),
      frame({
        id: 'r3',
        ok: false,
        type: 'show',
        error: {
          code: 'bd_error',
          message: DESK_TITLE,
          details: { stderr: DESK_TITLE }
        }
      }),
      frame({
        id: 'r4',
        ok: true,
        type: 'workspace-changed',
        payload: { root_dir: 'C:/SECRET' }
      }),
      frame({
        id: 'r5',
        ok: true,
        type: 'delete-issue',
        payload: { id: 'p-1', note: 'SECRET' }
      }),
      frame({
        id: 'r6',
        ok: true,
        type: 'something-new',
        payload: { text: 'SECRET' }
      }),
      'not json SECRET'
    ];
    const out = frames
      .map((f) => redactFrame(f, clean))
      .filter((x) => x !== null);
    expect(out.join('\n')).not.toMatch(leak);
    // plain bead stays readable, comments pass only for the proven request id
    expect(out.join('\n')).toContain('plain task');
    expect(out.join('\n')).toContain('fine');
    // the pointer keeps only neutral fields
    const snap = JSON.parse(
      /** @type {string} */ (redactFrame(frames[0], clean))
    );
    const p = snap.payload.issues[0];
    expect(p.pointer).toBe(true);
    expect(p.title).toBe('قرار ينتظرك');
    expect(p.description).toBeUndefined();
    expect(p.design).toBeUndefined();
    expect(snap.payload.issues[1].pointer).toBe(true); // sec-created
    expect(snap.payload.issues[2].dependencies[0].pointer).toBe(true); // nested
  });

  test('a subscribed phone socket gets pointers, never desk text', async () => {
    const mock = /** @type {import('vitest').Mock} */ (
      fetchListForSubscription
    );
    mock.mockResolvedValueOnce({ ok: true, items: [desk_issue, plain_issue] });
    const sent = /** @type {string[]} */ ([]);
    const sock = {
      readyState: 1,
      OPEN: 1,
      send: (/** @type {string} */ m) => void sent.push(m)
    };
    installPhoneSocket(sock);
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 's1',
          type: 'subscribe-list',
          payload: { id: 'c1', type: 'all-issues' }
        })
      )
    );
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.join('\n')).not.toMatch(leak);
    expect(sent.join('\n')).toContain('plain task');
  });
});

describe('phone door: derived fields (B4)', () => {
  test('blocked_by_detail never carries a desk title', () => {
    const issue = {
      id: 'p-1',
      title: 'plain',
      labels: [],
      blocked_by_detail: [
        { id: 'd-1', assignee: '', status: 'open', title: 'SECRET-DESK-TITLE' },
        { id: 'd-2', assignee: 'legal', status: 'open', title: 'LEGAL-TITLE' }
      ]
    };
    const out = JSON.stringify(redactIssue(issue));
    expect(out).not.toMatch(/SECRET-DESK-TITLE|LEGAL-TITLE/);
    expect(out).toContain('d-1');
    expect(out).toContain('plain');
  });

  test('a snapshot frame with blocked_by_detail is scrubbed', () => {
    const raw = JSON.stringify({
      type: 'list-snapshot',
      payload: {
        issues: [
          {
            id: 'p-1',
            title: 'plain',
            labels: [],
            blocked_by_detail: [
              { id: 'd-1', status: 'open', title: 'SECRET-DESK-TITLE' }
            ]
          }
        ]
      }
    });
    const out = redactFrame(raw, new Set());
    expect(out === null || !out.includes('SECRET-DESK-TITLE')).toBe(true);
  });
});

describe('phone door: busy port', () => {
  test('attachPhoneDoor on a busy port does not throw', async () => {
    const blocker = createServer();
    await new Promise((r) => blocker.listen(0, '127.0.0.1', () => r(undefined)));
    const port = /** @type {any} */ (blocker.address()).port;
    const phone = createServer();
    attachPhoneDoor(phone, { path: '/ws', heartbeat_ms: 60000 });
    const err = await new Promise((resolve) => {
      phone.on('error', resolve);
      phone.listen(port, '127.0.0.1');
    });
    expect(/** @type {any} */ (err).code).toBe('EADDRINUSE');
    blocker.close();
  });
});

describe('phone door: servers', () => {
  /** @type {import('node:http').Server} */
  let phone;
  /** @type {import('node:http').Server} */
  let pc;
  let phone_port = 0;
  let pc_port = 0;
  let att_root = '';
  const cfg = () => ({
    host: '127.0.0.1',
    port: 0,
    app_dir,
    root_dir: process.cwd()
  });

  beforeAll(async () => {
    att_root = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-att-'));
    process.env.BDUI_ATTACH_ROOT = att_root;
    fs.mkdirSync(path.join(att_root, 'proj', '2026-10'), { recursive: true });
    fs.writeFileSync(
      path.join(att_root, 'proj', '2026-10', '0123456789abcdef.png'),
      'PNG'
    );
    fs.writeFileSync(
      path.join(att_root, 'proj', '2026-10', 'fedcba9876543210.png'),
      'PNG'
    );
    registerWorkspace({ path: path.join(att_root, 'proj'), database: 'x' });

    pc = createServer(createApp(cfg()));
    attachWsServer(pc, { path: '/ws', heartbeat_ms: 60000 });
    phone = createServer(createApp(cfg(), 'phone'));
    attachPhoneDoor(phone, { path: '/ws', heartbeat_ms: 60000 });
    for (const s of [pc, phone]) {
      await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
    }
    pc_port = /** @type {any} */ (pc.address()).port;
    phone_port = /** @type {any} */ (phone.address()).port;
  });

  afterAll(async () => {
    for (const s of [pc, phone]) {
      s.closeAllConnections?.();
      await new Promise((r) => s.close(() => r(undefined)));
    }
    fs.rmSync(att_root, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.mocked(runBd).mockReset();
    vi.mocked(runBdJson).mockReset();
  });

  /**
   * @param {number} port
   * @param {string} p
   * @param {Record<string, string>} headers
   * @param {string} [method]
   * @returns {Promise<{ status: number, body: string }>}
   */
  function http(port, p, headers, method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: p, method, headers },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode || 0, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }
  const good = (/** @type {Record<string, string>} */ extra = {}) => ({
    Host: HOST,
    'Tailscale-User-Login': OWNER,
    ...extra
  });

  test('HTTP: identity required, wrong or missing identity refused', async () => {
    expect((await http(phone_port, '/healthz', { Host: HOST })).status).toBe(
      403
    );
    expect(
      (
        await http(phone_port, '/healthz', {
          Host: HOST,
          'Tailscale-User-Login': 'other@example.com'
        })
      ).status
    ).toBe(403);
    expect((await http(phone_port, '/healthz', good())).status).toBe(200);
    // loopback Host is not the phone
    expect(
      (
        await http(phone_port, '/healthz', {
          Host: '127.0.0.1',
          'Tailscale-User-Login': OWNER
        })
      ).status
    ).toBe(403);
    // foreign Origin
    expect(
      (
        await http(
          phone_port,
          '/healthz',
          good({ Origin: 'https://evil.example' })
        )
      ).status
    ).toBe(403);
  });

  test('HTTP: phone page carries the phone token; CLI routes are not there', async () => {
    const page = await http(phone_port, '/', good());
    expect(page.status).toBe(200);
    expect(page.body).toContain(getBoardToken('phone'));
    expect(page.body).not.toContain(getBoardToken('pc'));
    // Regression (company-1bo5.6.6): the report sheet lists projects from this
    // route; refusing it made the phone show "No projects found".
    const ws = await http(phone_port, '/api/workspaces', good());
    expect(ws.status).toBe(200);
    expect(JSON.parse(ws.body).ok).toBe(true);
    expect(
      (await http(phone_port, '/api/workspaces', { Host: good().Host })).status
    ).toBe(403);
    expect(
      (await http(phone_port, '/api/register-workspace', good(), 'POST')).status
    ).toBe(404);
  });

  test('PC door unchanged: no identity header needed, pc token in page', async () => {
    expect(
      (await http(pc_port, '/healthz', { Host: '127.0.0.1' })).status
    ).toBe(200);
    const page = await http(pc_port, '/', { Host: '127.0.0.1' });
    expect(page.body).toContain(getBoardToken('pc'));
    expect(page.body).not.toContain(getBoardToken('phone'));
    expect(
      (await http(pc_port, '/api/workspaces', { Host: '127.0.0.1' })).status
    ).toBe(200);
  });

  /**
   * @param {Record<string, string>} headers
   * @param {string} token
   * @returns {Promise<'open' | number>}
   */
  function upgradeStatus(headers, token) {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${phone_port}/ws?t=${token}`, {
        headers
      });
      ws.on('open', () => {
        ws.close();
        resolve('open');
      });
      ws.on('unexpected-response', (_q, res) => {
        res.resume();
        resolve(res.statusCode || 0);
      });
      ws.on('error', () => {});
    });
  }
  const origin = { Origin: `https://${HOST}` };

  test('WS upgrade: identity, host, origin, own token all required', async () => {
    const t = getBoardToken('phone');
    expect(await upgradeStatus(good(origin), t)).toBe('open');
    expect(await upgradeStatus({ Host: HOST, ...origin }, t)).toBe(403); // no identity
    expect(
      await upgradeStatus(
        { ...good(origin), 'Tailscale-User-Login': 'other@example.com' },
        t
      )
    ).toBe(403);
    expect(await upgradeStatus(good(origin), getBoardToken('pc'))).toBe(403); // pc token
    expect(await upgradeStatus(good(), t)).toBe(403); // no origin
    expect(await upgradeStatus(good({ Origin: `http://${HOST}` }), t)).toBe(
      403
    );
    expect(await upgradeStatus({ ...good(origin), Host: '127.0.0.1' }, t)).toBe(
      403
    );
  });

  /**
   * Open a phone socket, send one request, return the reply.
   *
   * @param {{ type: string, payload?: any }} msg
   */
  function ask(msg) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${phone_port}/ws?t=${getBoardToken('phone')}`,
        { headers: good(origin) }
      );
      ws.on('open', () => ws.send(JSON.stringify({ id: 'q1', ...msg })));
      ws.on('message', (d) => {
        ws.close();
        resolve(JSON.parse(String(d)));
      });
      ws.on('error', reject);
    });
  }

  test('WS: delete, label-remove, set-workspace, edits refused on the phone door', async () => {
    for (const type of [
      'delete-issue',
      'label-remove',
      'set-workspace',
      'update-status',
      'edit-text',
      'label-add',
      'dep-add',
      'update-type'
    ]) {
      const r = /** @type {any} */ (
        await ask({
          type,
          payload: { id: 'p-1', label: 'security', path: '/x' }
        })
      );
      expect(r.ok, type).toBe(false);
      expect(r.error.code, type).toBe('forbidden');
    }
    expect(vi.mocked(runBd)).not.toHaveBeenCalled();
  });

  test('WS: comment on a desk bead is refused, an unreadable bead fails closed', async () => {
    vi.mocked(runBdJson).mockResolvedValue({
      code: 0,

      stderr: '',
      stdoutJson: [desk_issue]
    });
    const a = /** @type {any} */ (
      await ask({ type: 'get-comments', payload: { id: 'p-1' } })
    );
    expect(a.error.code).toBe('pc_only');
    const b = /** @type {any} */ (
      await ask({ type: 'add-comment', payload: { id: 'p-1', text: 'hi' } })
    );
    expect(b.error.code).toBe('pc_only');
    vi.mocked(runBdJson).mockResolvedValue({
      code: 1,

      stderr: DESK_TITLE,
      stdoutJson: null
    });
    const c = /** @type {any} */ (
      await ask({ type: 'get-comments', payload: { id: 'p-9' } })
    );
    expect(c.error.code).toBe('pc_only');
    expect(JSON.stringify(c)).not.toContain('rotate');
    expect(vi.mocked(runBd)).not.toHaveBeenCalled();
  });

  test('WS: comments on a non-desk bead pass', async () => {
    vi.mocked(runBdJson).mockImplementation(async (args) =>
      args[0] === 'show'
        ? { code: 0, stdoutJson: [plain_issue] }
        : {
            code: 0,

            stderr: '',
            stdoutJson: [{ id: 1, text: 'hello' }]
          }
    );
    const r = /** @type {any} */ (
      await ask({ type: 'get-comments', payload: { id: 'p-3' } })
    );
    expect(r.ok).toBe(true);
    expect(r.payload[0].text).toBe('hello');
  });

  test('/att: served only when the owning bead is known and not desk', async () => {
    const owned = (/** @type {any} */ labels) =>
      vi.mocked(runBdJson).mockResolvedValue({
        code: 0,

        stderr: '',
        stdoutJson: [
          {
            id: 'proj-1',
            labels,
            created_by: 'cto',
            metadata: { attachments: ['proj/2026-10/0123456789abcdef.png'] }
          }
        ]
      });
    owned([]);
    expect(
      (await http(phone_port, '/att/proj/2026-10/0123456789abcdef.png', good()))
        .status
    ).toBe(200);
    owned(['publish']);
    expect(
      (await http(phone_port, '/att/proj/2026-10/0123456789abcdef.png', good()))
        .status
    ).toBe(404);
    owned([]);
    // image with no owning bead: refused on the phone, served on the PC
    expect(
      (await http(phone_port, '/att/proj/2026-10/fedcba9876543210.png', good()))
        .status
    ).toBe(404);
    expect(
      (
        await http(pc_port, '/att/proj/2026-10/fedcba9876543210.png', {
          Host: '127.0.0.1'
        })
      ).status
    ).toBe(200);
  });

  test('/api/report: pc token does not open the phone door', async () => {
    const r = await http(
      phone_port,
      '/api/report',
      good({
        Origin: `https://${HOST}`,
        'X-Bdui-Report': '1',
        'X-Board-Token': getBoardToken('pc')
      }),
      'POST'
    );
    expect(r.status).toBe(403);
    expect(r.body).toContain('forbidden');
  });
});
