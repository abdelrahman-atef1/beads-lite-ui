import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MIN_N, aggregate, flowStats } from './flow-stats.js';

const NOW = Date.UTC(2026, 10, 15, 12);
const D = 86_400_000;
let n = 0;
/** @param {any} o */
const bead = (o) => ({
  id: 'p-' + ++n,
  kind: 'task',
  project: 'p',
  status: 'closed',
  role: 'swe',
  closed: NOW - D,
  active_ms: 60_000,
  waiting_ms: 3000,
  buckets: {
    active: 1000,
    test: 2000,
    owner: 1000,
    merge: null,
    blocked: null,
    queue: null
  },
  quality: { qaFail: 0, reopen: 0, ownerReject: 0 },
  intervals: [],
  heavy: null,
  ...o
});

describe('Q1 weekly finished count ignores bulk closes', () => {
  test('zero-active weeks are not counted and do not move the median', () => {
    /** @type {Record<string, any>} */
    const beads = {};
    const many = (
      /** @type {number} */ k,
      /** @type {number} */ c,
      /** @type {any} */ o
    ) => {
      for (let i = 0; i < c; i++) {
        const b = bead({ closed: NOW - k * 7 * D - D, ...o });
        beads[b.id] = b;
      }
    };
    many(0, 4, { active_ms: 60_000 });
    many(0, 400, { active_ms: 0 }); // bulk this week
    many(1, 200, { active_ms: 120_000 });
    many(2, 500, { active_ms: 0 }); // bulk-only week counts 0
    many(3, 210, { active_ms: 90_000 });
    many(4, 5, { active_ms: 59_999 }); // just under: not counted
    many(5, 1, { active_ms: null }); // unknown: not counted
    const a = aggregate({ beads, built_at: 'x' }, null, 7, NOW);
    expect(a.weeks[7]).toBe(4);
    expect(a.weeks[6]).toBe(200);
    expect(a.weeks[5]).toBe(0);
    expect(a.weeks[4]).toBe(210);
    expect(a.weeks[3]).toBe(0);
    expect(a.weekTotal).toBe(414);
    expect(a.weekAvg).toBe(200); // median of the weeks with a counted close: [200, 210]
  });
});

describe('stats aggregate', () => {
  test('weeks, split, quality, unassigned, stuck', () => {
    /** @type {Record<string, any>} */
    const beads = {};
    const add = (/** @type {any} */ b) => (beads[b.id] = b);
    for (let i = 0; i < 9; i++)
      add(bead({ quality: { qaFail: i < 3 ? 1 : 0 } }));
    add(bead({ role: 'qa' })); // one qa: too few
    add(bead({ role: null }));
    add(bead({ kind: 'epic' })); // epics never count
    add(bead({ closed: NOW - 10 * D }));
    add(
      bead({
        status: 'owner_decision',
        closed: null,
        role: 'cos',
        intervals: [{ running: true, from: NOW - 3 * D, role: 'abdelrahman' }]
      })
    );
    const a = aggregate({ beads, built_at: 'x' }, null, 7, NOW);
    expect(a.weeks[7]).toBe(11);
    expect(a.weeks[6]).toBe(1);
    expect(a.counts.owner_decision).toBe(1);
    expect(a.stuck[0].ageMs).toBe(3 * D);
    expect(a.split.n).toBe(11);
    expect(a.split.biggest).toBe('test');
    const swe = /** @type {any} */ (
      a.quality.find((/** @type {any} */ q) => q.role === 'swe')
    );
    expect(swe.enough).toBe(true);
    expect(swe.rate).toBeCloseTo(3 / 9);
    expect(
      a.quality.find((/** @type {any} */ q) => q.role === 'qa')?.rate
    ).toBeNull();
    expect(a.unassigned).toBe(1);
    expect(MIN_N).toBe(8);
    expect(a.tokens.present).toBe(false); // no tokens file: unknown, never zero
    expect(a.machine.wakeMedMs).toBeNull();
  });

  test('tokens: known n of N, role split by calls, project from id prefix', () => {
    const b = bead({});
    const doc = { beads: { [b.id]: b }, projects: { 'my-proj': {} } };
    const tok = {
      days: 30,
      share: { shareOutput: 0.9 },
      beads: {
        [b.id]: {
          input: 10,
          output: 90,
          cache: 900,
          cost: 2,
          roles: { swe: 3, cto: 1 }
        },
        'my-9': { input: 1, output: 1, cache: 0, cost: 0, roles: { swe: 1 } }
      }
    };
    const a = aggregate(doc, tok, 7, NOW);
    expect(a.tokens.known).toBe(1);
    expect(a.tokens.of).toBe(1);
    expect(a.tokens.cacheHit).toBeCloseTo(900 / 910);
    expect(
      a.tokens.roles.find((/** @type {any} */ r) => r.role === 'swe').avg
    ).toBe(100);
    expect(
      a.tokens.projects.map((/** @type {any} */ p) => p.project).sort()
    ).toEqual(['my-proj', 'p']);
  });
});

describe('flow-stats handler', () => {
  /** @type {string} */
  let dir;
  const old = process.env.FLOW_HOME;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fstats-'));
    process.env.FLOW_HOME = dir;
  });
  afterEach(() => {
    process.env.FLOW_HOME = old;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no rollup file is the empty state, not an error', async () => {
    expect(await flowStats({ days: 7 })).toEqual({ present: false });
  });

  test('days are bounded and the answer is small', async () => {
    /** @type {Record<string, any>} */
    const beads = {};
    for (let i = 0; i < 300; i++) {
      const b = bead({});
      beads[b.id] = b;
    }
    fs.writeFileSync(
      path.join(dir, 'rollup.json'),
      JSON.stringify({ built_at: 'x', beads })
    );
    const r = await flowStats({ days: 100000 });
    expect(r.days).toBe(200);
    expect(JSON.stringify(r).length).toBeLessThan(6000);
  });

  test('project narrows every number; the project list stays whole; bad keys are ignored', async () => {
    /** @type {Record<string, any>} */
    const beads = {};
    for (const [proj, c] of [
      ['p', 3],
      ['q', 5]
    ]) {
      for (let i = 0; i < Number(c); i++) {
        const b = bead({ project: proj, id: proj + '-' + ++n });
        beads[b.id] = b;
      }
    }
    const blocked = bead({
      project: 'q',
      id: 'q-blk',
      status: 'blocked',
      closed: null
    });
    beads[blocked.id] = blocked;
    fs.writeFileSync(
      path.join(dir, 'rollup.json'),
      JSON.stringify({ built_at: 'x', beads })
    );
    const all = await flowStats({ days: 7 });
    const q = await flowStats({ days: 7, project: 'q' });
    const p = await flowStats({ days: 7, project: 'p' });
    expect(all.projects).toEqual(['p', 'q']);
    expect(q.projects).toEqual(['p', 'q']);
    expect(q.project).toBe('q');
    expect(q.counts.blocked).toBe(1);
    expect(p.counts.blocked).toBe(0);
    expect(all.counts.blocked).toBe(1);
    expect(q.split.n).toBe(5);
    expect(p.split.n).toBe(3);
    expect(all.split.n).toBe(8);
    // a key with path characters is not a project: same as no filter
    expect((await flowStats({ days: 7, project: '../x' })).split.n).toBe(8);
    expect((await flowStats({ days: 7, project: 'nope' })).split.n).toBe(0);
  });
});
