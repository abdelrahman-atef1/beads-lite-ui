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
  // Chips are capped by layout (2 lines), not by count: fitChips() hides the
  // overflow after render. max_chips stays only as a hard test/escape hatch.
  const shown = opts.max_chips ? actors.slice(0, opts.max_chips) : actors;
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
          ${shown.map(chip)}
          <li class="dh-chip dh-more" data-n=${more} ?hidden=${more <= 0}>
            ${more > 0 ? `+${num(more)}` : ''}
          </li>
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

/**
 * Pure: given each chip's row (offsetTop) and the +N chip's, how many chips
 * stay visible so everything fits in `lines` rows. The +N chip must itself sit
 * inside the last allowed row, so chips are dropped from the end until it does.
 *
 * @param {number[]} tops - offsetTop of each chip in order
 * @param {(visible: number) => number} moreTop - offsetTop the +N chip would
 *   get if only `visible` chips were shown
 * @param {number} [lines]
 * @returns {number} visible chip count
 */
export function fitCount(tops, moreTop, lines = 2) {
  const rows = [...new Set(tops)].sort((a, b) => a - b);
  if (rows.length <= lines) return tops.length;
  const limit = rows[lines - 1];
  let n = tops.filter((t) => t <= limit).length;
  while (n > 0 && moreTop(n) > limit) n--;
  return n;
}

/**
 * Hide chips beyond two lines and show "+N" for them. Layout-based, so it is
 * right on PC and phone and in LTR and RTL. Call after every render.
 *
 * @param {ParentNode} root
 * @param {(n: number) => string} [fmt]
 */
export function fitChips(root, fmt = (n) => String(n)) {
  const ul = /** @type {HTMLElement|null} */ (root.querySelector('.dh-chips'));
  if (!ul) return;
  const more = /** @type {HTMLElement|null} */ (ul.querySelector('.dh-more'));
  const chips = /** @type {HTMLElement[]} */ ([
    ...Array.from(ul.querySelectorAll('.dh-chip:not(.dh-more)'))
  ]);
  const forced = Number(more?.dataset.n || 0);
  for (const c of chips) c.hidden = false;
  if (more) {
    more.hidden = true;
    more.textContent = '';
  }
  if (chips.length === 0) return;
  const tops = chips.map((c) => c.offsetTop);
  const show = (/** @type {number} */ k) => {
    chips.forEach((c, i) => (c.hidden = i >= k));
    if (!more) return;
    const hid = chips.length - k + forced;
    more.hidden = hid <= 0;
    more.textContent = hid > 0 ? `+${fmt(hid)}` : '';
  };
  const k = fitCount(tops, (n) => {
    show(n);
    return more ? more.offsetTop : 0;
  });
  show(k);
}
