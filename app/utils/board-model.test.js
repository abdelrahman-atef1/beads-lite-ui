import { describe, expect, test } from 'vitest';
import {
  COLUMNS,
  KNOWN_STATUSES,
  ageLabel,
  cardOptions,
  displayTitle,
  isDesk,
  splitColumns
} from './board-model.js';

describe('utils/board-model', () => {
  test('splitColumns: 8 statuses, Deferred own lane, unknown is an error list', () => {
    const { columns, unknown } = splitColumns(
      [
        { id: 'a', status: 'open' },
        { id: 'b', status: 'open' },
        { id: 'c', status: 'open' },
        { id: 'd', status: 'closed' },
        { id: 'e', status: 'deferred' },
        { id: 'f', status: 'in_review' },
        { id: 'g', status: 'waiting_for_merge' }
      ],
      new Set(['a']),
      new Set(['b'])
    );
    expect(columns.ready.map((i) => i.id)).toEqual(['a', 'c']);
    expect(columns.blocked.map((i) => i.id)).toEqual(['b']);
    expect(columns.deferred.map((i) => i.id)).toEqual(['e']);
    expect(columns.merge.map((i) => i.id)).toEqual(['g']);
    expect(unknown.map((i) => i.id)).toEqual(['f']);
    expect('other' in columns).toBe(false);
    expect(COLUMNS.length + 1).toBe(KNOWN_STATUSES.length);
    expect(KNOWN_STATUSES).toHaveLength(8);
  });

  test('isDesk is retired: no card is PC-only (company-1bo5.6.38)', () => {
    expect(isDesk({ id: 'x', metadata: { card_class: 'desk' } })).toBe(false);
    expect(isDesk({ id: 'x', labels: ['security'] })).toBe(false);
    expect(isDesk({ id: 'x', labels: ['sec'] })).toBe(false);
    expect(isDesk({ id: 'x', metadata: { card_class: 'tap' } })).toBe(false);
  });

  test('displayTitle: Arabic first, real title also on former desk cards', () => {
    expect(
      displayTitle({ id: 'x', title: 'Eng', metadata: { title_ar: 'عربي' } })
    ).toEqual({ primary: 'عربي', secondary: 'Eng' });
    expect(displayTitle({ id: 'x', title: 'Eng' })).toEqual({
      primary: 'Eng',
      secondary: ''
    });
    expect(
      displayTitle({
        id: 'x',
        title: 'Secret weakness',
        metadata: {
          card_class: 'desk',
          card_title: 'قرار قانوني',
          title_ar: 'يكشف الضعف'
        }
      })
    ).toEqual({ primary: 'يكشف الضعف', secondary: 'Secret weakness' });
  });

  test('cardOptions parses, bounds and survives bad JSON', () => {
    const opts = cardOptions({
      id: 'x',
      metadata: {
        card_opts: JSON.stringify([
          { l: 'نعم', rec: true },
          { l: 'لا', n: 'note' },
          { nolabel: 1 }
        ])
      }
    });
    expect(opts).toEqual([
      { l: 'نعم', n: '', rec: true },
      { l: 'لا', n: 'note', rec: false }
    ]);
    expect(cardOptions({ id: 'x', metadata: { card_opts: '{bad' } })).toEqual(
      []
    );
    expect(cardOptions({ id: 'x' })).toEqual([]);
  });

  test('ageLabel', () => {
    const now = 10_000_000_000;
    expect(ageLabel(now - 5 * 60_000, now)).toBe('5m');
    expect(ageLabel(now - 3 * 3_600_000, now)).toBe('3h');
    expect(ageLabel(now - 3 * 86_400_000, now)).toBe('3d');
    expect(ageLabel(undefined, now)).toBe('');
  });
});
