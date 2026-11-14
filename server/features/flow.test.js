import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  flowDigest,
  flowRollup,
  pushWeeklyDigest,
  readDigest,
  readExps,
  slimExp
} from './flow.js';

const NOW = Date.now();
const doc = {
  built_at: '2026-11-14T10:00:00.000Z',
  heavy_recorded: false,
  beads: {
    a: {
      id: 'a',
      running: true,
      closed: null,
      role: 'swe',
      labels: ['x', 'exp:fast'],
      wake: { wakes: 1 }
    },
    b: {
      id: 'b',
      running: false,
      closed: NOW - 2 * 86_400_000,
      role: 'qa',
      labels: []
    },
    c: {
      id: 'c',
      running: false,
      closed: NOW - 90 * 86_400_000,
      role: 'qa',
      labels: []
    },
    d: {
      id: 'd',
      running: false,
      closed: NOW - 86_400_000,
      role: 'sre',
      labels: ['security']
    }
  }
};
let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  process.env.FLOW_HOME = dir;
});
afterEach(() => {
  delete process.env.FLOW_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('flow-rollup', () => {
  test('missing file is an empty state, not an error', () => {
    expect(flowRollup({})).toEqual({
      present: false,
      built_at: null,
      heavy_recorded: false,
      rows: []
    });
  });
  test('broken file is an empty state', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), '{nope');
    expect(flowRollup({}).present).toBe(false);
  });
  test('default window: running plus closed within 30 days; labels cut to exp:, no wake', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    const r = flowRollup({});
    expect(r.rows.map((x) => x.id).sort()).toEqual(['a', 'b', 'd']);
    const a = r.rows.find((x) => x.id === 'a');
    expect(a.labels).toEqual(['exp:fast']);
    expect(a.wake).toBeUndefined();
  });
  test('ids picks those beads; bad ids refused', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    expect(flowRollup({ ids: ['c'] }).rows.map((x) => x.id)).toEqual(['c']);
    expect(() => flowRollup({ ids: ['../x'] })).toThrow();
    expect(() => flowRollup({ ids: 'a' })).toThrow();
  });
  test('phone door leaves desk beads out', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    const r = flowRollup({}, { ws: { door: 'phone' } });
    expect(r.rows.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});

// ---- experiment view and weekly digest (beads-lite-1bo5.6.66.7) ----------------------------------

const HEAD = (/** @type {string} */ risks) =>
  [
    '# Flow review 2026-W46',
    '',
    'Title: Flow 2026-W46: at risk (n=2318 closed in 4 weeks)',
    'Done since last: nothing to report',
    'Next: cto - read the Flow review 2026-W46 task',
    'Needs you: nothing',
    'Risks: ' + risks,
    '',
    'Generated x',
    '## Where the time goes',
    'Risks: not-this-one'
  ].join('\n');

/** @param {string} slug @param {any} [over] */
const verdict = (slug, over = {}) => ({
  slug,
  exp: {
    slug,
    hypothesis: 'h',
    change: 'c',
    scope: { role: 'sre', kind: 'task' },
    start: 1,
    metric: 'active',
    target: 0.2,
    min_n: 10,
    max_weeks: 4
  },
  evaluated_at: '2026-11-14T20:00:00.000Z',
  n_treat: 12,
  n_base: 30,
  metric: 'active',
  median_treat: 1000,
  median_base: 5000,
  change: -0.8,
  guardrails: [
    {
      name: 'qaFail',
      known: true,
      base_rate: 0.1,
      treat_rate: 0.1,
      worse: false,
      held: true
    }
  ],
  verdict: 'ADOPT',
  reason: 'r',
  final: true,
  secret: 'drop-me',
  ...over
});

describe('flow-digest: experiments', () => {
  let ed = '';
  beforeEach(() => {
    ed = path.join(dir, 'exp');
    fs.mkdirSync(ed);
  });
  test('no folder or junk files: empty list, no throw', () => {
    fs.rmdirSync(ed);
    expect(readExps(ed)).toEqual([]);
    fs.mkdirSync(ed);
    fs.writeFileSync(path.join(ed, 'bad.json'), '{nope');
    fs.writeFileSync(path.join(ed, 'noslug.json'), '{"verdict":"ADOPT"}');
    fs.writeFileSync(path.join(ed, 'evil.json'), '{"slug":"../x"}');
    expect(readExps(ed)).toEqual([]);
  });
  test('keeps only known fields, running first then newest', () => {
    fs.writeFileSync(
      path.join(ed, 'a.json'),
      JSON.stringify(verdict('a-done'))
    );
    fs.writeFileSync(
      path.join(ed, 'b.json'),
      JSON.stringify(verdict('b-run', { final: false, verdict: 'EXTEND' }))
    );
    fs.writeFileSync(
      path.join(ed, 'c.json'),
      JSON.stringify(
        verdict('c-new', { evaluated_at: '2026-11-14T21:00:00.000Z' })
      )
    );
    const r = readExps(ed);
    expect(r.map((x) => x.slug)).toEqual(['b-run', 'c-new', 'a-done']);
    expect(JSON.stringify(r)).not.toContain('drop-me');
    expect(r[0].guardrails[0]).toMatchObject({ name: 'qaFail', held: true });
  });
  test('strings are bounded and non-numbers become null', () => {
    const x = slimExp(
      verdict('big', { reason: 'x'.repeat(5000), n_treat: 'many', change: NaN })
    );
    expect(x?.reason.length).toBe(500);
    expect(x?.n_treat).toBeNull();
    expect(x?.change).toBeNull();
  });
  test('more than 20 files: 20 rows', () => {
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(
        path.join(ed, `e${i}.json`),
        JSON.stringify(verdict('e' + i))
      );
    }
    expect(readExps(ed)).toHaveLength(20);
  });
});

