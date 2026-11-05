import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  T_GET,
  T_PROJECT,
  mountOutputs,
  mountProjectOutputs,
  rowOf,
  safeHref
} from './outputs-panel.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const NOW = Date.parse('2026-11-01T10:00:00Z');

/** @param {any} over */
const item = (over = {}) => ({
  src: 'record',
  kind: 'deploy',
  label: 'Web 14',
  bead: 'tc-1.1',
  at: NOW,
  by: 'swe',
  href: 'https://rayeh.example/app',
  ...over
});

/** @param {any} data */
function fake(data) {
  return {
    send: vi.fn(
      /** @type {(t: string, p?: any) => Promise<any>} */ (
        async () => structuredClone(data)
      )
    )
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('O2 safeHref', () => {
  test('https and local http only; userinfo and other schemes refused', () => {
    expect(safeHref('https://claude.ai/artifact/x')).toBe(
      'https://claude.ai/artifact/x'
    );
    expect(safeHref('http://127.0.0.1:3000/a')).toBe('http://127.0.0.1:3000/a');
    expect(safeHref('http://pc.tail1234.ts.net/x')).toBeTruthy();
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///c/x',
      'vbscript:x',
      'http://evil.example/x',
      'https://u:p@evil.example/',
      'https://tok@github.com/o/r',
      '//evil.example',
      'not a url',
      '',
      null,
      undefined,
      42
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('row rendering', () => {
  test('a record link is an anchor with noopener noreferrer and text content', () => {
    const li = rowOf(item({ label: '<img src=x onerror=alert(1)>' }), 'tc-1');
    const a = li.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://rayeh.example/app');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(li.querySelector('img')).toBeNull();
    expect(a?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  test('an unsafe href from the wire becomes plain text, not a link', () => {
    for (const href of ['javascript:alert(1)', 'http://evil.example/x', null]) {
      const li = rowOf(item({ href }), 'tc-1');
      expect(li.querySelector('a')).toBeNull();
      expect(li.textContent).toContain('Web 14');
    }
  });

  test('a path ref is text only', () => {
    const li = rowOf(
      item({ href: null, path: 'docs/a.md', label: 'ADR' }),
      'tc-1'
    );
    expect(li.querySelector('a')).toBeNull();
    expect(li.textContent).toContain('docs/a.md');
  });

  test('commit: landed flag, branch, remote link only when safe', () => {
    const base = {
      src: 'commit',
      kind: 'commit',
      label: 'Add panel (tc-1.1)',
      href: null,
      sha: 'abcdef1234',
      landed: true,
      branch: 'main'
    };
    const ok = rowOf(
      item({
        ...base,
        remote: 'https://github.com/o/r/commit/' + 'a'.repeat(40)
      }),
      'tc-1'
    );
    expect(ok.textContent).toContain('landed');
    expect(ok.textContent).toContain('main');
    expect(ok.querySelectorAll('a')).toHaveLength(1);
    const bad = rowOf(
      item({ ...base, landed: false, remote: 'https://tok@github.com/o/r' }),
      'tc-1'
    );
    expect(bad.querySelector('a')).toBeNull();
    expect(bad.textContent).toContain('not landed');
    expect(bad.textContent).toContain('abcdef1234');
  });

  test('images only from the strict /att/ shape', () => {
    const good = rowOf(
      item({
        src: 'attachment',
        kind: 'image',
        href: null,
        att: 'rayeh/2026-11/0123456789abcdef.png'
      }),
      'tc-1'
    );
    expect(good.querySelector('img')?.getAttribute('src')).toBe(
      '/att/rayeh/2026-11/0123456789abcdef.png'
    );
    const bad = rowOf(
      item({
        src: 'attachment',
        kind: 'image',
        href: null,
        att: '../../etc/passwd'
      }),
      'tc-1'
    );
    expect(bad.querySelector('img')).toBeNull();
  });

  test('mentioned links are marked and show their bead when from a child', () => {
    const li = rowOf(item({ src: 'mention', kind: 'link' }), 'tc-1');
    expect(li.textContent).toContain('mentioned');
    expect(li.textContent).toContain('#tc-1.1');
  });
});

describe('detail slot', () => {
  const data = {
    root: 'tc-1',
    items: [
      item(),
      item({
        src: 'commit',
        kind: 'commit',
        label: 'c1',
        href: null,
        sha: 'abcdef1',
        landed: true,
        branch: 'main',
        remote: null
      }),
      item({
        src: 'mention',
        kind: 'link',
        label: 'https://claude.ai/a',
        href: 'https://claude.ai/a'
      })
    ],
    has_more: false,
    degraded: false
  };

  test('fetches once per mount, renders a collapsed panel with a count', async () => {
    const client = fake(data);
    const el = document.createElement('div');
    await mountOutputs(el, { id: 'tc-1' }, { client });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0]).toBe(T_GET);
    expect(client.send.mock.calls[0][1]).toMatchObject({ id: 'tc-1', more: 0 });
    const d = el.querySelector('details.ou');
    expect(d).not.toBeNull();
    expect(d?.hasAttribute('open')).toBe(false);
    expect(el.querySelector('summary')?.textContent).toContain('3');
    expect(el.querySelectorAll('li.ou-row')).toHaveLength(3);
  });

  test('empty result leaves the slot empty (it is hidden by CSS)', async () => {
    const el = document.createElement('div');
    await mountOutputs(
      el,
      { id: 'tc-2' },
      { client: fake({ items: [], has_more: false }) }
    );
    expect(el.childElementCount).toBe(0);
  });

  test('a failed fetch never throws and shows nothing', async () => {
    const el = document.createElement('div');
    const client = { send: vi.fn(async () => Promise.reject(new Error('x'))) };
    await expect(
      mountOutputs(el, { id: 'tc-3' }, { client })
    ).resolves.toBeUndefined();
    expect(el.childElementCount).toBe(0);
  });

  test('kind chips filter; open state survives a re-mount of the same bead', async () => {
    const client = fake(data);
    const el = document.createElement('div');
    await mountOutputs(el, { id: 'tc-1' }, { client });
    const d = /** @type {HTMLDetailsElement} */ (el.querySelector('details'));
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
    /** @type {HTMLElement} */ (
      el.querySelector('.ou-chip[data-kind="commit"]')
    ).click();
    expect(el.querySelectorAll('li.ou-row')).toHaveLength(1);
    await mountOutputs(el, { id: 'tc-1' }, { client });
    expect(el.querySelector('details')?.hasAttribute('open')).toBe(true);
  });

  test('show more asks the next page; the rollup switch re-asks from page 0', async () => {
    const client = fake({ ...data, has_more: true });
    const el = document.createElement('div');
    await mountOutputs(el, { id: 'tc-1' }, { client });
    /** @type {HTMLElement} */ (el.querySelector('.ou-more')).click();
    await tick();
    expect(client.send.mock.calls.at(-1)?.[1]).toMatchObject({ more: 1 });
    const cb = /** @type {HTMLInputElement} */ (
      el.querySelector('.ou-roll-cb')
    );
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    await tick();
    expect(client.send.mock.calls.at(-1)?.[1]).toMatchObject({
      more: 0,
      rollup: false
    });
  });

  test('another bead on the same element resets the panel', async () => {
    const client = fake(data);
    const el = document.createElement('div');
    await mountOutputs(el, { id: 'tc-1' }, { client });
    await mountOutputs(el, { id: 'tc-9' }, { client: fake({ items: [] }) });
    expect(el.childElementCount).toBe(0);
  });

  test('a bad bead id never reaches the server', async () => {
    const client = fake(data);
    const el = document.createElement('div');
    await mountOutputs(el, { id: '../x' }, { client });
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe('project view', () => {
  test('nothing is fetched until the button is pressed; then the popover lists items', async () => {
    const client = fake({
      items: [
        item(),
        item({ kind: 'link', src: 'mention', label: 'L', href: null })
      ],
      has_more: false
    });
    const el = document.createElement('span');
    document.body.append(el);
    mountProjectOutputs(el, { client });
    expect(client.send).not.toHaveBeenCalled();
    /** @type {HTMLElement} */ (el.querySelector('button')).click();
    await tick();
    expect(client.send.mock.calls[0][0]).toBe(T_PROJECT);
    expect(document.querySelectorAll('.ou-panel li.ou-row')).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.ou-panel')).toBeNull();
  });
});
