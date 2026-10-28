import { beforeEach, describe, expect, test } from 'vitest';
import { createPriorityBadge } from './priority-badge.js';

describe('utils/priority-badge', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beads-ui.lang');
  });

  test('renders an SVG icon per level with no P0..P4 text', () => {
    const names = ['Critical', 'High', 'Medium', 'Low', 'Backlog'];
    const shapes = new Set();
    names.forEach((name, p) => {
      const el = createPriorityBadge(p);
      expect(el.tagName.toLowerCase()).toBe('svg');
      expect(el.classList.contains(`is-p${p}`)).toBe(true);
      expect(el.getAttribute('role')).toBe('img');
      expect(el.getAttribute('aria-label')).toBe(`Priority: ${name}`);
      expect(el.querySelector('title')?.textContent).toBe(name);
      expect(el.textContent).not.toMatch(/P\d/);
      shapes.add(el.innerHTML.replace(/<title>.*?<\/title>/, ''));
    });
    // shapes differ, not only colours
    expect(shapes.size).toBe(5);
  });

  test('bars: P1 three solid, P2 two, P3 one', () => {
    const solid = (p) =>
      [...createPriorityBadge(p).querySelectorAll('rect')].filter(
        (r) => !r.hasAttribute('opacity')
      ).length;
    expect([solid(1), solid(2), solid(3)]).toEqual([3, 2, 1]);
  });

  test('missing or out-of-range priority falls back safely', () => {
    expect(createPriorityBadge(undefined).classList.contains('is-p2')).toBe(
      true
    );
    expect(createPriorityBadge(9).classList.contains('is-p4')).toBe(true);
    expect(createPriorityBadge(-1).classList.contains('is-p0')).toBe(true);
  });

  test('Arabic label when UI language is ar', () => {
    window.localStorage.setItem('beads-ui.lang', 'ar');
    const el = createPriorityBadge(0);
    expect(el.getAttribute('aria-label')).toBe('الأولوية: حرجة');
  });
});
