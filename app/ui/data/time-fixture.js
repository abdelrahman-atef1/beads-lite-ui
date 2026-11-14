/**
 * Fixture rollup for the Time screens (beads-lite-1bo5.6.59.12): used only when
 * the page URL has `timefx=1` (dev and QA), loaded on demand. Rows have the same
 * shape as scripts/flow/core.mjs beadRow. Deterministic from `now`.
 */
const MIN = 60_000;
const B = {
  in_progress: 'active',
  waiting_for_test: 'test',
  owner_decision: 'owner',
  waiting_for_merge: 'merge',
  blocked: 'blocked',
  open: 'queue'
};

/**
 * @param {string} id
 * @param {string} role
 * @param {number} created
 * @param {Array<[string, string, number]>} steps - [status, role, minutes]; the last one running when `running`
 * @param {{ qaFail?: number, reopen?: number, ownerReject?: number, rework?: number }} q
 * @param {boolean} running
 */
function mk(id, role, created, steps, q = {}, running = false) {
  let at = created;
  const intervals = steps.map(([status, r, min], k) => {
    const from = at;
    at += min * MIN;
    const run = running && k === steps.length - 1;
    return {
      status,
      bucket: B[/** @type {keyof typeof B} */ (status)],
      role: r,
      from,
      to: run ? null : at,
      min,
      running: run
    };
  });
  /** @type {Record<string, number | null>} */
  const buckets = {
    active: null,
    test: null,
    owner: null,
    merge: null,
    blocked: null,
    queue: null
  };
  for (const i of intervals)
    buckets[i.bucket] = (buckets[i.bucket] || 0) + i.min * MIN;
  const active = buckets.active || 0;
  const waiting = intervals.reduce(
    (s, i) => s + (i.bucket === 'active' ? 0 : i.min * MIN),
    0
  );
  return {
    id,
    kind: 'task',
    project: 'beads-lite',
    status: running ? steps[steps.length - 1][0] : 'closed',
    running,
    role,
    created,
    closed: running ? null : at,
    wall_ms: active + waiting,
    active_ms: active,
    waiting_ms: waiting,
    buckets,
    intervals,
    quality: { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0, ...q },
    labels: [],
    tokens: null
  };
}

/** @param {number} now */
export function fixtureRows(now) {
  const D = 86_400_000;
  /** @type {any[]} */
  const rows = [];
  // 3 roles x 8 beads closed in the last 12 days; swe halves its time in the newest days but fails more
  const roles = ['qa', 'sre', 'swe'];
  for (let i = 0; i < 24; i++) {
    const role = roles[i % 3];
    const age = 1 + Math.floor(i / 2); // days ago
    const recent = age <= 6;
    const act = role === 'swe' && recent ? 40 + i : 80 + i * 3;
    const fails =
      role === 'swe' && recent ? (i % 2 ? 1 : 0) : i % 8 === 0 ? 1 : 0;
    rows.push(
      mk(
        'fx-' + i,
        role,
        now - age * D,
        [
          ['in_progress', role, act],
          ['waiting_for_test', 'qa', 20 + (i % 5) * 10]
        ],
        { qaFail: fails, rework: fails }
      )
    );
  }
  // older closed beads (previous period) so a comparison exists: 8 per role, slower, fewer fails
  for (let i = 0; i < 24; i++) {
    const role = roles[i % 3];
    const act = role === 'swe' ? 95 + i * 2 : 80 + i * 3;
    rows.push(
      mk(
        'fo-' + i,
        role,
        now - (16 + Math.floor(i / 2)) * D,
        [
          ['in_progress', role, act],
          ['waiting_for_test', 'qa', 25]
        ],
        { qaFail: i % 12 === 0 ? 1 : 0 }
      )
    );
  }
  rows.push(
    mk(
      'fx-run',
      'swe',
      now - 95 * MIN,
      [
        ['open', 'swe', 10],
        ['in_progress', 'swe', 85]
      ],
      {},
      true
    )
  );
  return rows;
}

/**
 * Row for one task id in fixture mode: three archetypes picked by the id so a
 * reviewer sees a full bead, a running one and one with no history.
 *
 * @param {string} id
 * @param {number} now
 */
export function fixtureFor(id, now) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 3;
  const t = now - 6 * 3_600_000;
  if (h === 0) {
    return {
      ...mk(
        id,
        'swe',
        t,
        [
          ['open', 'swe', 5],
          ['in_progress', 'swe', 130],
          ['waiting_for_test', 'qa', 30],
          ['in_progress', 'swe', 25],
          ['waiting_for_test', 'qa', 20],
          ['owner_decision', 'cos', 12],
          ['waiting_for_merge', 'cto', 40]
        ],
        { qaFail: 1, rework: 1, reopen: 0, ownerReject: 0 }
      ),
      tokens: {
        input: 182000,
        output: 31000,
        cache: 1_400_000,
        confidence: 'high'
      }
    };
  }
  if (h === 1)
    return mk(
      id,
      'swe',
      now - 130 * MIN,
      [
        ['open', 'swe', 20],
        ['in_progress', 'swe', 110]
      ],
      { qaFail: 0 },
      true
    );
  return {
    id,
    kind: 'task',
    project: 'beads-lite',
    status: 'open',
    running: true,
    role: null,
    created: t,
    closed: null,
    wall_ms: null,
    active_ms: null,
    waiting_ms: null,
    buckets: {
      active: null,
      test: null,
      owner: null,
      merge: null,
      blocked: null,
      queue: null
    },
    intervals: [],
    quality: { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0 },
    labels: [],
    tokens: null
  };
}
