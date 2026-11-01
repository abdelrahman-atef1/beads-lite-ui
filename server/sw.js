/**
 * Serves /sw.js with the shell list and a content-hash version filled in.
 * Shell = static, token-free files only: css, the built bundle, icons, the
 * manifest. Never index.html (per-launch token), never /api, /ws or /att.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** @param {string} app_dir */
export function listShell(app_dir) {
  /** @type {string[]} */
  const urls = ['/styles.css', '/manifest.webmanifest'];
  for (const dir of ['css', 'icons']) {
    const abs = path.join(app_dir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (/\.(css|png)$/.test(f)) urls.push('/' + dir + '/' + f);
    }
  }
  // Only a built bundle is stable enough to precache (the dev bundle is no-store).
  if (fs.existsSync(path.join(app_dir, 'main.bundle.js'))) {
    urls.push('/main.bundle.js');
  }
  return urls.filter((u) => fs.existsSync(path.join(app_dir, u)));
}

/** @param {string} app_dir */
export function renderServiceWorker(app_dir) {
  const shell = listShell(app_dir);
  const h = createHash('sha256');
  for (const u of shell) {
    h.update(u).update(fs.readFileSync(path.join(app_dir, u)));
  }
  const src = fs.readFileSync(path.join(app_dir, 'sw.js'), 'utf8');
  return src
    .replace('__SW_VERSION__', () => h.digest('hex').slice(0, 16))
    .replace('__SW_SHELL__', () => JSON.stringify(shell));
}
