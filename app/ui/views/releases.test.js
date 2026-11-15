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

describe('v3 releases detail: task links, link, download', () => {
  /** @param {any} file @param {any} over */
  async function open(file, over = {}) {
    const client = {
      async send(/** @type {string} */ type) {
        if (type === 'releases-get') {
          return {
            tasks: [
              { id: 'other-7', title: 'T', status: 'open' },
              { id: 'p-2', title: 'U', status: 'closed', closed_at: 1 }
            ],
            more: 0,
            file
          };
        }
        return {
          releases: [{ ...rel(1), ...over }],
          total: 1,
          has_more: false,
          skipped: [],
          degraded: false
        };
      }
    };
    const el = document.createElement('div');
    document.body.append(el);
    const h = mount(el, { client });
    await tick();
    /** @type {HTMLElement | null} */ (el.querySelector('.rl3-card'))?.click();
    await tick();
    return { el, h };
  }

  test('every task row links to its task, any project', async () => {
    const { el, h } = await open({ state: 'none' });
    const hrefs = [...el.querySelectorAll('.rl3-task a')].map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual(['#/issues?issue=other-7', '#/issues?issue=p-2']);
    // one link per row, and it holds the title, so tapping the title opens it
    const row = el.querySelector('.rl3-task');
    expect(row?.querySelectorAll('a').length).toBe(1);
    expect(row?.querySelector('a .rl3-ttl')?.textContent).toBe('T');
    h.unmount();
  });

  test('a url record gives an open button; a build file gives a download', async () => {
    const a = await open({ state: 'none' }, { href: 'https://x.dev/app' });
    const open1 = /** @type {HTMLAnchorElement} */ (
      a.el.querySelector('.rl3-open')
    );
    expect(open1.href).toBe('https://x.dev/app');
    expect(open1.rel).toContain('noopener');
    a.h.unmount();
    const b = await open(
      { state: 'ok', name: 'app.apk', size: 5 * 1048576 },
      { path: '.work/out/p-1/app.apk' }
    );
    const dl = /** @type {HTMLAnchorElement} */ (
      b.el.querySelector('.rl3-download')
    );
    expect(dl.getAttribute('href')).toBe(
      '/api/release-file?p=p&id=' + encodeURIComponent('p:1')
    );
    expect(dl.textContent).toContain('5.0 MB');
    b.h.unmount();
  });

  test('a build with no file on this PC says so and has no download link', async () => {
    const { el, h } = await open(
      { state: 'missing' },
      { path: '.work/out/p-1/app.apk' }
    );
    expect(el.querySelector('.rl3-download')).toBeNull();
    expect(el.querySelector('.rl3-where .rl3-note')).not.toBeNull();
    h.unmount();
  });
});
