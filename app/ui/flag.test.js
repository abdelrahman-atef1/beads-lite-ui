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
  test('default is legacy', () => {
    expect(resolveUi('', mem())).toBe(2);
  });
  test('?ui=3 stores bl.ui and turns v3 on, later visits keep it', () => {
    const s = mem();
    expect(resolveUi('?ui=3', s)).toBe(3);
    expect(s.m.get('bl.ui')).toBe('3');
    expect(resolveUi('', s)).toBe(3);
  });
  test('?ui=2 clears it', () => {
    const s = mem({ 'bl.ui': '3' });
    expect(resolveUi('?ui=2', s)).toBe(2);
    expect(s.m.has('bl.ui')).toBe(false);
    expect(resolveUi('', s)).toBe(2);
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
    expect(resolveUi('', bad)).toBe(2);
    expect(resolveUi('?ui=3', bad)).toBe(3);
  });
});
