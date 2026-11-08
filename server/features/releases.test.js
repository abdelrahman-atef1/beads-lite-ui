import { describe, expect, test } from 'vitest';
import { PAGE, beadPart, createReleases, releasesOf } from './releases.js';

/** Minimal stand-in for the shared validator. */
const validator = {
  parseOutputComment(/** @type {string} */ text) {
    const m = /^OUTPUT v1 ([a-z]+)\n(\{.*\})$/.exec(text);
    if (!m) return null;
    const j = JSON.parse(m[2]);
    return { kind: m[1], refType: 'url', ...j };
  }
};
const rec = (
  /** @type {string} */ kind,
  /** @type {string} */ label,
  /** @type {string} */ commit = ''
) =>
  `OUTPUT v1 ${kind}\n` +
  JSON.stringify({
    ref: 'https://example.dev/x',
    label,
    ...(commit ? { commit } : {})
  });
const C1 = 'a'.repeat(40);
const C2 = 'b'.repeat(40);

/** Export lines for the fake project. */
function exportText(/** @type {any[]} */ rows) {
  return rows.map((r) => JSON.stringify({ _type: 'issue', ...r })).join('\n');
}
const row = (/** @type {string} */ id, /** @type {any} */ o = {}) => ({
  id,
  title: 'Task ' + id,
  status: 'closed',
  closed_at: '2026-11-05T10:00:00Z',
  comments: [],
  ...o
});
const comment = (
  /** @type {string} */ id,
  /** @type {string} */ text,
  /** @type {string} */ at
) => ({ id, author: 'swe', text, created_at: at });

const ROWS = [
  row('p-1', {
    status: 'open',
    closed_at: null,
    comments: [
      comment('k1', rec('deploy', 'v1', C1), '2026-11-01T10:00:00Z'),
      comment('k2', 'a plain comment', '2026-11-02T10:00:00Z'),
      comment('k3', rec('deploy', 'v2', C2), '2026-11-03T10:00:00Z'),
      comment('k4', rec('doc', 'a doc', ''), '2026-11-04T10:00:00Z')
    ]
  }),
  row('p-1.1', { parent: 'p-1' }),
  row('p-1.2', { parent: 'p-1', status: 'open', closed_at: null }),
  row('p-2'),
  row('p-3', { status: 'open', closed_at: null }),
  row('p-9', {
    labels: ['deploy'],
    comments: [comment('k9', rec('build', 'apk', ''), '2026-11-02T12:00:00Z')]
  })
];

/** @param {any} [over] */
function make(over = {}) {
  /** @type {string[][]} */
  const gitCalls = [];
  let exports = 0;
  const rl = createReleases({
    listProjects: () => [{ path: 'C:/work/alpha' }, { path: 'C:/work/beta' }],
    exportIssues: async (cwd) => {
      exports += 1;
      if (cwd.endsWith('beta')) return null;
      return exportText(ROWS);
    },
    git: async (cwd, args) => {
      gitCalls.push([cwd, ...args]);
      return 'p-2 fix thing\nCo-Authored-By: x\nmerge p-3 and p-404\n';
    },
    security: async () => ({ validator }),
    repos: () => [],
    watch: () => ({ close() {} }),
    ...over
  });
  return { rl, gitCalls, exports: () => exports };
}

describe('releasesOf', () => {
  test('keeps only valid deploy/build records, newest first', () => {
    const snap = {
      rows: new Map(ROWS.map((r) => [r.id, r])),
      comments: new Map(ROWS.map((r) => [r.id, r.comments]))
    };
    const out = releasesOf(snap, validator, { key: 'alpha', name: 'alpha' });
    expect(out.map((r) => r.label)).toEqual(['v2', 'apk', 'v1']);
    expect(out[0]).toMatchObject({
      project: 'alpha',
      bead: 'p-1',
      kind: 'deploy',
      commit: C2,
      by: 'swe',
      href: 'https://example.dev/x'
    });
    expect(releasesOf(snap, null, { key: 'a', name: 'a' })).toEqual([]);
  });
});

describe('beadPart', () => {
  test('carrying bead plus closed descendants only', () => {
    const snap = {
      rows: new Map(ROWS.map((r) => [r.id, r])),
      kids: new Map([['p-1', [ROWS[1], ROWS[2]]]])
    };
    expect([...beadPart(snap, 'p-1').keys()]).toEqual(['p-1', 'p-1.1']);
  });
});

