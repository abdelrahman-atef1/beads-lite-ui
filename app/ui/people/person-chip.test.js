import { render } from 'lit-html';
import { beforeEach, describe, expect, test } from 'vitest';
import { fixtureDigest } from '../data/flow-digest-fixture.js';
import { expDetail } from '../views/time-exp.js';
import { timeBody } from '../views/time-section.js';
import { personChip } from './person-chip.js';

const strip = (/** @type {string|null} */ s) =>
  String(s).replace(/[\u2068\u2069]/g, '');
const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const setLang = (/** @type {string} */ l) =>
  localStorage.setItem('beads-ui.lang', l);

describe.each([
  ['ar', 'rtl', 'مارد وشوشني - مدير المكتب'],
  ['en', 'ltr', 'مارد وشوشني - Chief of Staff']
])('person chip in %s UI', (lang, dir, want) => {
  beforeEach(() => setLang(lang));
  test('full and short read name - title, direction follows the UI language', () => {
    const d = document.createElement('div');
    render(personChip({ role: 'cos' }), d);
    let el = /** @type {HTMLElement} */ (d.querySelector('.u3-role'));
    expect(el.getAttribute('dir')).toBe(dir);
    expect(strip(el.textContent).trim()).toBe(want);
    render(personChip({ role: 'cos', short: true }), d);
    el = /** @type {HTMLElement} */ (d.querySelector('.u3-role--short'));
    expect(el.getAttribute('dir')).toBe(dir);
    expect(strip(el.title)).toBe(want);
    expect(strip(el.textContent).replace(/\s+/g, ' ').trim()).toBe(want);
    expect(el.hasAttribute('data-open')).toBe(false);
    el.click();
    expect(el.hasAttribute('data-open')).toBe(true);
  });
  test('time section roles and time-exp scope show the title (seeded data)', () => {
    const t0 = NOW - 400 * MIN;
    const row = {
      id: 'x',
      running: false,
      active_ms: 60 * MIN,
      waiting_ms: 0,
      intervals: [
        {
          status: 'in_progress',
          bucket: 'active',
          role: 'swe',
          from: t0,
          to: t0 + 60 * MIN,
          min: 60,
          running: false
        }
      ],
      quality: { qaFail: 0, reopen: 0, ownerReject: 0, rework: 0 },
      tokens: null
    };
    const a = document.createElement('div');
    render(timeBody(row, { now: NOW }), a);
    const roles = [...a.querySelectorAll('.u3-role')].map((e) =>
      strip(e.textContent).replace(/\s+/g, ' ').trim()
    );
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.every((t) => t.includes(' - '))).toBe(true);
    const b = document.createElement('div');
    const ex = fixtureDigest(NOW).exps.find((e) => e.exp?.scope?.role);
    expect(ex, 'seeded experiment with a role').toBeTruthy();
    render(expDetail(ex), b);
    const chip = /** @type {HTMLElement} */ (b.querySelector('.u3-role'));
    expect(chip.getAttribute('dir')).toBe(dir);
    expect(strip(chip.title)).toContain(' - ');
  });
});
