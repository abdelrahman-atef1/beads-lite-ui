import { describe, expect, test } from 'vitest';
import { VIEWS, lazyView, loadView, mountSlots } from './registry.js';

describe('views/registry', () => {
  test('every route and slot view is a lazy import', () => {
    expect(Object.keys(VIEWS).sort()).toEqual([
      'board',
      'card',
      'decisions',
      'epics',
      'issues',
      'notifications',
      'outputs',
      'report'
    ]);
  });

  test('loadView caches the module and rejects an unknown name', async () => {
    const a = loadView('decisions');
    expect(loadView('decisions')).toBe(a);
    expect(typeof (await a).createDecisionsView).toBe('function');
    await expect(loadView('nope')).rejects.toThrow('Unknown view');
  });

  test('lazyView builds on first load only', async () => {
    let built = 0;
    let loaded = 0;
    const v = lazyView('board', () => {
      built++;
      return {
        load: () => {
          loaded++;
          return Promise.resolve();
        }
      };
    });
    expect(built).toBe(0);
    await v.load();
    await v.load();
    expect(built).toBe(1);
    expect(loaded).toBe(2);
  });

  test('mountSlots fills each slot once and ignores unknown slots', async () => {
    document.body.innerHTML =
      '<span data-slot="bell"></span><span data-slot="report"></span><span data-slot="zzz"></span>';
    await mountSlots(document);
    const els = document.querySelectorAll('[data-slot]');
    expect(els[0].getAttribute('data-mounted')).toBe('1');
    expect(els[1].getAttribute('data-mounted')).toBe('1');
    expect(els[2].getAttribute('data-mounted')).toBeNull();
  });
});
