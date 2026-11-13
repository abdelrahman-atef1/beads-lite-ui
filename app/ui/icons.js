import { html, svg } from 'lit-html';

/** 24px stroke icons (own simple paths, no icon dependency). */
const P = {
  desk: svg`<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>`,
  tasks: svg`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/>`,
  releases: svg`<path d="M12 3c3 2 4.5 5 4.5 8.5L14 17h-4l-2.5-5.5C7.5 8 9 5 12 3zM10 17l-1 4 3-2 3 2-1-4"/><circle cx="12" cy="10" r="1.5"/>`,
  projects: svg`<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>`,
  settings: svg`<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>`,
  more: svg`<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>`
};

/** @param {string} name */
export function icon(name) {
  const p = /** @type {any} */ (P)[name] || P.more;
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
    ${p}
  </svg>`;
}
