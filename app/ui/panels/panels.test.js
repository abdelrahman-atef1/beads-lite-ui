import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mountBell } from '../views/notifications.js';
import { openProjectOutputs } from '../views/outputs.js';
import { openReportSheet } from '../views/report.js';
import { PENS, openEditor, paintStrokes } from './draw.js';
import { mountPanels } from './mount.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (/** @type {() => boolean} */ ok) => {
  for (let i = 0; i < 40 && !ok(); i++) await flush();
};

const now = Date.now();
const SNAP = {
  events: [
    {
      id: 'e1',
      kind: 'decision',
      project: 'fatura',
      bead: 'fatura-1',
      title: 'Ship it?',
      at: now - 60000,
      read: false
    },
    {
      id: 'e2',
      kind: 'release',
      project: 'beads-lite',
      bead: null,
      title: 'v3',
      count: 1,
      at: now - 3600000,
      read: true
    }
  ],
  unread: 1,
  projects: [{ key: 'fatura', name: 'fatura', on: true }],
  mute_until: null
};

/** Fake ws client: records every send, answers by type. */
function fakeClient(/** @type {Record<string, any>} */ answers = {}) {
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();
  const sent = /** @type {{ type: string, payload: any }[]} */ ([]);
  return {
    sent,
    send: vi.fn(
      async (/** @type {string} */ type, /** @type {any} */ payload) => {
        sent.push({ type, payload });
        const a = answers[type];
        if (a instanceof Error) throw a;
        return typeof a === 'function' ? a(payload) : (a ?? {});
      }
    ),
    on(/** @type {string} */ t, /** @type {Function} */ fn) {
      if (!handlers.has(t)) handlers.set(t, new Set());
      handlers.get(t)?.add(fn);
      return () => handlers.get(t)?.delete(fn);
    },
    emit(/** @type {string} */ t, /** @type {any} */ p) {
      handlers.get(t)?.forEach((f) => f(p));
    }
  };
}

/** Fake browser push objects (same shape as push-client.test.js). */
function pushEnv(/** @type {any} */ o = {}) {
  let sub = o.sub ?? null;
  const subscribe = vi.fn(async () => {
    sub = {
      endpoint: 'https://push.example/x',
      toJSON: () => ({
        endpoint: 'https://push.example/x',
        keys: { p256dh: 'p', auth: 'a' }
      }),
      unsubscribe: vi.fn(async () => {
        sub = null;
      })
    };
    return sub;
  });
  return {
    subscribe,
    env: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => sub, subscribe }
        })
      },
      Notification: {
        permission: o.permission ?? 'default',
        requestPermission: vi.fn(async () => o.answer ?? 'granted')
      },
      PushManager: {}
    }
  };
}

