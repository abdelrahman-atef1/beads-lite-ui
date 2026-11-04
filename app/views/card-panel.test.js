// @ts-nocheck -- fixture-heavy view test; typed fixtures add noise
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mountCard, setCardClient } from './card-panel.js';

const WAITING = {
  id: 'p-1',
  project: 'p',
  state: 'waiting',
  sha: 'f'.repeat(64),
  max_rounds: 3,
  round: 0,
  thread: [],
  wake: { state: 'none' },
  card: {
    cls: 'tap',
    lang: 'en',
    q: 'Ship the build?',
    effect: 'Testers get it',
    show: 'Build 14',
    blocks: 'the release',
    opts: [
      { n: 1, l: 'Ship', note: '', rec: true },
      { n: 2, l: 'Wait', note: 'a day', rec: false }
    ]
  }
};
const ISSUE = {
  id: 'p-1',
  status: 'owner_decision',
  updated_at: 1,
  metadata: { card_q: 'x' }
};
const flush = () => new Promise((r) => setTimeout(r, 20));

/** @param {(type: string, p: any) => any} handler */
function setup(handler) {
  document.body.innerHTML = '<div id="slot" class="detail-slot"></div>';
  const el = document.getElementById('slot');
  const send = vi.fn(async (type, p) => handler(type, p));
  setCardClient({ send });
  return { el, send };
}
const q = (el, sel) => el.querySelector(sel);

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('beads-ui.lang', 'en');
});

