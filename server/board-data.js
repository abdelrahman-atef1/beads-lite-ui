import { runBdJson } from './bd.js';
import { debug } from './logging.js';

const log = debug('board-data');

/**
 * Board data layer (T032, contract board-data.md).
 *
 * One refresh = four `bd` calls (open+all custom statuses, closed, ready,
 * blocked) shared by every column subscription, split by status here. At most
 * one refresh is in flight; a request that arrives after `invalidate()` while
 * one is running waits for exactly one follow-up refresh. Works with upstream
 * bd today: only documented flags are used.
 */

/** Closed column cap: the newest N (FR-011); the client offers "show more". */
const DEFAULT_CLOSED_LIMIT = 1000;
/** A finished snapshot is reused this long, so the initial subscribes of all columns coalesce. */
const DEFAULT_TTL_MS = 1500;

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

/**
 * @param {{ ttl_ms?: number, load?: typeof loadSnapshot, now?: () => number }} [options]
 */
export function createBoardData(options = {}) {
  const ttl_ms = options.ttl_ms ?? DEFAULT_TTL_MS;
  const load = options.load ?? loadSnapshot;
  const now = options.now ?? Date.now;

  /** @type {{ key: string, generation: number, promise: Promise<Snapshot> } | null} */
  let inflight = null;
  /** @type {{ key: string, generation: number, promise: Promise<Snapshot> } | null} */
  let queued = null;
  /** @type {{ key: string, snapshot: Snapshot, at: number } | null} */
  let fresh = null;
  let spawned = 0;
  /** Bumped by invalidate(); a load that started earlier is never cached. */
  let generation = 0;

  /**
   * @param {string} key
   * @param {string | undefined} cwd
   * @param {'interactive' | 'background' | undefined} priority
   * @returns {Promise<Snapshot>}
   */
  function start(key, cwd, priority) {
    spawned += 1;
    const started_generation = generation;
    /** @type {{ key: string, generation: number, promise: Promise<Snapshot> }} */
    const entry = {
      key,
      generation: started_generation,
      promise: load(cwd, priority).then(
        (snapshot) => {
          if (started_generation === generation) {
            fresh = { key, snapshot, at: now() };
          }
          return snapshot;
        },
        (err) => {
          throw err;
        }
      )
    };
    inflight = entry;
    const done = () => {
      if (inflight === entry) {
        inflight = null;
      }
    };
    entry.promise.then(done, done);
    return entry.promise;
  }

  /**
   * Run one more load after the one in flight, whatever its outcome. Callers
   * that arrive meanwhile share it.
   *
   * @param {string} key
   * @param {string | undefined} cwd
   * @param {'interactive' | 'background' | undefined} priority
   * @returns {Promise<Snapshot>}
   */
  function chain(key, cwd, priority) {
    const prev = /** @type {{ promise: Promise<Snapshot> }} */ (inflight)
      .promise;
    /** @type {{ key: string, generation: number, promise: Promise<Snapshot> }} */
    const entry = {
      key,
      generation,
      promise: prev
        .catch(() => undefined)
        .then(() => {
          if (queued === entry) queued = null;
          return start(key, cwd, priority);
        })
    };
    queued = entry;
    return entry.promise;
  }

  /**
   * @param {{ cwd?: string, priority?: 'interactive' | 'background' }} [opts]
   * @returns {Promise<Snapshot>}
   */
  function getSnapshot(opts = {}) {
    const key = opts.cwd || '';
    if (fresh && fresh.key === key && now() - fresh.at < ttl_ms) {
      return Promise.resolve(fresh.snapshot);
    }
    if (queued && queued.key === key) {
      return queued.promise;
    }
    if (
      inflight &&
      inflight.key === key &&
      inflight.generation === generation
    ) {
      return inflight.promise;
    }
    if (inflight) {
      // Another workspace, or a run that started before the last change, is
      // in flight: wait for it, then run exactly one more.
      return chain(key, opts.cwd, opts.priority);
    }
    return start(key, opts.cwd, opts.priority);
  }

  /**
   * Data changed. Lazy: nothing runs until the next request, which then
   * shares exactly one new load (after the one in flight, if any). A load
   * that started earlier is never cached.
   */
  function invalidate() {
    fresh = null;
    generation += 1;
  }

  /**
   * Items for one subscription spec, taken from the shared snapshot.
   *
   * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
   * @param {{ cwd?: string, priority?: 'interactive' | 'background' }} [opts]
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
    return { ok: true, raw };
  }

  return {
    getSnapshot,
    getColumn,
    invalidate,
    /** Number of snapshot loads started (4 bd calls each); for tests and logs. */
    get loads() {
      return spawned;
    }
  };
}

/** Process-wide instance used by the server. */
export const boardData = createBoardData();
