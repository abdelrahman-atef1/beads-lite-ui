import { html, svg } from 'lit-html';

const P = {
  bell: svg`<path d="M6 16.5h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.3zM10 19.5h4"/>`,
  outputs: svg`<path d="M12 3 3.5 7.5 12 12l8.5-4.5zM3.5 12 12 16.5l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>`,
  report: svg`<path d="M12 3.5 21 19H3zM12 10v4M12 16.6v.1"/>`
};

/** @param {'bell'|'outputs'|'report'} name */
export function pIcon(name) {
  return html`<svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${P[name]}
  </svg>`;
}
