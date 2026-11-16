import { describe, expect, test } from 'vitest';
import { isReaction, splitReactions } from './reactions.js';

/** @param {string} id @param {string} author @param {string} text */
const C = (id, author, text) => ({ id, author, text });
describe('reactions', () => {
  const list = [
    C('aaaaaaaa-1111', 'abdelrahman', 'hello'),
    C('b1', 'swe', 'REACT: 👀 re: c-aaaaaaaa'),
    C('b2', 'qa', 'REACT: 👀 re: c-aaaaaaaa'),
    C('b3', 'swe', 'REACT: 👀 re: c-aaaaaaaa'),
    C('b4', 'swe', 'REACT: ✅ re: c-aaaaaaaa'),
    C('c1', 'cto', 'REACT: look at this, not a reaction')
  ];
  test('hides reactions from the thread', () => {
    const { real } = splitReactions(list);
    expect(real.map((c) => c.id)).toEqual(['aaaaaaaa-1111', 'c1']);
  });
  test('groups by emoji with unique reactors', () => {
    const { byAnchor } = splitReactions(list);
    expect(byAnchor.get('c-aaaaaaaa')).toEqual([
      { emoji: '👀', who: ['swe', 'qa'] },
      { emoji: '✅', who: ['swe'] }
    ]);
  });
  test('isReaction is strict', () => {
    expect(isReaction({ text: 'REACT: ✅ re: c-0123abcd' })).toBe(true);
    expect(isReaction({ text: 'REACT: ✅ re: c-xyz' })).toBe(false);
  });
});
