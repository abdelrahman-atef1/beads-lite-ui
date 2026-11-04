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
