// @ts-nocheck -- fixture-heavy view test
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { cardDir, cardLang, detectLang } from '../utils/card-dir.js';
import { mountCard, setCardClient } from './card-panel.js';

const AR = {
  id: 'p-1',
  state: 'waiting',
  sha: 'f'.repeat(64),
  max_rounds: 3,
  thread: [],
  wake: { state: 'none' },
  card: {
    cls: 'tap',
    lang: 'ar',
    q: 'نعتمد خطة Claude للبطاقة beads-lite-1bo5.6.53.6؟',
    effect: 'يتغير: Claude يكتب العربي صح (beads-lite-1bo5.6.61).',
    show: 'دلوقتي: الترتيب معكوس',
    blocks: 'التصميم .59',
    opts: [{ n: 1, l: 'نعم، اعتمد', note: '', rec: true }]
  }
};

describe('card direction rule (beads-lite-1bo5.6.61)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('beads-ui.lang', 'en'); // board is English
  });

  test('card language picks direction; unknown falls back to ar', () => {
    expect(cardDir('ar')).toBe('rtl');
    expect(cardDir('en')).toBe('ltr');
    expect(cardLang(undefined)).toBe('ar');
    expect(detectLang('Ship it')).toBe('en');
    expect(detectLang('هل نشحن؟')).toBe('ar');
  });

  test('Arabic card on an English board: rtl block, Arabic labels, own-line values', async () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const el = document.getElementById('slot');
    setCardClient({ send: vi.fn(async () => AR) });
    mountCard(el, {
      id: 'p-1',
      status: 'owner_decision',
      metadata: { card_q: 'x' }
    });
    await new Promise((r) => setTimeout(r, 20));
    const body = el.querySelector('.cd__body');
    expect(body.getAttribute('dir')).toBe('rtl');
    expect(body.getAttribute('lang')).toBe('ar');
    const labels = [...el.querySelectorAll('.cd__fl')].map(
      (x) => x.textContent
    );
    expect(labels).toEqual(['ماذا يتغير', 'الشيء نفسه', 'متوقف حتى ترد']);
    for (const v of el.querySelectorAll('.cd__fv, .cd__q')) {
      expect(v.getAttribute('dir')).toBe('auto');
    }
    // the label is never inside the same element as the text
    expect(
      el.querySelector('.cd__fl').parentElement.querySelector('.cd__fv')
    ).not.toBeNull();
    expect(el.querySelector('[data-opt] small').textContent).toBe('مُوصى');
  });
});
