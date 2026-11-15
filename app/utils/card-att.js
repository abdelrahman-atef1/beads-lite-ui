import { html, nothing } from 'lit-html';

/**
 * Approval-card attachments (beads-lite-1bo5.6.59.29): metadata.card_att is a
 * JSON list of 1-6 {a, n?, h?}. `a` is an image already in the /att/ store;
 * only that shape is ever drawn (no outside image URL loads in a card). `h`
 * is an optional https link shown as a tap target, never fetched.
 */
export const ATT_MAX = 6;
const A_RE = /^[A-Za-z0-9_-]+\/\d{4}-\d{2}\/[0-9a-f]{16}\.(?:png|jpe?g|webp)$/;
const CAP_MAX = 40;
const H_MAX = 300;

/**
 * Link rule: https only; host is a tailnet name or the artifact host.
 *
 * @param {string} h
 */
function okLink(h) {
  if (h.length > H_MAX) return false;
  try {
    const u = new URL(h);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (/\.ts\.net$/i.test(u.hostname) || /(^|\.)claude\.ai$/i.test(u.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * Re-check raw card_att (JSON string or array): keep valid items only, cap 6.
 *
 * @param {unknown} raw
 * @returns {Array<{ src: string, n: string, h: string }>}
 */
export function cleanAtt(raw) {
  /** @type {any} */
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  /** @type {Array<{ src: string, n: string, h: string }>} */
  const out = [];
  for (const it of list) {
    if (out.length >= ATT_MAX) break;
    if (!it || typeof it.a !== 'string' || !A_RE.test(it.a)) continue;
    const n =
      typeof it.n === 'string'
        ? it.n
            .replace(/[\r\n]+/g, ' ')
            .trim()
            .slice(0, CAP_MAX)
        : '';
    const h = typeof it.h === 'string' && okLink(it.h) ? it.h : '';
    out.push({ src: '/att/' + it.a, n, h });
  }
  return out;
}

/**
 * Full-size view on a phone: tap anywhere or Esc closes.
 *
 * @param {string} src
 * @param {string} alt
 */
function lightbox(src, alt) {
  const box = document.createElement('div');
  box.className = 'att-lightbox';
  box.setAttribute('role', 'dialog');
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  box.append(img);
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(box);
}

/**
 * Thumbnail strip. Tap opens the image full size: in-page lightbox on a
 * phone-width screen, a new tab on desktop.
 *
 * @param {Array<{ src: string, n: string, h: string }> | undefined} items
 * @param {{ label: string, open: string, link: string }} words
 */
export function attStrip(items, words) {
  if (!items || !items.length) return nothing;
  return html`<div class="att-strip" data-att="${items.length}">
    <b class="att-strip__lbl">${words.label}</b>
    <ul class="att-strip__list">
      ${items.map(
        (it) =>
          html`<li class="att-strip__item">
            <a
              class="att-strip__thumb"
              href=${it.src}
              target="_blank"
              rel="noopener"
              title=${words.open}
              @click=${(/** @type {MouseEvent} */ ev) => {
                if (
                  ev.ctrlKey ||
                  ev.metaKey ||
                  ev.shiftKey ||
                  ev.button !== 0
                ) {
                  return;
                }
                if (window.matchMedia?.('(max-width: 640px)').matches) {
                  ev.preventDefault();
                  lightbox(it.src, it.n || words.label);
                }
              }}
              ><img src=${it.src} alt=${it.n || words.label} loading="lazy"
            /></a>
            ${it.n
              ? html`<span class="att-strip__cap" dir="auto">${it.n}</span>`
              : nothing}
            ${it.h
              ? html`<a
                  class="att-strip__link"
                  href=${it.h}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${words.link}</a
                >`
              : nothing}
          </li>`
      )}
    </ul>
  </div>`;
}
