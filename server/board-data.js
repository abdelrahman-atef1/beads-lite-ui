import { runBdJson } from './bd.js';
import { buildIndex, deriveItems, stallHours } from './board-derive.js';
import { debug } from './logging.js';

const log = debug('board-data');

/**
 * Board data layer (T032, contract board-data.md).
 *
 * One refresh = four `bd` calls (open+all custom statuses, closed, ready,
 * blocked) shared by every column subscription, split by status here. At most
 * one refresh per project is in flight; a request that arrives after
 * `invalidate()` while one is running waits for exactly one follow-up
 * refresh. State is kept per project (bounded LRU), so projects never evict
 * each other. Works with upstream
 * bd today: only documented flags are used.
 */

/** Closed column cap: the newest N (FR-011; 200 = four pages of the rail, payload budget); the client offers "show more". */
const DEFAULT_CLOSED_LIMIT = 200;
/** A finished snapshot is reused this long, so the initial subscribes of all columns coalesce. */
const DEFAULT_TTL_MS = 1500;
/**
 * The workspace the file watcher is bound to is kept this long: the watcher's
 * invalidate() is what refreshes it, so a page load is answered from memory
 * (no bd spawn). The cap only guards against a missed file event.
 */
const DEFAULT_WATCHED_TTL_MS = 30 * 60_000;

/**
 * Subscription type -> how its items are taken from a snapshot.
 * `status` columns filter the open list; others use their own bd call.
 *
 * @type {Record<string, { part: 'open' | 'closed' | 'ready' | 'blocked', status?: string }>}
 */
const COLUMNS = {
  'all-issues': { part: 'open' },
  'in-progress-issues': { part: 'open', status: 'in_progress' },
  'status-blocked-issues': { part: 'open', status: 'blocked' },
  'owner-decision-issues': { part: 'open', status: 'owner_decision' },
  'waiting-for-test-issues': { part: 'open', status: 'waiting_for_test' },
  'waiting-for-merge-issues': { part: 'open', status: 'waiting_for_merge' },
  'closed-issues': { part: 'closed' },
  'ready-issues': { part: 'ready' },
  'blocked-issues': { part: 'blocked' }
};

/**
 * @param {string} type
 * @returns {boolean}
 */
export function isBoardColumnType(type) {
  return Object.hasOwn(COLUMNS, type) || type === 'status-issues';
}

