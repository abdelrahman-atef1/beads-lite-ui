import { afterEach, describe, expect, test } from 'vitest';
import { formatCommentDate, formatDateValue } from './detail.js';

// beads-lite-1bo5.6.48: dates follow the app language, not the browser locale.
const iso = '2026-06-15T12:00:00Z';

afterEach(() => window.localStorage.removeItem('beads-ui.lang'));

describe('detail dates follow the app language', () => {
  test('English UI: Latin month and digits', () => {
    window.localStorage.setItem('beads-ui.lang', 'en');
    for (const f of [formatCommentDate, formatDateValue]) {
      const out = f(iso);
      expect(out).toContain('Jun');
      expect(out).not.toMatch(/[\u0660-\u0669]/);
    }
  });

  test('Arabic UI: Arabic-Indic digits, no Latin month', () => {
    window.localStorage.setItem('beads-ui.lang', 'ar');
    for (const f of [formatCommentDate, formatDateValue]) {
      const out = f(iso);
      expect(out).toMatch(/[\u0660-\u0669]/);
      expect(out).not.toMatch(/Jun|2026/);
    }
  });
});
