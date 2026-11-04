/**
 * Bead header strip: who worked on it (icon + name), current assignee
 * highlighted, weighted progress bar (beads-lite-1bo5.6.47). Pure render from
 * data the detail view already has, plus an optional weights map.
 */
import { html } from 'lit-html';
import { actorInfo } from '../data/roles.js';
import { getLang, t } from '../utils/i18n.js';
import { deriveActors, parseSteps, progress } from '../utils/progress.js';

/** @param {number} n */
function num(n) {
  return new Intl.NumberFormat(getLang() === 'ar' ? 'ar-EG' : 'en').format(n);
}

/**
 * @param {any} issue
 * @param {{ weights?: Record<string, number|string>, max_chips?: number }} [opts]
 */
export function renderDetailHeader(issue, opts = {}) {
  const comments = Array.isArray(issue.comments) ? issue.comments : [];
  const actors = deriveActors(issue, comments, (a) => actorInfo(a).known);
  const assignee = String(issue.assignee || '').trim();
  const children = (
    Array.isArray(issue.dependents) ? issue.dependents : []
  ).filter((/** @type {any} */ d) => d && d.dependency_type === 'parent-child');
  const steps = parseSteps(
    issue.description,
    issue.acceptance || issue.acceptance_criteria
  );
  const pr = progress(children, steps, opts.weights || {});
  const max = opts.max_chips ?? 6;
  const shown = actors.slice(0, max);
  const more = actors.length - shown.length;

  const chip = (/** @type {string} */ a) => {
    const info = actorInfo(a);
    const cur = a === assignee;
    return html`<li
      class="dh-chip${cur ? ' dh-chip--current' : ''}"
      data-actor=${info.id}
      title=${cur ? t('Assigned to') : ''}
    >
      <span class="dh-icon" aria-hidden="true">${info.icon}</span>
      <span class="dh-name">${info.name}</span>
      ${cur ? html`<span class="dh-tag">${t('Assigned to')}</span>` : ''}
    </li>`;
  };

  if (actors.length === 0 && pr.total === 0) {
    return html``;
  }
  return html`<div class="detail-header" data-testid="detail-header">
    ${actors.length
      ? html`<ul class="dh-chips" aria-label=${t('Worked on by')}>
          ${shown.map(chip)}${more > 0
            ? html`<li class="dh-chip dh-more">+${num(more)}</li>`
            : ''}
        </ul>`
      : ''}
    ${pr.total > 0
      ? html`<div class="dh-progress">
          <div
            class="dh-bar"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax=${pr.total}
            aria-valuenow=${pr.done}
            aria-label=${t('Progress')}
          >
            <div class="dh-fill" style=${`width:${pr.pct}%`}></div>
          </div>
          <span class="dh-text"
            >${num(pr.done)} ${t('of')} ${num(pr.total)} ${t('weight')}</span
          >
        </div>`
      : ''}
  </div>`;
}
