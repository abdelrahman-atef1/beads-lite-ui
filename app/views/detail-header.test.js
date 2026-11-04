import { render } from 'lit-html';
import { afterEach, describe, expect, test } from 'vitest';
import { fitCount, renderDetailHeader } from './detail-header.js';

/**
 * @param {any} issue
 * @param {any} [opts]
 */
function mount(issue, opts) {
  const el = document.createElement('div');
  render(renderDetailHeader(issue, opts), el);
  return el;
}
const issue = {
  id: 'X-1',
  assignee: 'cto',
  description: '- [x] one\n- [ ] (3) two',
  design: '- [ ] never counted',
  comments: [{ author: 'swe' }, { author: 'zed' }],
  dependents: [
    {
      id: 'X-1.1',
      status: 'closed',
      priority: 2,
      dependency_type: 'parent-child'
    },
    { id: 'X-1.2', status: 'open', priority: 2, dependency_type: 'blocks' }
  ]
};

afterEach(() => {
  localStorage.clear();
});

/**
 * @param {Element} el
 * @param {string} sel
 */
const q = (el, sel) => /** @type {Element} */ (el.querySelector(sel));

describe('detail header', () => {
  test('chips from comment authors + assignee; assignee first and highlighted', () => {
    const el = mount(issue);
    const chips = Array.from(el.querySelectorAll('.dh-chip:not(.dh-more)'));
    expect(chips.map((c) => c.getAttribute('data-actor'))).toEqual([
      'cto',
      'zed',
      'swe'
    ]);
    expect(chips[0].classList.contains('dh-chip--current')).toBe(true);
    expect(el.textContent).toContain('أندل (SWE)');
    expect(el.textContent).toContain('شلبي (CTO)');
  });
  test('bar: closed child (3) + steps; design and blocks deps ignored', () => {
    const bar = q(mount(issue), '[role=progressbar]');
    expect(bar.getAttribute('aria-valuenow')).toBe('4');
    expect(bar.getAttribute('aria-valuemax')).toBe('7');
    expect(q(bar, '.dh-fill').getAttribute('style')).toContain('57%');
  });
  test('explicit weights apply', () => {
    const bar = q(
      mount(issue, { weights: { 'X-1.1': 10 } }),
      '[role=progressbar]'
    );
    expect(bar.getAttribute('aria-valuenow')).toBe('11');
    expect(bar.getAttribute('aria-valuemax')).toBe('14');
  });
  test('no children and no steps: no bar; caps chips with +N', () => {
    const el = mount(
      { comments: ['a', 'b', 'c'].map((x) => ({ author: x })) },
      { max_chips: 2 }
    );
    expect(el.querySelector('[role=progressbar]')).toBeNull();
    expect(el.querySelectorAll('.dh-chip:not(.dh-more)').length).toBe(2);
    expect(q(el, '.dh-more').textContent).toContain('+1');
  });
  test('nothing to show renders nothing', () => {
    expect(mount({}).querySelector('.detail-header')).toBeNull();
  });
  test('Arabic: Arabic digits and words in "N of M" order', () => {
    localStorage.setItem('beads-ui.lang', 'ar');
    const text = q(mount(issue), '.dh-text').textContent || '';
    expect(text).toMatch(/٤ من ٧ وزن/);
  });
});

describe('fitCount (chips cap at 2 lines by layout)', () => {
  test('everything fits in 2 rows -> all shown', () => {
    expect(fitCount([0, 0, 30, 30], () => 30)).toBe(4);
  });
  test('third row hidden', () => {
    expect(fitCount([0, 0, 30, 30, 60, 60], () => 30)).toBe(4);
  });
  test('+N must fit in row 2, else more chips drop', () => {
    // with 4 shown, +N would wrap to row 3; with 3 it fits
    expect(fitCount([0, 0, 30, 30, 60], (n) => (n >= 4 ? 60 : 30))).toBe(3);
  });
});
