/**
 * @import { Server } from 'node:http'
 * @import { RawData, WebSocket } from 'ws'
 * @import { MessageType } from '../app/protocol.js'
 */
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  SETTABLE_STATUSES,
  isRequest,
  isSettableStatus,
  makeError,
  makeOk
} from '../app/protocol.js';
import { getGitUserName, runBd, runBdJson } from './bd.js';
import { boardData } from './board-data.js';
import { resolveWorkspaceDatabase } from './db.js';
import { getHandler, isFeatureMutating } from './features/index.js';
import { WS_DEFLATE } from './features/perf.js';
import { BOARD_TASK_ARGS, afterBoardTask } from './features/report.js';
import { MUTATING_TYPES, checkUpgrade } from './guard.js';
import { fetchListForSubscription } from './list-adapters.js';
import { debug } from './logging.js';
import { allMovedIds, resolveMovedId } from './moved-alias.js';
import { installPhoneSocket } from './phone.js';
import { getAvailableWorkspaces } from './registry-watcher.js';
import { SubscriptionRegistry, keyOf, registry } from './subscriptions.js';
import { validateSubscribeListPayload } from './validators.js';
import {
  ctxFor,
  getDefaultWorkspace,
  setCtx,
  setDefaultWorkspace
} from './workspace-context.js';
import { withCounts } from './workspace-counts.js';
import { withPrefixes } from './workspace-prefix.js';

const log = debug('ws');

/**
 * Same folder, ignoring case and slash style (Windows).
 * @param {string} a
 * @param {string} b
 */
function samePath(a, b) {
  const n = (/** @type {string} */ p) =>
    path.resolve(p).split(path.sep).join('/').replace(/\/+$/, '').toLowerCase();
  return n(a) === n(b);
}

/**
 * @typedef {{ id: string, updated_at: number, closed_at: number | null } & Record<string, unknown>} SubscriptionIssue
 * @typedef {Awaited<ReturnType<typeof fetchListForSubscription>>} FetchListResult
 */

/**
 * Short-lived caches for issue detail snapshots and comments. Entries only
 * live between database change events.
 */
/** @type {Map<string, { items: SubscriptionIssue[] }>} */
const ISSUE_DETAIL_CACHE = new Map();
/** @type {Map<string, unknown[]>} */
const COMMENTS_CACHE = new Map();
const DETAIL_CACHE_LIMIT = 500;
let DETAIL_CACHE_GENERATION = 0;

/**
 * Debounced refresh scheduling for active list subscriptions.
 * A trailing window coalesces rapid change bursts into a single refresh run.
 */
/** @type {ReturnType<typeof setTimeout> | null} */
let REFRESH_TIMER = null;
let REFRESH_DEBOUNCE_MS = 75;

/**
 * Mutation refresh window gate. When active, watcher-driven list refresh
 * scheduling is suppressed. The gate resolves either when a watcher event
 * arrives (via scheduleListRefresh) or when a timeout elapses, at which
 * point a single refresh pass over all active list subscriptions is run.
 */
/**
 * @typedef {Object} MutationGate
 * @property {boolean} resolved
 * @property {(reason: 'watcher'|'timeout') => void} resolve
 * @property {ReturnType<typeof setTimeout>} timer
 */
/** @type {(MutationGate & { dbs: Set<string> }) | null} */
let MUTATION_GATE = null;

/**
 * Start a mutation window gate if not already active. The gate resolves on the
 * next watcher event or after `timeout_ms`, then triggers a single refresh run
 * across all active list subscriptions. Watcher-driven refresh scheduling is
 * suppressed during the window.
 *
 * Fire-and-forget; callers should not await this.
 *
 * @param {number} [timeout_ms]
 */
function triggerMutationRefreshOnce(timeout_ms = 500, db_path = '') {
  clearDetailCaches();
  if (MUTATION_GATE) {
    if (db_path) MUTATION_GATE.dbs.add(db_path);
    return;
  }
  /** @type {(r: 'watcher'|'timeout') => void} */
  let doResolve = () => {};
  const p = new Promise((resolve) => {
    doResolve = resolve;
  });
  MUTATION_GATE = {
    dbs: new Set(db_path ? [db_path] : []),
    resolved: false,
    resolve: (reason) => {
      if (!MUTATION_GATE || MUTATION_GATE.resolved) {
        return;
      }
      MUTATION_GATE.resolved = true;
      try {
        doResolve(reason);
      } catch {
        // ignore resolve errors
      }
    },
    timer: setTimeout(() => {
      try {
        MUTATION_GATE?.resolve('timeout');
      } catch {
        // ignore
      }
    }, timeout_ms)
  };
  MUTATION_GATE.timer.unref?.();

  // After resolution, run a single refresh across active subs and clear gate
  const gate_dbs = MUTATION_GATE.dbs;
  void p.then(async () => {
    log('mutation window resolved → refresh active subs');
    try {
      await refreshAllActiveListSubscriptions(
        gate_dbs.size > 0 ? gate_dbs : null
      );
    } catch {
      // ignore refresh errors
    } finally {
      try {
        if (MUTATION_GATE?.timer) {
          clearTimeout(MUTATION_GATE.timer);
        }
      } catch {
        // ignore
      }
      MUTATION_GATE = null;
    }
  });
}

/**
 * Collect unique active list subscriptions across all connected clients, one
 * per (project, spec). Optionally only for the given projects (db paths).
 *
 * @param {Set<string> | null} [only_dbs]
 * @returns {Array<{ spec: { type: string, params?: Record<string,string|number|boolean> }, ctx: { root_dir: string, db_path: string } }>}
 */
function collectActiveListSpecs(only_dbs = null) {
  /** @type {Array<{ spec: { type: string, params?: Record<string,string|number|boolean> }, ctx: { root_dir: string, db_path: string } }>} */
  const specs = [];
  /** @type {Set<string>} */
  const seen = new Set();
  if (!CURRENT_WSS) {
    return specs;
  }
  for (const ws of allClients()) {
    if (ws.readyState !== ws.OPEN) {
      continue;
    }
    const ctx = ctxFor(ws);
    if (!ctx || (only_dbs && !only_dbs.has(ctx.db_path))) {
      continue;
    }
    const s = ensureSubs(/** @type {any} */ (ws));
    if (!s.list_subs) {
      continue;
    }
    for (const { key, spec } of s.list_subs.values()) {
      const scoped = ctx.db_path + '\0' + key;
      if (!seen.has(scoped)) {
        seen.add(scoped);
        specs.push({ spec, ctx });
      }
    }
  }
  return specs;
}

