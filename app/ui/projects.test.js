import { describe, expect, test, vi } from 'vitest';
import { mountSearch, searchIssues } from './search.js';
import { countsFor, mount, projectName } from './views/projects.js';

const ISSUES = [
  { id: 'abc-1.2', title: 'Fix login', status: 'open' },
  { id: 'abc-9', title: 'Deploy the login page', status: 'owner_decision' },
  { id: 'abc-3', title: 'x', title_ar: 'تسجيل الدخول', status: 'open' }
];

function fakeBase(items = ISSUES) {
  /** @type {Set<() => void>} */
  const fns = new Set();
  return {
    base: {
      subscriptions: { subscribeList: async () => () => {} },
      sub_issue_stores: {
        getStore: () => ({}),
        register() {},
        unregister() {},
        isLoaded: () => true,
        snapshotFor: () => items,
        subscribeFor: (/** @type {any} */ _i, /** @type {() => void} */ fn) => {
          fns.add(fn);
          return () => fns.delete(fn);
        }
      }
    }
  };
}

describe('top search matching', () => {
  test('finds by title, by id, by Arabic title; bounded; id match first', () => {
    expect(searchIssues(ISSUES, 'login').map((i) => i.id)).toEqual([
      'abc-1.2',
      'abc-9'
    ]);
    expect(searchIssues(ISSUES, 'ABC-9')[0].id).toBe('abc-9');
    expect(searchIssues(ISSUES, 'الدخول')[0].id).toBe('abc-3');
    expect(searchIssues(ISSUES, '')).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: 'a-' + i,
      title: 'login'
    }));
    expect(searchIssues(many, 'login').length).toBe(8);
  });

  test('typing shows results, Enter opens the task page', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    mountSearch(slot, fakeBase().base);
    const input = /** @type {HTMLInputElement} */ (slot.querySelector('input'));
    input.value = 'login';
    input.dispatchEvent(new Event('input'));
    expect(slot.querySelectorAll('.u3-search__hit').length).toBe(2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(window.location.hash).toBe('#/issues?issue=abc-1.2');
    expect(input.value).toBe('');
  });
});

describe('projects screen', () => {
  test('name from either path separator; counts live for current, server for others', () => {
    expect(projectName('/a/b/rayeh')).toBe('rayeh');
    expect(
      projectName(['C:', 'a', 'rayeh'].join(String.fromCharCode(92)))
    ).toBe('rayeh');
    expect(
      countsFor({ counts: { total: 5, owner_decision: 2 } }, false, () => null)
    ).toEqual({ total: 5, owner_decision: 2 });
    expect(countsFor({}, true, () => ISSUES)).toEqual({
      total: 3,
      owner_decision: 1
    });
    expect(countsFor({}, false, () => null)).toBeNull();
  });

  test('rows render with counts; click switches via set-workspace and saves the choice', async () => {
    window.localStorage.clear();
    const state = {
      workspace: {
        current: { path: '/p/one' },
        available: [
          { path: '/p/one', counts: { total: 4, owner_decision: 1 } },
          { path: '/p/two', counts: { total: 7, owner_decision: 0 } }
        ]
      }
    };
    const send = vi.fn(async () => ({
      workspace: { root_dir: '/p/two' },
      changed: false
    }));
    const el = document.createElement('div');
    mount(el, {
      ...fakeBase().base,
      store: { getState: () => state, subscribe: () => () => {} },
      client: { send }
    });
    const rows = el.querySelectorAll('.u3p-row');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('7');
    /** @type {HTMLElement} */ (rows[1]).click();
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('set-workspace', { path: '/p/two' })
    );
    await vi.waitFor(() =>
      expect(window.localStorage.getItem('beads-ui.workspace')).toBe('/p/two')
    );
  });
});
