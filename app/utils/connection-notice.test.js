import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createConnectionNotice } from './connection-notice.js';

describe('connection notice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('never shows when the first connect fails', () => {
    const toast = vi.fn();
    const on = createConnectionNotice(toast, { delayMs: 4000 });
    on('connecting');
    on('closed');
    on('reconnecting');
    vi.advanceTimersByTime(60000);
    on('open');
    expect(toast).not.toHaveBeenCalled();
  });

  test('a blink under the delay stays silent', () => {
    const toast = vi.fn();
    const on = createConnectionNotice(toast, { delayMs: 4000 });
    on('open');
    on('closed');
    vi.advanceTimersByTime(2000);
    on('open');
    vi.advanceTimersByTime(10000);
    expect(toast).not.toHaveBeenCalled();
  });

  test('a drop that lasts shows once, then Reconnected', () => {
    const toast = vi.fn();
    const on = createConnectionNotice(toast, { delayMs: 4000 });
    on('open');
    on('closed');
    on('reconnecting');
    vi.advanceTimersByTime(4000);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][1]).toBe('error');
    on('closed');
    vi.advanceTimersByTime(8000);
    expect(toast).toHaveBeenCalledTimes(1);
    on('open');
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls[1][1]).toBe('success');
  });
});
