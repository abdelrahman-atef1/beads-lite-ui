import { t } from './i18n.js';

/**
 * Known issue types in canonical order for dropdowns.
 *
 * @type {Array<'bug'|'feature'|'task'|'epic'|'chore'|'decision'>}
 */
export const ISSUE_TYPES = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision'
];

/**
 * Return a human-friendly label for an issue type.
 *
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function typeLabel(type) {
  switch ((type || '').toString().toLowerCase()) {
    case 'bug':
      return t('Bug');
    case 'feature':
      return t('Feature');
    case 'task':
      return t('Task');
    case 'epic':
      return t('Epic');
    case 'chore':
      return t('Chore');
    case 'decision':
      return t('Decision');
    default:
      return '';
  }
}
