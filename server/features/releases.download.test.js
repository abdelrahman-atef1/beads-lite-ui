import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createReleases, resolveBuildFile } from './releases.js';

const APK = Buffer.alloc(64, 7);
const validator = {
  parseOutputComment(/** @type {string} */ text) {
    const m = /^OUTPUT v1 ([a-z]+)\n(\{.*\})$/.exec(text);
    if (!m) return null;
    const j = JSON.parse(m[2]);
    return { kind: m[1], refType: 'path', ...j };
  }
};
const build = (/** @type {string} */ ref, /** @type {string} */ label) =>
  'OUTPUT v1 build\n' + JSON.stringify({ ref, label });

describe('release download: only files named by a build record', () => {
  let tmp = '';
  let proj = '';
  let outside = '';
  /** @type {boolean} */
  let linked = false;

  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-rd-')));
    proj = path.join(tmp, 'alpha');
    outside = path.join(tmp, 'secret');
    for (const d of [
      path.join(proj, '.work', 'out', 'a-1'),
      path.join(proj, 'releases'),
      path.join(proj, 'docs'),
      path.join(proj, '.git'),
      path.join(proj, '.beads'),
      outside
    ]) {
      fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(proj, '.work', 'out', 'a-1', 'app.apk'), APK);
    fs.writeFileSync(path.join(proj, 'releases', 'setup.zip'), APK);
    fs.writeFileSync(path.join(proj, 'docs', 'other.apk'), APK);
    fs.writeFileSync(path.join(proj, '.git', 'x.apk'), APK);
    fs.writeFileSync(path.join(proj, 'releases', 'empty.apk'), '');
    fs.writeFileSync(path.join(proj, 'releases', 'notes.txt'), 'hi');
    fs.writeFileSync(path.join(outside, 'leak.apk'), APK);
    try {
      fs.symlinkSync(outside, path.join(proj, 'releases', 'esc'), 'junction');
      linked = true;
    } catch {
      // no symlink right: the symlink case is then reported as not exercised
    }
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const r = (/** @type {string} */ p, kind = 'build') => ({ kind, path: p });

  test('a build file inside .work/out or releases resolves', () => {
    const a = resolveBuildFile(proj, r('.work/out/a-1/app.apk'));
    expect(a).toMatchObject({
      state: 'ok',
      name: 'app.apk',
      size: 64,
      mime: 'application/vnd.android.package-archive'
    });
    expect(resolveBuildFile(proj, r('releases/setup.zip'))).toMatchObject({
      state: 'ok',
      mime: 'application/zip'
    });
  });

  test('refused: outside the release folders, bad names, wrong kind or type', () => {
    const none = { state: 'none' };
    expect(resolveBuildFile(proj, r('docs/other.apk'))).toEqual(none);
    expect(resolveBuildFile(proj, r('.git/x.apk'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases/../docs/other.apk'))).toEqual(
      none
    );
    expect(resolveBuildFile(proj, r(path.join(outside, 'leak.apk')))).toEqual(
      none
    );
    expect(resolveBuildFile(proj, r('//host/share/a.apk'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases\\setup.zip'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases/setup.zip:s'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases/notes.txt'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases/empty.apk'))).toEqual(none);
    expect(resolveBuildFile(proj, r('releases/setup.zip', 'deploy'))).toEqual(
      none
    );
    expect(resolveBuildFile(proj, { kind: 'build', path: null })).toEqual(none);
  });

  test('a record whose file is gone says missing, not a dead link', () => {
    expect(resolveBuildFile(proj, r('releases/gone.apk'))).toEqual({
      state: 'missing'
    });
  });

  test('a link out of the release folder is refused', (ctx) => {
    if (!linked) return ctx.skip();
    expect(resolveBuildFile(proj, r('releases/esc/leak.apk'))).toEqual({
      state: 'none'
    });
  });

  test('.beads/release-dirs adds a folder, only inside the project', () => {
    fs.writeFileSync(
      path.join(proj, '.beads', 'release-dirs'),
      'docs\n' + path.join(outside) + '\n../secret\n'
    );
    expect(resolveBuildFile(proj, r('docs/other.apk')).state).toBe('ok');
    expect(resolveBuildFile(proj, r(path.join(outside, 'leak.apk')))).toEqual({
      state: 'none'
    });
    fs.rmSync(path.join(proj, '.beads', 'release-dirs'));
    expect(resolveBuildFile(proj, r('docs/other.apk')).state).toBe('none');
  });

  /** Releases over the fake project: ids are `bead~commentId`. */
  function make() {
    const rows = [
      {
        id: 'a-1',
        title: 'T',
        status: 'open',
        comments: [
          {
            id: 'c1',
            author: 'swe',
            created_at: '2026-11-03T10:00:00Z',
            text: build('.work/out/a-1/app.apk', 'apk')
          },
          {
            id: 'c2',
            author: 'swe',
            created_at: '2026-11-04T10:00:00Z',
            text: build('releases/gone.apk', 'gone')
          },
          {
            id: 'c3',
            author: 'swe',
            created_at: '2026-11-05T10:00:00Z',
            text: build('docs/other.apk', 'outside')
          }
        ]
      },
      {
        id: 'a-2',
        title: 'D',
        status: 'open',
        labels: ['deploy'],
        comments: [
          {
            id: 'c9',
            author: 'swe',
            created_at: '2026-11-06T10:00:00Z',
            text: build('releases/setup.zip', 'desk build')
          }
        ]
      }
    ];
    return createReleases({
      listProjects: () => [{ path: proj }],
      exportIssues: async () =>
        rows.map((x) => JSON.stringify({ _type: 'issue', ...x })).join('\n'),
      git: async () => '',
      security: async () => ({ validator }),
      repos: () => [],
      watch: () => ({ close() {} })
    });
  }

  test('file(): needs a real record id; the client never names a path', async () => {
    const rl = make();
    const f = await rl.file({ project: 'alpha', id: 'a-1~c1' }, {});
    expect(f?.name).toBe('app.apk');
    expect(await rl.file({ project: 'alpha', id: 'a-1~c3' }, {})).toBeNull();
    expect(await rl.file({ project: 'alpha', id: 'a-1~c2' }, {})).toBeNull();
    for (const bad of [
      { project: 'alpha', id: '.work/out/a-1/app.apk' },
      { project: 'alpha', id: 'x'.repeat(200) },
      { project: '../alpha', id: 'a-1~c1' },
      { project: 'nope', id: 'a-1~c1' },
      { project: 'alpha' },
      {}
    ]) {
      expect(await rl.file(bad, {})).toBeNull();
    }
  });

  test('phone door: a release of a desk bead cannot be downloaded', async () => {
    const rl = make();
    expect(
      await rl.file({ project: 'alpha', id: 'a-2~c9' }, {})
    ).not.toBeNull();
    expect(
      await rl.file(
        { project: 'alpha', id: 'a-2~c9' },
        { ws: { door: 'phone' } }
      )
    ).toBeNull();
  });

  test('get() reports file state: ok with a name, missing, none', async () => {
    const rl = make();
    const list = await rl.list({}, {});
    const byLabel = (/** @type {string} */ l) =>
      list.releases.find((x) => x.label === l);
    const ok = await rl.get({ project: 'alpha', id: byLabel('apk').id }, {});
    expect(ok.file).toEqual({ state: 'ok', name: 'app.apk', size: 64 });
    const gone = await rl.get({ project: 'alpha', id: byLabel('gone').id }, {});
    expect(gone.file).toEqual({ state: 'missing' });
    const out = await rl.get(
      { project: 'alpha', id: byLabel('outside').id },
      {}
    );
    expect(out.file).toEqual({ state: 'none' });
  });
});
