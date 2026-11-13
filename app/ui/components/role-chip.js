import { html } from 'lit-html';

const ROLES = [
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
 * Role chip: coloured dot + role text (LTR code, never wrapped).
 *
 * @param {{ role: string, state?: 'active'|'idle' }} o
 */
export function roleChip(o) {
  const r = String(o.role || '').toLowerCase();
  const known = ROLES.includes(r) ? r : 'other';
  return html`<span class="u3-role u3-role--${known}" dir="ltr"
    ><i class="u3-role__dot" aria-hidden="true"></i>${r.toUpperCase()}</span
  >`;
}
