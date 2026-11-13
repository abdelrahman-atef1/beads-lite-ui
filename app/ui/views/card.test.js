// @ts-nocheck -- fixture-heavy view test
import { render } from 'lit-html';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { cardDir, cardLang, detectLang } from '../card/dir.js';
import { renderCard, renderStepsComment, setCardClient } from './card.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

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
    opts: [
      { n: 1, l: 'نعم، اعتمد', note: '', rec: true },
      { n: 2, l: 'مش دلوقتي', note: '', rec: false }
    ]
  }
};
const ITEM = { id: 'p-1', project: { name: 'fatura' }, title: 'x' };

/** @param {any} data @param {any} [onWrite] */
function mount(data, onWrite) {
  document.body.innerHTML = '<div id="slot"></div>';
  const el = document.getElementById('slot');
  const send = vi.fn(async (type, payload) => {
    if (type === 'card-state') return data;
    return onWrite ? onWrite(type, payload) : { code: 'ok', wake: 'queued' };
  });
  setCardClient({ send });
  render(renderCard(ITEM, {}), el);
  return { el, send };
}

describe('decision card direction (.61 cases)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('beads-ui.lang', 'en');
  });

  test('card language picks direction; unknown falls back to ar', () => {
    expect(cardDir('ar')).toBe('rtl');
    expect(cardDir('en')).toBe('ltr');
    expect(cardLang(undefined)).toBe('ar');
    expect(detectLang('Ship it')).toBe('en');
    expect(detectLang('هل نشحن؟')).toBe('ar');
  });

  test('Arabic card on an English board: rtl block, Arabic labels, own-line values', async () => {
    const { el } = mount(AR);
    await tick();
    const body = el.querySelector('.u3-cd__body');
    expect(body.getAttribute('dir')).toBe('rtl');
    expect(body.getAttribute('lang')).toBe('ar');
    const labels = [...el.querySelectorAll('.u3-cd__fl')].map(
      (x) => x.textContent
    );
    expect(labels).toEqual([
      'إيه اللي هيتغير عليك',
      'الشيء نفسه',
      'واقف لحد ما ترد'
    ]);
    for (const v of el.querySelectorAll('.u3-cd__fv, .u3-cd__q')) {
      expect(v.getAttribute('dir')).toBe('auto');
    }
    const f = el.querySelector('.u3-cd__field');
    expect(f.querySelector('.u3-cd__fl').textContent).not.toContain(
      f.querySelector('.u3-cd__fv').textContent
    );
    expect(el.querySelector('[data-opt="1"] small').textContent).toBe('مقترح');
  });

  test('English card gets ltr and English labels', async () => {
    const en = {
      ...AR,
      card: { ...AR.card, lang: 'en', q: 'Ship it?', effect: 'Live now' }
    };
    const { el } = mount(en);
    await tick();
    expect(el.querySelector('.u3-cd__body').getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.u3-cd__fl').textContent).toBe('What changes');
  });

  test('ids are monospace, Arabic text is not', async () => {
    const { el } = mount(AR);
    await tick();
    expect(el.querySelector('.u3-cd__id').classList.contains('u3-mono')).toBe(
      true
    );
    expect(el.querySelector('.u3-cd__q').classList.contains('u3-mono')).toBe(
      false
    );
  });
});

describe('decision card flow', () => {
  test('answer needs two taps and sends option + sha', async () => {
    const { el, send } = mount(AR);
    await tick();
    el.querySelector('[data-opt="1"]').click();
    await tick();
    expect(send).not.toHaveBeenCalledWith('card-answer', expect.anything());
    el.querySelector('[data-act="confirm"]').click();
    await tick();
    expect(send).toHaveBeenCalledWith('card-answer', {
      id: 'p-1',
      option: 1,
      sha: 'f'.repeat(64)
    });
  });

  test('back leaves the pick without writing', async () => {
    const { el, send } = mount(AR);
    await tick();
    el.querySelector('[data-opt="2"]').click();
    await tick();
    el.querySelector('[data-act="back"]').click();
    await tick();
    expect(el.querySelector('[data-opt="2"]')).not.toBeNull();
    expect(send).not.toHaveBeenCalledWith('card-answer', expect.anything());
  });

  test('owner types a question before answering; options stay answerable', async () => {
    const { el, send } = mount(AR);
    await tick();
    el.querySelector('[data-act="ask-open"]').click();
    await tick();
    expect(el.querySelector('[data-opt="1"]')).not.toBeNull();
    const ta = el.querySelector('.u3-cd__form textarea');
    ta.value = 'الحساب ده هيطلب كارت؟';
    ta.dispatchEvent(new Event('input'));
    el.querySelector('form').dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await tick();
    expect(send).toHaveBeenCalledWith('card-ask', {
      id: 'p-1',
      scope: 'question',
      question: 'الحساب ده هيطلب كارت؟'
    });
  });

  test('thread shows inside the card and wake chip states show', async () => {
    const data = {
      ...AR,
      thread: [
        { kind: 'q', text: 'سؤال؟' },
        { kind: 'a', text: 'لا' }
      ],
      wake: { state: 'delivered' }
    };
    const { el } = mount(data);
    await tick();
    expect(el.querySelectorAll('.u3-cd .u3-cd__msg').length).toBe(2);
    expect(el.querySelector('[data-wake="delivered"]')).not.toBeNull();
  });

  test('refused answer shows the error, no crash', async () => {
    const { el } = mount(AR, () => {
      throw new Error('changed');
    });
    await tick();
    el.querySelector('[data-opt="1"]').click();
    await tick();
    el.querySelector('[data-act="confirm"]').click();
    await tick();
    expect(el.querySelector('.u3-cd__err')).not.toBeNull();
  });
});

