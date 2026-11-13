import { html } from 'lit-html';
import { icon } from '../icons.js';

/**
 * Bottom tab bar (phone). items: { name, label, hash?, onClick? }.
 *
 * @param {{ items: { name: string, label: string, hash?: string, onClick?: (e: Event) => void }[], active: string, label?: string }} o
 */
export function tabBar(o) {
  return html`<nav class="u3-tabs" aria-label=${o.label ?? ''}>
    ${o.items.map((i) => {
      const cur = i.name === o.active;
      const body = html`<span class="u3-tabs__ico">${icon(i.name)}</span
        ><span class="u3-tabs__lbl">${i.label}</span>`;
      return i.hash
        ? html`<a
            class="u3-tab"
            href=${i.hash}
            aria-current=${cur ? 'page' : 'false'}
            >${body}</a
          >`
        : html`<button
            class="u3-tab"
            type="button"
            aria-current=${cur ? 'page' : 'false'}
            @click=${i.onClick}
          >
            ${body}
          </button>`;
    })}
  </nav>`;
}
