import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './markdown.js';

/** @param {string} src */
function render(src) {
  const d = document.createElement('div');
  d.append(renderMarkdown(src));
  return d;
}

describe('safe markdown', () => {
  test('subset renders: bold, italic, code, lists, headings, fenced code', () => {
    const d = render(
      '# Title\n\nSome **bold** and *em* and `x=1`.\n\n- a\n- b\n\n1. one\n2. two\n\n```js\nconst a = 1 < 2;\n```'
    );
    expect(d.querySelector('strong')?.textContent).toBe('bold');
    expect(d.querySelector('em')?.textContent).toBe('em');
    expect(d.querySelectorAll('ul li').length).toBe(2);
    expect(d.querySelectorAll('ol li').length).toBe(2);
    expect(d.querySelector('p.u3-ask__h')?.textContent).toBe('Title');
    const pre = d.querySelector('pre');
    expect(pre?.getAttribute('dir')).toBe('ltr');
    expect(pre?.textContent).toBe('const a = 1 < 2;');
  });

  test('XSS fixture: raw HTML, links, images, handlers stay literal text', () => {
    const evil =
      '<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>\n\n[click](javascript:alert(3))\n\n![i](http://evil/x.png)\n\n**<b onclick=1>x</b>**\n\n`<svg onload=1>`\n\n```\n<iframe src=//evil></iframe>\n```';
    const d = render(evil);
    expect(d.querySelector('img,script,a,iframe,svg,b')).toBeNull();
    for (const e of Array.from(d.querySelectorAll('*'))) {
      const on = Array.from(e.attributes).filter((a) =>
        a.name.startsWith('on')
      );
      expect(on).toEqual([]);
    }
    expect(d.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(d.textContent).toContain('<script>alert(2)</script>');
    expect(d.textContent).toContain('[click](javascript:alert(3))');
    expect(d.textContent).toContain('<iframe src=//evil></iframe>');
  });

  test('text blocks take their own direction; code stays ltr', () => {
    const d = render('مرحبا `npm test` ok\n\n```\nls\n```');
    expect(d.querySelector('p')?.getAttribute('dir')).toBe('auto');
    expect(d.querySelector('code.u3-ask__ic')?.getAttribute('dir')).toBe('ltr');
  });

  test('unclosed fence and empty input do not throw', () => {
    expect(render('```\nabc').querySelector('pre')?.textContent).toBe('abc');
    expect(render('').childNodes.length).toBe(0);
  });
});
