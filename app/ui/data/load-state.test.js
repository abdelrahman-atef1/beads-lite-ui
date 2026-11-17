import { describe, expect, test } from 'vitest';
import { createLoadState } from './load-state.js';

describe('load state', () => {
  test('never empty before the first load', () => {
    const s = createLoadState();
    expect(s.view(0)).toBe('loading');
    s.begin();
    expect(s.view(0)).toBe('loading');
  });
  test('empty only when loaded and empty', () => {
    const s = createLoadState();
    s.ok();
    expect(s.view(0)).toBe('empty');
    expect(s.view(2)).toBe('data');
  });
  test('failed first load is an error, not empty; a retry is loading-free', () => {
    const s = createLoadState();
    s.fail();
    expect(s.view(0)).toBe('error');
  });
  test('refresh keeps the old answer, failed refresh keeps old data', () => {
    const s = createLoadState();
    s.ok();
    s.begin();
    expect(s.view(3)).toBe('data');
    expect(s.view(0)).toBe('empty');
    s.fail();
    expect(s.view(3)).toBe('data');
  });
});
