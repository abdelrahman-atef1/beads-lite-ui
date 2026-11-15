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
  prio: svg`<path d="M5 21V4M5 4h13l-2.5 4 2.5 4H5"/>`,
  project: svg`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  nobody: svg`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M3 3l18 18"/>`,
  check: svg`<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  caret: svg`<path d="m6 9 6 6 6-6"/>`,
  any: svg`<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  bug: svg`<rect x="8" y="8" width="8" height="11" rx="4"/><path d="M12 8V5M5 12h3M16 12h3M6 18l2.5-2M18 18l-2.5-2M7 7l2 2M17 7l-2 2"/>`,
  feature: svg`<path d="m12 3 2.2 5.3L20 9l-4.3 3.8L17 18.5 12 15.6 7 18.5l1.3-5.7L4 9l5.8-.7z"/>`,
  task: svg`<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12h7M8.5 8.5h7M8.5 15.5h4"/>`,
  epic: svg`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
  chore: svg`<path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>`,
  story: svg`<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>`
};

const TYPES = ['bug', 'feature', 'task', 'epic', 'chore', 'story'];

/**
 * Icon name for an issue type (unknown types fall back to the Type icon).
 *
 * @param {string} t
 */
export function typeIconName(t) {
  return TYPES.includes(t) ? t : 'type';
}

/**
 * @param {string} name
 * @param {string} [cls] extra class (tone)
 */
export function chipIcon(name, cls = '') {
  const p = /** @type {any} */ (P)[name];
  return html`<svg
    class="u3t-ic ${cls}"
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
