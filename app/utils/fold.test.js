import { render } from 'lit-html';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseFolded, renderFolded } from './fold.js';

describe('parseFolded', () => {
  test('title, lead and sections', () => {
    const p = parseFolded(
      'Verdict: pass\n\nShip it.\nNext: deploy.\n\n## Evidence\n- a\n- b\n\n## Next\ndo x'
    );
    expect(p?.title).toBe('Verdict: pass');
    expect(p?.lead).toBe('Ship it.\nNext: deploy.');
    expect(p?.sections.map((s) => [s.name, s.lines])).toEqual([
      ['Evidence', 2],
      ['Next', 1]
    ]);
  });
  test('flat text returns null', () => {
    expect(parseFolded('just a note\nsecond line')).toBeNull();
    expect(parseFolded('')).toBeNull();
    expect(parseFolded(/** @type {any} */ (null))).toBeNull();
  });
  test('## inside a code fence is ignored', () => {
    expect(parseFolded('T\n\n```\n## not a section\n```\n')).toBeNull();
    const p = parseFolded('T\n\n```sh\n## no\n```\n## Real\nx');
    expect(p?.sections.map((s) => s.name)).toEqual(['Real']);
    expect(p?.sections[0].body).toBe('x');
  });
  test('### belongs to its section; #### and "##x" are not delimiters', () => {
    const p = parseFolded('T\n## A\n### sub\ntext\n##x\n');
    expect(p?.sections).toHaveLength(1);
    expect(p?.sections[0].body).toContain('### sub');
  });
  test('text starting with a heading is left flat', () => {
    expect(parseFolded('## Heading\nbody')).toBeNull();
  });
  test('leading # in title stripped; CRLF ok; Arabic title', () => {
    expect(parseFolded('# Design: x\r\n## A\r\nb')?.title).toBe('Design: x');
    expect(parseFolded('تم الانتهاء\n\n## تفاصيل\nنص')?.sections[0].name).toBe(
      'تفاصيل'
    );
  });
});

describe('renderFolded markup', () => {
  const txt = 'Title\n\nlead\n\n## One\na\nb\n\n## Two\nc';
  test('labelled counts, plain name, no stray text nodes in .fold', () => {
    const el = document.createElement('div');
    render(
      renderFolded(txt, (s) => s),
      el
    );
    const n = [...el.querySelectorAll('.fold-n')].map((x) => x.textContent);
    expect(n).toEqual(['2 lines', '1 line']);
    const fold = /** @type {HTMLElement} */ (el.querySelector('.fold'));
    expect(fold.querySelectorAll('details')).toHaveLength(2);
    expect(fold.firstElementChild?.className).toBe('fold-title');
  });
  test('css: chevron, rtl flip, fg name, no tap flash, whitespace-safe comment', () => {
    const css = readFileSync('app/styles.css', 'utf8');
    expect(css).toMatch(/\.fold-sec > summary::before/);
    expect(css).toMatch(/summary:dir\(rtl\)::before/);
    expect(css).toMatch(/-webkit-tap-highlight-color: transparent/);
    expect(css).toMatch(/\.fold-sec > summary:active/);
    const ct = /\.comment-text \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(ct).not.toMatch(/pre-wrap/);
  });
});
