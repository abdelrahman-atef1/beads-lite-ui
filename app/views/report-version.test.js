// Version dropdown in both report forms (beads-lite-1bo5.13.25): the list
// comes from the project's releases, "Other version" opens a typing box.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { openReportSheet } from '../ui/views/report.js';
import { closeReport, openReport } from './report.js';

const tick = () => new Promise((r) => setTimeout(r, 30));
const VERS = { rayeh: ['1.1.0+21', '1.1.0+20'], demo: [] };

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (/** @type {string} */ url) => {
      if (url.startsWith('/api/workspaces')) {
        return {
          ok: true,
          json: async () => ({
            workspaces: [
              { path: 'E:/Projects/rayeh' },
              { path: 'E:/Projects/demo' }
            ]
          })
        };
      }
      const p = decodeURIComponent(url.split('project=')[1] || '');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          versions: /** @type {any} */ (VERS)[p].map((v) => ({ v }))
        })
      };
    })
  );
}

/** @param {ParentNode} root */
const opts = (root) =>
  [
    ...root.querySelectorAll(
      'select[id="rpt-version-sel"] option, select[name="version-pick"] option'
    )
  ].map((o) => /** @type {HTMLOptionElement} */ (o).value);

describe('legacy report form', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.replaceChildren();
    stubFetch();
  });

  test('project versions fill the dropdown; other opens the box', async () => {
    window.localStorage.setItem('bdui.report.project', 'rayeh');
    openReport();
    await tick();
    const sel = /** @type {HTMLSelectElement} */ (
      document.querySelector('#rpt-version-sel')
    );
    const box = /** @type {HTMLInputElement} */ (
      document.querySelector('#rpt-version')
    );
    expect(opts(document.body)).toEqual(['1.1.0+21', '1.1.0+20', '__other']);
    expect(sel.value).toBe('1.1.0+21');
    expect(box.hidden).toBe(true);
    expect(box.value).toBe('1.1.0+21');
    sel.value = '1.1.0+20';
    sel.dispatchEvent(new Event('change'));
    expect(box.value).toBe('1.1.0+20');
    sel.value = '__other';
    sel.dispatchEvent(new Event('change'));
    expect(box.hidden).toBe(false);
    closeReport();
  });

  test('a project with no releases shows only the typing box', async () => {
    window.localStorage.setItem('bdui.report.project', 'demo');
    openReport();
    await tick();
    const box = /** @type {HTMLInputElement} */ (
      document.querySelector('#rpt-version')
    );
    expect(opts(document.body)).toEqual(['__other']);
    expect(box.hidden).toBe(false);
    closeReport();
  });
});

describe('v3 report sheet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.replaceChildren();
    stubFetch();
  });

  test('dropdown from releases, other shows the text input', async () => {
    window.localStorage.setItem('bdui.report.project', 'rayeh');
    const host = document.createElement('div');
    document.body.append(host);
    const s = openReportSheet({ host });
    await tick();
    const sel = /** @type {HTMLSelectElement} */ (
      document.querySelector('select[name="version-pick"]')
    );
    expect(opts(document.body)).toEqual(['1.1.0+21', '1.1.0+20', '__other']);
    expect(document.querySelector('input[name="version"]')).toBeNull();
    sel.value = '__other';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(document.querySelector('input[name="version"]')).toBeTruthy();
    s.close();
  });
});