/** Projects (db paths) with a refresh waiting; PENDING_ALL means every project. */
const PENDING_DBS = new Set();
let PENDING_ALL = false;

/**
 * Run refresh for active list subscriptions and publish deltas. With `dbs`
 * only those projects are refreshed (a change in X never touches Y).
 *
 * @param {Set<string> | null} [dbs]
 */
async function refreshAllActiveListSubscriptions(dbs = null) {
  if (dbs) {
    for (const d of dbs) PENDING_DBS.add(d);
  } else {
    PENDING_ALL = true;
  }
  // At most one refresh in flight; a change during one schedules exactly one
  // more (contract board-data.md).
  if (REFRESH_RUNNING) {
    return REFRESH_RUNNING;
  }
  REFRESH_RUNNING = (async () => {
    try {
      while (PENDING_ALL || PENDING_DBS.size > 0) {
        const filter = PENDING_ALL ? null : new Set(PENDING_DBS);
        PENDING_ALL = false;
        PENDING_DBS.clear();
        await refreshAllOnce(filter);
      }
    } finally {
      REFRESH_RUNNING = null;
    }
  })();
  return REFRESH_RUNNING;
}

/** @type {Promise<void> | null} */
let REFRESH_RUNNING = null;

/** @param {Set<string> | null} filter */
async function refreshAllOnce(filter) {
  clearDetailCaches();
  const specs = collectActiveListSpecs(filter);
  // Run refreshes concurrently; locking is handled per key in the registry
  await Promise.all(
    specs.map(async ({ spec, ctx }) => {
      try {
        await refreshAndPublish(spec, ctx);
      } catch {
        // ignore refresh errors per spec
      }
    })
  );
}

// A page load answered from a stale board snapshot is corrected as soon as the
// background reload finishes: publish the fresh items to every subscriber.
// No cache clearing here, or the fresh snapshot would be thrown away.
boardData.onRevalidated = () => {
  for (const { spec, ctx } of collectActiveListSpecs()) {
    void refreshAndPublish(spec, ctx).catch(() => undefined);
  }
};

/** Projects waiting on the debounce timer. */
const SCHEDULED_DBS = new Set();
let SCHEDULED_ALL = false;

/**
 * Schedule a coalesced refresh of active list subscriptions: of one project
 * (`db_path`, from its watcher) or, without it, of all.
 *
 * @param {string} [db_path]
 */
export function scheduleListRefresh(db_path) {
  // Suppress watcher-driven refreshes during an active mutation gate; resolve
  // gate once. A change in a project the gate is not about is not suppressed.
  if (MUTATION_GATE && (!db_path || MUTATION_GATE.dbs.has(db_path))) {
    try {
      MUTATION_GATE.resolve('watcher');
    } catch {
      // ignore
    }
    return;
  }
  if (db_path) {
    SCHEDULED_DBS.add(db_path);
  } else {
    SCHEDULED_ALL = true;
  }
  if (REFRESH_TIMER) {
    clearTimeout(REFRESH_TIMER);
  }
  REFRESH_TIMER = setTimeout(() => {
    REFRESH_TIMER = null;
    const dbs = SCHEDULED_ALL ? null : new Set(SCHEDULED_DBS);
    SCHEDULED_ALL = false;
    SCHEDULED_DBS.clear();
    // Fire and forget; callers don't await scheduling
    void refreshAllActiveListSubscriptions(dbs);
  }, REFRESH_DEBOUNCE_MS);
  REFRESH_TIMER.unref?.();
}

/**
 * @typedef {{
 *   show_id?: string | null,
 *   list_subs?: Map<string, { key: string, spec: { type: string, params?: Record<string, string | number | boolean> } }>,
 *   list_revisions?: Map<string, number>
 * }} ConnectionSubs
 */

/** @type {WeakMap<WebSocket, any>} */
const SUBS = new WeakMap();

/** Biggest inbound frame accepted on either door (the ws default is 100 MiB). */
const MAX_WS_PAYLOAD = 1024 * 1024;

/** @type {WebSocketServer | null} */
let CURRENT_WSS = null;
/** Phone-door socket servers (second listener, ADR 0001 section 2). @type {Set<WebSocketServer>} */
const PHONE_WSS = new Set();

/** @returns {Iterable<WebSocket>} every open client of both doors */
function allClients() {
  /** @type {WebSocket[]} */
  const out = [];
  for (const w of [CURRENT_WSS, ...PHONE_WSS]) {
    if (w) out.push(...w.clients);
  }
  return out;
}

/**
 * One subscription registry per project (db path), so two projects never share
 * entries or deltas. The server-default project uses the exported singleton.
 *
 * @type {Map<string, SubscriptionRegistry>}
 */
let REGISTRIES = new Map();

/**
 * @param {{ db_path: string } | null} ctx
 * @returns {SubscriptionRegistry}
 */
function registryFor(ctx) {
  const db = ctx?.db_path || '';
  let r = REGISTRIES.get(db);
  if (!r) {
    r =
      db === getDefaultWorkspace()?.db_path
        ? registry
        : new SubscriptionRegistry();
    REGISTRIES.set(db, r);
  }
  return r;
}

/**
 * Sockets per project and the watcher release callbacks. A project's fs
 * watcher exists only while a socket is on it (zero idle cost).
 *
 * @type {Map<string, Set<WebSocket>>}
 */
const PROJECT_SOCKETS = new Map();
/** @type {Map<string, () => void>} */
const PROJECT_RELEASE = new Map();
/** Set by attachWsServer; starts a watcher for one project, returns its closer. @type {((root_dir: string, db_path: string) => () => void) | null} */
let WATCH_PROJECT = null;

/**
 * Put a socket on a project (leaving its previous one).
 *
 * @param {WebSocket} ws
 * @param {{ root_dir: string, db_path: string }} ctx
 */
