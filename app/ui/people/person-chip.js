import { html } from 'lit-html';
import { personLabel, uiDir } from '../data/people.js';

const KNOWN = [
  'cto',
  'swe',
  'sre',
  'sec',
  'pm',
  'ux',
  'qa',
  'cos',
  'legal',
  'analytics',
  'sup'
];

/**
 * Person chip: coloured dot + "name - title". With short = true (tight rows)
 * only the name shows; the title is in the tooltip and opens on tap/Enter.
 * Same classes as roleChip, so the dot colours stay.
 *
 * @param {{ role: string, short?: boolean }} o
 */
export function personChip(o) {
  const r = String(o.role || '').toLowerCase();
  const p = personLabel(r);
  const known = KNOWN.includes(r) ? r : 'other';
  const dot = html`<i class="u3-role__dot" aria-hidden="true"></i>`;
  if (!p.known) {
    return html`<span class="u3-role u3-role--other" dir="ltr"
      >${dot}${r}</span
    >`;
  }
  if (!o.short || !p.title || p.title === p.name) {
    return html`<span
      class="u3-role u3-role--${known} u3-role--full"
      dir=${uiDir()}
      >${dot}${p.full}</span
    >`;
  }
  /** @param {Event} e */
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.toggleAttribute('data-open');
  };
  return html`<span
    class="u3-role u3-role--${known} u3-role--short"
    dir=${uiDir()}
    tabindex="0"
    role="button"
    title=${p.full}
    aria-label=${p.full}
    @click=${toggle}
    @keydown=${(/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter' || e.key === ' ') toggle(e);
    }}
    >${dot}<bdi>${p.name}</bdi
    ><span class="u3-role__title"> - <bdi>${p.title}</bdi></span></span
  >`;
}
