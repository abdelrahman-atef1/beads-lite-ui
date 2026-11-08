// @ts-nocheck -- fixture-heavy view test; typed fixtures add noise
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { strings } from '../i18n/releases.js';
import { createReleasesView, groupByMonth } from './releases.js';

const rel = (id, o = {}) => ({
  id,
  project: 'rayeh',
  name: 'rayeh',
  bead: 'rayeh-1',
  kind: 'deploy',
  label: 'Web ' + id,
  commit: 'a3f9c21' + '0'.repeat(33),
  href: 'https://rayeh.example.dev/',
  path: null,
  by: 'swe',
  at: Date.parse('2026-11-08T14:20:00Z'),
  n_tasks: 2,
  ...o
});
const LIST = {
  releases: [
    rel('r2', {
      kind: 'build',
      label: 'APK 14',
      project: 'fatura',
      name: 'fatura'
    }),
    rel('r1')
  ],
  total: 2,
  has_more: false,
  skipped: [],
  degraded: false
};
const TASKS = {
  tasks: [
    {
      id: 'rayeh-1',
      title: 'Carrier',
      status: 'closed',
      closed_at: Date.parse('2026-11-08T10:00:00Z'),
      via: 'bead'
    },
    {
      id: 'rayeh-2',
      title: 'From commit',
      status: 'open',
      closed_at: null,
      via: 'commit'
    }
  ],
  more: 0,
  git_failed: false
};

function setup({ list = LIST, tasks = TASKS, path = 'E:/p/rayeh' } = {}) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = document.getElementById('m');
  const client = {
    send: vi.fn(async (type, payload) => {
      if (type === 'releases-list') {
        if (typeof list === 'function') return list(payload);
        return list;
      }
      if (type === 'releases-get') {
        if (tasks instanceof Error) throw tasks;
        return tasks;
      }
      throw new Error('unexpected ' + type);
    })
  };
  const goto = vi.fn();
  const view = createReleasesView(mount, client, goto, () => path);
  return { mount, client, goto, view };
}
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  document.documentElement.setAttribute('lang', 'en');
  window.localStorage.clear();
});

