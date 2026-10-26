import { describe, expect, test } from 'vitest';
import {
  ageLabel,
  cardOptions,
  displayTitle,
  isDesk,
  splitColumns
} from './board-model.js';

describe('utils/board-model', () => {
  test('splitColumns sends unknown statuses to Other and skips closed', () => {
    const { columns, other } = splitColumns(
      [
        { id: 'a', status: 'open' },
        { id: 'b', status: 'open' },
        { id: 'c', status: 'open' },
        { id: 'd', status: 'closed' },
        { id: 'e', status: 'deferred' }
      ],
      new Set(['a']),
      new Set(['b'])
    );
    expect(columns.ready.map((i) => i.id)).toEqual(['a']);
    expect(columns.blocked.map((i) => i.id)).toEqual(['b']);
    // open but neither ready nor blocked, and deferred: not lost
    expect(other.map((i) => i.id).sort()).toEqual(['c', 'e']);
  });

  test('isDesk by card_class or by an exact never-by-phone label', () => {
    expect(isDesk({ id: 'x', metadata: { card_class: 'desk' } })).toBe(true);
    expect(isDesk({ id: 'x', labels: ['security'] })).toBe(true);
    expect(isDesk({ id: 'x', labels: ['sec'] })).toBe(false);
    expect(isDesk({ id: 'x', metadata: { card_class: 'tap' } })).toBe(false);
  });

  test('displayTitle: Arabic first, neutral title on desk cards', () => {
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
    ).toEqual({ primary: 'قرار قانوني', secondary: '' });
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
