import { html } from 'lit-html';

/**
 * One row of a list: status dot, title (own direction), meta chips, end text.
 *
 * @param {{ title: string, dot?: string, meta?: any, end?: any, href?: string }} o
 */
export function listRow(o) {
  const inner = html`<i
      class="u3-dot u3-dot--${o.dot || 'neutral'}"
      aria-hidden="true"
    ></i>
    <span class="u3-row__title" dir="auto">${o.title}</span>
    <span class="u3-row__meta">${o.meta ?? ''}</span>
    <span class="u3-row__end">${o.end ?? ''}</span>`;
  return o.href
    ? html`<a class="u3-row" href=${o.href}>${inner}</a>`
    : html`<div class="u3-row">${inner}</div>`;
}