/** @returns {number} */
function closedLimit() {
  const n = Number.parseInt(String(process.env.BDUI_CLOSED_LIMIT || ''), 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_CLOSED_LIMIT;
}

/**
 * @typedef {{ ok: true, value: unknown } | { ok: false, code: number, stderr: string }} Part
 * @typedef {{ open: Part, closed: Part, ready: Part, blocked: Part }} Snapshot
 */

/**
 * @param {string[]} args
 * @param {string | undefined} cwd
 * @param {'interactive' | 'background' | undefined} priority
 * @returns {Promise<Part>}
 */
async function runPart(args, cwd, priority) {
  try {
    const res = await runBdJson(args, { cwd, priority });
    if (!res || res.code !== 0 || !('stdoutJson' in res)) {
      return {
        ok: false,
        code: res?.code ?? -1,
        stderr: String(res?.stderr || 'bd failed')
      };
    }
    return { ok: true, value: res.stdoutJson };
  } catch (err) {
    return {
      ok: false,
      code: -1,
      stderr: String((err && /** @type {any} */ (err).message) || 'bd failed')
    };
  }
}

/**
 * @param {string | undefined} cwd
 * @param {'interactive' | 'background' | undefined} priority
 * @returns {Promise<Snapshot>}
 */
async function loadSnapshot(cwd, priority) {
  const [open, closed, ready, blocked] = await Promise.all([
    // `--limit 0` = unlimited; bd list leaves closed issues out by default.
    runPart(['list', '--json', '--tree=false', '--limit', '0'], cwd, priority),
    runPart(
      [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'closed',
        '--limit',
        String(closedLimit())
      ],
      cwd,
      priority
    ),
    runPart(['ready', '--limit', '1000', '--json'], cwd, priority),
    runPart(['blocked', '--json'], cwd, priority)
  ]);
  return { open, closed, ready, blocked };
}

/** Most projects whose snapshot is kept at once (LRU); each holds four bd lists, so this bounds memory. */
const DEFAULT_MAX_PROJECTS = 8;

/**
 * Cache state of one project (one workspace root). Projects never share or
 * evict each other's state: a change in X invalidates only X.
 *
 * @typedef {{
 *   inflight: { generation: number, promise: Promise<Snapshot> } | null,
 *   queued: { promise: Promise<Snapshot> } | null,
 *   fresh: { snapshot: Snapshot, at: number } | null,
 *   last: Snapshot | null,
 *   revalidating: boolean,
 *   generation: number
 * }} ProjectState
 */

/**
 * @param {{ ttl_ms?: number, watched_ttl_ms?: number, max_projects?: number, load?: typeof loadSnapshot, now?: () => number }} [options]
 */
export function createBoardData(options = {}) {
  const ttl_ms = options.ttl_ms ?? DEFAULT_TTL_MS;
  const watched_ttl_ms = options.watched_ttl_ms ?? DEFAULT_WATCHED_TTL_MS;
  const max_projects = Math.max(
    1,
    options.max_projects ?? DEFAULT_MAX_PROJECTS
  );
  /** Workspaces a change watcher covers (one per project in use). @type {Set<string>} */
  const watched_keys = new Set();
  const load = options.load ?? loadSnapshot;
  const now = options.now ?? Date.now;

  /**
   * Per-project state, least recently used first (Map keeps insertion order;
   * touch() re-inserts). `last` is the newest finished snapshot, kept past
   * invalidate(): an initial page load with `allow_stale` is answered from it
   * at once while one real reload runs (stale-while-revalidate). Zero idle
   * cost: nothing reloads unless a page asks.
   *
   * @type {Map<string, ProjectState>}
   */
  const states = new Map();
  /** @type {((key: string) => void) | null} Called when a stale answer has been replaced by a fresh load. */
  let on_revalidated = null;
  let spawned = 0;

  /**
   * State of one project, marked most recently used. Over the cap, the least
   * recently used idle project is dropped (unwatched ones first), never this
   * one and never one with a load in flight.
   *
   * @param {string} key
   * @returns {ProjectState}
   */
  function touch(key) {
    let st = states.get(key);
    if (st) {
      states.delete(key);
    } else {
      st = {
        inflight: null,
        queued: null,
        fresh: null,
        last: null,
        revalidating: false,
        generation: 0
      };
    }
    states.set(key, st);
    if (states.size > max_projects) {
      for (const pass of [false, true]) {
        for (const [k, v] of states) {
          if (states.size <= max_projects) break;
          if (k === key || v.inflight || v.queued) continue;
          if (!pass && watched_keys.has(k)) continue;
          states.delete(k);
        }
      }
    }
    return st;
  }

  /**
   * @param {ProjectState} st
   * @param {string | undefined} cwd
   * @param {'interactive' | 'background' | undefined} priority
   * @returns {Promise<Snapshot>}
   */
  function start(st, cwd, priority) {
    spawned += 1;
    const started_generation = st.generation;
    const key = cwd || '';
    /** @type {{ generation: number, promise: Promise<Snapshot> }} */
    const entry = {
      generation: started_generation,
      promise: load(cwd, priority).then((snapshot) => {
        // A load that started before the last change is never cached.
        if (started_generation === st.generation) {
          st.fresh = { snapshot, at: now() };
        }
        // Only keep it if the project was not evicted meanwhile.
        if (states.get(key) === st) st.last = snapshot;
        return snapshot;
      })
    };
    st.inflight = entry;
    const done = () => {
      if (st.inflight === entry) {
        st.inflight = null;
      }
    };
    entry.promise.then(done, done);
    return entry.promise;
  }

  /**
   * Run one more load after the one in flight, whatever its outcome. Callers
   * that arrive meanwhile share it.
   *
   * @param {ProjectState} st
   * @param {string | undefined} cwd
   * @param {'interactive' | 'background' | undefined} priority
   * @returns {Promise<Snapshot>}
   */
  function chain(st, cwd, priority) {
    const prev = /** @type {{ promise: Promise<Snapshot> }} */ (st.inflight)
      .promise;
    /** @type {{ promise: Promise<Snapshot> }} */
    const entry = {
      promise: prev
        .catch(() => undefined)
        .then(() => {
          if (st.queued === entry) st.queued = null;
          return start(st, cwd, priority);
        })
    };
    st.queued = entry;
    return entry.promise;
  }

  /**
   * @param {{ cwd?: string, priority?: 'interactive' | 'background', allow_stale?: boolean }} [opts]
   * @returns {Promise<Snapshot>}
   */
  function getSnapshot(opts = {}) {
    const key = opts.cwd || '';
    const st = touch(key);
    const max_age = watched_keys.has(key) ? watched_ttl_ms : ttl_ms;
    if (st.fresh && now() - st.fresh.at < max_age) {
      return Promise.resolve(st.fresh.snapshot);
    }
    if (opts.allow_stale && st.last) {
      if (!st.revalidating) {
        st.revalidating = true;
        getSnapshot({ cwd: opts.cwd, priority: 'background' }).then(
          () => {
            st.revalidating = false;
            on_revalidated?.(key);
          },
          () => {
            st.revalidating = false;
          }
        );
      }
      return Promise.resolve(st.last);
    }
    if (st.queued) {
      return st.queued.promise;
    }
    if (st.inflight && st.inflight.generation === st.generation) {
      return st.inflight.promise;
    }
    if (st.inflight) {
      // A run that started before the last change is in flight: wait for it,
      // then run exactly one more.
      return chain(st, opts.cwd, opts.priority);
    }
    return start(st, opts.cwd, opts.priority);
  }

  /**
   * Data changed. Lazy: nothing runs until the next request, which then
   * shares exactly one new load (after the one in flight, if any). A load
   * that started earlier is never cached. With `{ cwd }` only that project is
   * invalidated (others keep their cache); without arguments, all of them.
   *
   * @param {{ cwd?: string }} [scope]
   */
  function invalidate(scope) {
    const one = scope ? states.get(scope.cwd || '') : null;
    const targets = scope ? (one ? [one] : []) : [...states.values()];
    for (const st of targets) {
      st.fresh = null;
      st.generation += 1;
    }
  }

  /** @type {WeakMap<Snapshot, ReturnType<typeof buildIndex>>} */
  const indexes = new WeakMap();
  /** @param {Snapshot} snapshot */
  function indexFor(snapshot) {
    let idx = indexes.get(snapshot);
    if (!idx) {
      const list = (/** @type {Part} */ p) =>
        p.ok && Array.isArray(p.value) ? p.value : [];
      idx = buildIndex(list(snapshot.open), list(snapshot.blocked));
      indexes.set(snapshot, idx);
    }
    return idx;
  }

  /**
   * Items for one subscription spec, taken from the shared snapshot.
   *
   * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
   * @param {{ cwd?: string, priority?: 'interactive' | 'background', allow_stale?: boolean }} [opts]
   * @returns {Promise<{ ok: true, raw: unknown[] } | { ok: false, error: { code: string, message: string, details?: Record<string, unknown> } }>}
   */
  async function getColumn(spec, opts = {}) {
    const type = String(spec.type);
    /** @type {{ part: 'open' | 'closed' | 'ready' | 'blocked', status?: string } | undefined} */
    let col = COLUMNS[type];
    if (type === 'status-issues') {
      const status = String(spec.params?.status || '').trim();
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(status)) {
        return {
          ok: false,
          error: { code: 'bad_request', message: 'Invalid params.status' }
        };
      }
      col = { part: 'open', status };
    }
    if (!col) {
      return {
        ok: false,
        error: {
          code: 'bad_request',
          message: `Unknown subscription type: ${type}`
        }
      };
    }
    const snapshot = await getSnapshot(opts);
    const part = snapshot[col.part];
    if (!part.ok) {
      log('part %s failed code=%s %s', col.part, part.code, part.stderr);
      return {
        ok: false,
        error: {
          code: 'bd_error',
          message: part.stderr,
          details: { exit_code: part.code }
        }
      };
    }
    let raw = Array.isArray(part.value) ? part.value : [];
    if (col.status) {
      const want = col.status;
      raw = raw.filter(
        (it) =>
          it &&
          typeof it === 'object' &&
          /** @type {any} */ (it).status === want
      );
    }
    raw = deriveItems(raw, indexFor(snapshot), now(), stallHours());
    return { ok: true, raw };
  }

  /**
   * Tell the data layer which workspace the change watcher covers, and load
   * its snapshot now, so the first page load finds it ready. One load per
   * call; nothing repeats.
   *
   * @param {string | undefined} cwd
   */
  function watch(cwd) {
    watched_keys.add(cwd || '');
    getSnapshot({ cwd, priority: 'background' }).catch(() => undefined);
  }

  /**
   * The watcher for this workspace was closed (last socket left).
   *
   * @param {string | undefined} cwd
   */
  function unwatch(cwd) {
    watched_keys.delete(cwd || '');
    // Nobody is listening for changes now, so the snapshot may go stale
    // unseen: it must not count as fresh (30 min watched TTL) on return. The
    // old one stays only as `last` (stale-while-revalidate, then republished).
    invalidate({ cwd });
  }

  return {
    getSnapshot,
    getColumn,
    watch,
    unwatch,
    invalidate,
    /** @param {((key: string) => void) | null} fn */
    set onRevalidated(fn) {
      on_revalidated = fn;
    },
    /** Projects currently cached; for tests and logs. */
    get cachedProjects() {
      return states.size;
    },
    /** Number of snapshot loads started (4 bd calls each); for tests and logs. */
    get loads() {
      return spawned;
    }
  };
}

/** Process-wide instance used by the server. */
export const boardData = createBoardData();
