// @ts-nocheck -- fixture-heavy view test (beads-lite-1bo5.13.12.1.4)
import { render } from 'lit-html';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderCard, setCardClient } from './card.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

/** @param {number} done */
function state(done, extra = {}) {
  const mk = (n, cls, q, opts) => ({
    n,
    class: cls,
    q,
    effect: n === 1 ? 'الزرار هيبقى أوضح' : '',
    show: '',
    opts,
    att: [],
    sha: 's'.repeat(60) + n,
    answered:
      n <= done
        ? { n: 1, label: 'أه', via: 'phone', at: '2026-11-17T10:00:00Z' }
        : null,
    stale: false
  });
  return {
    id: 'p-1',
    state: done >= 3 ? 'answered' : 'waiting',
    sha: 'f'.repeat(64),
    max_rounds: 3,
    thread: [],
    wake: { state: 'none' },
    card: { cls: 'tap', lang: 'ar', q: '٣ قرارات عن اللوحة؟', opts: [] },
    questions: [
      mk(1, 'tap', 'نغيّر اللون؟', [
        { n: 1, l: 'أه', rec: true },
        { n: 2, l: 'لأ' }
      ]),
      mk(2, 'tap', 'فوق ولا تحت؟', [
        { n: 1, l: 'فوق' },
        { n: 2, l: 'تحت' }
      ]),
      mk(3, 'type', 'اسم الصفحة؟', [])
    ],
    answeredCount: done,
    total: 3,
    decision:
      done >= 3
        ? {
            via: 'phone',
            answer: '',
            at: '2026-11-17T10:00:00Z',
            answers: [
              { q: 1, answer: 'option 1 "أه"' },
              { q: 2, answer: 'option 2 "تحت"' },
              { q: 3, answer: '"صفحة"' }
            ]
          }
        : null,
    ...extra
  };
}

/** @param {() => any} get */
function mount(get, onWrite) {
  document.body.innerHTML = '<div id="slot"></div>';
  const el = document.getElementById('slot');
  const send = vi.fn(async (type, payload) => {
    if (type === 'card-state') return get();
    return onWrite ? onWrite(type, payload) : { code: 'answered-partial' };
  });
  setCardClient({ send });
  render(renderCard({ id: 'p-1', title: 'x', questions: 3 }, {}), el);
  return { el, send };
}

describe('multi-question card', () => {
  beforeEach(() => window.localStorage.setItem('beads-ui.lang', 'en'));

  test('shows progress, one current block, later ones waiting', async () => {
    const { el } = mount(() => state(1));
    await tick();
    expect(el.querySelector('[data-prog] b').textContent).toBe(
      'تم الرد على 1 من 3'
    );
    expect(el.querySelectorAll('.u3-cq--done')).toHaveLength(1);
    expect(el.querySelectorAll('.u3-cq--cur')).toHaveLength(1);
    expect(el.querySelector('.u3-cq--cur').dataset.q).toBe('2');
    expect(el.querySelector('[data-q="3"] .u3-cq__wait').textContent).toBe(
      'مستني ردك'
    );
    expect(el.querySelector('[data-answered]').textContent).toContain('أه');
    expect(el.textContent).toContain('3 أسئلة');
  });

  test('tap then Confirm sends q + that question sha, per question', async () => {
    const { el, send } = mount(() => state(0));
    await tick();
    el.querySelector('[data-q="1"] [data-opt="2"]').click();
    await tick();
    expect(
      el
        .querySelector('[data-q="1"] [data-opt="2"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
    el.querySelector('[data-q="1"] [data-act="confirm"]').click();
    await tick();
    const call = send.mock.calls.find((c) => c[0] === 'card-answer')[1];
    expect(call).toMatchObject({ id: 'p-1', q: 1, option: 2 });
    expect(call.sha).toBe('s'.repeat(60) + '1');
  });

  test('typed question needs text', async () => {
    const { el, send } = mount(() => state(2));
    await tick();
    el.querySelector('[data-q="3"] [data-act="send"]').click();
    await tick();
    expect(send.mock.calls.some((c) => c[0] === 'card-answer')).toBe(false);
    expect(el.querySelector('[data-qerr]')).not.toBeNull();
    el.querySelector('[data-q="3"] [data-type]').value = 'صفحة';
    el.querySelector('[data-q="3"] [data-type]').dispatchEvent(
      new Event('input')
    );
    el.querySelector('[data-q="3"] [data-act="send"]').click();
    await tick();
    expect(
      send.mock.calls.find((c) => c[0] === 'card-answer')[1]
    ).toMatchObject({
      q: 3,
      text: 'صفحة'
    });
  });

  test('send error keeps the pick and offers Try again', async () => {
    let fail = true;
    const { el } = mount(
      () => state(0),
      () => {
        if (fail) throw new Error('boom');
        return { code: 'answered-partial' };
      }
    );
    await tick();
    el.querySelector('[data-q="1"] [data-opt="1"]').click();
    el.querySelector('[data-q="1"] [data-act="confirm"]').click();
    await tick();
    await tick();
    expect(el.querySelector('[data-qerr]').textContent).toContain('ردك محفوظ');
    expect(
      el
        .querySelector('[data-q="1"] [data-opt="1"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
    fail = false;
    el.querySelector('[data-act="retry"]').click();
    await tick();
    expect(el.querySelector('[data-qerr]')).toBeNull();
  });

  test('changed question shows the amber note on that question only', async () => {
    const { el } = mount(
      () => state(0),
      () => {
        throw new Error('changed');
      }
    );
    await tick();
    el.querySelector('[data-q="1"] [data-opt="1"]').click();
    el.querySelector('[data-q="1"] [data-act="confirm"]').click();
    await tick();
    await tick();
    expect(el.querySelectorAll('[data-stale]')).toHaveLength(1);
    expect(el.querySelector('[data-q="1"] [data-stale]')).not.toBeNull();
    expect(el.querySelector('[data-q="1"] .is-picked')).toBeNull();
  });

  test('all answered: green lines, one wake line, no controls', async () => {
    const { el } = mount(() => state(3));
    await tick();
    expect(el.querySelectorAll('[data-answered]')).toHaveLength(3);
    expect(el.querySelector('[data-all]').textContent).toContain(
      'كل الردود اتبعتت'
    );
    expect(el.querySelector('[data-opt]')).toBeNull();
    expect(el.querySelector('[data-prog] b').textContent).toBe(
      'تم الرد على 3 من 3'
    );
  });

  test('ask on question 2 sends scope q2:question', async () => {
    const { el, send } = mount(() => state(0));
    await tick();
    el.querySelector('[data-q="2"] [data-act="ask-open"]').click();
    const ta = el.querySelector('form textarea:last-of-type');
    ta.value = 'ليه؟';
    ta.dispatchEvent(new Event('input'));
    el.querySelector('form').dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await tick();
    expect(send.mock.calls.find((c) => c[0] === 'card-ask')[1]).toMatchObject({
      scope: 'q2:question',
      question: 'ليه؟'
    });
  });

  test('one-question card is not the multi layout', async () => {
    const one = state(0);
    one.questions = [one.questions[0]];
    one.total = 1;
    one.card.opts = one.questions[0].opts;
    const { el } = mount(() => one);
    await tick();
    expect(el.querySelector('.u3-cd--multi')).toBeNull();
    expect(el.querySelector('[data-prog]')).toBeNull();
  });
});
