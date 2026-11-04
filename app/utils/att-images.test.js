import { render } from 'lit-html';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { attifyHtml, bindAttClicks, setImgContext } from './att-images.js';
import { linkifyText } from './linkify-ids.js';
import { renderMarkdown } from './markdown.js';

const P = '/att/alpha/2026-11/0123456789abcdef.png';

describe('att images', () => {
  test('markdown link becomes thumbnail', () => {
    const d = document.createElement('div');
    render(renderMarkdown(`Screenshot: [x](${P})`), d);
    const a = d.querySelector('a.att-thumb');
    expect(a?.getAttribute('data-att')).toBe(P);
    expect(d.querySelector('img.att-img')?.getAttribute('loading')).toBe(
      'lazy'
    );
  });
  test('plain comment text: md form and bare path', () => {
    const d = document.createElement('div');
    render(linkifyText(`see [x](${P}) and ${P} end`), d);
    expect(d.querySelectorAll('img.att-img').length).toBe(2);
    expect(d.textContent).toContain('see');
    expect(d.textContent).toContain('end');
  });
  test('description: md image and bare /att path become thumbnails (1bo5.6.28.2)', () => {
    const d = document.createElement('div');
    render(
      renderMarkdown(`![shot](${P})

text ${P} end

\`${P}\``),
      d
    );
    // md image and bare path -> thumbnails; the code span stays code
    expect(d.querySelectorAll('a.att-thumb').length).toBe(2);
    expect(d.querySelectorAll('a.att-thumb > img.att-img').length).toBe(2);
    expect(d.querySelectorAll('img').length).toBe(2);
    expect(d.querySelector('code')?.textContent).toBe(P);
  });
  test('detail.css keeps long text as block flow (1bo5.6.28.1)', () => {
    const css = readFileSync('app/css/detail.css', 'utf8');
    const rule = css.match(/#issue-dialog \.md\.editable\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/display:\s*block/);
  });
  test('other links and traversal paths are untouched', () => {
    const h =
      '<a href="/att/../x/2026-11/0123456789abcdef.png">a</a><a href="/att/a/b.png">b</a>';
    expect(attifyHtml(h)).toBe(h);
  });
});

describe('local image refs in bead text (1bo5.6.28.2)', () => {
  const srcs = (/** @type {HTMLElement} */ d) =>
    Array.from(d.querySelectorAll('img.att-img')).map((i) =>
      decodeURIComponent(i.getAttribute('src') || '')
    );

  test('markdown: ![](x), [t](x), `code`, bare name, abs path, relative path', () => {
    setImgContext({ bead: 'p-1', workspace: 'E:/Projects/p' });
    const d = document.createElement('div');
    render(
      renderMarkdown(
        [
          '![alt](docs/qa/a.png)',
          '[see](b.png)',
          '`c.png`',
          '(docs/x/p.png, merged) prose d.png here and H:/Projects/qa-shots/e.jpg.',
          'remote https://tile.openstreetmap.org/z/x/y.png stays',
          'in a fence:\n\n```\nf.png\n```'
        ].join('\n\n')
      ),
      d
    );
    const got = srcs(d).map((s) => new URL(s, 'http://x').searchParams);
    expect(got.map((q) => q.get('ref'))).toEqual([
      'docs/qa/a.png',
      'b.png',
      'c.png',
      'docs/x/p.png',
      'd.png',
      'H:/Projects/qa-shots/e.jpg'
    ]);
    expect(got[0].get('bead')).toBe('p-1');
    expect(got[0].get('w')).toBe('E:/Projects/p');
    // the remote url is not turned into a local request
    expect(d.innerHTML).not.toMatch(/local-img\?[^"]*openstreetmap/);
  });

  test('plain comment text gets thumbnails too, ids still link', () => {
    const d = document.createElement('div');
    render(linkifyText('QA after.png and see p-12 ok'), d);
    expect(srcs(d)).toHaveLength(1);
    expect(d.textContent).toContain('p-12');
  });

  test('a thumbnail whose file is missing turns back into its text', () => {
    const d = document.createElement('div');
    document.body.appendChild(d);
    bindAttClicks(d);
    render(linkifyText('see gone.png now'), d);
    d.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(d.querySelector('img')).toBeNull();
    expect(d.textContent).toBe('see gone.png now');
    d.remove();
  });

  test('tap opens the enlarged view for a local thumbnail', () => {
    const d = document.createElement('div');
    document.body.appendChild(d);
    bindAttClicks(d);
    render(linkifyText('x.png'), d);
    d.querySelector('a')?.click();
    expect(document.querySelector('dialog.att-lightbox img')).not.toBeNull();
    document.querySelector('dialog.att-lightbox')?.remove();
    d.remove();
  });
});
