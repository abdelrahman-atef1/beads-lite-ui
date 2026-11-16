// @ts-nocheck -- fixture-heavy view test
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { openNewTask } from './new-task.js';
import { mount } from './task.js';

const tick = () => new Promise((r) => setTimeout(r, 30));
const ISSUE = {
  id: 'p-1',
  title: 'old title',
  status: 'open',
  priority: 2,
  assignee: 'qa',
  labels: ['a', 'b'],
  description: 'old desc',
  dependencies: [{ id: 'p-0', dependency_type: 'parent-child', title: 'P' }]
};

function setup(fail) {
  document.body.innerHTML = '<div class="u3"><div id="v"></div></div>';
  window.localStorage.setItem('beads-ui.lang', 'en');
  window.location.hash = '#/issues?issue=p-1';
  const send = vi.fn(async (type) => {
    if (type === 'get-comments') return [];
    if (fail && type === fail) throw new Error('bd said no');
    return { id: 'p-1' };
  });
  const ctx = {
    route: { name: 'task', id: 'p-1', at: null },
    send,
    client: { send },
    sub_issue_stores: {
      register() {},
      subscribeFor: () => () => {},
      isLoaded: () => true,
      snapshotFor: () => [structuredClone(ISSUE)]
    },
    subscriptions: { subscribeList: async () => async () => {} }
  };
  const el = document.getElementById('v');
  Element.prototype.scrollIntoView = vi.fn();
  mount(el, ctx);
  return { el, send, ctx };
}

const edit = async (el) => {
  await tick();
  el.querySelector('.u3-ed__toggle').click();
  await tick();
};
const change = (node, value, ev = 'change') => {
  node.value = value;
  node.dispatchEvent(new Event(ev, { bubbles: true }));
};

describe('task page edits', () => {
  beforeEach(() => window.localStorage.clear());

  test('read mode has no controls; the pencil shows them', async () => {
    const { el } = setup();
    await tick();
    expect(el.querySelector('#u3-ed-status')).toBeNull();
    await edit(el);
    expect(el.querySelector('#u3-ed-status')).toBeTruthy();
    expect(el.querySelector('#u3-ed-title').value).toBe('old title');
    expect(el.querySelector('#u3-ed-desc').value).toBe('old desc');
  });

  test('status, priority, assignee use the legacy calls', async () => {
    const { el, send } = setup();
    await edit(el);
    change(el.querySelector('#u3-ed-status'), 'in_progress');
    await tick();
    expect(send).toHaveBeenCalledWith('update-status', {
      id: 'p-1',
      status: 'in_progress'
    });
    change(el.querySelector('#u3-ed-prio'), '0');
    await tick();
    expect(send).toHaveBeenCalledWith('update-priority', {
      id: 'p-1',
      priority: 0
    });
    change(el.querySelector('#u3-ed-asg'), 'swe');
    await tick();
    expect(send).toHaveBeenCalledWith('update-assignee', {
      id: 'p-1',
      assignee: 'swe'
    });
  });

  test('title and description save with edit-text', async () => {
    const { el, send } = setup();
    await edit(el);
    change(el.querySelector('#u3-ed-title'), 'new title', 'input');
    el.querySelector('.u3-ed__block .u3-btn--primary').click();
    await tick();
    expect(send).toHaveBeenCalledWith('edit-text', {
      id: 'p-1',
      field: 'title',
      value: 'new title'
    });
    change(el.querySelector('#u3-ed-desc'), 'new desc', 'input');
    el.querySelector('.u3-ts__sec.u3-ed__block .u3-btn--primary').click();
    await tick();
    expect(send).toHaveBeenCalledWith('edit-text', {
      id: 'p-1',
      field: 'description',
      value: 'new desc'
    });
  });

  test('labels add and remove', async () => {
    const { el, send } = setup();
    await edit(el);
    const inp = el.querySelector('.u3-ed__add input');
    change(inp, 'c', 'input');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    expect(send).toHaveBeenCalledWith('label-add', { id: 'p-1', label: 'c' });
    el.querySelector('.u3-ed__x[aria-label$="a"]').click();
    await tick();
    expect(send).toHaveBeenCalledWith('label-remove', {
      id: 'p-1',
      label: 'a'
    });
  });

  test('a failed save shows text and keeps the old value', async () => {
    const { el } = setup('update-status');
    await edit(el);
    change(el.querySelector('#u3-ed-status'), 'blocked');
    await tick();
    expect(el.querySelector('.u3-ed__err').textContent).toContain('bd said no');
    expect(el.querySelector('#u3-ed-status').value).toBe('open');
  });

  test('empty title is refused with text, no call', async () => {
    const { el, send } = setup();
    await edit(el);
    change(el.querySelector('#u3-ed-title'), '  ', 'input');
    el.querySelector('.u3-ed__block .u3-btn--primary').click();
    await tick();
    expect(el.querySelector('.u3-ed__err')).toBeTruthy();
    expect(send).not.toHaveBeenCalledWith('edit-text', expect.anything());
  });
});

