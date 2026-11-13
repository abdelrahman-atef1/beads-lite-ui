import { html, render } from 'lit-html';
import { t3 } from '../i18n.js';

/**
 * Placeholder screen until its task replaces it. A later task rewrites its OWN
 * view file (mount(el, ctx) -> { unmount?, update?(route) }); this helper stays.
 *
 * @param {string} name
 */
export function stubView(name) {
  return function mount(/** @type {HTMLElement} */ el) {
    render(
      html`<section class="u3-stub" data-view=${name}>
        <h2>${t3('u3_' + name)}</h2>
        <p class="u3-muted">${t3('u3_soon')}</p>
      </section>`,
      el
    );
    return { unmount: () => render(html``, el) };
  };
}
