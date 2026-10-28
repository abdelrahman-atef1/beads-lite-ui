import { getLang } from './i18n.js';
import { clampPriority, priorityName } from './priority.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Inner SVG markup per level. Shapes differ, not only colours:
 * P0 filled square with "!", P1/P2/P3 three/two/one filled bars (rest dimmed),
 * P4 dashed line (none).
 *
 * @param {number} p - clamped 0..4
 * @returns {string}
 */
function glyph(p) {
  if (p === 0) {
    return (
      '<rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor"/>' +
      '<path d="M8 4.5v4.5M8 11.2v.6" stroke="var(--bg, #fff)" stroke-width="1.7" stroke-linecap="round"/>'
    );
  }
  if (p === 4) {
    return '<path d="M2.5 8h3M6.5 8h3M10.5 8h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  }
  const filled = 4 - p;
  return [
    [2, 5],
    [6.5, 8],
    [11, 11]
  ]
    .map(
      ([x, h], k) =>
        `<rect x="${x}" y="${14 - h}" width="3" height="${h}" rx="1" fill="currentColor"${k < filled ? '' : ' opacity=".3"'}/>`
    )
    .join('');
}

/**
 * Priority as a Linear-style SVG icon (no P0..P4 text). The name lives in
 * aria-label and the tooltip.
 *
 * @param {number | null | undefined} priority
 * @returns {SVGSVGElement}
 */
export function createPriorityBadge(priority) {
  const p = clampPriority(priority);
  const name = priorityName(p);
  const label = `${getLang() === 'ar' ? 'الأولوية' : 'Priority'}: ${name}`;
  const el = /** @type {SVGSVGElement} */ (document.createElementNS(NS, 'svg'));
  el.setAttribute('class', `pi priority-icon is-p${p}`);
  el.setAttribute('viewBox', '0 0 16 16');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.setAttribute('data-priority', String(p));
  el.innerHTML = `<title>${name}</title>${glyph(p)}`;
  return el;
}

/**
 * @param {number} p
 */
export function emojiForPriority(p) {
  switch (p) {
    case 0:
      return '🔥';
    case 1:
      return '⚡️';
    case 2:
      return '🔧';
    case 3:
      return '🪶';
    case 4:
      return '💤';
    default:
      return '🔧';
  }
}
