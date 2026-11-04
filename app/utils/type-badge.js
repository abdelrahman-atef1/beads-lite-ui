import { t as tr } from './i18n.js';
import { typeLabel } from './issue-type.js';

/**
 * Create a compact, colored badge for an issue type.
 *
 * @param {string | undefined | null} issue_type - One of: bug, feature, task, epic, chore, decision
 * @returns {HTMLSpanElement}
 */
export function createTypeBadge(issue_type) {
  const el = document.createElement('span');
  el.className = 'type-badge';

  const t = (issue_type || '').toString().toLowerCase();
  const KNOWN = new Set([
    'bug',
    'feature',
    'task',
    'epic',
    'chore',
    'decision'
  ]);
  const kind = KNOWN.has(t) ? t : 'neutral';
  el.classList.add(`type-badge--${kind}`);
  el.setAttribute('role', 'img');
  const label = KNOWN.has(t) ? typeLabel(t) : '—';
  el.setAttribute(
    'aria-label',
    KNOWN.has(t) ? `${tr('Issue type')}: ${label}` : `${tr('Issue type')}: ?`
  );
  el.setAttribute(
    'title',
    KNOWN.has(t) ? `${tr('Type')}: ${label}` : `${tr('Type')}: ?`
  );
  el.textContent = label;
  return el;
}
