import { beforeEach, describe, expect, test } from 'vitest';
import { setLang, t } from '../utils/i18n.js';

describe('detail strings in Arabic', () => {
  beforeEach(() => window.localStorage.setItem('beads-ui.lang', 'en'));
  test('buttons, dialog and toasts have Arabic', () => {
    window.localStorage.setItem('beads-ui.lang', 'ar');
    for (const k of [
      'Save',
      'Cancel',
      'Delete Issue',
      'Failed to save notes',
      'Failed to update priority',
      'This action cannot be undone.',
      'No issue selected'
    ]) {
      expect(t(k)).not.toBe(k);
    }
  });
});

describe('dialog chrome in Arabic (1bo5.6.28.2)', () => {
  test('close, copy-id and type badge are not English', async () => {
    window.localStorage.setItem('beads-ui.lang', 'ar');
    const { createTypeBadge } = await import('../utils/type-badge.js');
    const { createIssueIdRenderer } =
      await import('../utils/issue-id-renderer.js');
    const badge = createTypeBadge('task');
    expect(badge.textContent).toBe('مهمة');
    expect(badge.getAttribute('aria-label')).not.toMatch(/Issue type|Task/);
    const btn = createIssueIdRenderer('X-1');
    expect(btn.getAttribute('title')).not.toMatch(/Copy/);
    expect(btn.getAttribute('aria-label')).not.toMatch(/Copy/);
    const mount = document.createElement('div');
    const { createIssueDialog } = await import('./issue-dialog.js');
    createIssueDialog(mount, /** @type {any} */ ({}), () => {});
    expect(
      mount.querySelector('.issue-dialog__close')?.getAttribute('aria-label')
    ).toBe('إغلاق');
    window.localStorage.setItem('beads-ui.lang', 'en');
  });
});
