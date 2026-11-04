import { html } from 'lit-html';
import { getLang } from './i18n.js';

/**
 * Report screenshots live at /att/<project>/<yyyy-mm>/<sha16>.<ext>. Show them
 * inline (small thumbnail, lazy) and open a larger view on tap/click.
 *
 * Agents also name images as plain text (bare file names, project-relative or
 * absolute paths). Those become thumbnails served by GET /api/local-img, which
 * is confined server-side; if the server has no such file the thumbnail turns
 * back into the original text (beads-lite-1bo5.6.28.2).
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
const alt = () => ALT[getLang() === 'ar' ? 'ar' : 'en'];

const LOCAL_URL = '/api/local-img?';
const LOCAL_RE =
  /(?<![\w/\\.:%@~-])((?:[A-Za-z]:[\\/]|~\/)?(?:[\w.@()+-]+[\\/])*[\w.@()+-]+\.(?:png|jpe?g|webp|gif))(?![\w/-])/gi;
const LOCAL_ONE =
  /^(?:[A-Za-z]:[\\/]|~\/)?(?:[\w.@()+-]+[\\/])*[\w.@()+-]+\.(?:png|jpe?g|webp|gif)$/i;

/** Which bead / workspace the text being rendered belongs to. */
const ctx = { bead: '', workspace: '' };

/** @param {{ bead?: string, workspace?: string }} next */
export function setImgContext(next) {
  if (next.bead !== undefined) ctx.bead = next.bead;
  if (next.workspace !== undefined) ctx.workspace = next.workspace;
}

/** @param {string} ref */
export function localSrc(ref) {
  const q = new URLSearchParams({ ref });
  if (ctx.bead) q.set('bead', ctx.bead);
  if (ctx.workspace) q.set('w', ctx.workspace);
  return LOCAL_URL + q.toString();
}

/**
 * A ref that is a plain local image reference (not a URL, not /att/).
 *
 * @param {string} ref
 */
function isLocalRef(ref) {
  return LOCAL_ONE.test(ref) && !PATH_RE.test(ref);
}

/**
 * @param {string} src
 * @param {string} [ref] original text, restored if the image fails to load
 */
function thumbHtml(src, ref) {
  const r = ref ? ` data-ref="${ref.replace(/"/g, '&quot;')}"` : '';
  return `<a class="att-thumb" href="${src}" data-att="${src}"${r}><img class="att-img" src="${src}" alt="${alt()}" loading="lazy" decoding="async"></a>`;
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
 * In sanitised HTML, turn local image references (markdown images and links,
 * `code` spans, bare names and paths in prose) into thumbnails.
 *
 * @param {string} html_string
 */
export function localifyHtml(html_string) {
  if (typeof document === 'undefined') return html_string;
  if (!/\.(?:png|jpe?g|webp|gif)/i.test(html_string)) return html_string;
  const tpl = document.createElement('template');
  tpl.innerHTML = html_string;
  const root = tpl.content;
  /** @param {string} ref */
  const make = (ref) => {
    const t = document.createElement('template');
    t.innerHTML = thumbHtml(localSrc(ref), ref);
    return /** @type {Element} */ (t.content.firstElementChild);
  };
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const ref = img.getAttribute('src') || '';
    if (isLocalRef(ref)) img.replaceWith(make(ref));
  }
  for (const a of Array.from(root.querySelectorAll('a[href]'))) {
    if (a.classList.contains('att-thumb')) continue;
    const ref = a.getAttribute('href') || '';
    if (isLocalRef(ref)) a.replaceWith(make(ref));
  }
  for (const code of Array.from(root.querySelectorAll('code'))) {
    const ref = (code.textContent || '').trim();
    if (isLocalRef(ref) && !code.closest('a, pre')) code.replaceWith(make(ref));
  }
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  /** @type {Text[]} */
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = /** @type {Text} */ (n).parentElement;
    if (!el || el.closest('a, pre, code, .att-thumb')) continue;
    texts.push(/** @type {Text} */ (n));
  }
  for (const node of texts) {
    const s = node.data;
    if (!/\.(?:png|jpe?g|webp|gif)/i.test(s)) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(LOCAL_RE)) {
      frag.append(s.slice(last, m.index));
      frag.append(make(m[1]));
      last = (m.index ?? 0) + m[0].length;
    }
    if (last === 0) continue;
    frag.append(s.slice(last));
    node.replaceWith(frag);
  }
  return tpl.innerHTML;
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
  /** @param {string} s */
  const withLocal = (s) => {
    /** @type {unknown[]} */
    const parts = [];
    let at = 0;
    for (const m of s.matchAll(LOCAL_RE)) {
      parts.push(...rest(s.slice(at, m.index)));
      const ref = m[1];
      const u = localSrc(ref);
      parts.push(
        html`<a class="att-thumb" href=${u} data-att=${u} data-ref=${ref}
          ><img
            class="att-img"
            src=${u}
            alt=${alt()}
            loading="lazy"
            decoding="async"
        /></a>`
      );
      at = (m.index ?? 0) + m[0].length;
    }
    parts.push(...rest(s.slice(at)));
    return parts;
  };
  for (const m of src.matchAll(TEXT_RE)) {
    const path = m[1] || m[2];
    out.push(...withLocal(src.slice(last, m.index)));
    out.push(
      html`<a class="att-thumb" href=${path} data-att=${path}
        ><img
          class="att-img"
          src=${path}
          alt=${alt()}
          loading="lazy"
          decoding="async"
      /></a>`
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(...withLocal(src.slice(last)));
  return out;
}

/** @type {HTMLDialogElement | null} */
let box = null;

/** @param {string} src */
export function openLightbox(src) {
  if (!PATH_RE.test(src) && !src.startsWith(LOCAL_URL)) return;
  if (!box) {
    box = document.createElement('dialog');
    box.className = 'att-lightbox';
    box.addEventListener('click', () => box?.close());
    document.body.appendChild(box);
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt();
  box.replaceChildren(img);
  if (box.open) return;
  if (typeof box.showModal === 'function') box.showModal();
  else box.setAttribute('open', '');
}

const bound = new WeakSet();

/**
 * One delegated click handler: tap on a thumbnail opens the enlarged view. A
 * thumbnail whose file the server does not have turns back into its text.
 *
 * @param {HTMLElement} root
 */
export function bindAttClicks(root) {
  if (bound.has(root)) return;
  bound.add(root);
  root.addEventListener(
    'error',
    (ev) => {
      const img = /** @type {HTMLElement} */ (ev.target);
      const a = img.closest?.('.att-thumb');
      const ref = a?.getAttribute('data-ref');
      if (a && ref) a.replaceWith(document.createTextNode(ref));
    },
    true
  );
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