describe('new task dialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('beads-ui.lang', 'en');
  });

  function open(reply, opts) {
    document.body.innerHTML = '<div class="u3" id="h"></div>';
    const send = vi.fn(async (t) =>
      t === 'create-issue' ? reply : t === 'list-issues' ? [] : {}
    );
    const ctx = {
      send,
      listSelectors: {
        selectIssuesFor: () => [
          { id: 'p-0', title: 'Epic', issue_type: 'epic', status: 'open' }
        ]
      }
    };
    openNewTask(document.getElementById('h'), ctx, opts);
    return { send };
  }
  const val = (sel, v, ev = 'input') => {
    const n = document.querySelector(sel);
    n.value = v;
    n.dispatchEvent(new Event(ev, { bubbles: true }));
  };
  const submit = async () => {
    document.querySelector('.u3-nt__act button').click();
    await tick();
  };

  test('requires title, parent and assignee (text errors, no call)', async () => {
    const { send } = open({});
    await submit();
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(/Title/);
    val('#u3-nt-title', 'x');
    await submit();
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(/parent/);
    val('#u3-nt-parent', 'zzz-9');
    await submit();
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(
      /No task with that id/
    );
    val('#u3-nt-parent', 'p-0');
    await submit();
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(
      /assignee/
    );
    expect(send).not.toHaveBeenCalled();
  });

  test('sends create-issue with parent, type, assignee, priority', async () => {
    const { send } = open(
      { created: true, id: 'p-7', parent: 'p-0', assignee: 'swe' },
      { parent: 'p-0' }
    );
    val('#u3-nt-title', 'My task');
    val('#u3-nt-asg', 'swe');
    val('#u3-nt-type', 'bug', 'change');
    val('#u3-nt-prio', '1', 'change');
    await submit();
    expect(send).toHaveBeenCalledWith('create-issue', {
      title: 'My task',
      type: 'bug',
      priority: 1,
      parent: 'p-0',
      assignee: 'swe'
    });
    expect(window.location.hash).toContain('issue=p-7');
  });

  test('server that ignores parent: reported as text, not dropped', async () => {
    const { send } = open({ created: true, id: 'p-8' }, { parent: 'p-0' });
    val('#u3-nt-title', 'My task');
    val('#u3-nt-asg', 'swe');
    await submit();
    expect(send).toHaveBeenCalledWith('update-assignee', {
      id: 'p-8',
      assignee: 'swe'
    });
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(
      /parent was not set/
    );
  });
});

describe('new task dialog project', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('beads-ui.lang', 'en');
    document.body.innerHTML = '<div class="u3" id="h"></div>';
  });
  const WS = {
    current: { path: 'E:/w/p' },
    available: [
      { path: 'E:/w/p', prefix: 'p' },
      { path: 'E:/w/q', prefix: 'q' }
    ]
  };
  function openP(opts) {
    const send = vi.fn(async (t) =>
      t === 'create-issue'
        ? { created: true, id: 'q-7', parent: 'q-0', assignee: 'swe' }
        : t === 'set-workspace'
          ? { workspace: { root_dir: 'E:/w/q' }, changed: true }
          : {}
    );
    const ctx = {
      send,
      store: { getState: () => ({ workspace: WS }) },
      listSelectors: {
        selectIssuesFor: () => [
          { id: 'p-0', title: 'E', issue_type: 'epic', status: 'open' }
        ]
      }
    };
    openNewTask(document.getElementById('h'), ctx, opts);
    return { send };
  }
  const submit = async () => {
    document.querySelector('.u3-nt__act button').click();
    await new Promise((r) => setTimeout(r, 20));
  };

  test('no project chosen: Create is disabled; the Tasks filter with one project is the default', () => {
    openP({});
    expect(document.querySelector('.u3-nt__act button').disabled).toBe(true);
    expect(document.querySelector('[data-testid=nt-project]').value).toBe('');
    document.body.innerHTML = '<div class="u3" id="h"></div>';
    window.localStorage.setItem(
      'u3.tasks.filters',
      JSON.stringify({ project: ['q'] })
    );
    openP({});
    expect(document.querySelector('[data-testid=nt-project]').value).toBe('q');
    expect(document.querySelector('.u3-nt__act button').disabled).toBe(false);
  });

  test('opened from a task: that task project; last used is the fallback', () => {
    openP({ parent: 'p-0' });
    expect(document.querySelector('[data-testid=nt-project]').value).toBe('p');
    document.body.innerHTML = '<div class="u3" id="h"></div>';
    window.localStorage.setItem('bdui.newtask.project', 'q');
    openP({});
    expect(document.querySelector('[data-testid=nt-project]').value).toBe('q');
  });

  test('another project: the workspace is switched first, then the task is made there', async () => {
    window.localStorage.setItem(
      'u3.tasks.filters',
      JSON.stringify({ project: ['q'] })
    );
    const { send } = openP({ parent: undefined });
    const set = (sel, v) => {
      const n = document.querySelector(sel);
      n.value = v;
      n.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('#u3-nt-title', 'T');
    set('#u3-nt-asg', 'swe');
    set('#u3-nt-parent', 'p-0');
    await submit();
    expect(document.querySelector('.u3-ed__err').textContent).toMatch(
      /another project/
    );
    expect(send).not.toHaveBeenCalled();
    set('#u3-nt-parent', 'q-0');
    await submit();
    expect(send.mock.calls.map((c) => c[0]).slice(0, 2)).toEqual([
      'set-workspace',
      'create-issue'
    ]);
    expect(window.localStorage.getItem('bdui.newtask.project')).toBe('q');
  });
});