function joinProject(ws, ctx) {
  leaveProject(ws);
  setCtx(ws, ctx);
  let set = PROJECT_SOCKETS.get(ctx.db_path);
  if (!set) {
    set = new Set();
    PROJECT_SOCKETS.set(ctx.db_path, set);
  }
  set.add(ws);
  if (WATCH_PROJECT && !PROJECT_RELEASE.has(ctx.db_path)) {
    PROJECT_RELEASE.set(ctx.db_path, WATCH_PROJECT(ctx.root_dir, ctx.db_path));
    boardData.watch(ctx.root_dir);
  }
}

/**
 * Drop a socket from its project: its subscriptions, and the project's
 * registry and watcher when it was the last one.
 *
 * @param {WebSocket} ws
 */
function leaveProject(ws) {
  const ctx = ctxFor(ws);
  if (!ctx) return;
  const db = ctx.db_path;
  const reg = REGISTRIES.get(db);
  try {
    reg?.onDisconnect(ws);
  } catch {
    // ignore cleanup errors
  }
  const set = PROJECT_SOCKETS.get(db);
  if (!set || !set.delete(ws) || set.size > 0) return;
  PROJECT_SOCKETS.delete(db);
  if (reg && reg !== registry) REGISTRIES.delete(db);
  const release = PROJECT_RELEASE.get(db);
  if (release) {
    PROJECT_RELEASE.delete(db);
    try {
      release();
    } catch {
      // ignore
    }
    boardData.unwatch(ctx.root_dir);
  }
}

/** Set by attachWsServer; lets feature handlers broadcast. @type {((type: string, payload?: unknown) => void) | null} */
let FEATURE_BROADCAST = null;

/**
 * Clear issue-detail and comments caches whenever the database may have
 * changed. Incrementing the generation prevents stale in-flight reads from
 * repopulating either cache.
 */
function clearDetailCaches() {
  ISSUE_DETAIL_CACHE.clear();
  COMMENTS_CACHE.clear();
  DETAIL_CACHE_GENERATION += 1;
  boardData.invalidate();
}

/**
 * @param {string} issue_id
 * @param {{ root_dir: string, db_path: string } | null} ctx
 */
function issueDetailCacheKey(issue_id, ctx) {
  const root_dir = ctx?.root_dir || '';
  const db_path = ctx?.db_path || '';
  return `${root_dir}\0${db_path}\0${issue_id}`;
}

/**
 * @template T
 * @param {Map<string, T>} cache
 * @param {number} limit
 */
function evictOldestCacheEntry(cache, limit) {
  if (cache.size <= limit) {
    return;
  }
  const oldest_key = cache.keys().next().value;
  if (oldest_key !== undefined) {
    cache.delete(oldest_key);
  }
}

/**
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {SubscriptionIssue[]} items
 * @param {number} generation
 * @param {{ root_dir: string, db_path: string } | null} ctx
 */
function populateIssueDetailCache(spec, items, generation, ctx) {
  if (generation !== DETAIL_CACHE_GENERATION) {
    return;
  }
  const issue_id = String(spec.params?.id || '').trim();
  if (issue_id.length === 0) {
    return;
  }
  ISSUE_DETAIL_CACHE.set(issueDetailCacheKey(issue_id, ctx), {
    items: items.slice()
  });
  evictOldestCacheEntry(ISSUE_DETAIL_CACHE, DETAIL_CACHE_LIMIT);
}

/**
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {{ root_dir: string, db_path: string } | null} ctx
 * @returns {Promise<FetchListResult>}
 */
async function fetchCachedIssueDetail(spec, ctx) {
  const issue_id = String(spec.params?.id || '').trim();
  if (issue_id.length === 0) {
    return fetchListForSubscription(spec, {
      cwd: ctx?.root_dir
    });
  }
  const cached = ISSUE_DETAIL_CACHE.get(issueDetailCacheKey(issue_id, ctx));
  if (cached) {
    return { ok: true, items: cached.items.slice() };
  }
  const generation = DETAIL_CACHE_GENERATION;
  const result = await fetchListForSubscription(spec, {
    cwd: ctx?.root_dir
  });
  if (result.ok) {
    populateIssueDetailCache(spec, result.items, generation, ctx);
  }
  return result;
}

/**
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {{ root_dir: string, db_path: string } | null} ctx
 * @returns {Promise<FetchListResult>}
 */
function fetchInitialListForSubscription(spec, ctx) {
  if (String(spec.type) === 'issue-detail') {
    return fetchCachedIssueDetail(spec, ctx);
  }
  return fetchListForSubscription(spec, {
    cwd: ctx?.root_dir,
    allow_stale: true
  });
}

/**
 * Get or initialize the subscription state for a socket.
 *
 * @param {WebSocket} ws
 * @returns {any}
 */
function ensureSubs(ws) {
  let s = SUBS.get(ws);
  if (!s) {
    s = {
      show_id: null,
      list_subs: new Map(),
      list_revisions: new Map()
    };
    SUBS.set(ws, s);
  }
  return s;
}

/**
 * Get next monotonically increasing revision for a subscription key on this connection.
 *
 * @param {WebSocket} ws
 * @param {string} key
 */
/**
 * @param {WebSocket} ws
 * @param {string} key
 */
function nextListRevision(ws, key) {
  const s = ensureSubs(ws);
  const m = s.list_revisions || new Map();
  s.list_revisions = m;
  const prev = m.get(key) || 0;
  const next = prev + 1;
  m.set(key, next);
  return next;
}

/**
 * Emit per-subscription envelopes to a specific client id on a socket.
 * Helpers for snapshot / upsert / delete.
 */
/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {Array<Record<string, unknown>>} issues
 */
function emitSubscriptionSnapshot(ws, client_id, key, issues) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: /** @type {const} */ ('snapshot'),
    id: client_id,
    revision,
    issues
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('snapshot'),
    payload
  });
  try {
    ws.send(msg);
  } catch (err) {
    log('emit snapshot send failed key=%s id=%s: %o', key, client_id, err);
  }
}

/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {Record<string, unknown>} issue
 */
