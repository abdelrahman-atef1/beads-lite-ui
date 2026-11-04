import { afterEach, describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createListView } from './list.js';

afterEach(() => window.localStorage.removeItem('beads-ui.lang'));

describe('views/list text and priority names', () => {
  /** @param {string} lang */
  async function mountList(lang) {
    window.localStorage.setItem('beads-ui.lang', lang);
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const store = createSubscriptionIssueStore('tab:issues');
    store.applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'UI-1',
          title: 'One',
          status: 'open',
          priority: 0,
          issue_type: 'task'
        }
      ]
    });
    const stores = /** @type {any} */ ({
      getStore: () => store,
      snapshotFor: () => store.snapshot().slice(),
      subscribe: () => () => {}
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      undefined,
      stores
    );
    await view.load();
    return mount;
  }

  test('English: headers and priority option names, no P0-P4 text', async () => {
    const mount = await mountList('en');
    const heads = Array.from(mount.querySelectorAll('th')).map(
      (h) => h.textContent
    );
    expect(heads).toContain('Title');
    const opts = Array.from(
      mount.querySelectorAll('select.badge--priority option')
    ).map((o) => o.textContent?.trim());
    expect(opts).toEqual(['Critical', 'High', 'Medium', 'Low', 'Backlog']);
    expect(mount.textContent).not.toMatch(/\bP[0-4]\b/);
  });

  test('Arabic: headers, search placeholder and priority names are Arabic', async () => {
    const mount = await mountList('ar');
    const heads = Array.from(mount.querySelectorAll('th')).map(
      (h) => h.textContent
    );
    expect(heads).toContain('العنوان');
    expect(
      mount.querySelector('input[type=search]')?.getAttribute('placeholder')
    ).toBe('بحث…');
    const opts = Array.from(
      mount.querySelectorAll('select.badge--priority option')
    ).map((o) => o.textContent?.trim());
    expect(opts[0]).toBe('حرجة');
  });
});
