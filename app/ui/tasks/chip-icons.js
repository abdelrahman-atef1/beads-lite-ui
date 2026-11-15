import { html, svg } from 'lit-html';

/** 14px stroke icons for the Tasks filter chips (own paths, no dependency). */
const P = {
  select: svg`<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  mine: svg`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  urgent: svg`<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>`,
  decision: svg`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01"/>`,
  blocked: svg`<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>`,
  type: svg`<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>`,
  label: svg`<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1"/>`,
  assignee: svg`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>`,
  prio: svg`<path d="M5 21V4M5 4h13l-2.5 4 2.5 4H5"/>`
};

/** @param {string} name */
export function chipIcon(name) {
  const p = /** @type {any} */ (P)[name];
  return html`<svg
    class="u3t-ic"
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${p}
  </svg>`;
}