function emitSubscriptionUpsert(ws, client_id, key, issue) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: 'upsert',
    id: client_id,
    revision,
    issue
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('upsert'),
    payload
  });
  try {
    ws.send(msg);
  } catch (err) {
    log('emit upsert send failed key=%s id=%s: %o', key, client_id, err);
  }
}

/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {string} issue_id
 */
function emitSubscriptionDelete(ws, client_id, key, issue_id) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: 'delete',
    id: client_id,
    revision,
    issue_id
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('delete'),
    payload
  });
  try {
    ws.send(msg);
  } catch (err) {
    log('emit delete send failed key=%s id=%s: %o', key, client_id, err);
  }
}

// issues-changed removed in v2: detail and lists are pushed via subscriptions

/**
 * Refresh a subscription spec: fetch via adapter, apply to registry and emit
 * per-subscription full-issue envelopes to subscribers. Serialized per key.
 *
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {{ root_dir: string, db_path: string }} ctx the project to refresh
 */
async function refreshAndPublish(spec, ctx) {
  const key = keyOf(spec);
  const reg = registryFor(ctx);
  await reg.withKeyLock(key, async () => {
    const is_detail = String(spec.type) === 'issue-detail';
    const detail_cache_generation = DETAIL_CACHE_GENERATION;
    const res = await fetchListForSubscription(spec, {
      cwd: ctx?.root_dir,
      priority: is_detail ? 'interactive' : 'background'
    });
    if (!res.ok) {
      log('refresh failed for %s: %s %o', key, res.error.message, res.error);
      return;
    }
    const items = applyClosedIssuesFilter(spec, res.items);
    if (is_detail) {
      populateIssueDetailCache(spec, items, detail_cache_generation, ctx);
    }
    const prev_size = reg.get(key)?.itemsById.size || 0;
    const delta = reg.applyItems(key, items);
    const entry = reg.get(key);
    if (!entry || entry.subscribers.size === 0) {
      return;
    }
    /** @type {Map<string, any>} */
    const by_id = new Map();
    for (const it of items) {
      if (it && typeof it.id === 'string') {
        by_id.set(it.id, it);
      }
    }
    for (const ws of entry.subscribers) {
      if (ws.readyState !== ws.OPEN) continue;
      const s = ensureSubs(ws);
      const subs = s.list_subs || new Map();
      /** @type {string[]} */
      const client_ids = [];
      for (const [cid, v] of subs.entries()) {
        if (v.key === key) client_ids.push(cid);
      }
      if (client_ids.length === 0) continue;
      if (prev_size === 0) {
        for (const cid of client_ids) {
          emitSubscriptionSnapshot(ws, cid, key, items);
        }
        continue;
      }
      for (const cid of client_ids) {
        for (const id of [...delta.added, ...delta.updated]) {
          const issue = by_id.get(id);
          if (issue) {
            emitSubscriptionUpsert(ws, cid, key, issue);
          }
        }
        for (const id of delta.removed) {
          emitSubscriptionDelete(ws, cid, key, id);
        }
      }
    }
  });
}

/**
 * Apply pre-diff filtering for closed-issues lists based on spec.params.since (epoch ms).
 *
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {Array<{ id: string, updated_at: number, closed_at: number | null } & Record<string, unknown>>} items
 */
