import { describe, expect, test } from 'vitest';
import {
  commentAnchor,
  findCommentIndex,
  findLineElement,
  parseAnchor
} from './anchor.js';

describe('parseAnchor', () => {
  test('no at / old links', () => {
    expect(parseAnchor('#/issues?issue=A-1')).toBeNull();
    expect(parseAnchor('#/issues')).toBeNull();
    expect(parseAnchor('')).toBeNull();
  });
  test('fields, comments, lines', () => {
    expect(parseAnchor('#/issues?issue=A-1&at=design')).toEqual({
      target: 'design',
      from: 0,
      to: 0
    });
    expect(parseAnchor('#/board?issue=A-1&at=c-6cea896d.L3')).toEqual({
      target: 'c-6cea896d',
      from: 3,
      to: 3
    });
    expect(parseAnchor('#/issues?issue=A-1&at=description.L2-5')).toEqual({
      target: 'description',
      from: 2,
      to: 5
    });
    expect(parseAnchor('#/issues?issue=A-1&at=c-last')?.target).toBe('c-last');
    expect(parseAnchor('#/issues?issue=A-1&at=c-2')?.target).toBe('c-2');
  });
  test('rejects junk', () => {
    expect(parseAnchor('#/issues?issue=A-1&at=<script>')).toBeNull();
    expect(parseAnchor('#/issues?issue=A-1&at=nope')).toBeNull();
    expect(parseAnchor('#/issues?issue=A-1&at=c-zz')).toBeNull();
  });
});

describe('comment lookup', () => {
  const list = [
    { id: '6cea896d-1def-5410-80db-6d50fd4659ee' },
    { id: 'abcdef12-0000-0000-0000-000000000000' }
  ];
  test('anchor is c- + 8 hex', () => {
    expect(commentAnchor(list[0])).toBe('c-6cea896d');
  });
  test('last, n, prefix, missing', () => {
    expect(findCommentIndex('c-last', list)).toBe(1);
    expect(findCommentIndex('c-1', list)).toBe(0);
    expect(findCommentIndex('c-3', list)).toBe(-1);
    expect(findCommentIndex('c-abcdef', list)).toBe(1);
    expect(findCommentIndex('c-ffffff', list)).toBe(-1);
  });
});

describe('findLineElement', () => {
  test('matches the rendered list item for a source line', () => {
    document.body.innerHTML =
      '<div id="r"><p>Intro</p><ul><li>first <b>item</b></li><li>second</li></ul></div>';
    const root = /** @type {Element} */ (document.getElementById('r'));
    const src = 'Intro\n\n- first **item**\n- second';
    expect(findLineElement(root, src, 3)?.tagName).toBe('LI');
    expect(findLineElement(root, src, 4)?.textContent).toBe('second');
    expect(findLineElement(root, src, 2)).toBeNull();
    expect(findLineElement(root, src, 99)).toBeNull();
  });
});