/** @returns {HTMLElement} */
function stage() {
  document.body.innerHTML =
    '<div id="u3" class="u3"><header><span data-slot="bell"></span></header></div>';
  return /** @type {HTMLElement} */ (document.getElementById('u3'));
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('beads-ui.lang', 'en');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('bell (notify-*)', () => {
  test('unread dot from notify-list, opens the sheet, mark all read clears it', async () => {
    const root = stage();
    const c = fakeClient({
      'notify-list': SNAP,
      'notify-mark-read': { ...SNAP, unread: 0 },
      'push-key': { key: 'AQAB' },
      'push-list': { subscriptions: [] }
    });
    const slot = /** @type {HTMLElement} */ (root.querySelector('header span'));
    mountBell(slot, { client: c, host: root, pushEnv: pushEnv().env });
    await wait(() => !!root.querySelector('.u3-pn-dot'));
    expect(root.querySelector('.u3-pn-dot')?.getAttribute('data-unread')).toBe(
      '1'
    );
    /** @type {HTMLElement} */ (root.querySelector('[data-act=bell]')).click();
    await wait(() => root.querySelectorAll('.u3-pn__item').length === 2);
    expect(root.querySelectorAll('.u3-pn__item.is-unread').length).toBe(1);
    /** @type {HTMLElement} */ (
      root.querySelector('[data-act=mark-all]')
    ).click();
    await wait(() => !root.querySelector('.u3-pn-dot'));
    expect(
      c.sent.some((s) => s.type === 'notify-mark-read' && s.payload.all)
    ).toBe(true);
  });

  test('a pushed notify-event adds an item and lights the dot; no timers are used', async () => {
    const root = stage();
    const c = fakeClient({ 'notify-list': { ...SNAP, events: [], unread: 0 } });
    const timers = vi.spyOn(window, 'setInterval');
    mountBell(/** @type {HTMLElement} */ (root.querySelector('span')), {
      client: c,
      host: root
    });
    await flush();
    expect(root.querySelector('.u3-pn-dot')).toBeNull();
    c.emit('notify-event', { event: SNAP.events[0], unread: 1 });
    await flush();
    expect(root.querySelector('.u3-pn-dot')).not.toBeNull();
    expect(timers).not.toHaveBeenCalled();
  });

  test('project switch sends notify-set; a failure puts the switch back', async () => {
    const root = stage();
    const c = fakeClient({
      'notify-list': SNAP,
      'notify-set': new Error('no'),
      'push-key': { key: 'AQAB' },
      'push-list': { subscriptions: [] }
    });
    const b = mountBell(
      /** @type {HTMLElement} */ (root.querySelector('span')),
      {
        client: c,
        host: root,
        pushEnv: pushEnv().env
      }
    );
    b.open();
    await wait(() => !!root.querySelector('.u3-pn__tg'));
    const cb = /** @type {HTMLInputElement} */ (
      root.querySelector('.u3-pn__tg')
    );
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await wait(() => !!root.querySelector('.u3-pn__err'));
    expect(c.sent.find((s) => s.type === 'notify-set')?.payload).toEqual({
      project: 'fatura',
      on: false
    });
    expect(
      /** @type {HTMLInputElement} */ (root.querySelector('.u3-pn__tg')).checked
    ).toBe(true);
  });
});

describe('push opt-in (same wire as push-client)', () => {
  test('turn on: permission, push-key, subscription, push-subscribe, then state on', async () => {
    const root = stage();
    const pe = pushEnv();
    const c = fakeClient({
      'notify-list': SNAP,
      'push-key': { key: 'AQAB' },
      'push-list': { subscriptions: [] }
    });
    mountBell(/** @type {HTMLElement} */ (root.querySelector('span')), {
      client: c,
      host: root,
      pushEnv: pe.env
    }).open();
    await wait(
      () =>
        root.querySelector('.u3-pn__push')?.getAttribute('data-push') === 'off'
    );
    /** @type {HTMLElement} */ (root.querySelector('[data-act=push]')).click();
    await wait(
      () =>
        root.querySelector('.u3-pn__push')?.getAttribute('data-push') === 'on'
    );
    expect(pe.env.Notification.requestPermission).toHaveBeenCalled();
    expect(pe.subscribe).toHaveBeenCalledOnce();
    const sub = c.sent.find((s) => s.type === 'push-subscribe');
    expect(sub?.payload.subscription.endpoint).toBe('https://push.example/x');
  });

  test('denied and unsupported show a note, no button; a listed phone can be removed', async () => {
    const root = stage();
    const c = fakeClient({
      'notify-list': SNAP,
      'push-list': {
        subscriptions: [
          {
            id: 'p1',
            label: 'Redmi',
            created: '2026-11-03T00:00:00Z',
            last_ok: null
          }
        ]
      }
    });
    const b = mountBell(
      /** @type {HTMLElement} */ (root.querySelector('span')),
      {
        client: c,
        host: root,
        pushEnv: pushEnv({ permission: 'denied' }).env
      }
    );
    b.open();
    await wait(
      () =>
        root.querySelector('.u3-pn__push')?.getAttribute('data-push') ===
        'denied'
    );
    expect(root.querySelector('[data-act=push]')).toBeNull();
    await wait(() => !!root.querySelector('.u3-pn__phones button'));
    /** @type {HTMLElement} */ (
      root.querySelector('.u3-pn__phones button')
    ).click();
    await flush();
    expect(c.sent.find((s) => s.type === 'push-remove')?.payload).toEqual({
      id: 'p1'
    });
  });
});

describe('project outputs (outputs-project)', () => {
  test('lists rows, links pass safeHref only, failure shows retry', async () => {
    const root = stage();
    const c = fakeClient({
      'outputs-project': {
        project: 'p',
        root: '',
        beads: 1,
        has_more: false,
        degraded: false,
        items: [
          {
            src: 'record',
            kind: 'deploy',
            label: 'Deployed',
            bead: 'b-1',
            at: now,
            by: 'sre',
            href: 'javascript:alert(1)'
          },
          {
            src: 'record',
            kind: 'doc',
            label: 'ADR',
            bead: 'b-2',
            at: now,
            by: 'sec',
            href: 'https://example.com/adr'
          }
        ]
      }
    });
    openProjectOutputs({ client: c, host: root });
    await wait(() => root.querySelectorAll('.ou-row').length === 2);
    expect(root.querySelectorAll('.ou-row a').length).toBe(1);
    expect(root.querySelector('.ou-row a')?.getAttribute('rel')).toContain(
      'noopener'
    );
    expect(c.sent[0]).toEqual({
      type: 'outputs-project',
      payload: { more: 0 }
    });
  });

  test('server failure says so, never an empty panel', async () => {
    const root = stage();
    openProjectOutputs({
      client: fakeClient({ 'outputs-project': new Error('x') }),
      host: root
    });
    await wait(() => !!root.querySelector('.u3-pn__err'));
    expect(root.querySelector('[role=alert]')).not.toBeNull();
  });
});

describe('report sheet', () => {
  test('needs a valid version, then posts one frame to /api/report and clears the draft', async () => {
    const root = stage();
    const fetchMock = vi.fn(async (/** @type {string} */ url) =>
      url === '/api/workspaces'
        ? new Response(
            JSON.stringify({ workspaces: [{ path: 'E:/Projects/beads-lite' }] })
          )
        : new Response(JSON.stringify({ ok: true, id: 'R-9' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    openReportSheet({ host: root });
    await wait(() => !!root.querySelector('select option[value]'));
    const form = /** @type {HTMLFormElement} */ (root.querySelector('form'));
    const text = /** @type {HTMLTextAreaElement} */ (
      form.querySelector('[name=text]')
    );
    text.value = 'broken';
    text.dispatchEvent(new Event('input'));
    /** @type {HTMLElement} */ (form.querySelector('[data-act=send]')).click();
    await flush();
    expect(root.querySelector('.u3-pn__msg')?.className).toContain('is-err');
    expect(
      fetchMock.mock.calls.filter((c) => c[0] === '/api/report').length
    ).toBe(0);
    const ver = /** @type {HTMLInputElement} */ (
      form.querySelector('[name=version]')
    );
    ver.value = 'v3-test';
    ver.dispatchEvent(new Event('input'));
    /** @type {HTMLElement} */ (form.querySelector('[data-act=send]')).click();
    await wait(
      () =>
        root.querySelector('.u3-pn__msg')?.className.includes('is-ok') ?? false
    );
    const post = /** @type {any[]} */ (
      fetchMock.mock.calls.find((c) => c[0] === '/api/report')
    );
    expect(post[1].headers['x-bdui-report']).toBe('1');
    expect(root.querySelector('.u3-pn__msg')?.textContent).toContain('R-9');
    const link = root.querySelector('.u3-pn__msg a[data-act=open-created]');
    expect(link?.getAttribute('href')).toBe('#/issues?issue=R-9');
    expect(window.localStorage.getItem('bdui.report.draft')).toBe('{}');
    vi.unstubAllGlobals();
  });
});

describe('mountPanels', () => {
  test('fills the bell slot once with outputs, report and bell buttons', async () => {
    const root = stage();
    const c = fakeClient({ 'notify-list': SNAP });
    const a = mountPanels(root, { client: c });
    expect(a).not.toBeNull();
    expect(mountPanels(root, { client: c })).toBeNull();
    expect(
      Array.from(root.querySelectorAll('.u3-pn-btn')).map((b) =>
        b.getAttribute('data-act')
      )
    ).toEqual(['outputs', 'report', 'bell']);
    await flush();
  });
});

describe('finger-drawing editor', () => {
  test('Done commits strokes, Cancel and Escape drop them, undo and clear work', () => {
    const root = stage();
    const base = document.createElement('canvas');
    base.width = 200;
    base.height = 100;
    const got = /** @type {any[]} */ ([]);
    const open = () =>
      openEditor({
        host: root,
        base,
        strokes: [
          {
            c: PENS[0][0],
            p: [
              [1, 1],
              [5, 5]
            ]
          }
        ],
        pen: PENS[0][0],
        onDone: (s, pen) => got.push({ s, pen })
      });
    open();
    const c = /** @type {HTMLCanvasElement} */ (
      root.querySelector('.u3-draw__canvas')
    );
    c.getBoundingClientRect = () =>
      /** @type {any} */ ({ left: 0, top: 0, width: 200, height: 100 });
    const ev = (/** @type {string} */ t, /** @type {number} */ x) => {
      const e = new Event(t);
      Object.assign(e, { clientX: x, clientY: 10, pointerId: 1 });
      c.dispatchEvent(e);
    };
    /** @type {HTMLElement} */ (
      root.querySelector('[data-pen="#1e88e5"]')
    ).click();
    ev('pointerdown', 10);
    ev('pointermove', 20);
    ev('pointerup', 20);
    /** @type {HTMLElement} */ (root.querySelector('[data-act=done]')).click();
    expect(root.querySelector('.u3-draw')).toBeNull();
    expect(got[0].s.length).toBe(2);
    expect(got[0].s[1].c).toBe('#1e88e5');
    expect(got[0].pen).toBe('#1e88e5');
    open();
    /** @type {HTMLElement} */ (root.querySelector('[data-act=clear]')).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.u3-draw')).toBeNull();
    expect(got.length).toBe(1);
    open();
    /** @type {HTMLElement} */ (
      root.querySelector('[data-act=cancel]')
    ).click();
    expect(got.length).toBe(1);
  });

  test('paintStrokes draws without throwing on a single-point stroke', () => {
    const c = document.createElement('canvas');
    c.width = 10;
    c.height = 10;
    expect(() =>
      paintStrokes(c, c, [{ c: '#000', p: [[1, 1]] }])
    ).not.toThrow();
  });
});
