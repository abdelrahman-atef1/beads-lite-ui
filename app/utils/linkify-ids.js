import { html } from 'lit-html';

/**
 * Turn bead ids written in text (any project prefix) into links that open
 * that bead. Opening a bead from another project switches workspace through
 * the normal selected_id path (ensureIssueWorkspace), so a plain hash link is
 * all that is needed, and it keeps browser history (Back returns to the
 * previous bead).
 */

// prefix (letters, may hold -word parts) + "-" + short hash/number + .n parts
const ID_RE =
  /(?<![\w./-])([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*-[a-z0-9]{1,6}(?:\.\d+)*)(?![\w-]|\.\w)/gi;

/** @type {((id: string) => boolean) | null} */
let known = null;

/**
 * Restrict links to ids whose prefix is a known workspace (avoids "utf-8").
 *
 * @param {((id: string) => boolean) | null} fn
 */
export function setKnownIdFilter(fn) {
  known = fn;
}

/** @param {string} id */
function plausible(id) {
  if (known) return known(id);
  const tail = id.split('-').pop() || '';
  return (
    tail.length >= 2 &&
    /\d/.test(tail) &&
    id.split('-').length >= 2 &&
    id.length >= 5
  );
}

/** @param {string} id */
export function beadHref(id) {
  const m = /^#\/(issues|epics|board|decisions)\b/.exec(
    typeof window !== 'undefined' ? window.location.hash || '' : ''
  );
  return `#/${m ? m[1] : 'issues'}?issue=${encodeURIComponent(id)}`;
}

/** @param {string} s */
function esc(s) {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}

/**
 * Link ids inside an HTML string (already sanitised); skips existing links
 * and code blocks.
 *
 * @param {string} html_string
 */
export function linkifyHtml(html_string) {
  let skip = 0;
  return html_string
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(a|code|pre)\b/i.test(part)) skip++;
        else if (/^<\/(a|code|pre)\b/i.test(part)) skip = Math.max(0, skip - 1);
        return part;
      }
      if (skip) return part;
      return part.replace(ID_RE, (id) =>
        plausible(id)
          ? `<a class="bead-link" href="${esc(beadHref(id))}">${id}</a>`
          : id
      );
    })
    .join('');
}

/** @param {Event} ev */
function stop(ev) {
  // Keep an enclosing click-to-edit block from opening its editor.
  ev.stopPropagation();
}

/**
 * Plain text to lit parts with linked ids.
 *
 * @param {string} text
 */
export function linkifyText(text) {
  const out = [];
  let last = 0;
  const src = String(text ?? '');
  for (const m of src.matchAll(ID_RE)) {
    const id = m[0];
    if (!plausible(id)) continue;
    out.push(src.slice(last, m.index));
    out.push(
      html`<a class="bead-link" href=${beadHref(id)} @click=${stop}>${id}</a>`
    );
    last = (m.index ?? 0) + id.length;
  }
  out.push(src.slice(last));
  return out;
}
