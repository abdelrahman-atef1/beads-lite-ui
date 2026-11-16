/**
 * The board's own icon library: direction C (colour-coded), built from
 * Phosphor Icons fill weight (MIT, app/ui/LICENSE-phosphor-MIT.txt) as inline
 * SVG: no font, no CDN, no runtime fetch (beads-lite-1bo5.6.59.32).
 *
 * One concept, one icon, one tone. Bare glyph on chips and rows, coloured
 * rounded tile (tile: true) for navigation and cards. Directional icons (next, back)
 * are mirrored in RTL by css (.u3-ic--dir). Tones are CSS variables, dark and light.
 */
import { html } from 'lit-html';
import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js';
import { GLYPHS } from './icons-data.js';

const G = /** @type {Record<string, [string, string]>} */ (
  /** @type {unknown} */ (GLYPHS)
);

/** Names older call sites use, kept so one library serves every screen. */
const ALIAS = /** @type {Record<string, string>} */ ({
  select: 'f_select',
  mine: 'f_mine',
  urgent: 'p_urgent',
  decision: 'c_decision',
  blocked: 's_block',
  type: 'f_type',
  label: 'f_label',
  assignee: 'f_assignee',
  prio: 'f_prio',
  project: 'f_project',
  nobody: 'f_nobody',
  any: 'f_any',
  check: 'a_approve',
  caret: 'a_expand',
  bell: 'a_notify',
  outputs: 'c_layers',
  report: 'c_warn',
  bug: 'bug',
  feature: 'feature',
  task: 'task',
  epic: 'epic',
  chore: 'chore',
  story: 'story'
});

/** @param {string} name */
function glyphOf(name) {
  const id = ALIAS[name] || name;
  return G[id] || G.more;
}

/**
 * Tone of an icon: blue amber teal red green purple grey.
 *
 * @param {string} name
 */
export function iconTone(name) {
  return glyphOf(name)[0];
}

/** Every icon id the library draws (tests, sheets). */
export const ICON_IDS = Object.keys(GLYPHS);

/**
 * @param {string} name icon id (or an older alias)
 * @param {{ size?: number, tile?: boolean, tone?: string, label?: string }} [o]
 *   size = glyph px (default 20); tile = coloured square behind it;
 *   tone = override colour; label = accessible name (default: decorative)
 */
export function icon(name, o = {}) {
  const [tone, body] = glyphOf(name);
  const size = o.size || 20;
  const t = o.tone || tone;
  const id = ALIAS[name] || name;
  const cls = `u3-ic u3-ic--${t}${o.tile ? ' u3-ic--tile' : ''}${id === 'a_next' || id === 'a_back' ? ' u3-ic--dir' : ''}`;
  const box = o.tile ? Math.round(size * 1.5) : size;
  const g = html`<svg
    viewBox="0 0 256 256"
    width=${o.tile ? Math.round(size * 0.95) : size}
    height=${o.tile ? Math.round(size * 0.95) : size}
    fill="currentColor"
    aria-hidden="true"
  >
    ${unsafeSVG(body)}
  </svg>`;
  return html`<span
    class=${cls}
    data-icon=${id}
    style=${o.tile
      ? `width:${box}px;height:${box}px;border-radius:${Math.round(box * 0.3)}px`
      : ''}
    role=${o.label ? 'img' : 'presentation'}
    aria-label=${o.label || ''}
    >${g}</span
  >`;
}
