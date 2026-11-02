import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { createNotifier } from './notifier.js';

const CARDS = path.join(
  os.homedir(),
  'company',
  'scripts',
  'cards',
  'rules.mjs'
);
/** @type {any} */
let rules;
beforeAll(async () => {
  // The real card core: if it is missing the suite must fail, not skip.
  expect(existsSync(CARDS)).toBe(true);
  rules = await import(pathToFileURL(CARDS).href);
});

const card = (/** @type {any} */ extra = {}) => ({
  card_class: 'tap',
  card_back: 'swe',
  card_q: 'Ship it?',
  card_effect: 'It ships.',
  card_blocks: 'swe',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }]),
  card_title: 'Ship decision',
  ...extra
});
const bead = (
  /** @type {string} */ id,
  /** @type {any} */ meta,
  /** @type {any} */ o = {}
) => ({
  id,
  status: 'owner_decision',
  assignee: 'abdelrahman',
  created_by: 'cto',
  labels: [],
  metadata: meta,
  ...o
});

function rig(/** @type {any} */ over = {}) {
  const home = over.home || mkdtempSync(path.join(os.tmpdir(), 'notif-'));
  /** @type {Record<string, any[]>} */
  const parked = { alpha: [], beta: [] };
  const calls = {
    list: 0,
    closed: /** @type {string[]} */ ([]),
    opened: /** @type {string[]} */ ([])
  };
  /** @type {any[]} */
  const frames = [];
  /** @type {Map<string, () => void>} */
  const cbs = new Map();
  let t = Date.parse('2026-11-01T10:00:00Z');
  const n = createNotifier({
    rules,
    rescan_ms: 0,
    now: () => t,
    broadcast: (type, p) => frames.push({ type, p }),
    listProjects: () => [{ path: 'C:/p/alpha' }, { path: 'C:/p/Beta/' }],
    listParked: async (cwd) => {
      calls.list += 1;
      return parked[path.basename(cwd).toLowerCase()] || [];
    },
    readBeadLabels: async () => [],
    watch: (root, cb) => {
      calls.opened.push(root);
      cbs.set(root, cb);
      return { close: () => calls.closed.push(root) };
    },
    ...over,
    home
  });
  return {
    n,
    home,
    parked,
    calls,
    frames,
    cbs,
    tick: (/** @type {number} */ ms) => (t += ms)
  };
}
const settle = () => new Promise((r) => setTimeout(r, 30));
const json = (/** @type {string} */ f) => JSON.parse(readFileSync(f, 'utf8'));
const A = 'C:/p/alpha';