describe('flow-digest: weekly file', () => {
  /** @param {string} name @param {string} text */
  const put = (name, text) => {
    fs.mkdirSync(path.join(dir, 'wk'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'wk', name), text);
  };
  test('newest week wins; five lines as written; first match only', () => {
    put('2026-W45.md', HEAD('old'));
    put('2026-W46.md', HEAD('swe bug: slower'));
    put('notes.md', 'x');
    const d = readDigest(path.join(dir, 'wk'));
    expect(d?.week).toBe('2026-W46');
    expect(d?.lines).toEqual([
      'Title: Flow 2026-W46: at risk (n=2318 closed in 4 weeks)',
      'Done since last: nothing to report',
      'Next: cto - read the Flow review 2026-W46 task',
      'Needs you: nothing',
      'Risks: swe bug: slower'
    ]);
    expect(d?.findings).toBe(true);
  });
  test('Risks none = no findings; no file or no Title = null', () => {
    put('2026-W46.md', HEAD('none'));
    expect(readDigest(path.join(dir, 'wk'))?.findings).toBe(false);
    expect(readDigest(path.join(dir, 'nope'))).toBeNull();
    put('2026-W47.md', 'no head here');
    expect(readDigest(path.join(dir, 'wk'))).toBeNull();
  });
  test('flowDigest reads both folders; nothing there is not an error', () => {
    process.env.FLOW_DIGEST_DIR = path.join(dir, 'wk');
    try {
      expect(flowDigest()).toEqual({ digest: null, exps: [] });
      put('2026-W46.md', HEAD('a'));
      fs.mkdirSync(path.join(dir, 'exp'));
      fs.writeFileSync(
        path.join(dir, 'exp', 'a.json'),
        JSON.stringify(verdict('a'))
      );
      const r = flowDigest();
      expect(r.digest?.lines).toHaveLength(5);
      expect(r.exps).toHaveLength(1);
    } finally {
      delete process.env.FLOW_DIGEST_DIR;
    }
  });
});

describe('weekly push', () => {
  const wk = () => path.join(dir, 'wk');
  const state = () => path.join(dir, 'board', 'flow-push.json');
  /** @param {string} name @param {string} risks */
  const put = (name, risks) => {
    fs.mkdirSync(wk(), { recursive: true });
    fs.writeFileSync(path.join(wk(), name), HEAD(risks));
  };
  const fake = (/** @type {string} */ answer = 'sent') => {
    /** @type {any[]} */
    const calls = [];
    return {
      calls,
      send: async (/** @type {any} */ ev, /** @type {any} */ ctx) => {
        calls.push({ ev, ctx });
        return answer;
      }
    };
  };
  const base = () => ({ dir: wk(), state: state(), muted: false });

  test('findings: one push, then never again for the same file', async () => {
    put('2026-W46.md', 'swe bug: slower');
    const p = fake();
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('sent');
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('already');
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].ev).toMatchObject({
      kind: 'flow',
      project: 'flow',
      bead: null,
      title: null
    });
    // no digest text leaves in the payload
    expect(JSON.stringify(p.calls[0].ev)).not.toContain('swe bug');
  });
  test('no findings: nothing is sent, and the file is not retried', async () => {
    put('2026-W46.md', 'none');
    const p = fake();
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('no-findings');
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('already');
    expect(p.calls).toHaveLength(0);
  });
  test('a second weekly file inside 6 days is skipped (one a week)', async () => {
    put('2026-W46.md', 'a');
    const p = fake();
    await pushWeeklyDigest({ ...base(), push: p });
    put('2026-W47.md', 'b');
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('week-cap');
    expect(p.calls).toHaveLength(1);
    // a week later the next file goes
    put('2026-W48.md', 'c');
    const later = Date.now() + 7 * 86_400_000;
    fs.utimesSync(path.join(wk(), '2026-W48.md'), later / 1000, later / 1000);
    expect(await pushWeeklyDigest({ ...base(), push: p, now: later })).toBe(
      'sent'
    );
  });
  test('the sender refuses (no subscriber, muted, capped): not marked, retried later', async () => {
    put('2026-W46.md', 'a');
    for (const answer of ['no-subscriber', 'muted', 'capped', 'none']) {
      const p = fake(answer);
      expect(await pushWeeklyDigest({ ...base(), push: p })).toBe(answer);
    }
    expect(fs.existsSync(state())).toBe(false);
    const p = fake();
    expect(await pushWeeklyDigest({ ...base(), push: p })).toBe('sent');
  });
  test('the owner mute is passed to the sender', async () => {
    put('2026-W46.md', 'a');
    const p = fake('muted');
    await pushWeeklyDigest({ ...base(), muted: true, push: p });
    expect(p.calls[0].ctx).toEqual({ muted: true });
  });
  test('a file older than 8 days, or a sender that throws: nothing sent, no throw', async () => {
    put('2026-W46.md', 'a');
    const p = fake();
    const far = Date.now() + 9 * 86_400_000;
    expect(await pushWeeklyDigest({ ...base(), push: p, now: far })).toBe(
      'stale'
    );
    expect(p.calls).toHaveLength(0);
    const boom = {
      send: async () => {
        throw new Error('x');
      }
    };
    expect(await pushWeeklyDigest({ ...base(), push: boom })).toBe('error');
  });
  test('two triggers at once send once', async () => {
    put('2026-W46.md', 'a');
    const p = fake();
    const [a, b] = await Promise.all([
      pushWeeklyDigest({ ...base(), push: p }),
      pushWeeklyDigest({ ...base(), push: p })
    ]);
    expect([a, b]).toEqual(['sent', 'sent']);
    expect(p.calls).toHaveLength(1);
  });
});