describe('steps card', () => {
  test('numbered 1-3 and opens the steps comment', () => {
    document.body.innerHTML = '<div id="s"></div>';
    const el = document.getElementById('s');
    render(
      renderCard({
        id: 'fatura-1',
        kind: 'steps',
        title: 'سجّل دخول Claude للوحة',
        project: { name: 'beads-lite' },
        steps: {
          comment: 'c-1234abcd',
          title: 'سجّل دخول Claude',
          n: 5,
          at: ''
        }
      }),
      el
    );
    expect(
      [...el.querySelectorAll('.u3-cd__numlist li')].map((x) => x.textContent)
    ).toEqual(['1', '2', '3']);
    const a = el.querySelector('a.u3-btn--steps');
    expect(a.getAttribute('href')).toBe(
      '#/issues?issue=fatura-1&at=c-1234abcd'
    );
    expect(el.querySelector('.u3-chip').className).toContain('teal');
  });
});

describe('renderStepsComment', () => {
  const TEXT = [
    'STEPS: سجّل دخول Claude للوحة مرة واحدة',
    '',
    '## Steps',
    '1. افتح تبويب الترمينال اللي اسمه `Board Claude sign-in`',
    '```',
    'claude auth login',
    '```',
    '2. كمّل تسجيل الدخول في المتصفح',
    '3. `echo done`'
  ].join('\n');
  const C = { id: '1234abcdffff', text: TEXT, author: 'cos' };

  /** @param {any} ctx */
  function mountSteps(ctx) {
    document.body.innerHTML = '<div id="s"></div>';
    const el = document.getElementById('s');
    render(renderStepsComment(C, { issueId: 'b-1', ...ctx }), el);
    return el;
  }

  test('draws checklist, copy blocks, buttons; Western digits', () => {
    const el = mountSteps({ client: { send: vi.fn() } });
    expect(
      [...el.querySelectorAll('.u3-st__num')].map((x) => x.textContent)
    ).toEqual(['1', '2', '3']);
    expect(
      [...el.querySelectorAll('.u3-st__code')].map((x) => x.textContent)
    ).toEqual(['claude auth login', 'echo done']);
    expect(el.querySelector('.u3-st__text code').textContent).toBe(
      'Board Claude sign-in'
    );
    expect(el.querySelector('[data-act="steps-done"]')).not.toBeNull();
    expect(el.textContent).not.toMatch(/[٠-٩]/);
    expect(el.querySelector('[data-cid]').getAttribute('data-cid')).toBe(
      'c-1234abcd'
    );
  });

  test('done sends steps-done with the comment ref', async () => {
    const send = vi.fn(async () => ({ code: 'ok', wake: 'queued' }));
    const el = mountSteps({ client: { send } });
    el.querySelector('[data-act="steps-done"]').click();
    await tick();
    expect(send).toHaveBeenCalledWith('steps-done', {
      id: 'b-1',
      comment: 'c-1234abcd'
    });
    expect(el.querySelector('[data-steps-done]')).not.toBeNull();
    expect(el.querySelector('[data-act="steps-done"]')).toBeNull();
  });

  test('question goes through card-ask, falls back to a comment', async () => {
    const send = vi.fn(async (type) => {
      if (type === 'card-ask') throw new Error('bad-card');
      return {};
    });
    const el = mountSteps({ client: { send } });
    el.querySelector('[data-act="steps-ask"]').click();
    await tick();
    const ta = el.querySelector('textarea');
    ta.value = 'مش لاقي التبويب';
    ta.dispatchEvent(new Event('input'));
    el.querySelector('form').dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await tick();
    expect(send.mock.calls[0][0]).toBe('card-ask');
    expect(send.mock.calls[1][0]).toBe('add-comment');
  });

  test('open:false hides the buttons; a non-steps comment draws nothing', () => {
    const el = mountSteps({ open: false });
    expect(el.querySelector('.u3-btn--steps')).toBeNull();
    document.body.innerHTML = '<div id="n"></div>';
    const n = document.getElementById('n');
    render(renderStepsComment({ id: 'a', text: 'hello' }, { issueId: 'x' }), n);
    expect(n.querySelector('.u3-st')).toBeNull();
  });
});
