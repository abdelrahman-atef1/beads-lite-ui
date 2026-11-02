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

/*
 * Web Push (ADR 0007 N3). The payload is JSON with no free text:
 * { kind, project, bead, title, count, at }. The words are built here, in the
 * phone's language. title is null for a desk bead: pointer only.
 */
const MSG = {
  en: {
    decision: (p) =>
      p.title ? 'Decision needed: ' + p.title : 'A decision waits at the PC',
    answer: (p) =>
      p.title
        ? 'Answer to your question: ' + p.title
        : 'An answer waits at the PC',
    digest: (p) => p.count + ' decisions waiting in ' + p.project,
    more: () => 'More on the board'
  },
  ar: {
    decision: (p) =>
      p.title ? 'قرار مطلوب: ' + p.title : 'قرار ينتظرك على الكمبيوتر',
    answer: (p) =>
      p.title ? 'رد على سؤالك: ' + p.title : 'رد ينتظرك على الكمبيوتر',
    digest: (p) => p.count + ' قرارات تنتظرك في ' + p.project,
    more: () => 'المزيد على اللوحة'
  }
};
const BEAD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[0-9]+)*$/i;

/** @param {any} p parsed payload (untrusted) */
function describePush(p) {
  if (!p || typeof p !== 'object') p = {};
  const lang = /^ar/i.test((self.navigator && self.navigator.language) || '')
    ? 'ar'
    : 'en';
  const kind = Object.hasOwn(MSG[lang], p.kind) ? p.kind : 'more';
  const project = typeof p.project === 'string' ? p.project.slice(0, 40) : '';
  const title = typeof p.title === 'string' ? p.title.slice(0, 80) : null;
  const count = Number(p.count) || 0;
  const bead =
    typeof p.bead === 'string' && BEAD_ID.test(p.bead) ? p.bead : null;
  const body = MSG[lang][kind]({ project, title, count });
  return {
    title: project || 'Board',
    options: {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: bead ? 'bead-' + bead + '-' + kind : 'board-' + kind + '-' + project,
      data: {
        url: bead
          ? '/#/issues?issue=' + encodeURIComponent(bead)
          : '/#/decisions'
      }
    }
  };
}

self.addEventListener('push', (event) => {
  /** @type {any} */
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = {};
  }
  const n = describePush(p);
  // A browser requires every push to show something (userVisibleOnly).
  event.waitUntil(self.registration.showNotification(n.title, n.options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((all) => {
        const open = all.find(
          (c) => new URL(c.url).origin === self.location.origin
        );
        if (open) {
          // Focus first (needs the tap's activation), then a hash-only navigate:
          // same page, the board router reacts, no reload.
          return open
            .focus()
            .then(() => open.navigate(target))
            .catch(() => self.clients.openWindow(target));
        }
        return self.clients.openWindow(target);
      })
  );
});
