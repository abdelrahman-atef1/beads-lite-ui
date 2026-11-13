import { html } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { mountAsk } from '../views/ask.js';

/** @type {HTMLElement | null} */
let current = null;

/**
 * Lit calls this with the host element when it appears, undefined when the
 * template removes it (route left the task page).
 *
 * @param {Element | undefined} el
 */
function onHost(el) {
  if (el) {
    current = /** @type {HTMLElement} */ (el);
    mountAsk(current);
  } else {
    /** @type {any} */ (current)?.u3ask?.destroy();
    current = null;
  }
}

/**
 * SEAM (task 8): the ask-Claude head. Task pages only, never the desk.
 * Renders a host element; the widget keeps its state inside it and resets
 * only when `data-id` (the task id) changes.
 *
 * @param {any} route
 * @param {any} ctx
 */
export function renderAskHead(route, ctx) {
  const id = route && typeof route.id === 'string' ? route.id : '';
  if (!id || (route.name && route.name !== 'task')) return html``;
  return html`<div
    class="u3-ask"
    .u3ctx=${ctx}
    data-id=${id}
    ${ref(onHost)}
  ></div>`;
}
