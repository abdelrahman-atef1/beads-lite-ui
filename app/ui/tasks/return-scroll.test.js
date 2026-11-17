// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('return-scroll survives a page reload (beads-lite-1bo5.13.31)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });
  test('the place set before a reload is read after it (fresh module = reload)', async () => {
    const a = await import('./return-scroll.js');
    a.setTasksReturn(1500);
    vi.resetModules(); // the reload: memory is gone, sessionStorage stays
    const b = await import('./return-scroll.js');
    expect(b.peekTasksReturn()).toBe(1500);
    b.clearTasksReturn();
    expect(b.peekTasksReturn()).toBe(0);
  });
  test('an old place expires', async () => {
    const a = await import('./return-scroll.js');
    a.setTasksReturn(900, 1000);
    vi.resetModules();
    const b = await import('./return-scroll.js');
    expect(b.peekTasksReturn(1000 + 31 * 60_000)).toBe(0);
  });
});
