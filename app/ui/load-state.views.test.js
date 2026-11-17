// @vitest-environment jsdom
// No view says "empty" before its data has arrived (beads-lite-1bo5.13.36).
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createSubscriptionIssueStores } from '../data/subscription-issue-stores.js';
import { setCardClient } from './card/common.js';
import { mount as mountDesk } from './views/desk.js';
import { mountBell } from './views/notifications.js';
import { mount as mountReleases } from './views/releases.js';
import { mount as mountStats } from './views/stats.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
/** @returns {{ p: Promise<any>, ok: (v: any) => void, no: () => void }} */
function later() {
  /** @type {any} */ let ok;
  /** @type {any} */ let no;
  const p = new Promise((a, b) => {
    ok = a;
    no = b;
  });
  return { p, ok, no };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('beads-ui.lang', 'en');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('desk', () => {
  /** @param {any} saved @param {any} feedAnswer */
  async function openDesk(saved, feedAnswer) {
    window.localStorage.setItem('u3.desk.filters', JSON.stringify(saved));
    const stores = createSubscriptionIssueStores();
    const specs = /** @type {any[]} */ ([]);
    const subscriptions = {
      subscribeList: async (/** @type {string} */ id, /** @type {any} */ s) => {
        specs.push({ id, s });
        return async () => {};
      }
    };
    const client = {
      send: () => feedAnswer.p,
      on: () => () => {}
    };
    setCardClient(client);
    const el = document.createElement('div');
    document.body.append(el);
    const h = mountDesk(
      el,
      /** @type {any} */ ({ client, subscriptions, sub_issue_stores: stores })
    );
    await tick();
    return { el, h, stores, specs };
  }
  const item = {
    id: 'p-1',
    kind: 'decision',
    title: 'Q',
    metadata: {},
    project: { key: 'p' }
  };

  test('before the feed: loading in decisions and steps, no empty text, no 0 counts', async () => {
    const feed = later();
    const { el, h } = await openDesk({}, feed);
    expect(el.querySelector('.dk3-main')?.textContent).toMatch(/Loading/);
    expect(el.querySelector('.dk3-steps')?.textContent).toMatch(/Loading/);
    expect(el.querySelector('.dk3-moves')?.textContent).toMatch(/Loading/);
    const all = el.textContent || '';
    expect(all).not.toMatch(/Nothing|No decisions|empty/i);
    expect(el.querySelector('.dk3-chips')?.textContent).not.toMatch(/\b0\b/);
    feed.ok({ items: [] });
    await tick();
    expect(el.querySelector('.dk3-main')?.textContent).not.toMatch(/Loading/);
    expect(el.querySelector('.dk3-main .dk3-empty')).not.toBeNull();
    h.unmount();
  });

  test('a label filter holds the Desk in loading until the shared list is loaded', async () => {
    const feed = later();
    const { el, h, stores, specs } = await openDesk({ label: ['x'] }, feed);
    feed.ok({ items: [item] });
    await tick();
    // feed is here, the list that carries labels is not: still loading, not "no match"
    expect(el.querySelector('[data-testid=no-match]')).toBeNull();
    expect(el.querySelector('.dk3-main')?.textContent).toMatch(/Loading/);
    /** @type {any} */ (stores.getStore(specs[0].id)).applyPush({
      type: 'snapshot',
      id: specs[0].id,
      revision: 1,
      issues: [{ ...item, labels: ['y'], updated_at: 1 }]
    });
    await tick();
    expect(el.querySelector('.dk3-main')?.textContent).not.toMatch(/Loading/);
    expect(el.querySelector('[data-testid=no-match]')).not.toBeNull();
    h.unmount();
  });

  test('a failed first fetch says so, and a reconnect tries again', async () => {
    const feed = later();
    feed.no();
    const { el, h } = await openDesk({}, feed);
    expect(el.querySelector('.dk3-main [role=alert]')).not.toBeNull();
    expect(el.querySelector('.dk3-main')?.textContent).not.toMatch(
      /Nothing|No decisions/
    );
    h.unmount();
  });
});

describe('notifications bell', () => {
  test('no "nothing needs you" before the first list; error is not empty either', async () => {
    document.body.innerHTML =
      '<div id="u3" class="u3"><header><span data-slot="bell"></span></header></div>';
    const root = /** @type {HTMLElement} */ (document.getElementById('u3'));
    const list = later();
    const handlers = new Map();
    const client = {
      send: (/** @type {string} */ t) =>
        t === 'notify-list' ? list.p : Promise.resolve({}),
      on: (/** @type {string} */ t, /** @type {any} */ f) => {
        handlers.set(t, f);
        return () => {};
      }
    };
    const bell = mountBell(
      /** @type {HTMLElement} */ (root.querySelector('[data-slot=bell]')),
      { client, host: root }
    );
    bell.open();
    await tick();
    const text = () => document.querySelector('.u3-pn')?.textContent || '';
    expect(text()).toMatch(/Loading/);
    expect(text()).not.toMatch(/Nothing needs you/);
    list.ok({ events: [], unread: 0, projects: [] });
    await tick();
    expect(text()).toMatch(/Nothing needs you/);
    expect(text()).not.toMatch(/Loading/);
  });
});

describe('stats', () => {
  test('failed load is an error, not "No numbers yet"; a failed refresh keeps the numbers', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const first = later();
    let n = 0;
    const h = mountStats(el, {
      client: {
        send: () => {
          n += 1;
          return n === 1 ? first.p : Promise.reject(new Error('x'));
        }
      }
    });
    await tick();
    expect(el.textContent).not.toMatch(/No numbers yet/);
    expect(el.querySelector('.u3-skel')).not.toBeNull();
    first.no();
    await tick();
    expect(el.textContent).toMatch(/Could not load/);
    expect(el.textContent).not.toMatch(/No numbers yet/);
    h.unmount();
  });

  test('empty only when loaded and the file is truly missing', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const h = mountStats(el, {
      client: { send: async () => ({ present: false }) }
    });
    await tick();
    expect(el.textContent).toMatch(/No numbers yet/);
    h.unmount();
  });
});

describe('releases', () => {
  test('loading until the list arrives, then empty', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const res = later();
    const h = mountReleases(
      el,
      /** @type {any} */ ({ client: { send: () => res.p } })
    );
    await tick();
    expect(el.querySelector('[aria-busy=true]')).not.toBeNull();
    expect(el.querySelector('.rl3-empty')).toBeNull();
    res.ok({ releases: [], total: 0, has_more: false });
    await tick();
    expect(el.querySelector('.rl3-empty')).not.toBeNull();
    h.unmount?.();
  });
});