describe('card panel', () => {
  test('a bead with no card stays empty and asks nothing', async () => {
    const { el, send } = setup(() => WAITING);
    mountCard(el, { id: 'p-9', status: 'open', metadata: {} });
    await flush();
    expect(el.childElementCount).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  test('waiting card: two steps, then card-answer with option and sha', async () => {
    const { el, send } = setup((type) =>
      type === 'card-state' ? WAITING : { code: 'recorded', wake: 'queued' }
    );
    mountCard(el, ISSUE);
    await flush();
    expect(q(el, '.cd__q').textContent).toBe('Ship the build?');
    const opts = el.querySelectorAll('[data-opt]');
    expect(opts.length).toBe(2);
    opts[1].click();
    await flush();
    // nothing written before Confirm
    expect(send.mock.calls.map((c) => c[0])).toEqual(['card-state']);
    q(el, '[data-act=confirm]').click();
    await flush();
    expect(send).toHaveBeenCalledWith('card-answer', {
      id: 'p-1',
      option: 2,
      sha: WAITING.sha
    });
  });

  test('typed card sends the text; empty text is not sent', async () => {
    const typed = {
      ...WAITING,
      card: {
        ...WAITING.card,
        cls: 'type',
        opts: [{ n: 1, l: 'Name', note: '', rec: false }]
      }
    };
    const { el, send } = setup((type) =>
      type === 'card-state' ? typed : { code: 'recorded', wake: 'queued' }
    );
    mountCard(el, ISSUE);
    await flush();
    q(el, '[data-act=send]').click();
    await flush();
    expect(send.mock.calls.some((c) => c[0] === 'card-answer')).toBe(false);
    const ta = q(el, '.cd__text');
    ta.value = ' Falak ';
    ta.dispatchEvent(new Event('input'));
    q(el, '[data-act=send]').click();
    await flush();
    expect(send).toHaveBeenCalledWith('card-answer', {
      id: 'p-1',
      text: 'Falak',
      sha: WAITING.sha
    });
  });

  test('a changed card shows the reason and the card reloads', async () => {
    let states = 0;
    const { el } = setup((type) => {
      if (type === 'card-state') {
        states += 1;
        return WAITING;
      }
      throw Object.assign(new Error('changed'), { code: 'changed' });
    });
    mountCard(el, ISSUE);
    await flush();
    el.querySelector('[data-opt]').click();
    await flush();
    q(el, '[data-act=confirm]').click();
    await flush();
    expect(q(el, '.cd__err').textContent).toMatch(/card changed/i);
    expect(states).toBe(2);
    // back to the choice step
    expect(q(el, '[data-act=confirm]')).toBe(null);
  });

  test('ask: scope option 2 sends card-ask; part sends the quote', async () => {
    const { el, send } = setup((type) =>
      type === 'card-state'
        ? WAITING
        : { code: 'asked', round: 1, wake: 'queued' }
    );
    mountCard(el, ISSUE);
    await flush();
    q(el, '[data-act=ask-open]').click();
    await flush();
    expect(q(el, '.cd__note').textContent).toContain('1 of 3');
    const sel = q(el, '.cd__sel');
    sel.value = 'option:2';
    sel.dispatchEvent(new Event('change'));
    await flush();
    const qt = q(el, '.cd__qtext');
    qt.value = 'What does a day cost?';
    qt.dispatchEvent(new Event('input'));
    q(el, '.cd__form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(send).toHaveBeenCalledWith('card-ask', {
      id: 'p-1',
      scope: 'option:2',
      question: 'What does a day cost?'
    });

    // part: quote is required text from the box
    q(el, '[data-act=ask-open]').click();
    await flush();
    const sel2 = q(el, '.cd__sel');
    sel2.value = 'part';
    sel2.dispatchEvent(new Event('change'));
    await flush();
    const quote = q(el, '.cd__quote');
    quote.value = 'Testers get it';
    quote.dispatchEvent(new Event('input'));
    const qt2 = q(el, '.cd__qtext');
    qt2.value = 'Which testers?';
    qt2.dispatchEvent(new Event('input'));
    q(el, '.cd__form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(send).toHaveBeenCalledWith('card-ask', {
      id: 'p-1',
      scope: 'part',
      question: 'Which testers?',
      quote: 'Testers get it'
    });
  });

  test('thread shows the question and the asker answer; no ask after 3 rounds', async () => {
    const thread = [1, 2, 3].flatMap((n) => [
      { kind: 'q', round: n, scope: 'question', text: 'Q' + n },
      { kind: 'a', round: n, text: 'A' + n }
    ]);
    const { el } = setup(() => ({ ...WAITING, thread }));
    mountCard(el, ISSUE);
    await flush();
    const msgs = el.querySelectorAll('.cd__msg');
    expect(msgs.length).toBe(6);
    expect(msgs[1].textContent).toContain('A1');
    expect(q(el, '[data-act=ask-open]')).toBe(null);
    expect(q(el, '.cd__note').textContent).toMatch(/used all 3/);
  });

  test('wake state: queued with no listener, queued, delivered', async () => {
    for (const [state, re] of [
      ['queued-no-listener', /not listening/],
      ['queued', /will get it shortly/],
      ['delivered', /Delivered/]
    ]) {
      const { el } = setup(() => ({
        ...WAITING,
        state: 'answered',
        sha: '',
        decision: { via: 'phone', answer: 'answer: option 1 "Ship"' },
        wake: { state }
      }));
      mountCard(el, { ...ISSUE, status: 'open' });
      await flush();
      expect(q(el, '.cd__wake').textContent).toMatch(re);
      expect(q(el, '.cd__rec').textContent).toContain('option 1');
      expect(q(el, '[data-opt]')).toBe(null);
    }
  });

  test('asked state: explains that the card comes back; Arabic when chosen', async () => {
    window.localStorage.setItem('beads-ui.lang', 'ar');
    const { el } = setup(() => ({
      ...WAITING,
      state: 'asked',
      sha: '',
      thread: [{ kind: 'q', round: 1, scope: 'question', text: 'why?' }]
    }));
    mountCard(el, {
      ...ISSUE,
      status: 'open',
      metadata: { card_state: 'asked' }
    });
    await flush();
    expect(q(el, '.cd__title').textContent).toContain('سؤالك');
    expect(q(el, '.cd__note').textContent).toContain('الشرح');
    expect(q(el, '[data-opt]')).toBe(null);
  });

  test('a late reply for another bead does not paint', async () => {
    let release;
    const { el } = setup(
      (type, p) =>
        new Promise((res) => {
          if (p.id === 'p-1') release = () => res(WAITING);
          else
            res({
              ...WAITING,
              id: 'p-2',
              card: { ...WAITING.card, q: 'Second?' }
            });
        })
    );
    mountCard(el, ISSUE);
    mountCard(el, { ...ISSUE, id: 'p-2' });
    await flush();
    release();
    await flush();
    expect(q(el, '.cd__q').textContent).toBe('Second?');
  });
});
