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

  test('assignee picker shows full names, values stay role codes', async () => {
    const { el } = setup();
    await edit(el);
    const o = el.querySelector('#u3-ed-asg option[value="cos"]');
    expect(o.textContent).toContain('مارد وشوشني');
    expect(o.textContent).not.toBe('cos');
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

  test('requires title and parent (text errors, no call)', async () => {
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
    expect(send).not.toHaveBeenCalled();
  });

  test('Unassigned is allowed on create: no assignee sent', async () => {
    const { send } = open({ created: true, id: 'p-9' }, { parent: 'p-0' });
    val('#u3-nt-title', 'No owner');
    val('#u3-nt-asg', '');
    await submit();
    expect(send).toHaveBeenCalledWith(
      'create-issue',
      expect.not.objectContaining({ assignee: expect.anything() })
    );
    expect(send).not.toHaveBeenCalledWith('update-assignee', expect.anything());
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
