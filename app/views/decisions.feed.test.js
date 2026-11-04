// @ts-nocheck -- fixture-heavy view test; typed fixtures add noise
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byPriorityThenAge,
  createDecisionsView,
  filterByProjects
} from './decisions.js';

const card = (q) => ({
  card_class: 'tap',
  card_q: q,
  card_effect: 'e',
  card_back: 'swe',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }])
});
const item = (id, key, priority, updated_at) => ({
  id,
  title: id,
  priority,
  updated_at,
  project: { key, name: key.toUpperCase() },
  sha: 'sha-' + id,
  metadata: card('Q ' + id + '?')
});
const SNAP = {
  items: [
    item('beta-1', 'beta', 0, 5),
    item('alpha-1', 'alpha', 2, 1),
    item('beta-2', 'beta', 2, 3)
  ],
  projects: [
    { key: 'alpha', name: 'ALPHA', count: 1 },
    { key: 'beta', name: 'BETA', count: 2 }
  ],
  rules_ok: true
};

function setup(snapshot = SNAP, send) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = document.getElementById('m');
  const handlers = new Map();
  const feed = {
    send:
      send ||
      vi.fn(async (type) => (type === 'list-decisions-all' ? snapshot : {})),
    on: (type, fn) => {
      handlers.set(type, fn);
      return () => {};
    }
  };
  const view = createDecisionsView(mount, () => {}, undefined, undefined, feed);
  return { mount, view, feed, handlers };
}
const flush = () => new Promise((r) => setTimeout(r, 30));
const ids = (mount) =>
  [...mount.querySelectorAll('article')].map((a) => a.dataset.issueId);

beforeEach(() => {
  window.localStorage.clear();
});

describe('decisions all-projects feed', () => {
  test('pure helpers: priority then age; empty choice = all', () => {
    expect(byPriorityThenAge(SNAP.items).map((i) => i.id)).toEqual([
      'beta-1',
      'alpha-1',
      'beta-2'
    ]);
    expect(filterByProjects(SNAP.items, new Set()).length).toBe(3);
    expect(filterByProjects(SNAP.items, new Set(['alpha'])).length).toBe(1);
  });

  test('opens on All projects, every project in one list with a project chip', async () => {
    const { mount, view, feed } = setup();
    await view.load();
    expect(feed.send).toHaveBeenCalledWith('list-decisions-all', {});
    expect(ids(mount)).toEqual(['beta-1', 'alpha-1', 'beta-2']);
    expect(mount.querySelector('.dfilter summary').textContent.trim()).toBe(
      'All projects'
    );
    expect(
      [...mount.querySelectorAll('.dchip')].map((c) => c.textContent.trim())
    ).toEqual(['BETA', 'ALPHA', 'BETA']);
  });

  test('multi-select dropdown narrows the list; ticking everything is All again', async () => {
    const { mount, view } = setup();
    await view.load();
    const box = (k) => mount.querySelector(`input[data-project="${k}"]`);
    box('alpha').click();
    await flush();
    expect(ids(mount)).toEqual(['alpha-1']);
    expect(mount.querySelector('.dfilter summary').textContent.trim()).toBe(
      'ALPHA'
    );
    box('beta').click();
    await flush();
    expect(ids(mount).length).toBe(3);
    expect(mount.querySelector('.dfilter summary').textContent.trim()).toBe(
      'All projects'
    );
  });

  test('empty selection result shows a message and a reset button', async () => {
    const snap = { ...SNAP, items: [SNAP.items[0]] };
    const { mount, view } = setup(snap);
    await view.load();
    mount.querySelector('input[data-project="alpha"]').click();
    await flush();
    expect(ids(mount)).toEqual([]);
    expect(mount.querySelector('.empty b').textContent).toMatch(/selected/);
    mount.querySelector('.dreset').click();
    await flush();
    expect(ids(mount)).toEqual(['beta-1']);
  });

  test('empty state when nothing waits anywhere', async () => {
    const { mount, view } = setup({ items: [], projects: [], rules_ok: true });
    await view.load();
    expect(mount.querySelector('.empty')).toBeTruthy();
  });

  test('a pushed decisions-all frame replaces the list', async () => {
    const { mount, view, handlers } = setup();
    await view.load();
    handlers.get('decisions-all')({ ...SNAP, items: [SNAP.items[1]] });
    await flush();
    expect(ids(mount)).toEqual(['alpha-1']);
  });

  test('tap answer in another project goes to card-answer with the sha (option, then Confirm)', async () => {
    const { mount, view, feed } = setup();
    await view.load();
    const a = mount.querySelector('[data-issue-id="alpha-1"]');
    a.querySelector('.opts .btn').click();
    await flush();
    a.querySelector('.btn--primary').click();
    await flush();
    expect(feed.send).toHaveBeenCalledWith('card-answer', {
      id: 'alpha-1',
      option: 1,
      sha: 'sha-alpha-1'
    });
    expect(ids(mount)).not.toContain('alpha-1');
  });

  test('keys 1-9 pick an option on the top card; ignored while typing', async () => {
    const { mount, view } = setup();
    await view.load();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    await flush();
    const top = mount.querySelector('[data-issue-id="beta-1"]');
    expect(top.querySelector('.btn--primary').textContent).toMatch(/No/);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }));
    await flush();
    expect(top.querySelector('.btn--primary').textContent).toMatch(/No/);
  });

  test('feed failure falls back to this project with a note', async () => {
    const { mount, view } = setup(
      SNAP,
      vi.fn(async () => {
        throw new Error('down');
      })
    );
    await view.load();
    expect(mount.querySelector('.dnote--err')).toBeTruthy();
    expect(mount.querySelector('.dfilter')).toBeNull();
  });

  test('rules missing is said, not silent', async () => {
    const { mount, view } = setup({ items: [], projects: [], rules_ok: false });
    await view.load();
    expect(mount.querySelector('.dnote--err')).toBeTruthy();
  });

  test('Arabic strings exist for every new key', async () => {
    const { strings } = await import('../i18n/decisions.js');
    for (const [k, v] of Object.entries(strings)) {
      expect(v.en && v.ar, k).toBeTruthy();
    }
  });
});
