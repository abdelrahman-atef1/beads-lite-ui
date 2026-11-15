import { render } from 'lit-html';
import { beforeEach, expect, test } from 'vitest';
import { personChip } from './person-chip.js';

beforeEach(() => localStorage.setItem('beads-ui.lang', 'ar'));

test('full chip shows name - title; short shows name, title opens on tap', () => {
  const d = document.createElement('div');
  render(personChip({ role: 'cos' }), d);
  expect(d.textContent).toContain('مارد وشوشني - مدير المكتب');
  render(personChip({ role: 'cos', short: true }), d);
  const el = /** @type {HTMLElement} */ (d.querySelector('.u3-role--short'));
  expect(el.title).toBe('مارد وشوشني - مدير المكتب');
  expect(el.hasAttribute('data-open')).toBe(false);
  el.click();
  expect(el.hasAttribute('data-open')).toBe(true);
});