describe('notifier', () => {
  test('valid card -> one decision event; invalid card -> nothing; no repeat', async () => {
    const r = rig();
    r.parked.alpha = [
      bead('alpha-1', card()),
      bead('alpha-2', card({ card_q: 'no question mark' }))
    ];
    r.n.sync();
    await settle();
    const s = r.n.snapshot();
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({
      kind: 'decision',
      project: 'alpha',
      bead: 'alpha-1',
      title: 'Ship decision',
      desk: false,
      read: false
    });
    expect(s.unread).toBe(1);
    expect(r.frames.map((f) => f.type)).toEqual(['notify-event']);
    await r.n.scan('alpha', A);
    expect(r.n.snapshot().events).toHaveLength(1);
  });

  test('changed question notifies again; explained answer once per round', async () => {
    const r = rig();
    r.parked.alpha = [bead('alpha-1', card())];
    r.n.sync();
    await settle();
    const q2 = { card_q: 'Ship it later?' };
    r.parked.alpha = [bead('alpha-1', card(q2))];
    await r.n.scan('alpha', A);
    expect(r.n.snapshot().events.map((e) => e.kind)).toEqual([
      'decision',
      'decision'
    ]);
    const ex = (/** @type {number} */ round) =>
      bead(
        'alpha-1',
        card({ ...q2, card_state: 'explained', card_round: round })
      );
    r.parked.alpha = [ex(1)];
    await r.n.scan('alpha', A);
    await r.n.scan('alpha', A);
    const answers = () =>
      r.n.snapshot().events.filter((e) => e.kind === 'answer');
    expect(answers()).toHaveLength(1);
    r.parked.alpha = [ex(2)];
    await r.n.scan('alpha', A);
    expect(answers()).toHaveLength(2);
  });

  test('not the owner or not owner_decision: nothing', async () => {
    const r = rig();
    r.parked.alpha = [
      bead('alpha-1', card(), { assignee: 'swe' }),
      bead('alpha-2', card(), { status: 'open' })
    ];
    r.n.sync();
    await settle();
    expect(r.n.snapshot().events).toHaveLength(0);
  });

  test('W3: desk, sec, legal, declared-desk and unreadable-parent beads carry no title', async () => {
    const r = rig({
      readBeadLabels: async (
        /** @type {string} */ _c,
        /** @type {string} */ id
      ) => (id === 'alpha-9' ? null : [])
    });
    r.n.sync();
    await settle(); // first sight done (empty); now runtime single events
    const cases = [
      bead('alpha-1', card(), { labels: ['security'] }),
      bead('alpha-2', card(), { created_by: 'sec' }),
      bead('alpha-3', card({ card_class: 'desk', card_opts: undefined })),
      bead('alpha-9.1', card()),
      bead('alpha-6', card(), { labels: ['owner-pc-only'] }),
      bead('alpha-7', card(), { created_by: 'legal' })
    ];
    for (const b of cases) {
      r.parked.alpha = [b];
      await r.n.scan('alpha', A);
    }
    const ev = r.n.snapshot().events.filter((e) => e.kind === 'decision');
    expect(ev).toHaveLength(cases.length);
    for (const e of ev) expect(e).toMatchObject({ desk: true, title: null });
    // control: an ordinary bead does carry its title
    r.parked.alpha = [bead('alpha-8', card())];
    await r.n.scan('alpha', A);
    expect(r.n.snapshot().events[0]).toMatchObject({
      desk: false,
      title: 'Ship decision'
    });
  });

  test('title: bidi marks stripped, secret-looking title dropped', async () => {
    const r = rig();
    r.n.sync();
    await settle();
    r.parked.alpha = [bead('alpha-1', card({ card_title: 'ok\u202Etitle' }))];
    await r.n.scan('alpha', A);
    expect(r.n.snapshot().events[0].title).toBe('oktitle');
    r.parked.alpha = [
      bead('alpha-2', card({ card_title: 'key sk-abcdefghijklmnop1234' }))
    ];
    await r.n.scan('alpha', A);
    expect(r.n.snapshot().events[0].title).toBeNull();
  });

  test('per-project switch: off closes the watcher and stops events; default on; persisted', async () => {
    const r = rig();
    r.n.sync();
    await settle();
    expect(r.n.watching().sort()).toEqual(['alpha', 'beta']);
    const s = r.n.setProject({ project: 'beta', on: false });
    expect(s.projects).toEqual([
      { key: 'alpha', name: 'alpha', on: true },
      { key: 'beta', name: 'Beta', on: false }
    ]);
    expect(r.n.watching()).toEqual(['alpha']);
    expect(r.calls.closed).toEqual(['C:/p/Beta/']);
    r.parked.beta = [bead('beta-1', card())];
    await r.n.scan('beta', 'C:/p/Beta/');
    expect(r.n.snapshot().events).toHaveLength(0);
    expect(json(path.join(r.home, 'notify.json')).projects.beta.on).toBe(false);
    r.n.setProject({ project: 'beta', on: true });
    await settle();
    expect(r.n.watching().sort()).toEqual(['alpha', 'beta']);
    expect(r.n.snapshot().events).toHaveLength(1);
    expect(() => r.n.setProject({ project: '../x', on: true })).toThrow();
    expect(() => r.n.setProject({ project: 'alpha', on: 'yes' })).toThrow();
  });

  test('idle: no bd list between DB writes; a write triggers exactly one', async () => {
    const r = rig();
    r.n.sync();
    await settle();
    const before = r.calls.list;
    expect(before).toBe(2); // one initial scan per project
    await new Promise((x) => setTimeout(x, 150));
    expect(r.calls.list).toBe(before);
    /** @type {() => void} */ (r.cbs.get(A))();
    await settle();
    expect(r.calls.list).toBe(before + 1);
  });

  test('restart after downtime: one digest; known cards stay quiet', async () => {
    const r = rig();
    r.parked.alpha = [
      bead('alpha-1', card()),
      bead('alpha-2', card()),
      bead('alpha-3', card())
    ];
    r.n.sync();
    await settle();
    expect(r.n.snapshot().events.map((e) => [e.kind, e.count])).toEqual([
      ['digest', 3]
    ]);
    // new process on the same files: nothing new, nothing emitted
    const r2 = rig({ home: r.home });
    r2.parked.alpha = r.parked.alpha;
    r2.n.sync();
    await settle();
    expect(r2.frames).toHaveLength(0);
    // while down, two more were parked: exactly one digest
    const r3 = rig({ home: r.home });
    r3.parked.alpha = [
      ...r.parked.alpha,
      bead('alpha-4', card()),
      bead('alpha-5', card())
    ];
    r3.n.sync();
    await settle();
    expect(r3.frames).toHaveLength(1);
    expect(r3.frames[0].p.event).toMatchObject({ kind: 'digest', count: 2 });
  });

  test('spawn refusal stops that project watcher, one degraded event, no retry', async () => {
    let calls = 0;
    const r = rig({
      listParked: async (/** @type {string} */ cwd) => {
        if (path.basename(cwd) === 'alpha') {
          calls += 1;
          throw new Error('spawn EPERM');
        }
        return [];
      }
    });
    r.n.sync();
    await settle();
    expect(r.n.watching()).toEqual(['beta']);
    expect(r.n.snapshot().events).toMatchObject([
      { kind: 'degraded', project: 'alpha', bead: null }
    ]);
    r.n.sync();
    await settle();
    expect(calls).toBe(1);
  });

  test('mark-read, mute bounds, 30 day retention', async () => {
    const r = rig();
    r.parked.alpha = [bead('alpha-1', card())];
    r.n.sync();
    await settle();
    const id = r.n.snapshot().events[0].id;
    expect(r.n.markRead({ ids: [id] }).unread).toBe(0);
    expect(() => r.n.markRead({})).toThrow();
    const ok = new Date(
      Date.parse('2026-11-01T10:00:00Z') + 3600e3
    ).toISOString();
    expect(r.n.mute({ until: ok }).mute_until).toBe(ok);
    expect(() => r.n.mute({ until: '2027-01-01T00:00:00Z' })).toThrow();
    expect(r.n.mute({ until: null }).mute_until).toBeNull();
    r.tick(31 * 24 * 3600e3);
    expect(r.n.snapshot().events).toHaveLength(0);
  });

  test('every new event goes to onEvent (push) with the mute flag; a throwing sender never breaks the bell', async () => {
    /** @type {any[]} */
    const seen = [];
    const r = rig({
      onEvent: (/** @type {any} */ ev, /** @type {any} */ ctx) => {
        seen.push({ ev, ctx });
        throw new Error('push down');
      }
    });
    r.parked.alpha = [bead('alpha-1', card())];
    r.n.sync();
    await settle();
    expect(seen).toHaveLength(1);
    expect(seen[0].ev).toMatchObject({ kind: 'decision', bead: 'alpha-1' });
    expect(seen[0].ctx).toEqual({ muted: false });
    expect(r.n.snapshot().events).toHaveLength(1);
    r.n.mute({
      until: new Date(Date.parse('2026-11-01T10:00:00Z') + 3600e3).toISOString()
    });
    r.parked.alpha = [bead('alpha-2', card())];
    await r.n.scan('alpha', A);
    expect(seen[1].ctx).toEqual({ muted: true });
  });
});