describe('releases view', () => {
  test('lists releases newest first with project, kind, commit and task count', async () => {
    const { mount, view, client } = setup();
    await view.load();
    const rows = [...mount.querySelectorAll('.rl-row')];
    expect(rows.map((r) => r.dataset.release)).toEqual(['r2', 'r1']);
    expect(rows[1].textContent).toContain('rayeh');
    expect(rows[1].textContent).toContain('a3f9c21');
    expect(rows[1].textContent).toContain('2 tasks');
    expect(rows[0].querySelector('.rl-k-build')).toBeTruthy();
    expect(client.send).toHaveBeenCalledWith('releases-list', { more: 0 });
  });

  test('a row opens the detail with tasks; a task of the open project is a link, others are text', async () => {
    const { mount, view, client, goto } = setup();
    await view.load();
    mount.querySelector('[data-release="r1"]').click();
    await flush();
    expect(client.send).toHaveBeenCalledWith('releases-get', {
      project: 'rayeh',
      id: 'r1'
    });
    const links = [...mount.querySelectorAll('.rl-tasks a')];
    expect(links.map((a) => a.textContent)).toEqual(['rayeh-1', 'rayeh-2']);
    links[0].click();
    expect(goto).toHaveBeenCalledWith('rayeh-1');
    expect(mount.querySelector('.rl-detail a[target]').href).toBe(
      'https://rayeh.example.dev/'
    );
    // another project: no link to a bead the open project does not have
    mount.querySelector('[data-release="r2"]').click();
    await flush();
    expect(mount.querySelectorAll('.rl-tasks a')).toHaveLength(0);
    expect(mount.querySelectorAll('.rl-tasks .rl-id')).toHaveLength(2);
  });

  test('an unsafe link is text, never an anchor', async () => {
    const { mount, view } = setup({
      list: { ...LIST, releases: [rel('r1', { href: 'javascript:alert(1)' })] }
    });
    await view.load();
    mount.querySelector('[data-release="r1"]').click();
    await flush();
    expect(mount.querySelector('.rl-detail a[target]')).toBeNull();
  });

  test('empty state explains how releases appear, with the command wrapping on a phone', async () => {
    const { mount, view } = setup({
      list: {
        releases: [],
        total: 0,
        has_more: false,
        skipped: [],
        degraded: false
      }
    });
    await view.load();
    expect(mount.querySelector('.rl-empty h3').textContent).toBe(
      'No releases yet'
    );
    expect(mount.querySelector('.rl-cmd').textContent).toContain('output add');
    expect(mount.querySelector('.rl-filters')).toBeNull();
    const css = fs.readFileSync(
      path.resolve(import.meta.dirname, '../css/releases.css'),
      'utf8'
    );
    const block = css.slice(css.indexOf('.rl-cmd {'));
    expect(block.slice(0, block.indexOf('}'))).toMatch(
      /white-space:\s*pre-wrap/
    );
    expect(block.slice(0, block.indexOf('}'))).toMatch(
      /overflow-wrap:\s*anywhere/
    );
  });

  test('filters ask the server and an empty filter result offers to clear it', async () => {
    const list = vi.fn((p) =>
      p.kind === 'build' ? { ...LIST, releases: [], total: 0 } : LIST
    );
    const { mount, view, client } = setup({ list });
    await view.load();
    [...mount.querySelectorAll('.rl-chip')]
      .find((b) => b.textContent.trim() === 'Build')
      .click();
    await flush();
    expect(client.send).toHaveBeenLastCalledWith('releases-list', {
      more: 0,
      kind: 'build'
    });
    expect(mount.querySelector('.rl-empty h3').textContent).toBe(
      'No releases match the filter'
    );
    mount.querySelector('.rl-empty .rl-btn').click();
    await flush();
    expect(mount.querySelectorAll('.rl-row')).toHaveLength(2);
  });

  test('a skipped project is named; nothing else breaks', async () => {
    const { mount, view } = setup({ list: { ...LIST, skipped: ['fatura'] } });
    await view.load();
    expect(mount.querySelector('.rl-note').textContent).toContain('fatura');
    expect(mount.querySelectorAll('.rl-row')).toHaveLength(2);
  });

  test('a failed list shows a retry, not a raw error', async () => {
    let fail = true;
    const { mount, view } = setup({
      list: () => {
        if (fail) throw new Error('boom: stack trace');
        return LIST;
      }
    });
    await view.load();
    expect(mount.querySelector('[role=alert]').textContent).not.toContain(
      'boom'
    );
    fail = false;
    mount.querySelector('[role=alert] .rl-btn').click();
    await flush();
    expect(mount.querySelectorAll('.rl-row')).toHaveLength(2);
  });

  test('a failed git read is said in the detail; a failed detail is a message', async () => {
    const a = setup({ tasks: { ...TASKS, git_failed: true } });
    await a.view.load();
    a.mount.querySelector('[data-release="r1"]').click();
    await flush();
    expect(a.mount.querySelector('.rl-detail .rl-note').textContent).toMatch(
      /Git/
    );
    const b = setup({ tasks: new Error('x') });
    await b.view.load();
    b.mount.querySelector('[data-release="r1"]').click();
    await flush();
    expect(b.mount.querySelector('.rl-detail [role=alert]')).toBeTruthy();
  });

  test('load() on every store change does not re-read within 15 s', async () => {
    const { view, client } = setup();
    await view.load();
    await view.load();
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  test('older page asks for the next page', async () => {
    const list = vi.fn((p) => ({ ...LIST, has_more: p.more === 0 }));
    const { mount, view, client } = setup({ list });
    await view.load();
    mount.querySelector('.rl-center .rl-btn').click();
    await flush();
    expect(client.send).toHaveBeenLastCalledWith('releases-list', { more: 1 });
  });

  test('groupByMonth keeps order and splits months', () => {
    const g = groupByMonth([
      { at: Date.parse('2026-11-08T10:00:00Z') },
      { at: Date.parse('2026-11-01T10:00:00Z') },
      { at: Date.parse('2026-10-31T10:00:00Z') }
    ]);
    expect(g.map((x) => x.items.length)).toEqual([2, 1]);
  });

  test('every string has Arabic', () => {
    for (const [k, v] of Object.entries(strings)) {
      expect(v.en && v.ar, k).toBeTruthy();
    }
  });
});
