/**
 * Service worker: installability + app-shell precache (company-1bo5.6.16).
 *
 * The server serves this file from /sw.js with two placeholders filled in:
 * the version placeholder (a hash of the shell files, so the worker's bytes change on
 * every new build; the browser then installs the update) and the shell placeholder (the
 * list of static shell URLs).
 *
 * Rules:
 * - Only exact, precached shell URLs are ever answered from cache. Every other
 *   request (pages, /api, websocket, /att, anything with a token) gets no
 *   respondWith(), so the browser does its normal network request and nothing
 *   is stored.
 * - The page itself ("/") is never cached: it carries the per-launch token.
 * - New build: skipWaiting + clients.claim, old caches deleted on activate, so
 *   the owner is never stuck on an old shell.
 */
const VERSION = '__SW_VERSION__';
const SHELL = /** @type {string[]} */ (JSON.parse('__SW_SHELL__'));
const CACHE = 'board-shell-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          SHELL.map((u) =>
            fetch(u, { cache: 'reload' }).then((r) => {
              if (!r.ok) throw new Error('shell fetch ' + u + ' ' + r.status);
              return c.put(u, r);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search) return;
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(url.pathname))
      .then((hit) => hit || fetch(req))
  );
});
