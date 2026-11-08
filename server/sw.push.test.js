import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';

const src = fs
  .readFileSync(path.resolve(import.meta.dirname, '../app/sw.js'), 'utf8')
  .replace('__SW_VERSION__', 'v')
  .replace('__SW_SHELL__', '[]');

/** Run the real sw.js against a fake worker scope. */
function boot(lang = 'en') {
  /** @type {Record<string, Function>} */
  const handlers = {};
  /** @type {any[]} */
  const shown = [];
  /** @type {string[]} */
  const opened = [];
  /** @type {string[]} */
  const navigated = [];
  const state = { windows: /** @type {any[]} */ ([]) };
  const self = {
    navigator: { language: lang },
    location: { origin: 'https://pc.tail.ts.net' },
    addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => {
      handlers[t] = f;
    },
    registration: {
      showNotification: async (
        /** @type {string} */ t,
        /** @type {any} */ o
      ) => {
        shown.push({ t, o });
      }
    },
    clients: {
      matchAll: async () => state.windows,
      openWindow: async (/** @type {string} */ u) => {
        opened.push(u);
      }
    },
    skipWaiting: () => undefined
  };
  vm.runInNewContext(src, { self, caches: {}, fetch: () => {}, URL, JSON });
  const push = async (/** @type {any} */ payload) => {
    /** @type {any} */
    let p;
    handlers.push({
      data: { json: () => payload },
      waitUntil: (/** @type {any} */ x) => (p = x)
    });
    await p;
  };
  const click = async (/** @type {string} */ url) => {
    /** @type {any} */
    let p;
    handlers.notificationclick({
      notification: { close: () => undefined, data: { url } },
      waitUntil: (/** @type {any} */ x) => (p = x)
    });
    await p;
  };
  return { push, click, shown, opened, navigated, state };
}

describe('sw push', () => {
  test('release: words in the phone language, one tap target (the screen)', async () => {
    const s = boot();
    await s.push({
      kind: 'release',
      project: 'rayeh',
      bead: 'rayeh-1',
      title: 'Web v14',
      count: 1
    });
    expect(s.shown[0].o.body).toBe('Release shipped: Web v14');
    expect(s.shown[0].o.data.url).toBe('/#/releases');
    await s.push({
      kind: 'release',
      project: 'rayeh',
      bead: null,
      title: null,
      count: 4
    });
    expect(s.shown[1].o.body).toBe('4 releases shipped in rayeh');
    await s.push({
      kind: 'release',
      project: 'rayeh',
      bead: 'rayeh-1',
      title: null,
      count: 1
    });
    expect(s.shown[2].o.body).toBe('A release shipped in rayeh');
    const ar = boot('ar-EG');
    await ar.push({
      kind: 'release',
      project: 'rayeh',
      bead: 'rayeh-1',
      title: 'Web v14',
      count: 1
    });
    expect(ar.shown[0].o.body).toBe('تم نشر إصدار: Web v14');
  });

  test('decision: project as title, card_title in the body, tap target is the bead', async () => {
    const s = boot();
    await s.push({
      kind: 'decision',
      project: 'fatura',
      bead: 'fatura-1.2',
      title: 'Tax rounding',
      count: 1
    });
    expect(s.shown[0].t).toBe('fatura');
    expect(s.shown[0].o.body).toBe('Decision needed: Tax rounding');
    expect(s.shown[0].o.data.url).toBe('/#/issues?issue=fatura-1.2');
  });

  test('desk (title null): pointer only', async () => {
    const s = boot();
    await s.push({
      kind: 'decision',
      project: 'company',
      bead: 'company-9',
      title: null
    });
    expect(s.shown[0].o.body).toBe('A decision waits at the PC');
    await s.push({
      kind: 'answer',
      project: 'company',
      bead: 'company-9',
      title: null
    });
    expect(s.shown[1].o.body).toBe('An answer waits at the PC');
  });

  test('answer, digest, more; an Arabic phone gets Arabic', async () => {
    const s = boot('ar-EG');
    await s.push({
      kind: 'answer',
      project: 'rayeh',
      bead: 'rayeh-2',
      title: 'مزود'
    });
    expect(s.shown[0].o.body).toBe('رد على سؤالك: مزود');
    await s.push({ kind: 'digest', project: 'rayeh', bead: null, count: 3 });
    expect(s.shown[1].o.body).toBe('3 قرارات تنتظرك في rayeh');
    expect(s.shown[1].o.data.url).toBe('/#/decisions');
    const e = boot();
    await e.push({ kind: 'digest', project: 'rayeh', count: 3 });
    expect(e.shown[0].o.body).toBe('3 decisions waiting in rayeh');
    await e.push({ kind: 'more' });
    expect(e.shown[1].o.body).toBe('More on the board');
  });

  test('hostile or broken payload still shows something harmless', async () => {
    const s = boot();
    await s.push({
      kind: '__proto__',
      project: 5,
      bead: '"><img src=x>',
      title: 'x'.repeat(500)
    });
    expect(s.shown).toHaveLength(1);
    expect(s.shown[0].o.data.url).toBe('/#/decisions');
    await s.push(null);
    expect(s.shown).toHaveLength(2);
  });

  test('tap opens a window when the board is closed, focuses and navigates when open', async () => {
    const s = boot();
    await s.click('/#/issues?issue=a-1');
    expect(s.opened).toEqual(['https://pc.tail.ts.net/#/issues?issue=a-1']);
    s.state.windows = [
      {
        url: 'https://pc.tail.ts.net/#/decisions',
        focus: async () => s.navigated.push('focus'),
        navigate: async (/** @type {string} */ u) => s.navigated.push(u)
      }
    ];
    await s.click('/#/issues?issue=a-2');
    expect(s.navigated).toEqual([
      'focus',
      'https://pc.tail.ts.net/#/issues?issue=a-2'
    ]);
    expect(s.opened).toHaveLength(1);
  });
});
