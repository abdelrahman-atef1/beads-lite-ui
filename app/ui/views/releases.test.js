import { describe, expect, test } from 'vitest';
import { MAX_PAGE, mount, shortRef } from './releases.js';

const rel = (/** @type {number} */ i) => ({
  id: 'p:' + i,
  project: 'p',
  name: 'p',
  bead: 'p-' + i,
  kind: i % 2 ? 'build' : 'deploy',
  label: 'Release ' + i,
  commit: 'abcdef0123456789',
  href: '',
  path: '',
  by: 'sre',
  at: Date.UTC(2026, 10, 8) - i * 86400000,
  n_tasks: i
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('v3 releases view', () => {
  test('renders cards, opens detail, never asks past the last server page', async () => {
    /** @type {any[]} */
    const asked = [];
    const client = {
      /**
       * @param {string} type
       * @param {any} payload
       */
      async send(type, payload) {
        asked.push([type, payload]);
        if (type === 'releases-get') {
          return {
            tasks: [{ id: 'p-1', title: 'T', status: 'open' }],
            more: 0
          };
        }
        return {
          releases: [rel(0), rel(1)],
          total: 999,
          has_more: true,
          skipped: [],
          degraded: false
        };
      }
    };
    const el = document.createElement('div');
    document.body.append(el);
    const h = mount(el, { client });
    await tick();
    expect(el.querySelectorAll('.rl3-card').length).toBe(2);
    expect(el.textContent).not.toMatch(/[٠-٩]/);

    for (let i = 0; i < 12; i++) {
      /** @type {HTMLElement | null} */
      const more = el.querySelector('.rl3-more button');
      if (!more) break;
      more.click();
      await tick();
    }
    const pagesAsked = asked
      .filter((a) => a[0] === 'releases-list')
      .map((a) => a[1].more);
    expect(Math.max(...pagesAsked)).toBe(MAX_PAGE);
    expect(el.querySelector('.rl3-more')).toBeNull();
    expect(el.querySelector('.rl3-note')).not.toBeNull();

    /** @type {HTMLElement} */ (el.querySelector('.rl3-card')).click();
    await tick();
    expect(el.querySelector('.rl3--detail')).not.toBeNull();
    expect(el.querySelectorAll('.rl3-task').length).toBe(1);
    h.unmount();
    expect(el.querySelector('.rl3')).toBeNull();
  });

  test('shortRef cuts hashes, keeps versions', () => {
    expect(shortRef('a1bf92c0d1e2f3')).toBe('a1bf92c');
    expect(shortRef('1.1.0+20')).toBe('1.1.0+20');
  });
});
