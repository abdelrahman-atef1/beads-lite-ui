/**
 * Safe markdown for ask-Claude answers (beads-lite-1bo5.6.59.8, fixes .56 QA
 * low finding 1). Subset only: paragraphs, headings (shown as bold lines),
 * bullet and numbered lists, **bold**, *italic*, `code`, fenced code blocks.
 *
 * Safety (SEC B9, plain-text guarantee kept): output is built only with
 * createElement + textContent. No innerHTML, no raw HTML, no links, no
 * images: anything else in the answer ("<img onerror=...>", "[x](javascript:)")
 * stays literal text. Code blocks are dir="ltr"; each text block is dir="auto".
 */

/**
 * @param {string} tag
 * @param {string} [text]
 */
function el(tag, text) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Inline spans inside one block of text.
 *
 * @param {HTMLElement} parent
 * @param {string} text
 */
export function appendInline(parent, text) {
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    if (m[1] != null) {
      const c = el('code', m[1]);
      c.dir = 'ltr';
      c.className = 'u3-ask__ic';
      parent.append(c);
    } else if (m[2] != null) parent.append(el('strong', m[2]));
    else parent.append(el('em', m[3]));
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

/**
 * @param {string} src
 * @returns {DocumentFragment}
 */
export function renderMarkdown(src) {
  const out = document.createDocumentFragment();
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  /** @type {string[]} */
  let para = [];
  /** @type {{ tag: 'ul' | 'ol', items: string[] } | null} */
  let list = null;

  const flushPara = () => {
    if (!para.length) return;
    const p = el('p');
    p.dir = 'auto';
    appendInline(p, para.join(' '));
    out.append(p);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const l = el(list.tag);
    for (const it of list.items) {
      const li = el('li');
      li.dir = 'auto';
      appendInline(li, it);
      l.append(li);
    }
    out.append(l);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushPara();
      flushList();
      /** @type {string[]} */
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i++]);
      const pre = el('pre');
      pre.dir = 'ltr';
      pre.className = 'u3-ask__code';
      pre.append(el('code', code.join('\n')));
      out.append(pre);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const p = el('p');
      p.dir = 'auto';
      p.className = 'u3-ask__h';
      appendInline(p, h[1]);
      out.append(p);
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(/** @type {RegExpExecArray} */ (ul || ol)[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out;
}
