import { html, render } from 'lit-html';
import { renderAskHead } from '../ask/head-slot.js';
import { renderStepsComment } from '../card/steps.js';
import { renderComposerExtras } from '../task/composer-ext.js';
import { renderTimeSlot } from '../task/time-slot.js';

/**
 * Task page stub: shows the deep-link target and calls every seam once so the
 * seams are wired (task 6 replaces this body and keeps calling them).
 *
 * @param {HTMLElement} el
 * @param {any} ctx
 */
export function mount(el, ctx) {
  const draw = (/** @type {any} */ route) =>
    render(
      html`<section class="u3-stub" data-view="task" data-at=${route.at ?? ''}>
        <h2 dir="ltr" class="u3-mono">${route.id}</h2>
        <p class="u3-muted">${route.at ? '#' + route.at : ''}</p>
        ${renderAskHead(route, ctx)} ${renderTimeSlot(null, ctx)}
        ${renderStepsComment(null, ctx)} ${renderComposerExtras(ctx)}
      </section>`,
      el
    );
  draw(ctx.route);
  return { update: draw, unmount: () => render(html``, el) };
}
