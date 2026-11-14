import { describe, expect, test } from 'vitest';
import { MAX_BULK, isLive, refusal, validate } from './bulk.js';

const now = Date.parse('2026-11-14T12:00:00Z');
const none = new Set();

describe('bulk validate', () => {
  test('caps at 50 and writes nothing', () => {
    const ids = Array.from({ length: MAX_BULK + 1 }, (_, i) => 'a-' + i);
    expect(() =>
      validate({ action: 'close', ids, params: { reason: 'x' } })
    ).toThrow(/at most 50/);
    expect(
      validate({
        action: 'close',
        ids: ids.slice(0, MAX_BULK),
        params: { reason: ' x ' }
      }).params.reason
    ).toBe('x');
  });
  test('rejects bad input', () => {
    expect(() => validate({ action: 'nuke', ids: ['a'] })).toThrow();
    expect(() =>
      validate({ action: 'close', ids: ['a'], params: {} })
    ).toThrow();
    expect(() =>
      validate({ action: 'close', ids: ['--force'], params: { reason: 'x' } })
    ).toThrow();
    expect(() =>
      validate({
        action: 'move',
        ids: ['a'],
        params: { status: 'owner_decision' }
      })
    ).toThrow();
    expect(() =>
      validate({ action: 'move', ids: ['a'], params: { status: 'closed' } })
    ).toThrow();
    expect(() =>
      validate({ action: 'defer', ids: ['a'], params: { until: 'tomorrow' } })
    ).toThrow();
    expect(
      validate({ action: 'defer', ids: ['a'], params: { until: '' } }).params
        .until
    ).toBe('');
  });
});

describe('bulk refusal', () => {
  const t = (o) => ({ id: 'a', status: 'open', ...o });
  test('owner_decision is never touched', () => {
    for (const a of ['close', 'move', 'defer', 'label', 'assign']) {
      expect(
        refusal(
          a,
          t({ status: 'owner_decision' }),
          none,
          { status: 'open' },
          true,
          now
        )
      ).toBe('decision');
    }
  });
  test('close reasons', () => {
    expect(
      refusal('close', t({ status: 'closed' }), none, {}, false, now)
    ).toBe('already_closed');
    expect(refusal('close', t(), new Set(['a']), {}, false, now)).toBe(
      'children'
    );
    expect(
      refusal(
        'close',
        t({
          dependencies: [{ id: 'b', status: 'open', dependency_type: 'blocks' }]
        }),
        none,
        {},
        false,
        now
      )
    ).toBe('blockers');
    expect(
      refusal(
        'close',
        t({
          dependencies: [
            { id: 'p', status: 'open', dependency_type: 'parent-child' }
          ]
        }),
        none,
        {},
        false,
        now
      )
    ).toBe('');
  });
  test('live lease skipped unless take over', () => {
    const live = t({
      status: 'in_progress',
      assignee: 'x',
      lease_expires_at: '2026-11-14T12:05:00Z'
    });
    const dead = t({
      status: 'in_progress',
      assignee: 'x',
      lease_expires_at: '2026-11-14T11:00:00Z'
    });
    expect(isLive(live, now)).toBe(true);
    expect(isLive(dead, now)).toBe(false);
    expect(refusal('move', live, none, { status: 'open' }, false, now)).toBe(
      'live'
    );
    expect(refusal('move', live, none, { status: 'open' }, true, now)).toBe('');
    expect(refusal('move', dead, none, { status: 'open' }, false, now)).toBe(
      ''
    );
    expect(refusal('label', live, none, {}, false, now)).toBe('');
  });
  test('same status and missing', () => {
    expect(refusal('move', t(), none, { status: 'open' }, false, now)).toBe(
      'same'
    );
    expect(refusal('move', undefined, none, {}, false, now)).toBe('missing');
  });
});
