import { describe, expect, test } from 'vitest';
import { resolveUi } from './flag.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (/** @type {string} */ k) => (m.has(k) ? m.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) =>
      void m.set(k, v),
    removeItem: (/** @type {string} */ k) => void m.delete(k),
    m
  };
}

describe('ui flag', () => {
  test('default is v3 with no flag and an empty store', () => {
    expect(resolveUi('', mem())).toBe(3);
  });
  test('an old stored bl.ui=3 and ?ui=3 links still give v3', () => {
    const s = mem({ 'bl.ui': '3' });
    expect(resolveUi('', s)).toBe(3);
    expect(resolveUi('?ui=3', s)).toBe(3);
    expect(s.m.has('bl.ui')).toBe(false);
  });
  test('?ui=2 gives legacy for that visit only', () => {
    const s = mem();
    expect(resolveUi('?ui=2', s)).toBe(2);
    expect(resolveUi('', s)).toBe(3);
  });
  test('broken storage never throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      }
    };
    expect(resolveUi('', bad)).toBe(3);
    expect(resolveUi('?ui=2', bad)).toBe(2);
  });
});
