// @ts-nocheck -- fixture-heavy view test
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fmtDate, mount, reportedVersion } from './task.js';

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

let CARD_STATE = {};
function setup(at) {
  document.body.innerHTML = '<div id="v"></div>';
  window.localStorage.setItem('beads-ui.lang', 'ar');
  window.location.hash = `#/issues?issue=p-1${at ? '&at=' + at : ''}`;
  const send = vi.fn(async (type, p) => {
    if (type === 'get-comments') return COMMENTS;
    if (type === 'card-state') return CARD_STATE;
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

/** @param {HTMLElement} el - @param {number} n */
const tabBtn = (el, n) => el.querySelectorAll('.u3-ts__j')[n];

describe('task page', () => {
  beforeEach(() => window.localStorage.clear());

  test('a type card (one option) shows its answer box on the task page', async () => {
    COMMENTS.push({
      id: 'eeeeeeee-5555',
      author: 'cos',
      text: [
        'ASK: Which wording?',
        '',
        '## Decision',
        'q: Which wording?',
        'show: A or B',
        'options:',
        '1. Write your reply'
      ].join('\n'),
      created_at: '2026-11-10T11:00:00Z'
    });
    CARD_STATE = {
      id: 'p-1',
      state: 'waiting',
      sha: 'f'.repeat(64),
      max_rounds: 3,
      thread: [],
      wake: { state: 'none' },
      card: {
        cls: 'type',
        lang: 'ar',
        q: 'Which wording?',
        show: 'A or B',
        opts: [{ n: 1, l: 'Write your reply' }]
      }
    };
    try {
      const { el } = setup('card');
      await tick();
      await tick();
      expect(el.querySelector('.u3-cd__text')).not.toBeNull();
      expect(el.querySelector('[data-act="send"]')).not.toBeNull();
    } finally {
      COMMENTS.pop();
      CARD_STATE = {};
    }
  });

  test('an ASK comment with no card record shows its options and read-only, answer on Desk (.59.36)', async () => {
    COMMENTS.push({
      id: 'eeeeeeee-5555',
      author: 'cos',
      text: [
        'ASK: Apply the rule?',
        '',
        '## Decision',
        'q: Apply the rule?',
        'effect: all roles log deploys',
        'options:',
        '1. Yes (recommended)',
        '2. Edit it'
      ].join('\n'),
      created_at: '2026-11-10T11:00:00Z'
    });
    ISSUE.status = 'owner_decision';
    CARD_STATE = { id: 'p-1', state: 'none', card: null };
    try {
      const { el, send } = setup('card');
      await tick();
      await tick();
      expect(el.querySelectorAll('.u3-cd__ro li').length).toBe(2);
      // the list numbers itself: no second "1." inside the item (.13.34)
      expect(el.querySelector('.u3-cd__ro li')?.textContent?.trim()).toMatch(
        /^Yes/
      );
      expect(el.querySelector('[data-desk-only]')).not.toBeNull();
      expect(el.querySelector('.u3-cd__opt')).toBeNull();
      expect(send.mock.calls.some((c) => c[0] === 'add-comment')).toBe(false);
    } finally {
      COMMENTS.pop();
      ISSUE.status = 'in_progress';
      CARD_STATE = {};
    }
  });

  test('the Time section starts closed; details are plain facts (.59.36 + .13.2)', async () => {
    const { el } = setup();
    await tick();
    await tick();
    expect(el.querySelector('.u3-ts__time')?.hasAttribute('data-open')).toBe(
      false
    );
    expect(el.querySelector('details.u3-ts__fold')).toBeNull();
  });

  test('renders fields and comments, newest first', async () => {
    const { el } = setup();
    await tick();
    expect(el.textContent).toContain('عيوب الشاشة');
    expect(el.querySelectorAll('.u3-ts__c').length).toBe(3);
    expect(el.querySelector('.u3-ts__c').textContent).toContain('last one');
    // flat page: tabs, comments first; description and subtasks are one tap
    expect(el.querySelector('[data-anchor="description"]')).toBeNull();
    tabBtn(el, 2).click();
    await tick();
    expect(el.textContent).toContain('p-2');
    tabBtn(el, 1).click();
    await tick();
    expect(el.querySelector('[data-anchor="description"]')).toBeTruthy();
  });

  test('add-comment box is one line at the top until tapped', async () => {
    const { el } = setup();
    await tick();
    expect(el.querySelector('textarea')).toBeNull();
    const quick = el.querySelector('.u3-ts__quick');
    expect(quick).toBeTruthy();
    // above the newest comment
    const sec = el.querySelector('[data-anchor="comments"]');
    expect(sec.firstElementChild).toBe(quick);
    quick.click();
    await tick();
    expect(el.querySelector('textarea')).toBeTruthy();
    expect(
      el.querySelector('[data-anchor="comments"]').firstElementChild.className
    ).toContain('u3-ts__composer');
  });

  test('the more menu holds Add subtask and closes on Escape', async () => {
    const { el } = setup();
    await tick();
    expect(el.querySelector('.u3-ts__menu')).toBeNull();
    el.querySelector('.u3-ts__morebtn').click();
    await tick();
    expect(el.querySelectorAll('.u3-ts__mi').length).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();
    expect(el.querySelector('.u3-ts__menu')).toBeNull();
  });

  test('a deep link to the description opens that tab', async () => {
    const { el } = setup('description.L3');
    await tick();
    expect(el.querySelector('.anchor-hit').textContent).toContain('line two');
  });

  test('reactions fold under their comment and leave the thread/count (13.3)', async () => {
    COMMENTS.push(
      { id: 'f1', author: 'swe', text: 'REACT: 👀 re: c-aaaaaaaa' },
      { id: 'f2', author: 'qa', text: 'REACT: 👀 re: c-aaaaaaaa' }
    );
    try {
      const { el } = setup();
      await tick();
      expect(el.querySelectorAll('.u3-ts__c').length).toBe(3);
      const chips = el.querySelectorAll(
        '[data-anchor="c-aaaaaaaa"] .u3-ts__rxc'
      );
      expect(chips.length).toBe(1);
      expect(chips[0].textContent).toContain('👀');
      expect(chips[0].textContent).toContain('swe, qa');
      expect(el.textContent).not.toContain('REACT:');
    } finally {
      COMMENTS.pop();
      COMMENTS.pop();
    }
  });

  test('status emojis on the report itself show under the description (8ce8.17.13)', async () => {
    COMMENTS.push(
      { id: 'g1', author: 'wake', text: 'REACT: 👀 re: description' },
      { id: 'g2', author: 'status-hook', text: 'REACT: 🛠️ re: description' }
    );
    try {
      const { el } = setup('description.L1');
      await tick();
      const chips = el.querySelectorAll('[data-report-status] .u3-ts__rxc');
      expect([...chips].map((c) => c.textContent.trim())).toEqual(['👀', '🛠️']);
      expect(el.textContent).not.toContain('REACT:');
    } finally {
      COMMENTS.pop();
      COMMENTS.pop();
    }
  });

  test('a blocked task lists what blocks it; a release record is a short line (13.17)', async () => {
    const saved = ISSUE.dependencies;
    ISSUE.status = 'blocked';
    ISSUE.dependencies = [
      ...saved,
      {
        id: 'p-7',
        dependency_type: 'blocks',
        title: 'Waiting thing',
        status: 'open',
        assignee: 'sre'
      },
      { id: 'p-8', dependency_type: 'blocks', title: 'Done', status: 'closed' }
    ];
    COMMENTS.push({
      id: 'ffffffff-6666',
      author: '',
      text: 'OUTPUT v1 deploy\n{"ref":"https://a.pages.dev/x","label":"App prod - fix","commit":"abc1234def"}'
    });
    try {
      const { el } = setup();
      await tick();
      const b = el.querySelector('[data-blockers]');
      expect(b.textContent).toContain('p-7');
      expect(b.textContent).toContain('Waiting thing');
      expect(b.textContent).toContain('sre');
      expect(b.textContent).not.toContain('p-8');
      expect(b.querySelector('a').getAttribute('href')).toContain('p-7');
      const r = el.querySelector('[data-release]');
      expect(r.textContent).toContain('App prod - fix');
      expect(r.querySelector('a').getAttribute('href')).toBe(
        'https://a.pages.dev/x'
      );
      expect(el.textContent).not.toContain('OUTPUT v1');
    } finally {
      ISSUE.status = 'in_progress';
      ISSUE.dependencies = saved;
      COMMENTS.pop();
    }
  });

  test('blocked with no recorded blocker says so (13.17)', async () => {
    ISSUE.status = 'blocked';
    try {
      const { el } = setup();
      await tick();
      expect(el.querySelector('[data-blockers]')).not.toBeNull();
    } finally {
      ISSUE.status = 'in_progress';
    }
  });

  test('an id the server refuses shows not-found, not loading (.59.24)', async () => {
    document.body.innerHTML = '<div id="v"></div>';
    window.localStorage.setItem('beads-ui.lang', 'en');
    window.location.hash = '#/issues?issue=p-9';
    const send = vi.fn(async () => COMMENTS);
    const ctx = {
      route: { name: 'task', id: 'p-9', at: null },
      send,
      client: { send },
      sub_issue_stores: {
        register() {},
        subscribeFor: () => () => {},
        isLoaded: () => false,
        snapshotFor: () => []
      },
      subscriptions: {
        subscribeList: async () => {
          throw new Error('not found');
        }
      }
    };
    const el = document.getElementById('v');
    mount(el, ctx);
    await tick();
    expect(el.textContent).toContain('Task not found');
    expect(el.textContent).not.toContain('Loading');
  });

  test('ask head keeps one host and its open panel from loading to loaded', async () => {
    document.body.innerHTML = '<div id="v"></div>';
    window.localStorage.setItem('beads-ui.lang', 'en');
    window.location.hash = '#/issues?issue=p-1';
    let have = false;
    let notify = () => {};
    const send = vi.fn(async () => COMMENTS);
    const ctx = {
      route: { name: 'task', id: 'p-1', at: null },
      send,
      client: { send },
      sub_issue_stores: {
        register() {},
        subscribeFor: (_ids, fn) => {
          notify = fn;
          return () => {};
        },
        isLoaded: () => have,
        snapshotFor: () => (have ? [structuredClone(ISSUE)] : [])
      },
      subscriptions: { subscribeList: async () => async () => {} }
    };
    const el = document.getElementById('v');
    mount(el, ctx);
    await tick();
    const host = el.querySelector('.u3-ask');
    expect(host).toBeTruthy();
    expect(el.querySelector('.u3-ts__title')).toBeNull(); // still loading
    host.querySelector('.u3-ask__head').click();
    expect(host.querySelector('.u3-ask__sheet')).toBeTruthy();
    have = true;
    notify();
    await tick();
    expect(el.querySelector('.u3-ts__title')).toBeTruthy(); // loaded
    expect(el.querySelectorAll('.u3-ask').length).toBe(1);
    expect(el.querySelector('.u3-ask')).toBe(host); // same node, not remade
    expect(host.querySelector('.u3-ask__sheet')).toBeTruthy(); // still open
  });

  test('page keeps room below it for the floating ask button', () => {
    // the floating button needs room below the page content (390 RTL)
    const css = readFileSync('app/css/u3-task.css', 'utf8');
    expect(css).toMatch(/\.u3 \.u3-ts \{[^}]*padding-block-end: calc\(56px/);
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
    el.querySelector('.u3-ts__quick').click();
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
    expect(el.querySelector('textarea')).toBeNull(); // back to the one line
    expect(el.querySelector('.u3-ts__quick')).toBeTruthy();
  });
  test('offline post shows queued after a few seconds; a refused post offers Retry', async () => {
    const { el, send } = setup();
    await tick();
    el.querySelector('.u3-ts__quick').click();
    await tick();
    const ta = el.querySelector('textarea');
    ta.value = 'offline note';
    ta.dispatchEvent(new Event('input'));
    await tick();
    let fail = false;
    const base = send.getMockImplementation();
    send.mockImplementation((type, p) => {
      if (type !== 'add-comment') return base(type, p);
      return fail ? Promise.reject(new Error('x')) : new Promise(() => {}); // socket holds it until back online
    });
    vi.useFakeTimers();
    try {
      [...el.querySelectorAll('.u3-ts__act button')].pop().click();
      await vi.advanceTimersByTimeAsync(4500);
      expect(el.querySelector('[role="status"]')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test('a refused post shows failed with a Retry that posts again', async () => {
    const { el, send } = setup();
    await tick();
    el.querySelector('.u3-ts__quick').click();
    await tick();
    const ta = el.querySelector('textarea');
    ta.value = 'will fail';
    ta.dispatchEvent(new Event('input'));
    await tick();
    const base = send.getMockImplementation();
    let n = 0;
    send.mockImplementation((type, p) =>
      type === 'add-comment' && n++ === 0
        ? Promise.reject(new Error('x'))
        : base(type, p)
    );
    [...el.querySelectorAll('.u3-ts__act button')].pop().click();
    await tick();
    const err = el.querySelector('.u3-ts__err');
    expect(err).toBeTruthy();
    err.querySelector('button').click();
    await tick();
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('.u3-ts__quick')).toBeTruthy();
  });
});

describe('fmtDate', () => {
  const now = new Date(2026, 10, 16, 15, 0, 0).getTime();
  test('a date from today is relative', () => {
    expect(fmtDate(now - 5 * 60000, now)).toMatch(/5/);
    expect(fmtDate(now - 5 * 60000, now)).toMatch(/ago|منذ|من/);
    expect(fmtDate(now - 2 * 3600000, now)).toMatch(/2/);
  });
  test('an older date keeps the full date', () => {
    const y = new Date(2026, 10, 14, 15, 0, 0).getTime();
    expect(fmtDate(y, now)).toMatch(/2026/);
  });
});

describe('reportedVersion', () => {
  test('metadata wins, old reports fall back to the title prefix', () => {
    expect(
      reportedVersion({ metadata: { version: '1.1.0' }, title: 'x' })
    ).toBe('1.1.0');
    expect(reportedVersion({ title: '[v1.0.2+3] crash on open' })).toBe(
      '1.0.2+3'
    );
    expect(reportedVersion({ title: 'plain', metadata: {} })).toBe('');
  });
});
