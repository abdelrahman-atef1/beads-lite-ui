import { describe, expect, test } from 'vitest';
import { createDecisionsFeed } from './decisions-feed.js';

// Minimal stand-in for the card core: valid = card_q + at least one option.
const rules = {
  parseCard(/** @type {any} */ bead) {
    const m = bead.metadata || {};
    let opts = [];
    try {
      opts = JSON.parse(m.card_opts || '[]');
    } catch {
      opts = [];
    }
    const ok = !!m.card_q && opts.length > 0 && m.card_class !== 'desk';
    return {
      ok,
      card: {
        q: m.card_q || '',
        effect: m.card_effect || '',
        show: '',
        blocks: '',
        title: '',
        titleAr: '',
        opts: opts.map((/** @type {any} */ o) => ({ l: o.l, note: '' }))
      }
    };
  },
  scanText: (/** @type {string} */ s) =>
    /sk-[a-z0-9]{8,}/.test(s) ? ['key'] : []
};

const card = (/** @type {any} */ extra = {}) => ({
  card_class: 'tap',
  card_back: 'swe',
  card_q: 'Ship it?',
  card_effect: 'It ships.',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }]),
  ...extra
});
const bead = (
  /** @type {string} */ id,
  /** @type {any} */ metadata,
  /** @type {any} */ o = {}
) => ({
  id,
  title: 'T ' + id,
  status: 'owner_decision',
  assignee: 'abdelrahman',
  priority: 2,
  updated_at: '2026-11-01T10:00:00Z',
  labels: [],
  metadata,
  ...o
});

/** Two fixture workspaces: alpha and beta. */
function rig(/** @type {any} */ over = {}) {
  /** @type {Record<string, any[]>} */
  const parked = {
    '/w/alpha': [
      bead('alpha-1', card(), { priority: 2 }),
      bead('alpha-2', card({ card_q: '' })), // no valid card
      bead('alpha-3', card({ card_class: 'desk' })) // desk: never listed
    ],
    '/w/beta': [
      bead('beta-1', card(), { priority: 0 }),
      bead('beta-2', card({ card_effect: 'key sk-abcdefgh12345' }), {
        title: 'leak sk-abcdefgh12345'
      })
    ]
  };
  const calls = {
    list: /** @type {string[]} */ ([]),
    bd: /** @type {Array<{ args: string[], cwd: string, stdin?: string }>} */ ([])
  };
  /** @type {Map<string, () => void>} */
  const cbs = new Map();
  /** @type {any[]} */
  const frames = [];
  let projects = [{ path: '/w/alpha' }, { path: '/w/beta' }];
  const feed = createDecisionsFeed({
    listProjects: () => projects,
    listParked: async (cwd) => {
      calls.list.push(cwd);
      return parked[cwd] || [];
    },
    rules,
    watch: (root, cb) => {
      cbs.set(root, cb);
      return { close: () => cbs.delete(root) };
    },
    broadcast: (type, payload) => frames.push({ type, payload }),
    ...over
  });
  return {
    feed,
    parked,
    calls,
    cbs,
    frames,
    setProjects: (/** @type {any[]} */ p) => (projects = p)
  };
}

describe('decisions-feed steps', () => {
  const stepsC = (/** @type {string} */ id, /** @type {string} */ text) => ({
    id,
    author: 'swe',
    created_at: '2026-11-13T10:00:00Z',
    text
  });
  const good = stepsC('aabbccdd-0001', 'STEPS: Install the build\n## Steps\n1. Open it\n2. Tap install\n## Why\nx');
  const lab = (/** @type {any} */ b, /** @type {any[]} */ comments) => ({ bead: { ...b, labels: ['owner-steps'] }, comments });

  test('a marked bead shows as kind steps with its comment id and step count', async () => {
    const r = rig({
      listSteps: async (/** @type {string} */ cwd) =>
        cwd === '/w/alpha' ? [lab(bead('alpha-7', {}, { status: 'in_progress' }), [good])] : []
    });
    const snap = await r.feed.list();
    const s = snap.items.find((i) => i.id === 'alpha-7');
    expect(s?.kind).toBe('steps');
    expect(s?.steps).toEqual({ comment: 'c-aabbccdd', title: 'Install the build', n: 2, at: '2026-11-13T10:00:00Z' });
    expect(snap.items.find((i) => i.id === 'alpha-1')?.kind).toBe('decision');
  });
  test('a bead with a card AND steps stays one decision item carrying steps', async () => {
    const r = rig({
      listSteps: async (/** @type {string} */ cwd) =>
        cwd === '/w/alpha' ? [lab(bead('alpha-1', card()), [good])] : []
    });
    const items = (await r.feed.list()).items.filter((i) => i.id === 'alpha-1');
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe('decision');
    expect(items[0].steps?.comment).toBe('c-aabbccdd');
  });
  test('closed bead, done record, no Steps section and a secret in the title are never listed', async () => {
    const done = stepsC('ffee0011-1', 'x');
    done.author = 'owner-board';
    done.text = 'OWNER STEPS DONE via board (pc)';
    const r = rig({
      listSteps: async (/** @type {string} */ cwd) =>
        cwd === '/w/alpha'
          ? [
              lab(bead('a-closed', {}, { status: 'closed' }), [good]),
              lab(bead('a-done', {}, { status: 'open' }), [good, done]),
              lab(bead('a-nosec', {}, { status: 'open' }), [stepsC('aabbccdd-9', 'STEPS: no section')]),
              lab(bead('a-leak', {}, { status: 'open' }), [stepsC('aabbccdd-8', 'STEPS: key sk-abcdefgh12345\n## Steps\n1. x')])
            ]
          : []
    });
    const ids = (await r.feed.list()).items.map((i) => i.id);
    for (const x of ['a-closed', 'a-done', 'a-nosec', 'a-leak']) expect(ids).not.toContain(x);
  });
  test('a failing steps lookup does not hide the decisions', async () => {
    const r = rig({ listSteps: async () => { throw new Error('boom'); } });
    expect((await r.feed.list()).items.map((i) => i.id)).toEqual(['beta-1', 'alpha-1']);
  });
});