describe('releases-list', () => {
  test('lists across projects, skips the unreadable one, counts tasks', async () => {
    const { rl } = make();
    const res = await rl.list({}, {});
    expect(res.skipped).toEqual(['beta']);
    expect(res.total).toBe(3);
    expect(res.releases.map((r) => r.label)).toEqual(['v2', 'apk', 'v1']);
    expect(res.releases[0]).not.toHaveProperty('desk');
    // v2: bead p-1 + closed child p-1.1 + p-2 and p-3 named in the range v1..v2
    expect(res.releases[0].n_tasks).toBe(4);
    // build apk has no commit: bead part only
    expect(res.releases[1].n_tasks).toBe(1);
    // v1 has no previous release: bead part only (p-1 and p-1.1)
    expect(res.releases[2].n_tasks).toBe(2);
  });

  test('filters by project and kind; rejects bad input', async () => {
    const { rl } = make();
    expect((await rl.list({ kind: 'build' }, {})).releases).toHaveLength(1);
    expect((await rl.list({ project: 'beta' }, {})).releases).toHaveLength(0);
    for (const bad of [{ kind: 'doc' }, { project: '../x' }, { project: 5 }]) {
      await expect(rl.list(bad, {})).rejects.toMatchObject({
        code: 'bad_input'
      });
    }
  });

  test('phone door drops releases carried by a desk bead (label deploy)', async () => {
    const { rl } = make();
    const res = await rl.list({}, { ws: { door: 'phone' } });
    expect(res.releases.map((r) => r.label)).toEqual(['v2', 'v1']);
    expect(res.total).toBe(2);
  });

  test('a second open reads nothing again until the database changes', async () => {
    /** @type {() => void} */
    let fire = () => {};
    const { rl, exports } = make({
      watch: (/** @type {string} */ _r, /** @type {() => void} */ cb) => {
        fire = cb;
        return { close() {} };
      }
    });
    await rl.list({}, {});
    const first = exports();
    await rl.list({}, {});
    // beta is unreadable and never remembered; alpha is cached
    expect(exports() - first).toBe(1);
    fire();
    await rl.list({}, {});
    expect(exports() - first).toBe(2);
  });

  test('pages: 40 releases give a first page and has_more', async () => {
    const many = [
      row('p-1', {
        comments: Array.from({ length: 40 }, (_, i) =>
          comment(
            'k' + i,
            rec('deploy', 'r' + i, ''),
            new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString()
          )
        )
      })
    ];
    const { rl } = make({ exportIssues: async () => exportText(many) });
    const res = await rl.list({ project: 'alpha' }, {});
    expect(res.releases).toHaveLength(PAGE);
    expect(res.has_more).toBe(true);
    expect(res.total).toBe(40);
    const all = await rl.list({ project: 'alpha', more: 1 }, {});
    expect(all.releases).toHaveLength(40);
    expect(all.has_more).toBe(false);
  });
});

describe('releases-get', () => {
  test('tasks say how they were found; the git range starts at the previous release of the same kind', async () => {
    const { rl, gitCalls } = make();
    const list = await rl.list({}, {});
    const res = await rl.get({ project: 'alpha', id: list.releases[0].id }, {});
    expect(res.git_failed).toBe(false);
    expect(
      res.tasks.map((/** @type {any} */ t) => [t.id, t.via]).sort()
    ).toEqual([
      ['p-1', 'bead'],
      ['p-1.1', 'child'],
      ['p-2', 'commit'],
      ['p-3', 'commit']
    ]);
    expect(new Set(res.tasks.map((/** @type {any} */ t) => t.id)).size).toBe(
      res.tasks.length
    );
    expect(gitCalls[0]).toEqual([
      'C:/work/alpha',
      'log',
      '--format=%s',
      '-n2000',
      `${C1}..${C2}`
    ]);
  });

  test('a git failure drops only the commit part and says so', async () => {
    const { rl } = make({
      git: async () => {
        throw new Error('bad revision');
      }
    });
    const list = await rl.list({}, {});
    const res = await rl.get({ project: 'alpha', id: list.releases[0].id }, {});
    expect(res.git_failed).toBe(true);
    expect(res.tasks.map((/** @type {any} */ t) => t.id).sort()).toEqual([
      'p-1',
      'p-1.1'
    ]);
  });

  test('unknown project, id or unreadable project is a refusal, not a crash', async () => {
    const { rl } = make();
    const code = async (/** @type {any} */ p) =>
      rl.get(p, {}).catch((/** @type {any} */ e) => e.code);
    expect(await code({ project: 'nope', id: 'x' })).toBe('not_found');
    expect(await code({ project: 'alpha', id: 'x' })).toBe('not_found');
    expect(await code({ project: 'beta', id: 'x' })).toBe('unreadable');
    expect(await code({ project: 'alpha', id: 'x'.repeat(200) })).toBe(
      'bad_input'
    );
  });

  test('read-only: git is only ever asked for `log`', async () => {
    const { rl, gitCalls } = make();
    await rl.list({}, {});
    expect(gitCalls.length).toBeGreaterThan(0);
    for (const c of gitCalls) expect(c[1]).toBe('log');
  });
});
