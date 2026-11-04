import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../app.js';
import { registerWorkspace } from '../registry-watcher.js';
import { resolveLocalImage } from './local-img.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 1)
]);

describe('local-img: images named in beads (1bo5.6.28.2)', () => {
  let tmp = '';
  let proj = '';
  let outside = '';
  let server = /** @type {import('node:http').Server | null} */ (null);
  let port = 0;

  beforeAll(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-li-')));
    proj = path.join(tmp, 'alpha');
    outside = path.join(tmp, 'secret');
    fs.mkdirSync(path.join(proj, 'docs', 'qa'), { recursive: true });
    fs.mkdirSync(path.join(proj, '.work', 'out', 'a-1', 'qa', 'deep'), {
      recursive: true
    });
    fs.mkdirSync(path.join(proj, '.git'), { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(proj, 'docs', 'qa', 'shot.png'), PNG);
    fs.writeFileSync(
      path.join(proj, '.work', 'out', 'a-1', 'qa', 'deep', 'after.png'),
      PNG
    );
    fs.writeFileSync(path.join(proj, '.git', 'x.png'), PNG);
    fs.writeFileSync(
      path.join(proj, 'fake.png'),
      'this is not an image at all'
    );
    fs.writeFileSync(path.join(outside, 'leak.png'), PNG);
    try {
      fs.symlinkSync(outside, path.join(proj, 'link'), 'junction');
    } catch {
      // no symlink right: the symlink test is then skipped below
    }
    registerWorkspace({ path: proj, database: 'x' });
    server = createServer(
      createApp({
        host: '127.0.0.1',
        port: 0,
        app_dir: path.resolve(import.meta.dirname, '../../app'),
        root_dir: proj
      })
    );
    await new Promise((r) => server?.listen(0, '127.0.0.1', () => r(0)));
    port = /** @type {any} */ (server.address()).port;
  });

  afterAll(async () => {
    server?.closeAllConnections?.();
    await new Promise((r) => server?.close(() => r(0)));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('project-relative path, bare name (searched under the bead), abs path', () => {
    expect(resolveLocalImage('docs/qa/shot.png', 'a-1', proj)?.kind).toBe(
      'png'
    );
    expect(resolveLocalImage('after.png', 'a-1', proj)?.kind).toBe('png');
    const abs = path
      .join(proj, 'docs', 'qa', 'shot.png')
      .split(path.sep)
      .join('/');
    expect(resolveLocalImage(abs, '', '')?.kind).toBe('png');
  });

  test('path escape: ../, absolute outside, symlink, ~ are all refused', () => {
    expect(resolveLocalImage('../secret/leak.png', 'a-1', proj)).toBeNull();
    expect(
      resolveLocalImage('docs/../../secret/leak.png', '', proj)
    ).toBeNull();
    expect(
      resolveLocalImage(path.join(outside, 'leak.png'), '', proj)
    ).toBeNull();
    expect(resolveLocalImage('~/../../secret/leak.png', '', proj)).toBeNull();
    if (fs.existsSync(path.join(proj, 'link')))
      expect(resolveLocalImage('link/leak.png', '', proj)).toBeNull();
  });

  test('refuses non-images, wrong extension, .git, odd input, unregistered w', () => {
    expect(resolveLocalImage('fake.png', '', proj)).toBeNull(); // bytes not an image
    expect(resolveLocalImage('docs/qa/shot.svg', '', proj)).toBeNull();
    expect(resolveLocalImage('.git/x.png', '', proj)).toBeNull();
    expect(resolveLocalImage('a\0.png', '', proj)).toBeNull();
    expect(resolveLocalImage('x'.repeat(500) + '.png', '', proj)).toBeNull();
    // an unregistered w grants nothing: the file is only found via registered roots
    expect(resolveLocalImage('leak.png', 'a-1', outside)).toBeNull();
  });

  test('served on the door with image headers; 404 is uniform', async () => {
    const get = (/** @type {string} */ ref) =>
      fetch(
        `http://127.0.0.1:${port}/api/local-img?ref=${encodeURIComponent(ref)}&bead=a-1&w=${encodeURIComponent(proj)}`
      );
    const ok = await get('docs/qa/shot.png');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await ok.arrayBuffer()).length).toBe(PNG.length);
    const bad = await get('../secret/leak.png');
    const none = await get('nope.png');
    expect(bad.status).toBe(404);
    expect(none.status).toBe(404);
    expect(await bad.text()).toBe(await none.text());
  });
});
