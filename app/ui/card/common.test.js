import { describe, expect, test } from 'vitest';
import { relIfToday } from './common.js';

describe('relIfToday', () => {
  const now = new Date(2026, 10, 16, 15, 0, 0).getTime();
  test('today is relative', () => {
    expect(relIfToday(now - 5 * 60000, 'en', () => 'abs', now)).toBe('5m ago');
  });
  test('another day uses the fallback', () => {
    const y = new Date(2026, 10, 14, 9, 0, 0).getTime();
    expect(relIfToday(y, 'en', () => 'abs', now)).toBe('abs');
  });
});