function applyClosedIssuesFilter(spec, items) {
  if (String(spec.type) !== 'closed-issues') {
    return items;
  }
  const p = spec.params || {};
  const since = typeof p.since === 'number' ? p.since : 0;
  if (!Number.isFinite(since) || since <= 0) {
    return items;
  }
  /** @type {typeof items} */
  const out = [];
  for (const it of items) {
    const ca = it.closed_at;
    if (typeof ca === 'number' && Number.isFinite(ca) && ca >= since) {
      out.push(it);
    }
  }
  return out;
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 *
 * @param {Server} http_server
 * @param {{ path?: string, heartbeat_ms?: number, refresh_debounce_ms?: number, root_dir?: string, watch_project?: (root_dir: string, db_path: string) => () => void }} [options]
 * @returns {{ wss: WebSocketServer, broadcast: (type: MessageType, payload?: unknown) => void, scheduleListRefresh: (db_path?: string) => void, setWorkspace: (root_dir: string) => { changed: boolean, workspace: { root_dir: string, db_path: string } } }}
 */
export function attachWsServer(http_server, options = {}) {
  const ws_path = options.path || '/ws';

  // Initialize workspace state
  const initial_root = options.root_dir || process.cwd();
  const initial_db = resolveWorkspaceDatabase({ cwd: initial_root });
  setDefaultWorkspace({ root_dir: initial_root, db_path: initial_db.path });
  REGISTRIES = new Map([[initial_db.path, registry]]);
  WATCH_PROJECT = options.watch_project || null;
  clearDetailCaches();
  const heartbeat_ms = options.heartbeat_ms ?? 30000;
  if (typeof options.refresh_debounce_ms === 'number') {
    const n = options.refresh_debounce_ms;
    if (Number.isFinite(n) && n >= 0) {
      REFRESH_DEBOUNCE_MS = n;
    }
  }

  const wss = new WebSocketServer({
    server: http_server,
    maxPayload: MAX_WS_PAYLOAD,
    perMessageDeflate: WS_DEFLATE, // slow links (1bo5.6.31)
    path: ws_path,
    // D8: foreign/missing Origin, unknown Host or bad token never upgrade.
    verifyClient: (info, cb) => {
      const r = checkUpgrade(info.req);
      if (r.ok) {
        cb(true);
      } else {
        log('upgrade refused: %s', r.reason);
        cb(false, 403, 'Forbidden');
      }
    }
  });
  CURRENT_WSS = wss;

  // Feature handlers (decisions feed, notifier) push through ctx.broadcast.
  // Without this line it is a silent no-op: an open Decisions tab never gets
  // 'decisions-all' (beads-lite-1bo5.6.49; dropped by accident in 4b64932).
  FEATURE_BROADCAST = broadcast;

  // Heartbeat: track if client answered the last ping
  wss.on('connection', (ws, upgrade_req) => {
    log('client connected');
    // @ts-expect-error add marker property
    ws.isAlive = true;
    // Reached only after verifyClient passed (Origin + token).
    // @ts-expect-error marker
    ws.guarded = true;
    // @ts-expect-error marker
    ws.hostHeader = upgrade_req?.headers?.host;
    // @ts-expect-error marker
    ws.authed = true;

    // Initialize subscription state for this connection
    ensureSubs(ws);
    // Every socket starts on the server default and keeps its own project.
    const start = getDefaultWorkspace();
    if (start) joinProject(ws, start);

    ws.on('pong', () => {
      // @ts-expect-error marker
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      handleMessage(ws, data);
    });

    ws.on('close', () => {
      leaveProject(ws);
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      // @ts-expect-error marker
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      // @ts-expect-error marker
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeat_ms);

  interval.unref?.();

  wss.on('close', () => {
    clearInterval(interval);
  });

  /**
   * Broadcast a server-initiated event to all open clients.
   *
   * @param {MessageType} type
   * @param {unknown} [payload]
   */
  function broadcast(type, payload) {
    const msg = JSON.stringify({
      id: `evt-${Date.now()}`,
      ok: true,
      type,
      payload
    });
    for (const ws of allClients()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }

  /**
   * Change the project NEW connections start on. Open sockets keep theirs:
   * the server never moves one client because of another.
   *
   * @param {string} new_root_dir - Absolute path to the new workspace root.
   * @returns {{ changed: boolean, workspace: { root_dir: string, db_path: string } }}
   */
  function setWorkspace(new_root_dir) {
    const resolved_root = path.resolve(new_root_dir);
    const new_db = resolveWorkspaceDatabase({ cwd: resolved_root });
    const old_path = getDefaultWorkspace()?.db_path || '';
    const workspace = { root_dir: resolved_root, db_path: new_db.path };
    setDefaultWorkspace(workspace);
    return { changed: new_db.path !== old_path, workspace };
  }

  return {
    wss,
    broadcast,
    scheduleListRefresh,
    setWorkspace
    // v2: list subscription refresh handles updates
  };
}

/**
 * Attach the phone door's socket server to a second HTTP server (bound to
 * loopback, proxied by `tailscale serve`). Shares all state with the PC door;
 * differs in its upgrade check (owner identity, tailnet Host, https Origin,
 * its own token) and in that every socket gets the redacting send (B4).
 *
 * @param {Server} http_server
 * @param {{ path?: string, heartbeat_ms?: number }} [options]
 * @returns {{ wss: WebSocketServer }}
 */
export function attachPhoneDoor(http_server, options = {}) {
  const wss = new WebSocketServer({
    server: http_server,
    maxPayload: MAX_WS_PAYLOAD,
    perMessageDeflate: WS_DEFLATE, // slow links (1bo5.6.31)
    path: options.path || '/ws',
    verifyClient: (info, cb) => {
      const r = checkUpgrade(info.req, 'phone');
      if (r.ok) {
        cb(true);
      } else {
        log('phone upgrade refused: %s', r.reason);
        cb(false, 403, 'Forbidden');
      }
    }
  });
  // The ws server re-emits the http server's errors (e.g. EADDRINUSE); with no
  // listener Node would throw and take the whole board down.
  wss.on('error', (err) => {
    log('phone door ws error %o', err);
  });
  PHONE_WSS.add(wss);
  wss.on('connection', (ws, upgrade_req) => {
    log('phone client connected');
    /** @type {any} */
    const m = ws;
    m.isAlive = true;
    m.guarded = true;
    m.authed = true;
    m.hostHeader = upgrade_req?.headers?.host;
    installPhoneSocket(ws);
    ensureSubs(ws);
    const start = getDefaultWorkspace();
    if (start) joinProject(ws, start);
    ws.on('pong', () => {
      m.isAlive = true;
    });
    ws.on('message', (data) => {
      handleMessage(ws, data);
    });
    ws.on('close', () => {
      leaveProject(ws);
    });
  });
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (/** @type {any} */ (ws).isAlive === false) {
        ws.terminate();
        continue;
      }
      /** @type {any} */ (ws).isAlive = false;
      ws.ping();
    }
  }, options.heartbeat_ms ?? 30000);
  interval.unref?.();
  wss.on('close', () => {
    clearInterval(interval);
    PHONE_WSS.delete(wss);
  });
  return { wss };
}

/**
 * Handle an incoming message frame and respond to the same socket.
 *
 * @param {WebSocket} ws
 * @param {RawData} data
 */
export async function handleMessage(ws, data) {
  try {
    await handleMessageUnsafe(ws, data);
  } catch (err) {
    // Last line of defence: a throwing handler answers with an error and the
    // server stays up (an unhandled rejection would exit the process).
    log('handler threw: %o', err);
    try {
      let id = 'unknown';
      let type = 'internal-error';
      try {
        const j = JSON.parse(data.toString());
        if (j && typeof j.id === 'string') id = j.id;
        if (j && typeof j.type === 'string') type = j.type;
      } catch {
        // keep defaults
      }
      ws.send(
        JSON.stringify({
          id,
          ok: false,
          type,
          error: { code: 'internal_error', message: 'Request failed' }
        })
      );
    } catch {
      // socket gone
    }
  }
}

/**
 * @param {WebSocket} ws
 * @param {RawData} data
 */
async function handleMessageUnsafe(ws, data) {
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(data.toString());
  } catch {
    const reply = {
      id: 'unknown',
      ok: false,
      type: 'bad-json',
      error: { code: 'bad_json', message: 'Invalid JSON' }
    };
    ws.send(JSON.stringify(reply));
    return;
  }

  if (!isRequest(json)) {
    log('invalid request');
    const reply = {
      id: 'unknown',
      ok: false,
      type: 'bad-request',
      error: { code: 'bad_request', message: 'Invalid request envelope' }
    };
    ws.send(JSON.stringify(reply));
    return;
  }

  const req = json;

  // Phone door: full control (company-1bo5.6.38). Same handlers as the PC; the
  // identity check is at the upgrade, outbound frames go through redactFrame.

  // D8 defence in depth: a real connection that is not authed never mutates.
  // (Stub sockets used by unit tests carry no `guarded` marker.)
  if (
    /** @type {any} */ (ws).guarded &&
    !(/** @type {any} */ (ws).authed) &&
    (MUTATING_TYPES.has(req.type) || isFeatureMutating(req.type))
  ) {
    ws.send(JSON.stringify(makeError(req, 'forbidden', 'Missing board token')));
    return;
  }

  // Pin every bd invocation made during this message to the active workspace.
  // Without this, runBd/runBdJson fall back to process.cwd() and bd reports
  // "no beads database found" for any workspace selected via set-workspace.
  // See mantoni/beads-ui#87.
  const bd_options = { cwd: ctxFor(ws)?.root_dir };

  // Dispatch known types here as we implement them. For now, only a ping utility.
  if (req.type === /** @type {MessageType} */ ('ping')) {
    ws.send(JSON.stringify(makeOk(req, { ts: Date.now() })));
    return;
  }

  // subscribe-list: payload { id: string, type: string, params?: object }
  if (req.type === 'subscribe-list') {
    const payload_id = /** @type {any} */ (req.payload)?.id || '';
    log('subscribe-list %s', payload_id);
    const validation = validateSubscribeListPayload(
      /** @type {any} */ (req.payload || {})
    );
    if (!validation.ok) {
      ws.send(
        JSON.stringify(makeError(req, validation.code, validation.message))
      );
      return;
    }
    const client_id = validation.id;
    const spec = validation.spec;
    const key = keyOf(spec);
    const sub_ctx = ctxFor(ws);

    /**
     * Reply with an error and avoid attaching the subscription when
     * initialization fails.
     *
     * @param {string} code
     * @param {string} message
     * @param {Record<string, unknown>|undefined} details
     */
    const replyWithError = (code, message, details = undefined) => {
      ws.send(JSON.stringify(makeError(req, code, message, details)));
    };

    /** @type {FetchListResult | null} */
    let initial = null;
    try {
      initial = await fetchInitialListForSubscription(spec, sub_ctx);
    } catch (err) {
      log('subscribe-list snapshot error for %s: %o', key, err);
      const message =
        (err && /** @type {any} */ (err).message) || 'Failed to load list';
      replyWithError('bd_error', String(message), { key });
      return;
    }

    if (!initial.ok) {
      log(
        'initial snapshot failed for %s: %s %o',
        key,
        initial.error.message,
        initial.error
      );
      const details = { ...(initial.error.details || {}), key };
      replyWithError(initial.error.code, initial.error.message, details);
      return;
    }

    if (ctxFor(ws) !== sub_ctx) {
      // The socket switched project while the list loaded: this answer is for
      // the old project. Drop it quietly: attach nothing, publish nothing, and
      // answer ok so the client does not show a load failure. The client
      // re-subscribes after switching (beads-lite-1bo5.6.34).
      ws.send(JSON.stringify(makeOk(req, { id: client_id, key, stale: true })));
      return;
    }
    const s = ensureSubs(ws);
    const reg = registryFor(sub_ctx);
    const { key: attached_key } = reg.attach(spec, ws);
    s.list_subs?.set(client_id, { key: attached_key, spec });

    try {
      await reg.withKeyLock(attached_key, async () => {
        const items = applyClosedIssuesFilter(
          spec,
          initial ? initial.items : []
        );
        void reg.applyItems(attached_key, items);
        emitSubscriptionSnapshot(ws, client_id, attached_key, items);
      });
    } catch (err) {
      log('subscribe-list snapshot error for %s: %o', attached_key, err);
      s.list_subs?.delete(client_id);
      try {
        reg.detach(spec, ws);
      } catch {
        // ignore detach errors
      }
      replyWithError('bd_error', 'Failed to publish snapshot', { key });
      return;
    }

    ws.send(JSON.stringify(makeOk(req, { id: client_id, key: attached_key })));
    return;
  }

  // unsubscribe-list: payload { id: string }
  if (req.type === 'unsubscribe-list') {
    log('unsubscribe-list %s', /** @type {any} */ (req.payload)?.id || '');
    const { id: client_id } = /** @type {any} */ (req.payload || {});
    if (typeof client_id !== 'string' || client_id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload.id must be a non-empty string')
        )
      );
      return;
    }
    const s = ensureSubs(ws);
    const sub = s.list_subs?.get(client_id) || null;
    let removed = false;
    if (sub) {
      try {
        removed = registryFor(ctxFor(ws)).detach(sub.spec, ws);
      } catch {
        removed = false;
      }
      s.list_subs?.delete(client_id);
    }
    ws.send(
      JSON.stringify(
        makeOk(req, {
          id: client_id,
          unsubscribed: removed
        })
      )
    );
    return;
  }

  // Removed: subscribe-updates and subscribe-issues. No-ops in v2.

  // list-issues and epic-status were removed in favor of push-only subscriptions

  // Removed: show-issue. Details flow is push-only via `subscribe-list { type: 'issue-detail' }`.

  // type updates are not exposed via UI; no handler

  // update-assignee
  if (req.type === 'update-assignee') {
    const { id, assignee } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof assignee !== 'string'
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, assignee: string }'
          )
        )
      );
      return;
    }
    // Pass empty string to clear assignee when requested
    clearDetailCaches();
    const res = await runBd(['update', id, '--assignee', assignee], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id, assignee })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // update-status
  if (req.type === 'update-status') {
    log('update-status');
    const { id, status } = /** @type {any} */ (req.payload);
    // Only human-settable statuses: `pinned` and `hooked` are bd's to manage.
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof status !== 'string' ||
      !isSettableStatus(status)
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            `payload requires { id: string, status: ${SETTABLE_STATUSES.map(
              (s) => `'${s}'`
            ).join('|')} }`
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['update', id, '--status', status], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id, status })));
    // After mutation, refresh active subscriptions once (watcher or timeout)
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // update-priority
  if (req.type === 'update-priority') {
    log('update-priority');
    const { id, priority } = /** @type {any} */ (req.payload);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof priority !== 'number' ||
      priority < 0 ||
      priority > 4
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, priority: 0..4 }'
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(
      ['update', id, '--priority', String(priority)],
      bd_options
    );
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id, priority })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // update-type
  if (req.type === 'update-type') {
    log('update-type');
    const { id, type } = /** @type {any} */ (req.payload);
    const allowed = new Set([
      'bug',
      'feature',
      'task',
      'epic',
      'chore',
      'decision'
    ]);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof type !== 'string' ||
      !allowed.has(type)
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            "payload requires { id: string, type: 'bug'|'feature'|'task'|'epic'|'chore'|'decision' }"
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['update', id, '--type', type], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id, issue_type: type })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // edit-text
  if (req.type === 'edit-text') {
    log('edit-text');
    const { id, field, value } = /** @type {any} */ (req.payload);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      (field !== 'title' &&
        field !== 'description' &&
        field !== 'acceptance' &&
        field !== 'notes' &&
        field !== 'design') ||
      typeof value !== 'string'
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            "payload requires { id: string, field: 'title'|'description'|'acceptance'|'notes'|'design', value: string }"
          )
        )
      );
      return;
    }
    // Map UI fields to bd CLI flags
    // title       → --title
    // description → --description
    // acceptance  → --acceptance-criteria
    // notes       → --notes
    // design      → --design
    const flag =
      field === 'title'
        ? '--title'
        : field === 'description'
          ? '--description'
          : field === 'acceptance'
            ? '--acceptance-criteria'
            : field === 'notes'
              ? '--notes'
              : '--design';
    clearDetailCaches();
    // description/design can be 100K+: send them on stdin (never the command
    // line). Other fields have no file option in bd; the arg cap covers them.
    const file_flag =
      field === 'description'
        ? '--body-file'
        : field === 'design'
          ? '--design-file'
          : '';
    const res = file_flag
      ? await runBd(['update', id, file_flag, '-'], {
          ...bd_options,
          stdin: value
        })
      : await runBd(['update', id, flag, value], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id, [field]: value })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // create-issue
  if (req.type === 'create-issue') {
    log('create-issue');
    const { title, type, priority, description } = /** @type {any} */ (
      req.payload || {}
    );
    if (typeof title !== 'string' || title.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { title: string, ... }'
          )
        )
      );
      return;
    }
    const args = ['create'];
    /** @type {string | undefined} */
    let long_description;
    if (
      typeof type === 'string' &&
      (type === 'bug' ||
        type === 'feature' ||
        type === 'task' ||
        type === 'epic' ||
        type === 'chore')
    ) {
      args.push('-t', type);
    }
    if (typeof priority === 'number' && priority >= 0 && priority <= 4) {
      args.push('-p', String(priority));
    }
    if (typeof description === 'string' && description.length > 0) {
      long_description = description;
    }
    // '--' so a title like '--help' is a title, never a bd flag.
    clearDetailCaches();
    // D6: a board-created task is marked and wakes CoS (agents never pass here).
    const res = await runBd(
      [
        ...args,
        ...(long_description !== undefined ? ['--body-file', '-'] : []),
        ...BOARD_TASK_ARGS,
        '--',
        title
      ],
      long_description !== undefined
        ? { ...bd_options, stdin: long_description }
        : bd_options
    );
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const wake = await afterBoardTask(
      bd_options.cwd,
      res.stdout,
      /** @type {any} */ (ws).hostHeader
    );
    // Reply with a minimal ack
    ws.send(JSON.stringify(makeOk(req, { created: true, wake })));
    // Refresh active subscriptions once (watcher or timeout)
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // dep-add: payload { a: string, b: string, view_id?: string }
  if (req.type === 'dep-add') {
    const { a, b, view_id } = /** @type {any} */ (req.payload || {});
    if (
      typeof a !== 'string' ||
      a.length === 0 ||
      typeof b !== 'string' ||
      b.length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { a: string, b: string }'
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['dep', 'add', a, b], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const id = typeof view_id === 'string' && view_id.length > 0 ? view_id : a;
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // dep-remove: payload { a: string, b: string, view_id?: string }
  if (req.type === 'dep-remove') {
    const { a, b, view_id } = /** @type {any} */ (req.payload || {});
    if (
      typeof a !== 'string' ||
      a.length === 0 ||
      typeof b !== 'string' ||
      b.length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { a: string, b: string }'
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['dep', 'remove', a, b], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const id = typeof view_id === 'string' && view_id.length > 0 ? view_id : a;
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // label-add: payload { id: string, label: string }
  if (req.type === 'label-add') {
    const { id, label } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof label !== 'string' ||
      label.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, label: non-empty string }'
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['label', 'add', id, label.trim()], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // label-remove: payload { id: string, label: string }
  if (req.type === 'label-remove') {
    const { id, label } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof label !== 'string' ||
      label.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, label: non-empty string }'
          )
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['label', 'remove', id, label.trim()], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // No post-mutation `show` (contract board-data.md): the one refresh below
    // pushes the new state to every subscriber; the reply only echoes the change.
    ws.send(JSON.stringify(makeOk(req, { id })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // get-weights: payload { id: string } -> { [child_id]: weight } for children of
  // id that carry an explicit metadata.weight (usually none). Read-only, bounded
  // (200), one cheap bd list; the header fills its progress bar from it.
  if (req.type === 'get-weights') {
    const { id } = /** @type {any} */ (req.payload || {});
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload requires { id: string }')
        )
      );
      return;
    }
    const res = await runBdJson(
      [
        'list',
        '--parent',
        id,
        '--has-metadata-key',
        'weight',
        '--all',
        '--limit',
        '200',
        '--json'
      ],
      bd_options
    );
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    /** @type {Record<string, number|string>} */
    const out = {};
    const rows = Array.isArray(res.stdoutJson) ? res.stdoutJson : [];
    for (const r of rows) {
      const wv = r && r.metadata ? r.metadata.weight : undefined;
      if (r && typeof r.id === 'string' && wv !== undefined) {
        out[r.id] = wv;
      }
    }
    ws.send(JSON.stringify(makeOk(req, out)));
    return;
  }

  // get-comments: payload { id: string }
  if (req.type === 'get-comments') {
    const { id } = /** @type {any} */ (req.payload || {});
    if (typeof id !== 'string' || id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload requires { id: string }')
        )
      );
      return;
    }
    const cache_key = issueDetailCacheKey(id, ctxFor(ws));
    const cached = COMMENTS_CACHE.get(cache_key);
    if (cached !== undefined) {
      ws.send(JSON.stringify(makeOk(req, cached)));
      return;
    }
    const generation = DETAIL_CACHE_GENERATION;
    const res = await runBdJson(['comments', id, '--json'], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const comments = Array.isArray(res.stdoutJson) ? res.stdoutJson : [];
    if (generation === DETAIL_CACHE_GENERATION) {
      COMMENTS_CACHE.set(cache_key, comments.slice());
      evictOldestCacheEntry(COMMENTS_CACHE, DETAIL_CACHE_LIMIT);
    }
    ws.send(JSON.stringify(makeOk(req, comments)));
    return;
  }

  // add-comment: payload { id: string, text: string }
  if (req.type === 'add-comment') {
    const { id, text } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof text !== 'string' ||
      text.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, text: non-empty string }'
          )
        )
      );
      return;
    }

    clearDetailCaches();

    // Get git user name for author attribution
    const author = await getGitUserName(bd_options);
    const args = ['comments', 'add', id, '-f', '-'];
    if (author) {
      args.push('--author', author);
    }

    const res = await runBd(args, { ...bd_options, stdin: text.trim() });
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    clearDetailCaches();

    // Return updated comments list
    const generation = DETAIL_CACHE_GENERATION;
    const comments = await runBdJson(['comments', id, '--json'], bd_options);
    if (comments.code !== 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bd_error', comments.stderr || 'bd failed')
        )
      );
      return;
    }
    const comment_list = Array.isArray(comments.stdoutJson)
      ? comments.stdoutJson
      : [];
    if (generation === DETAIL_CACHE_GENERATION) {
      COMMENTS_CACHE.set(
        issueDetailCacheKey(id, ctxFor(ws)),
        comment_list.slice()
      );
      evictOldestCacheEntry(COMMENTS_CACHE, DETAIL_CACHE_LIMIT);
    }
    ws.send(JSON.stringify(makeOk(req, comment_list)));
    return;
  }

  // delete-issue: payload { id: string }
  if (req.type === 'delete-issue') {
    const { id } = /** @type {any} */ (req.payload || {});
    if (typeof id !== 'string' || id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload requires { id: string }')
        )
      );
      return;
    }
    clearDetailCaches();
    const res = await runBd(['delete', id, '--force'], bd_options);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bd_error', res.stderr || 'bd delete failed')
        )
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, { deleted: true, id })));
    try {
      triggerMutationRefreshOnce(500, ctxFor(ws)?.db_path);
    } catch {
      // ignore
    }
    return;
  }

  // list-workspaces: returns all available workspaces from the registry
  if (req.type === 'list-workspaces') {
    log('list-workspaces');
    const base = getAvailableWorkspaces();
    const [counted, prefixed] = await Promise.all([
      withCounts(base),
      withPrefixes(base)
    ]);
    const workspaces = counted.map((w, i) =>
      prefixed[i]?.prefix ? { ...w, prefix: prefixed[i].prefix } : w
    );
    ws.send(
      JSON.stringify(
        makeOk(req, {
          workspaces,
          current: ctxFor(ws)
        })
      )
    );
    return;
  }

  // resolve-moved-id: payload { id } -> { moved: { id, repo } | null }. Read-only.
  if (req.type === 'resolve-moved-id') {
    const id = /** @type {any} */ (req.payload || {}).id;
    if (id === undefined) {
      // no id: the whole table, loaded once by the browser
      ws.send(JSON.stringify(makeOk(req, { all: allMovedIds() })));
      return;
    }
    ws.send(JSON.stringify(makeOk(req, { moved: resolveMovedId(id) })));
    return;
  }

  // get-workspace: returns the current workspace
  if (req.type === 'get-workspace') {
    log('get-workspace');
    ws.send(JSON.stringify(makeOk(req, ctxFor(ws))));
    return;
  }

  // set-workspace: payload { path: string }
  if (req.type === 'set-workspace') {
    log('set-workspace');
    const { path: workspace_path } = /** @type {any} */ (req.payload || {});
    if (typeof workspace_path !== 'string' || workspace_path.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { path: string } (absolute workspace path)'
          )
        )
      );
      return;
    }

    // Resolve and validate the path: only registered workspaces (SEC N1).
    const resolved = path.resolve(workspace_path);
    const registered = getAvailableWorkspaces().some((w) =>
      samePath(w.path, resolved)
    );
    if (!registered) {
      ws.send(
        JSON.stringify(
          makeError(req, 'forbidden', 'workspace is not registered')
        )
      );
      return;
    }

    // Per-connection: only THIS socket changes project. Its subscriptions
    // leave the old project; the client re-subscribes (clearAndResubscribe).
    const new_db = resolveWorkspaceDatabase({ cwd: resolved });
    const old_path = ctxFor(ws)?.db_path || '';
    const changed = new_db.path !== old_path;
    const workspace = { root_dir: resolved, db_path: new_db.path };

    if (changed) {
      log(
        'workspace changed via set-workspace: %s → %s',
        old_path,
        new_db.path
      );
      ensureSubs(ws).list_subs?.clear();
      joinProject(ws, workspace);
    }

    ws.send(
      JSON.stringify(
        makeOk(req, {
          changed,
          workspace: changed ? workspace : ctxFor(ws)
        })
      )
    );
    return;
  }

  // Feature seam: handlers registered by server/features/*.js
  const feature = getHandler(req.type);
  if (feature) {
    try {
      const out = await feature(req, {
        ws,
        root_dir: ctxFor(ws)?.root_dir,
        broadcast: (type, payload) => FEATURE_BROADCAST?.(type, payload)
      });
      ws.send(JSON.stringify(makeOk(req, out === undefined ? null : out)));
    } catch (e) {
      const ex = /** @type {any} */ (e);
      ws.send(
        JSON.stringify(
          makeError(
            req,
            typeof ex?.code === 'string' ? ex.code : 'internal_error',
            String(ex?.message || 'Feature handler failed')
          )
        )
      );
    }
    return;
  }

  // Unknown type
  const err = makeError(
    req,
    'unknown_type',
    `Unknown message type: ${req.type}`
  );
  ws.send(JSON.stringify(err));
}
