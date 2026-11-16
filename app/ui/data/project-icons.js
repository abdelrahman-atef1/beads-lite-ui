/**
 * Project app icons: the ONE place the board reads them from
 * (beads-lite-1bo5.13.6).
 *
 * Key = project name as the board shows it (the bead id prefix, e.g. "rayeh"
 * for rayeh-123). Value = file under app/icons/projects/. A project's
 * responsible chat registers its icon by copying a square image (PNG or SVG,
 * 48px is enough, under 8 KB) into that folder and adding ONE line here.
 * A project with no entry, or whose file fails to load, shows the coloured dot.
 * Static files only: nothing is fetched until a project name is on screen, and
 * the browser caches them.
 */
import { html } from 'lit-html';

/** @type {Record<string, string>} */
export const PROJECT_ICONS = {
  rayeh: 'rayeh.png',
  fatura: 'fatura.png',
  'whisper-flow': 'whisper-flow.png',
  'patient-record': 'patient-record.svg',
  'abo-ali-market': 'abo-ali-market.png',
  'beads-lite': 'beads-lite.png'
};

const DOTS = ['blue', 'teal', 'amber', 'purple', 'green', 'red'];

/**
 * Stable colour for a project's fallback dot.
 *
 * @param {string} name
 */
export function projectTone(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOTS[h % DOTS.length];
}

/**
 * Icon URL, or '' when the project has none.
 *
 * @param {string} name
 */
export function projectIconUrl(name) {
  const f = PROJECT_ICONS[String(name || '').toLowerCase()];
  return f ? './icons/projects/' + f : '';
}

/**
 * The icon (or the coloured dot) for a project.
 *
 * @param {string} name
 * @param {number} [size] px, default 18
 */
export function projectIcon(name, size = 18) {
  const url = projectIconUrl(name);
  const dot = () => {
    const i = document.createElement('i');
    i.className = `u3-dot u3-dot--${projectTone(name)}`;
    i.setAttribute('aria-hidden', 'true');
    return i;
  };
  if (!url) {
    return html`<i
      class="u3-dot u3-dot--${projectTone(name)}"
      aria-hidden="true"
    ></i>`;
  }
  return html`<img
    class="u3-proj__img"
    src=${url}
    alt=""
    width=${size}
    height=${size}
    loading="lazy"
    decoding="async"
    data-project-icon=${name}
    @error=${(/** @type {Event} */ e) =>
      /** @type {HTMLElement} */ (e.currentTarget).replaceWith(dot())}
  />`;
}

/**
 * A project name with its icon beside it.
 *
 * @param {string} name
 * @param {{ size?: number, mono?: boolean }} [o]
 */
export function projectLabel(name, o = {}) {
  return html`<span class="u3-proj" data-project=${name}
    >${projectIcon(name, o.size)}<span class=${o.mono ? 'u3-mono' : ''}
      >${name}</span
    ></span
  >`;
}