describe('decisions-feed', () => {
  test('lists valid cards from both projects, priority first, with project', async () => {
    const r = rig();
    const snap = await r.feed.list();
    expect(snap.items.map((i) => i.id)).toEqual(['beta-1', 'alpha-1']);
    expect(snap.items[0].project).toEqual({ key: 'beta', name: 'beta' });
    expect(snap.projects).toEqual([
      { key: 'alpha', name: 'alpha', count: 1 },
      { key: 'beta', name: 'beta', count: 1 }
    ]);
    expect(snap.rules_ok).toBe(true);
  });

  test('invalid card, desk card and a card that trips the secret scan are never listed', async () => {
    const r = rig();
    const ids = (await r.feed.list()).items.map((i) => i.id);
    expect(ids).not.toContain('alpha-2');
    expect(ids).not.toContain('alpha-3');
    expect(ids).not.toContain('beta-2');
  });

  test('only card_* metadata leaves the server', async () => {
    const r = rig();
    r.parked['/w/alpha'][0].metadata.secret_note = 'x';
    const snap = await r.feed.list();
    const a = snap.items.find((i) => i.id === 'alpha-1');
    expect(a?.metadata.secret_note).toBeUndefined();
    expect(a?.metadata.card_q).toBe('Ship it?');
  });

  test('cached: a second list spawns no bd; idle costs nothing', async () => {
    const r = rig();
    await r.feed.list();
    expect(r.calls.list).toEqual(['/w/alpha', '/w/beta']);
    await r.feed.list();
    expect(r.calls.list.length).toBe(2);
  });

  test('a change in one project rescans only that project and pushes once', async () => {
    const r = rig();
    await r.feed.list();
    r.parked['/w/alpha'].push(bead('alpha-9', card(), { priority: 1 }));
    r.cbs.get('/w/alpha')?.();
    await new Promise((res) => setTimeout(res, 20));
    expect(r.calls.list.filter((c) => c === '/w/alpha').length).toBe(2);
    expect(r.calls.list.filter((c) => c === '/w/beta').length).toBe(1);
    expect(r.frames.length).toBe(1);
    expect(r.frames[0].type).toBe('decisions-all');
    expect(
      r.frames[0].payload.items.map((/** @type {any} */ i) => i.id)
    ).toEqual(['beta-1', 'alpha-9', 'alpha-1']);
    // same data again: no second push
    r.cbs.get('/w/alpha')?.();
    await new Promise((res) => setTimeout(res, 20));
    expect(r.frames.length).toBe(1);
  });

  test('cold start: a 2nd list during the first scan waits for it (F1)', async () => {
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise((res) => (release = () => res(undefined)));
    const r = rig({
      listParked: async (/** @type {string} */ cwd) => {
        await gate;
        return cwd === '/w/alpha' ? [bead('alpha-1', card())] : [];
      }
    });
    const first = r.feed.list();
    const second = r.feed.list();
    let done = false;
    void second.then(() => (done = true));
    await new Promise((res) => setTimeout(res, 20));
    expect(done).toBe(false); // used to return items: [] at once
    release();
    expect((await second).items.map((i) => i.id)).toEqual(['alpha-1']);
    expect((await first).items.length).toBe(1);
  });

  test('a workspace whose scan never works is not in the dropdown (F3)', async () => {
    const r = rig({
      listParked: async (/** @type {string} */ cwd) => {
        if (cwd === '/w/beta') throw new Error('no db');
        return [bead('alpha-1', card())];
      }
    });
    const snap = await r.feed.list();
    expect(snap.projects.map((p) => p.key)).toEqual(['alpha']);
  });

  test('a failing project keeps its last list and does not hide the others', async () => {
    let fail = false;
    const r = rig({
      listParked: async (/** @type {string} */ cwd) => {
        if (fail && cwd === '/w/beta') throw new Error('boom');
        return cwd === '/w/alpha'
          ? [bead('alpha-1', card())]
          : [bead('beta-1', card())];
      }
    });
    await r.feed.list();
    fail = true;
    r.cbs.get('/w/beta')?.();
    await new Promise((res) => setTimeout(res, 20));
    expect((await r.feed.list()).items.map((i) => i.id).sort()).toEqual([
      'alpha-1',
      'beta-1'
    ]);
  });

  test('a project that leaves the registry is dropped and its watcher closed', async () => {
    const r = rig();
    await r.feed.list();
    r.setProjects([{ path: '/w/alpha' }]);
    const snap = await r.feed.list();
    expect(snap.items.map((i) => i.id)).toEqual(['alpha-1']);
    expect(r.cbs.has('/w/beta')).toBe(false);
  });

  test('missing card rules: nothing listed, rules_ok false', async () => {
    const r = rig({ rules: null });
    const snap = await r.feed.list();
    expect(snap.items).toEqual([]);
    expect(snap.rules_ok).toBe(false);
  });
});
