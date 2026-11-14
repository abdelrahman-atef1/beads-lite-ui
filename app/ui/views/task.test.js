// @ts-nocheck -- fixture-heavy view test
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mount } from './task.js';

const tick = () => new Promise((r) => setTimeout(r, 30));
const ISSUE = {
  id: 'p-1',
  title: 'عيوب الشاشة',
  status: 'in_progress',
  priority: 2,
  assignee: 'qa',
  description: 'line one\n\nline two\n\nline three',
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T11:00:00Z',
  dependencies: [{ id: 'p-0', dependency_type: 'parent-child', title: 'P' }],
  dependents: [
    { id: 'p-2', dependency_type: 'parent-child', title: 'kid', status: 'open' }
  ]
};
const COMMENTS = [
  {
    id: 'aaaaaaaa-1111',
    author: 'qa',
    text: 'first',
    created_at: '2026-11-08T10:00:00Z'
  },
  {
    id: 'bbbbbbbb-2222',
    author: 'swe',
    text: 'STEPS: do it\n\n## Steps\n1. run `npm test`',
    created_at: '2026-11-08T11:00:00Z'
  },
  {
    id: 'cccccccc-3333',
    author: 'cos',
    text: 'last one',
    created_at: '2026-11-09T11:00:00Z'
  }
];

function setup(at) {
  document.body.innerHTML = '<div id="v"></div>';
  window.localStorage.setItem('beads-ui.lang', 'ar');
  window.location.hash = `#/issues?issue=p-1${at ? '&at=' + at : ''}`;
  const send = vi.fn(async (type, p) => {
    if (type === 'get-comments') return COMMENTS;
    if (type === 'add-comment')
      return [
        ...COMMENTS,
        { id: 'dddddddd-4444', author: 'swe', text: p.text }
      ];
    return {};
  });
  const ctx = {
    route: { name: 'task', id: 'p-1', at: at || null },
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
  const h = mount(el, ctx);
  return { el, send, h };
}

describe('task page', () => {
  beforeEach(() => window.localStorage.clear());

  test('renders fields and comments, newest first', async () => {
    const { el } = setup();
    await tick();
    expect(el.textContent).toContain('عيوب الشاشة');
    expect(el.querySelectorAll('.u3-ts__c').length).toBe(3);
    expect(el.querySelector('.u3-ts__c').textContent).toContain('last one');
    expect(el.textContent).toContain('p-2');
    expect(el.querySelector('[data-anchor="description"]')).toBeTruthy();
  });

  test('c-last highlights the newest comment', async () => {
    const { el } = setup('c-last');
    await tick();
    const hit = el.querySelector('.anchor-hit');
    expect(hit.getAttribute('data-anchor')).toBe('c-cccccccc');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test('c-<n> and description anchors', async () => {
    const a = setup('c-1');
    await tick();
    expect(a.el.querySelector('.anchor-hit').getAttribute('data-anchor')).toBe(
      'c-aaaaaaaa'
    );
    const b = setup('description.L3');
    await tick();
    expect(b.el.querySelector('.anchor-hit').textContent).toContain('line two');
  });

  test('steps comment is drawn and anchorable', async () => {
    const { el } = setup('c-bbbbbbbb');
    await tick();
    expect(el.querySelector('.u3-stcomment')).toBeTruthy();
    expect(el.querySelector('.anchor-hit .u3-stcomment')).toBeTruthy();
  });

  test('composer posts and the comment appears', async () => {
    const { el, send } = setup();
    await tick();
    const ta = el.querySelector('textarea');
    ta.value = 'hello مرحبا';
    ta.dispatchEvent(new Event('input'));
    await tick();
    const btn = [...el.querySelectorAll('.u3-ts__act button')].pop();
    expect(btn.disabled).toBe(false);
    btn.click();
    await tick();
    expect(send).toHaveBeenCalledWith('add-comment', {
      id: 'p-1',
      text: 'hello مرحبا'
    });
    expect(el.querySelectorAll('.u3-ts__c').length).toBe(4);
    expect(el.querySelector('textarea').value).toBe('');
  });
});
