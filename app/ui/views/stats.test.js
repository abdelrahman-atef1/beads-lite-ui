// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { mount, summaryLine } from './stats.js';

const data = {
  present: true,
  built_at: '2026-11-14T20:16:00Z',
  now: Date.parse('2026-11-15T12:00:00Z'),
  days: 7,
  counts: {
    owner_decision: 21,
    waiting_for_test: 260,
    waiting_for_merge: 34,
    blocked: 28
  },
  stuck: [
    {
      id: 'a-1',
      project: 'a',
      status: 'blocked',
      role: 'cto',
      ageMs: 11 * 86_400_000,
      title: 'Code security review'
    }
  ],
  weeks: [1, 2, 3, 4, 5, 6, 7, 60],
  weekAvg: 48,
  weekTotal: 88,
  split: {
    n: 5,
    shares: {
      active: 0.5,
      test: 0.5,
      owner: 0,
      merge: 0,
      blocked: 0,
      queue: 0
    },
    biggest: 'test'
  },
  quality: [
    { role: 'swe', closed: 57, rate: 0.34, enough: true },
    { role: 'sre', closed: 5, rate: null, enough: false }
  ],
  unassigned: 1970,
  machine: { n: 0, waitMedS: null, heldMedS: null, wakeMedMs: null },
  tokens: { present: false }
};

describe('stats home', () => {
  test('draws every block, "name - title", too few, empty tokens state, never a 0 for unknown', async () => {
    const send = vi.fn(async () => data);
    const el = document.createElement('div');
    document.body.append(el);
    const h = mount(el, { client: { send } });
    await vi.waitFor(() =>
      expect(el.querySelector('[data-block="stuck"]')).not.toBeNull()
    );
    for (const k of [
      'summary',
      'weeks',
      'split',
      'quality',
      'tokens-role',
      'tokens-project',
      'machine'
    ])
      expect(el.querySelector(`[data-block="${k}"]`), k).not.toBeNull();
    // same order as the task page: name first, then the title
    const who = el.querySelector('[data-block="stuck"] .u3-sh__muted');
    expect(who?.textContent).toMatch(/ - Chief Technology Officer$/);
    expect(el.querySelector('[data-block="quality"]')?.textContent).toMatch(
      /عدد قليل|too few/
    );
    expect(
      el.querySelector('[data-block="tokens-role"] .u3-sh__empty')
    ).not.toBeNull();
    expect(el.querySelector('[data-block="machine"]')?.textContent).toMatch(
      /مش معروف|unknown/
    );
    expect(el.querySelector('[data-stale]')).toBeNull(); // built 16 h ago: fresh
    h.unmount();
  });

  test('summary line names the owner wait; period change asks again', async () => {
    expect(summaryLine(data)).toContain('60');
    expect(summaryLine(data)).toContain('21');
    const send = vi.fn(async () => data);
    const el = document.createElement('div');
    document.body.append(el);
    const h = mount(el, { client: { send } });
    await vi.waitFor(() =>
      expect(el.querySelector('.u3-tms__p')).not.toBeNull()
    );
    el.querySelectorAll('.u3-tms__p')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await vi.waitFor(() =>
      expect(send).toHaveBeenLastCalledWith('flow-stats', { days: 30 })
    );
    h.unmount();
  });

  test('numbers older than 36 h say so', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const old = { ...data, built_at: '2026-11-12T00:00:00Z' };
    const h = mount(el, { client: { send: async () => old } });
    await vi.waitFor(() =>
      expect(el.querySelector('[data-stale]')).not.toBeNull()
    );
    h.unmount();
  });

  test('no server answer is the empty state, not a crash', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const h = mount(el, {
      client: {
        send: async () => {
          throw new Error('x');
        }
      }
    });
    await vi.waitFor(() =>
      expect(el.querySelector('.u3-sh__empty')).not.toBeNull()
    );
    h.unmount();
  });

  test('Project chip asks for one project, hides tokens per project, All brings it back', async () => {
    window.localStorage.clear();
    const send = vi.fn(async (_t, /** @type {any} */ p) => ({
      ...data,
      project: p.project || '',
      projects: ['a', 'b']
    }));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const h = mount(el, { client: { send } });
    await vi.waitFor(() =>
      expect(el.querySelector('.u3t-menu[data-name="project"]')).not.toBeNull()
    );
    expect(el.querySelector('[data-block="tokens-project"]')).not.toBeNull();
    /** @type {HTMLElement} */ (el.querySelector('.u3t-menu')).click();
    /** @type {HTMLElement} */ (
      el.querySelector('.u3t-opt[data-v="b"]')
    ).click();
    await vi.waitFor(() =>
      expect(send).toHaveBeenLastCalledWith('flow-stats', {
        days: 7,
        project: 'b'
      })
    );
    await vi.waitFor(() =>
      expect(el.querySelector('[data-block="tokens-project"]')).toBeNull()
    );
    expect(window.localStorage.getItem('u3.stats.project')).toBe('b');
    /** @type {HTMLElement} */ (el.querySelector('.u3t-menu')).click();
    /** @type {HTMLElement} */ (
      el.querySelector('.u3t-opt[data-v=""]')
    ).click();
    await vi.waitFor(() =>
      expect(send).toHaveBeenLastCalledWith('flow-stats', { days: 7 })
    );
    expect(window.localStorage.getItem('u3.stats.project')).toBeNull();
    h.unmount();
  });
});
