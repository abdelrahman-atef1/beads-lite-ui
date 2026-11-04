import { html } from 'lit-html';
import { getLang, t } from './i18n.js';

/**
 * "Folded text" format (beads-lite-1bo5.6.46): line 1 is the title, an
 * optional lead follows, detail sits under `## Name` sections. Text with no
 * such section is flat and renders as before.
 */

/**
 * @typedef {{ name: string, body: string, lines: number }} FoldSection
 * @typedef {{ title: string, lead: string, sections: FoldSection[] }} Folded
 */

/**
 * Split text into title, lead and sections. Returns null for flat text:
 * no `## ` line outside a code fence, or text that starts with a section
 * heading (an old-style document, left alone).
 *
 * @param {string} text
 * @returns {Folded | null}
 */
export function parseFolded(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  /** @type {number[]} */
  const heads = [];
  let fence = '';
  lines.forEach((line, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = '';
      return;
    }
    if (!fence && /^## \S/.test(line)) heads.push(i);
  });
  if (heads.length === 0) return null;
  const head = lines.slice(0, heads[0]);
  const first = head.findIndex((l) => l.trim() !== '');
  if (first < 0) return null;
  const title = head[first].trim().replace(/^#+\s*/, '');
  const lead = head
    .slice(first + 1)
    .join('\n')
    .trim();
  const sections = heads.map((start, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : lines.length;
    const body = lines
      .slice(start + 1, end)
      .join('\n')
      .trim();
    return {
      name: lines[start].slice(3).trim(),
      body,
      lines: body === '' ? 0 : body.split('\n').length
    };
  });
  return { title, lead, sections };
}

/** Open sections, kept in memory only (key = text hash + index). */
const openKeys = new Set();

/** @param {string} s */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A summary tap/key toggles its section; it must not reach an edit-on-click parent. */
const stop = (/** @type {Event} */ e) => e.stopPropagation();

/**
 * Render folded text, or `flat(text)` when the text is flat.
 *
 * @param {string} text
 * @param {(s: string) => any} body - renders a text fragment (markdown or linkified)
 * @param {(s: string) => any} [flat] - renders flat text; defaults to body
 */
export function renderFolded(text, body, flat = body) {
  const p = parseFolded(text);
  if (!p) return flat(text);
  const base = hash(String(text));
  return html`<div class="fold">
    <div class="fold-title" dir="auto">${p.title}</div>
    ${p.lead
      ? html`<div class="fold-lead" dir="auto">${body(p.lead)}</div>`
      : ''}
    ${p.sections.map((s, i) => {
      const key = base + ':' + i;
      return html`<details
        class="fold-sec"
        ?open=${openKeys.has(key)}
        @toggle=${(/** @type {Event} */ e) => {
          if (/** @type {HTMLDetailsElement} */ (e.target).open)
            openKeys.add(key);
          else openKeys.delete(key);
        }}
      >
        <summary
          dir="auto"
          @click=${stop}
          @keydown=${stop}
        >
          <span class="fold-name">${s.name}</span>
          <span class="fold-n" dir=${getLang() === 'ar' ? 'rtl' : 'ltr'}
            >${s.lines} ${t(s.lines === 1 ? 'line' : 'lines')}</span
          >
        </summary>
        <div class="fold-body" dir="auto">${body(s.body)}</div>
      </details>`;
    })}
  </div>`;
}
