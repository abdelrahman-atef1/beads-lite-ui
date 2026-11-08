import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  codeRepos,
  commitUrl,
  createGitIndex,
  createOutputs,
  idsInSubject,
  parseGitLog
} from './outputs.js';

const VALIDATE = path.join(
  process.env.OUTPUTS_DIR || path.join(os.homedir(), 'company/scripts/outputs'),
  'validate.mjs'
);
const haveValidator = fs.existsSync(VALIDATE);
if (!haveValidator) {
  console.warn(
    'outputs.test: shared validator not found, record tests NOT exercised'
  );
}
const SHA = 'a'.repeat(40);
const SECRET = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outputsunit-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** @param {string[]} args */
function git(args, cwd = dir) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
}
function initRepo() {
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.t']);
  git(['config', 'user.name', 'T']);
  git(['config', 'commit.gpgsign', 'false']);
}
/** @param {string} msg */
function commit(msg) {
  fs.writeFileSync(path.join(dir, 'f.txt'), String(Math.random()));
  git(['add', '.']);
  git(['commit', '-q', '-m', msg]);
  return git(['rev-parse', 'HEAD']).trim();
}
/** Real git, counting calls. */
function countingGit() {
  /** @type {string[][]} */
  const calls = [];
  const fn = (
    /** @type {string} */ cwd,
    /** @type {string[]} */ args,
    input = ''
  ) => {
    calls.push(args);
    try {
      return Promise.resolve(
        execFileSync('git', args, {
          cwd,
          input: input || undefined,
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
    } catch (e) {
      return Promise.reject(e);
    }
  };
  return { fn, calls };
}

describe('O4 commitUrl', () => {
  test('built from a parsed github remote, userinfo stripped', () => {
    const want = 'https://github.com/o/r/commit/' + SHA;
    expect(commitUrl('https://github.com/o/r.git', SHA)).toBe(want);
    expect(commitUrl('https://tok3n@github.com/o/r.git', SHA)).toBe(want);
    expect(commitUrl('https://user:pw@github.com/o/r', SHA)).toBe(want);
    expect(commitUrl('git@github.com:o/r.git', SHA)).toBe(want);
    expect(commitUrl('ssh://git@github.com/o/r.git', SHA)).toBe(want);
  });
  test('other hosts, odd forms and bad shas give no link', () => {
    expect(commitUrl('https://evil.example/o/r', SHA)).toBe('');
    expect(commitUrl('https://github.com.evil.example/o/r', SHA)).toBe('');
    expect(commitUrl('file:///c/repo', SHA)).toBe('');
    expect(commitUrl('C:\\repo', SHA)).toBe('');
    expect(commitUrl('https://github.com/o/r/extra', SHA)).toBe('');
    expect(commitUrl('https://github.com/o/r', 'zz')).toBe('');
    expect(commitUrl('', SHA)).toBe('');
  });
  test('the raw remote never appears in the output', () => {
    expect(commitUrl('https://sekret@github.com/o/r', SHA)).not.toContain(
      'sekret'
    );
  });
});

describe('subjects and log parsing', () => {
  test('several ids, trailing punctuation, lower-case', () => {
    expect(
      idsInSubject('Fix (Company-1bo5.6.13), also beads-lite-1bo5.6.18. Done')
    ).toEqual(['company-1bo5.6.13', 'beads-lite-1bo5.6.18']);
    expect(idsInSubject('no id here')).toEqual([]);
  });
  test('parseGitLog skips malformed records', () => {
    const rec = [SHA, '100', 'me', 'refs/heads/main', 'subj (x-1)'].join(
      '\x1f'
    );
    expect(parseGitLog(rec + '\x1e\nbroken\x1e')).toHaveLength(1);
  });
});

describe('git index (real repo)', { timeout: 30000 }, () => {
  test('landed flag, branch, remote; unchanged refs run one for-each-ref', async () => {
    initRepo();
    git(['remote', 'add', 'origin', 'https://tok@github.com/o/r.git']);
    const a = commit('first (x-1)');
    git(['checkout', '-q', '-b', 'feat']);
    const b = commit('on branch (x-2)');
    const g = countingGit();
    const idx = createGitIndex({ git: g.fn });
    const r1 = await idx.read(dir);
    expect(r1.byId.get('x-1')[0].sha).toBe(a);
    expect(r1.landed.has(a)).toBe(true);
    expect(r1.landed.has(b)).toBe(false);
    expect(r1.byId.get('x-2')[0].ref).toBe('refs/heads/feat');
    expect(r1.remote).toContain('github.com');
    const before = g.calls.length;
    await idx.read(dir);
    expect(g.calls.slice(before).map((c) => c[0])).toEqual(['for-each-ref']);
  });

  test('a new commit is read incrementally, old tips are excluded', async () => {
    initRepo();
    commit('one (x-1)');
    const g = countingGit();
    const idx = createGitIndex({ git: g.fn });
    await idx.read(dir);
    const c2 = commit('two (x-1)');
    const before = g.calls.length;
    const r = await idx.read(dir);
    const logs = g.calls.slice(before).filter((c) => c[0] === 'log');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('--stdin');
    expect(r.byId.get('x-1').map((/** @type {any} */ c) => c.sha)).toContain(
      c2
    );
    expect(r.byId.get('x-1')).toHaveLength(2);
    expect(r.landed.has(c2)).toBe(true);
  });
});

function rig(/** @type {any} */ over = {}) {
  const calls = { bd: /** @type {string[][]} */ ([]), change: () => {} };
  /** @type {Record<string, any>} */
  const rows = {
    'tc-1': {
      id: 'tc-1',
      title: 'Story',
      status: 'open',
      comment_count: 0,
      updated_at: 'u1',
      metadata: {}
    },
    'tc-1.1': {
      id: 'tc-1.1',
      title: 'A',
      status: 'open',
      comment_count: 3,
      updated_at: 'u2',
      metadata: {
        attachments: ['rayeh/2026-11/0123456789abcdef.png', '../../etc/passwd']
      }
    },
    'tc-1.2': {
      id: 'tc-1.2',
      title: 'Sec fix',
      status: 'open',
      comment_count: 1,
      updated_at: 'u3',
      metadata: {},
      labels: ['security']
    }
  };
  /** @type {Record<string, string[]>} */
  const kids = { 'tc-1': ['tc-1.1', 'tc-1.2'] };
  /** @type {Record<string, any[]>} */
  const comments = {
    'tc-1.1': [
      {
        author: 'swe',
        created_at: '2026-11-01T10:00:00Z',
        text: 'OUTPUT v1 deploy\n{"ref":"https://rayeh.example/app","label":"Web 14"}'
      },
      {
        author: 'x',
        created_at: '2026-11-01T11:00:00Z',
        text: 'OUTPUT v1 evil\n{"ref":"https://a.example","label":"nope"}'
      },
      {
        author: 'swe',
        created_at: '2026-11-01T12:00:00Z',
        text: 'See https://rayeh.example/app and https://claude.ai/artifact/abc, also javascript:alert(1) and http://evil.example/x and https://claude.ai/artifact/abc.'
      }
    ],
    'tc-1.2': [
      {
        author: 'sec',
        created_at: '2026-11-01T12:00:00Z',
        text: 'https://secret-fix.example/idor'
      }
    ]
  };
  const bdJson = async (/** @type {string[]} */ args) => {
    calls.bd.push(args);
    if (args[0] === 'show') return { code: 0, stdoutJson: [rows[args[1]]] };
    if (args[0] === 'comments') {
      return { code: 0, stdoutJson: comments[args[1]] || [] };
    }
    if (args[0] === 'list' && args[1] === '--parent') {
      return {
        code: 0,
        stdoutJson: (kids[args[2]] || []).map((i) => rows[i])
      };
    }
    if (args[0] === 'list') {
      return { code: 0, stdoutJson: Object.values(rows) };
    }
    return { code: 1 };
  };
  const gitFake = async (
    /** @type {string} */ _cwd,
    /** @type {string[]} */ a
  ) => {
    if (a[0] === 'for-each-ref') return `${SHA} refs/heads/main\n`;
    if (a[0] === 'config') return 'https://tok@github.com/o/r.git';
    if (a[0] === 'log') {
      return [
        [SHA, '1700000000', 'swe', 'refs/heads/main', 'Add panel (tc-1.1)'],
        [
          SHA.replace(/a/g, 'b'),
          '1700000100',
          'sec',
          'refs/heads/main',
          'fix IDOR in api (tc-1.2)'
        ],
        [
          SHA.replace(/a/g, 'c'),
          '1700000200',
          'swe',
          'refs/heads/main',
          'leak ' + SECRET + ' (tc-1.1)'
        ]
      ]
        .map((r) => r.join('\x1f') + '\x1e')
        .join('\n');
    }
    if (a[0] === 'rev-list') return `${SHA}\n`;
    return '';
  };
  const out = createOutputs({
    listProjects: () => [{ path: dir }],
    runBdJson: /** @type {any} */ (bdJson),
    git: gitFake,
    watch: (_root, cb) => {
      calls.change = cb;
      return { close() {} };
    },
    ...over
  });
  return { out, calls };
}

const pc = () => ({ ws: { door: 'pc' }, root_dir: dir });
const phone = () => ({ ws: { door: 'phone' }, root_dir: dir });
const bySrc = (/** @type {any} */ r, /** @type {string} */ s) =>
  r.items.filter((/** @type {any} */ i) => i.src === s);

describe('outputs-get rollup', () => {
  test.skipIf(!haveValidator)(
    'story rolls up children: records, mentions, attachments, commits',
    async () => {
      const { out } = rig();
      const r = await out.get({ id: 'tc-1' }, pc());
      expect(bySrc(r, 'record')).toHaveLength(1);
      expect(bySrc(r, 'record')[0].href).toBe('https://rayeh.example/app');
      // a record with an unknown kind is a plain comment: no record, no link
      expect(r.items.some((/** @type {any} */ i) => i.label === 'nope')).toBe(
        false
      );
      const men = bySrc(r, 'mention').map((/** @type {any} */ i) => i.href);
      expect(men).toContain('https://claude.ai/artifact/abc');
      expect(
        men.filter(
          (/** @type {string} */ h) => h === 'https://claude.ai/artifact/abc'
        )
      ).toHaveLength(1);
      expect(men).not.toContain('https://rayeh.example/app');
      expect(men.join(' ')).not.toMatch(/javascript|evil/);
      expect(
        bySrc(r, 'attachment').map((/** @type {any} */ i) => i.att)
      ).toEqual(['rayeh/2026-11/0123456789abcdef.png']);
      const cm = bySrc(r, 'commit');
      const add = cm.find(
        (/** @type {any} */ c) => c.label === 'Add panel (tc-1.1)'
      );
      expect(add.landed).toBe(true);
      expect(add.remote).toBe('https://github.com/o/r/commit/' + SHA);
      expect(JSON.stringify(r)).not.toContain('tok@');
      expect(JSON.stringify(r)).not.toContain(SECRET);
      expect(cm.some((/** @type {any} */ c) => c.label === 'cccccccc')).toBe(
        true
      );
    }
  );

  test.skipIf(!haveValidator)(
    'O3 the phone door drops a desk child, the PC door keeps it',
    async () => {
      const { out } = rig();
      const onPc = await out.get({ id: 'tc-1' }, pc());
      expect(JSON.stringify(onPc)).toContain('IDOR');
      const onPhone = await out.get({ id: 'tc-1' }, phone());
      const txt = JSON.stringify(onPhone);
      expect(txt).not.toContain('IDOR');
      expect(txt).not.toContain('secret-fix');
      expect(onPhone.beads.map((/** @type {any} */ b) => b.id)).not.toContain(
        'tc-1.2'
      );
      expect(txt).toContain('Add panel');
    }
  );

  test('O1 no validator: no records and no mentioned links (fail closed)', async () => {
    const { out } = rig({
      security: async () => ({ validator: null, scan: () => [] })
    });
    const r = await out.get({ id: 'tc-1' }, pc());
    expect(r.degraded).toBe(true);
    expect(bySrc(r, 'record')).toHaveLength(0);
    expect(bySrc(r, 'mention')).toHaveLength(0);
    expect(bySrc(r, 'commit').length).toBeGreaterThan(0);
  });

  test.skipIf(!haveValidator)(
    'reopen with no db change spawns no bd; a change does',
    async () => {
      const { out, calls } = rig();
      await out.get({ id: 'tc-1' }, pc());
      const first = calls.bd.length;
      expect(first).toBeGreaterThan(0);
      await out.get({ id: 'tc-1' }, pc());
      await out.get({ id: 'tc-1', more: 0 }, phone());
      expect(calls.bd.length).toBe(first);
      calls.change();
      await out.get({ id: 'tc-1' }, pc());
      expect(calls.bd.length).toBeGreaterThan(first);
    }
  );

  test('rollup is capped at 50 beads and offers more', async () => {
    const mk = (/** @type {string} */ id) => ({
      id,
      title: 't',
      status: 'open',
      comment_count: 0,
      updated_at: 'u',
      metadata: {}
    });
    const many = Array.from({ length: 70 }, (_, i) => mk(`tc-1.${i + 10}`));
    const bdJson = async (/** @type {string[]} */ a) => {
      if (a[0] === 'show') return { code: 0, stdoutJson: [mk('tc-1')] };
      if (a[1] === '--parent') {
        return { code: 0, stdoutJson: a[2] === 'tc-1' ? many : [] };
      }
      return { code: 0, stdoutJson: [] };
    };
    const out = createOutputs({
      listProjects: () => [{ path: dir }],
      runBdJson: /** @type {any} */ (bdJson),
      git: async () => '',
      security: async () => ({ validator: null, scan: () => [] }),
      watch: () => ({ close() {} })
    });
    const p1 = await out.get({ id: 'tc-1' }, pc());
    expect(p1.beads).toHaveLength(50);
    expect(p1.has_more).toBe(true);
    const p2 = await out.get({ id: 'tc-1', more: 1 }, pc());
    expect(p2.beads).toHaveLength(71);
    expect(p2.has_more).toBe(false);
  });

  test('bad input is refused with a code, no text', async () => {
    const { out } = rig();
    await expect(out.get({ id: '../x' }, pc())).rejects.toMatchObject({
      code: 'bad_input'
    });
    await expect(
      out.get({ id: 'tc-1' }, { ws: {}, root_dir: '' })
    ).rejects.toMatchObject({ code: 'no_project' });
  });

  test.skipIf(!haveValidator)('project view lists newest first', async () => {
    const { out } = rig();
    const r = await out.project({}, pc());
    expect(r.root).toBe(null);
    const at = r.items.map((/** @type {any} */ i) => i.at);
    expect([...at].sort((a, b) => b - a)).toEqual(at);
    expect(r.items.length).toBeGreaterThan(3);
  });
});

describe('git index drops rewritten history (beads-lite-1bo5.6.51)', () => {
  const subjects = (/** @type {any} */ r, /** @type {string} */ id) =>
    (r.byId.get(id) || []).map((/** @type {any} */ c) => c.subject);

  test('amend: the old subject goes, the new one stays', async () => {
    initRepo();
    commit('base (x-0)');
    commit('old words (x-1)');
    const idx = createGitIndex({ git: countingGit().fn });
    expect(subjects(await idx.read(dir), 'x-1')).toEqual(['old words (x-1)']);
    git(['commit', '-q', '--amend', '-m', 'new words (x-1)']);
    expect(subjects(await idx.read(dir), 'x-1')).toEqual(['new words (x-1)']);
  });

  test('a deleted branch takes its commits with it; landed ones stay', async () => {
    initRepo();
    commit('base (x-0)');
    git(['checkout', '-q', '-b', 'feat']);
    commit('only on feat (x-2)');
    git(['checkout', '-q', 'main']);
    const idx = createGitIndex({ git: countingGit().fn });
    expect(subjects(await idx.read(dir), 'x-2')).toHaveLength(1);
    git(['branch', '-q', '-D', 'feat']);
    const r = await idx.read(dir);
    expect(subjects(r, 'x-2')).toEqual([]);
    expect(subjects(r, 'x-0')).toEqual(['base (x-0)']);
  });

  test('a fast-forward is not a rewrite: no full rescan', async () => {
    initRepo();
    commit('one (x-1)');
    const g = countingGit();
    const idx = createGitIndex({ git: g.fn });
    await idx.read(dir);
    commit('two (x-1)');
    const before = g.calls.length;
    const r = await idx.read(dir);
    expect(subjects(r, 'x-1')).toHaveLength(2);
    const logs = g.calls.slice(before).filter((c) => c[0] === 'log');
    // incremental: the old tip is still excluded
    expect(logs[0].some((a) => a.includes('--stdin'))).toBe(true);
    expect(r.commits.size).toBe(2);
  });
});

describe('one export instead of one bd call per bead', () => {
  const lines = [
    { id: 'tc-1', title: 'Story', status: 'open', comment_count: 0 },
    {
      id: 'tc-1.1',
      title: 'A',
      status: 'open',
      comment_count: 1,
      dependencies: [{ type: 'parent-child', depends_on_id: 'tc-1' }],
      comments: [
        { author: 'swe', created_at: '2026-11-01T10:00:00Z', text: 'hi' }
      ]
    },
    {
      id: 'tc-1.1.1',
      title: 'B',
      status: 'closed',
      comment_count: 0,
      parent: 'tc-1.1'
    }
  ];

  test('a 3-level rollup runs zero per-bead bd calls', async () => {
    const { out, calls } = rig({
      exportIssues: async () =>
        lines.map((l) => JSON.stringify({ _type: 'issue', ...l })).join('\n'),
      security: async () => ({ validator: null, scan: () => [] })
    });
    const r = await out.get({ id: 'tc-1' }, pc());
    expect(r.beads.map((/** @type {any} */ b) => b.id)).toEqual([
      'tc-1',
      'tc-1.1',
      'tc-1.1.1'
    ]);
    expect(calls.bd).toEqual([]);
  });

  test('a failed export falls back to the per-bead path', async () => {
    const { out, calls } = rig({
      exportIssues: async () => null,
      security: async () => ({ validator: null, scan: () => [] })
    });
    const r = await out.get({ id: 'tc-1' }, pc());
    expect(r.beads.length).toBe(3);
    expect(calls.bd.length).toBeGreaterThan(0);
  });
});

describe('failed export and failed comments (1bo5.6.51.1)', () => {
  test('a failed export is tried once for a 3-level rollup, not once per node', async () => {
    let exports = 0;
    const { out } = rig({
      exportIssues: async () => {
        exports += 1;
        return null;
      },
      security: async () => ({ validator: null, scan: () => [] })
    });
    await out.get({ id: 'tc-1' }, pc());
    expect(exports).toBe(1);
  });

  test('beads whose comments cannot be read are counted, not silently dropped', async () => {
    const { out } = rig({
      exportIssues: async () => null,
      runBdJson: async (/** @type {string[]} */ a) =>
        a[0] === 'show'
          ? {
              code: 0,
              stdoutJson: [
                {
                  id: 'tc-1.1',
                  title: 'A',
                  status: 'open',
                  comment_count: 2,
                  updated_at: 'u',
                  metadata: {}
                }
              ]
            }
          : { code: 1 },
      security: async () => ({ validator: null, scan: () => [] })
    });
    const r = await out.get({ id: 'tc-1.1', rollup: false }, pc());
    expect(r.skipped).toBe(1);
  });
});

describe('code repos of a project (.beads/code-repos)', () => {
  test('commits of a listed repo show with its name; bad lines are ignored', async () => {
    const code = fs.mkdtempSync(path.join(os.tmpdir(), 'outputscode-'));
    try {
      git(['init', '-q', '-b', 'main'], code);
      git(['config', 'user.email', 't@t.t'], code);
      git(['config', 'user.name', 'T'], code);
      git(['config', 'commit.gpgsign', 'false'], code);
      fs.writeFileSync(path.join(code, 'f'), '1');
      git(['add', '.'], code);
      git(['commit', '-q', '-m', 'ui change (tc-1.1)'], code);
      fs.mkdirSync(path.join(dir, '.beads'));
      fs.writeFileSync(
        path.join(dir, '.beads', 'code-repos'),
        ['# code', code, '../does-not-exist', ''].join('\n')
      );
      expect(codeRepos(dir)).toEqual([path.resolve(code)]);
      const { out } = rig({
        git: undefined,
        security: async () => ({ validator: null, scan: () => [] })
      });
      const r = await out.get({ id: 'tc-1.1', rollup: false }, pc());
      const c = r.items.filter((/** @type {any} */ i) => i.src === 'commit');
      expect(c).toHaveLength(1);
      expect(c[0].repo).toBe(path.basename(code));
      expect(c[0].label).toBe('ui change (tc-1.1)');
    } finally {
      fs.rmSync(code, { recursive: true, force: true });
    }
  });

  test('no file means no extra repos', () => {
    expect(codeRepos(dir)).toEqual([]);
  });
});
