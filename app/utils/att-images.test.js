import { render } from 'lit-html';
import { describe, expect, test } from 'vitest';
import { attifyHtml } from './att-images.js';
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
  test('other links and traversal paths are untouched', () => {
    const h =
      '<a href="/att/../x/2026-11/0123456789abcdef.png">a</a><a href="/att/a/b.png">b</a>';
    expect(attifyHtml(h)).toBe(h);
  });
});
