import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  T_EVENT,
  T_LIST,
  T_MUTE,
  T_READ,
  T_SET,
  ago,
  itemText,
  mountBell,
  normalizeItem
} from './notifications.js';

const NOW = Date.now();
const FEED = {
  unread: 3,
  mute_until: null,
  events: [
    {
      id: 'e1',
      kind: 'decision',
      project: 'fatura',
      bead: 'b-1',
      title: 'Tax rounding',
      desk: false,
      at: NOW - 20 * 60000,
      read: false
    },
    {
      id: 'e2',
      kind: 'answer',
      project: 'rayeh',
      bead: 'b-2',
      title: 'Provider',
      desk: false,
      at: NOW - 3 * 3600000,
      read: false
    },
    {
      id: 'e3',
      kind: 'decision',
      project: 'company',
      bead: 'b-3',
      title: null,
      desk: true,
      at: NOW - 86400000,
      read: false
    }
  ],
  projects: [
    { key: 'fatura', name: 'fatura', on: true },
    { key: 'rayeh', name: 'rayeh', on: false }
  ]
};

/** Fake ws client: records sends, lets a test push events. */
function fakeClient(feed = FEED, failSet = false) {
  /** @type {Record<string, Function[]>} */
  const handlers = {};
  const state = structuredClone(feed);
  const sent = /** @type {Array<[string, any]>} */ ([]);
  return {
    sent,
    emit: (/** @type {string} */ t, /** @type {any} */ p) =>
      (handlers[t] || []).forEach((f) => f(p)),
    on: (/** @type {string} */ t, /** @type {Function} */ f) => {
      (handlers[t] ||= []).push(f);
      return () => undefined;
    },
    onConnection: () => () => undefined,
    send: vi.fn(async (/** @type {string} */ t, /** @type {any} */ p) => {
      sent.push([t, p]);
      if (t === T_SET && failSet) throw new Error('no');
      if (t === T_READ) {
        for (const e of state.events) {
          if (p.all || p.ids.includes(e.id)) e.read = true;
        }
        state.unread = state.events.filter((e) => !e.read).length;
      }
      if (t === T_SET) {
        const pr = state.projects.find((x) => x.key === p.project);
        if (pr) pr.on = p.on;
      }
      if (t === T_MUTE) state.mute_until = p.until;
      return structuredClone(state);
    })
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
let el = /** @type {HTMLElement} */ (document.body);

beforeEach(() => {
  document.body.innerHTML = '<span id="slot"></span>';
  document.documentElement.setAttribute('lang', 'en');
  localStorage.clear();
  location.hash = '';
  el = /** @type {HTMLElement} */ (document.getElementById('slot'));
});

describe('notifications bell', () => {
  test('shows unread count from the feed and opens the panel', async () => {
    const c = fakeClient();
    mountBell(el, { client: c });
    await tick();
    expect(el.querySelector('.nt-dot')?.textContent).toBe('3');
    el.querySelector('button')?.click();
    await tick();
    const rows = document.querySelectorAll('.nt-item');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Decision needed: Tax rounding');
    expect(rows[1].textContent).toContain('Answer to your question: Provider');
  });

  test('desk item shows pointer only and does not navigate', async () => {
    const c = fakeClient();
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    const desk = document.querySelector('[data-key="e3"]');
    expect(desk?.textContent).toContain('A decision waits at the PC (company)');
    expect(desk?.textContent).not.toContain('Tax');
    /** @type {HTMLElement} */ (desk).click();
    expect(location.hash).toBe('');
    expect(c.sent.some(([t]) => t === T_READ)).toBe(true);
  });

  test('item tap opens the bead and marks it read (survives reload)', async () => {
    const c = fakeClient();
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    /** @type {HTMLElement} */ (
      document.querySelector('[data-key="e1"]')
    ).click();
    expect(location.hash).toBe('#/issues?issue=b-1');
    expect(c.sent).toContainEqual([T_READ, { ids: ['e1'] }]);
    // Reload: the server owns read state, so a re-mount against it shows 2.
    document.body.innerHTML = '<span id="slot"></span>';
    el = /** @type {HTMLElement} */ (document.getElementById('slot'));
    mountBell(el, { client: c });
    await tick();
    expect(el.querySelector('.nt-dot')?.textContent).toBe('2');
  });

  test('mark all read clears the badge', async () => {
    mountBell(el, { client: fakeClient() });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    /** @type {HTMLElement} */ (document.querySelector('.nt-lnk')).click();
    expect(el.querySelector('.nt-dot')).toBeNull();
  });

  test('a pushed event adds an item without polling', async () => {
    const c = fakeClient({
      events: [],
      unread: 0,
      projects: [],
      mute_until: null
    });
    mountBell(el, { client: c });
    await tick();
    expect(el.querySelector('.nt-dot')).toBeNull();
    c.emit(T_EVENT, {
      unread: 1,
      event: {
        id: 'k9',
        kind: 'decision',
        project: 'x',
        bead: 'x-9',
        title: 'New',
        desk: false,
        at: Date.now(),
        read: false
      }
    });
    expect(el.querySelector('.nt-dot')?.textContent).toBe('1');
  });

  test('project switch persists via notify-set and reverts on failure', async () => {
    const c = fakeClient();
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    const cb = /** @type {HTMLInputElement} */ (
      document.querySelector('[data-project="rayeh"]')
    );
    expect(cb.checked).toBe(false);
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    await tick();
    expect(c.sent).toContainEqual([T_SET, { project: 'rayeh', on: true }]);

    const f = fakeClient(FEED, true);
    document.body.innerHTML = '<span id="slot"></span>';
    mountBell(/** @type {HTMLElement} */ (document.getElementById('slot')), {
      client: f
    });
    await tick();
    document.querySelector('.nt-bell')?.dispatchEvent(new Event('click'));
    await tick();
    const cb2 = /** @type {HTMLInputElement} */ (
      document.querySelector('[data-project="rayeh"]')
    );
    cb2.checked = true;
    cb2.dispatchEvent(new Event('change'));
    await tick();
    const cb3 = /** @type {HTMLInputElement} */ (
      document.querySelector('[data-project="rayeh"]')
    );
    expect(cb3.checked).toBe(false);
    expect(document.querySelector('[role=alert]')).not.toBeNull();
  });

  test('server error degrades to an empty panel with a notice', async () => {
    const c = fakeClient();
    c.send.mockRejectedValue(new Error('x'));
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    expect(document.querySelector('.nt-empty')).not.toBeNull();
    expect(document.querySelector('[role=status]')).not.toBeNull();
  });

  test('Arabic strings and hostile text stay text', async () => {
    localStorage.setItem('beads-ui.lang', 'ar');
    const c = fakeClient({
      unread: 1,
      mute_until: null,
      events: [
        {
          id: 'z',
          kind: 'decision',
          project: 'p',
          bead: 'b',
          title: '<img src=x onerror=alert(1)>',
          desk: false,
          at: NOW,
          read: false
        }
      ],
      projects: []
    });
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    expect(document.querySelector('.nt-item')?.textContent).toContain(
      'قرار مطلوب'
    );
    expect(document.querySelector('.nt-panel img')).toBeNull();
  });

  test('mute toggles through notify-mute', async () => {
    const c = fakeClient();
    mountBell(el, { client: c });
    await tick();
    el.querySelector('button')?.click();
    await tick();
    /** @type {HTMLElement} */ (document.querySelector('.nt-mute')).click();
    await tick();
    expect(c.sent.at(-1)?.[0]).toBe(T_MUTE);
    expect(typeof c.sent.at(-1)?.[1].until).toBe('string');
  });

  test('digest and degraded events read as plain text', () => {
    const d = normalizeItem({
      id: 'd',
      kind: 'digest',
      project: 'p',
      count: 4,
      at: NOW
    });
    expect(itemText(/** @type {any} */ (d))).toBe('4 decisions waiting in p');
    const g = normalizeItem({
      id: 'g',
      kind: 'degraded',
      project: 'p',
      bead: null,
      at: NOW
    });
    expect(itemText(/** @type {any} */ (g))).toContain('paused');
  });

  test('normalizeItem and ago', () => {
    expect(normalizeItem({ id: '', bead: 'x' })).toBeNull();
    expect(ago(NOW, NOW)).toBe('now');
    expect(ago(NOW - 5 * 60000, NOW)).toBe('5m');
  });
});
