import { html } from 'lit-html';
import { getLang } from './i18n.js';

/**
 * Report screenshots live at /att/<project>/<yyyy-mm>/<sha16>.<ext>. Show them
 * inline (small thumbnail, lazy) and open a larger view on tap/click.
 */
const PATH =
  '/att/[A-Za-z0-9_-]+/\\d{4}-\\d{2}/[0-9a-f]{16}\\.(?:png|jpe?g|webp)';
const PATH_RE = new RegExp('^' + PATH + '$');
// markdown link form, or the bare path
const TEXT_RE = new RegExp(
  '\\[[^\\]]*\\]\\((' + PATH + ')\\)|(?<![\\w/])(' + PATH + ')',
  'g'
);
const A_RE = new RegExp(
  '<a\\b[^>]*\\bhref="(' + PATH + ')"[^>]*>[\\s\\S]*?</a>',
  'g'
);

const ALT = { en: 'Screenshot', ar: 'لقطة الشاشة' };

/** @param {string} src */
function thumbHtml(src) {
  const alt = ALT[getLang() === 'ar' ? 'ar' : 'en'];
  return `<a class="att-thumb" href="${src}" data-att="${src}"><img class="att-img" src="${src}" alt="${alt}" loading="lazy" decoding="async"></a>`;
}

/**
 * In sanitised HTML, turn links to report screenshots into thumbnails.
 *
 * @param {string} html_string
 */
export function attifyHtml(html_string) {
  return html_string.replace(A_RE, (_m, src) => thumbHtml(src));
}

/**
 * Plain text to lit parts with screenshot thumbnails; other text goes through
 * `rest` (e.g. id linking).
 *
 * @param {string} text
 * @param {(s: string) => unknown[]} rest
 */
export function attifyText(text, rest) {
  const src = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of src.matchAll(TEXT_RE)) {
    const path = m[1] || m[2];
    out.push(...rest(src.slice(last, m.index)));
    out.push(
      html`<a class="att-thumb" href=${path} data-att=${path}
        ><img
          class="att-img"
          src=${path}
          alt=${ALT[getLang() === 'ar' ? 'ar' : 'en']}
          loading="lazy"
          decoding="async"
      /></a>`
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(...rest(src.slice(last)));
  return out;
}

/** @type {HTMLDialogElement | null} */
let box = null;

/** @param {string} src */
export function openLightbox(src) {
  if (!PATH_RE.test(src)) return;
  if (!box) {
    box = document.createElement('dialog');
    box.className = 'att-lightbox';
    box.addEventListener('click', () => box?.close());
    document.body.appendChild(box);
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = ALT[getLang() === 'ar' ? 'ar' : 'en'];
  box.replaceChildren(img);
  if (box.open) return;
  if (typeof box.showModal === 'function') box.showModal();
  else box.setAttribute('open', '');
}

const bound = new WeakSet();

/**
 * One delegated click handler: tap on a thumbnail opens the enlarged view.
 *
 * @param {HTMLElement} root
 */
export function bindAttClicks(root) {
  if (bound.has(root)) return;
  bound.add(root);
  root.addEventListener('click', (ev) => {
    const a = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (ev.target).closest?.('.att-thumb')
    );
    if (!a) return;
    ev.preventDefault();
    ev.stopPropagation();
    openLightbox(a.getAttribute('data-att') || '');
  });
}
