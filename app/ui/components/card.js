import { html } from 'lit-html';

/**
 * Card frame with a start-edge accent bar. accent: amber (decision), teal
 * (steps), blue (action), none (task).
 *
 * @param {{ accent?: 'amber'|'teal'|'blue'|'none', head?: any, body?: any, foot?: any, label?: string }} o
 */
export function card(o) {
  return html`<article
    class="u3-card u3-card--${o.accent || 'none'}"
    aria-label=${o.label ?? ''}
  >
    ${o.head ? html`<header class="u3-card__head">${o.head}</header>` : ''}
    ${o.body ? html`<div class="u3-card__body">${o.body}</div>` : ''}
    ${o.foot ? html`<footer class="u3-card__foot">${o.foot}</footer>` : ''}
  </article>`;
}
