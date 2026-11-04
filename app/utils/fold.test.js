import { describe, expect, test } from 'vitest';
import { parseFolded } from './fold.js';

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
