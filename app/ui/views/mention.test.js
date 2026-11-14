// @ts-nocheck -- fixture-heavy view test
import { render } from 'lit-html';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  createMentionApi,
  inQuoted,
  parseMentions,
  pickerItems,
  tokenAt
} from '../data/mention.js';
import {
  afterCommentPosted,
  attachPicker,
  forceFixture,
  renderMentionChips,
  useMentionApi
} from './mention.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('mention parsing (fixture rules)', () => {
  test('known roles only, in order, unique', () => {
    expect(parseMentions('@qa and @swe and @QA, @nobody, @owner')).toEqual({
      roles: ['qa', 'swe'],
      owner: true
    });
  });
  test('nothing inside fences, inline code or quotes', () => {
    expect(
      parseMentions('```\n@qa\n```\n> @swe\n`@pm` and a@qa.com').roles
    ).toEqual([]);
  });
  test('caret in code or a quote opens no picker', () => {
    expect(inQuoted('```\nx @')).toBe(true);
    expect(inQuoted('> hi @')).toBe(true);
    expect(inQuoted('see `x @')).toBe(true);
    expect(inQuoted('see @')).toBe(false);
    expect(tokenAt('```\n@q', 6)).toBeNull();
    expect(tokenAt('hi @q', 5)).toEqual({ start: 3, query: 'q' });
    expect(tokenAt('mail a@q', 8)).toBeNull();
    expect(tokenAt('شوف @s', 6)).toEqual({ start: 4, query: 's' });
  });
  test('picker rows start with the query; @owner is listed', () => {
    expect(pickerItems('').some((r) => r.role === 'owner')).toBe(true);
    expect(pickerItems('sw').map((r) => r.role)).toEqual(['swe']);
    expect(pickerItems('zz')).toEqual([]);
  });
});

describe('fixture adapter', () => {
  test('3 roles wake, the rest are limit; owner is seen', async () => {
    const api = createMentionApi();
    const r = await api.scan('b-1', '@pm @cos @swe @qa @owner');
    expect(r.map((x) => `${x.role}:${x.chip}`)).toEqual([
      'owner:seen',
      'pm:waiting',
      'cos:waiting',
      'swe:waiting',
      'qa:limit'
    ]);
    expect(api.fixture).toBe(true);
  });
});

describe('chips', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="v"></div>';
    window.localStorage.setItem('beads-ui.lang', 'ar');
    forceFixture(true);
  });
  for (const chip of ['waiting', 'woke', 'limit', 'paused']) {
    test(`fixture state ${chip} renders under the newest comment`, async () => {
      useMentionApi({ fixtureChip: chip });
      await afterCommentPosted({}, 'b-1', '@qa please');
      const host = document.getElementById('v');
      render(renderMentionChips('b-1', { id: 'c1' }, true), host);
      const el = host.querySelector(`[data-chip=${chip}]`);
      expect(el).toBeTruthy();
      expect(el.textContent).toContain('@qa');
      expect(el.getAttribute('dir')).toBe('ltr');
    });
  }
  test('seen chip for @owner; older comments show none', async () => {
    useMentionApi({});
    await afterCommentPosted({}, 'b-2', 'cc @owner');
    const host = document.getElementById('v');
    render(renderMentionChips('b-2', { id: 'c1' }, true), host);
    expect(host.querySelector('[data-chip=seen]')).toBeTruthy();
    render(renderMentionChips('b-2', { id: 'c0' }, false), host);
    expect(host.querySelector('[data-chip]')).toBeNull();
  });
  test('server chips match their own comment id only', async () => {
    const calls = [];
    useMentionApi({
      send: async (type, p) => {
        calls.push(type);
        return type === 'mention-chips'
          ? {
              chips: [
                { comment: 'c9', role: 'qa', chip: 'woke', verdict: 'queued' }
              ]
            }
          : {};
      }
    });
    forceFixture(false);
    const { loadChips } = await import('./mention.js');
    await loadChips({}, 'b-3');
    const host = document.getElementById('v');
    render(renderMentionChips('b-3', { id: 'c9' }, false), host);
    expect(host.querySelector('[data-chip=woke]')).toBeTruthy();
    render(renderMentionChips('b-3', { id: 'c1' }, true), host);
    expect(host.querySelector('[data-chip]')).toBeNull();
  });
});

describe('picker in the composer', () => {
  /** @returns {{ ta: HTMLTextAreaElement, pop: HTMLElement, off: () => void }} */
  function mountComposer(lang = 'ar') {
    window.localStorage.setItem('beads-ui.lang', lang);
    forceFixture(true);
    useMentionApi({});
    document.body.innerHTML =
      '<div class="u3-ts__composer"><textarea id="u3-ts-in"></textarea><div id="pop"></div></div>';
    const ta = document.getElementById('u3-ts-in');
    const pop = document.getElementById('pop');
    const off = attachPicker(ta, pop);
    return { ta, pop, off };
  }
  const type = (ta, v) => {
    ta.value = v;
    ta.setSelectionRange(v.length, v.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  test('"@" lists the roles and @owner; Arabic names, LTR role codes', async () => {
    const { ta, pop, off } = mountComposer('ar');
    type(ta, '@');
    await tick();
    const names = [...pop.querySelectorAll('.u3-mn__r')].map(
      (x) => x.textContent
    );
    expect(names).toContain('@qa');
    expect(names).toContain('@owner');
    expect(pop.querySelector('.u3-mn__r').getAttribute('dir')).toBe('ltr');
    expect(pop.querySelector('.u3-mn__d').textContent).toMatch(/[؀-ۿ]/);
    expect(pop.querySelector('.u3-mn__hint').textContent).toMatch(/المنشن/);
    off();
  });
  test('typing filters, Enter inserts and closes, text keeps the rest', async () => {
    const { ta, pop, off } = mountComposer('en');
    type(ta, 'hi @sw');
    await tick();
    expect(pop.querySelectorAll('[role=option]').length).toBe(1);
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
    );
    expect(ta.value).toBe('hi @swe ');
    expect(pop.querySelectorAll('[role=option]').length).toBe(0);
    off();
  });
  test('arrow keys move, Escape closes, a tap inserts', async () => {
    const { ta, pop, off } = mountComposer('en');
    type(ta, '@');
    await tick();
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true
      })
    );
    expect(
      pop.querySelectorAll('[role=option]')[1].getAttribute('aria-selected')
    ).toBe('true');
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );
    expect(pop.querySelectorAll('[role=option]').length).toBe(0);
    type(ta, '@q');
    await tick();
    pop
      .querySelector('[role=option]')
      .dispatchEvent(
        new Event('pointerdown', { bubbles: true, cancelable: true })
      );
    expect(ta.value).toBe('@qa ');
    off();
  });
  test('no picker inside a code fence or a quote; none for an unknown name', async () => {
    const { ta, pop, off } = mountComposer('en');
    type(ta, '```\n@');
    await tick();
    expect(pop.querySelectorAll('[role=option]').length).toBe(0);
    type(ta, '> @');
    await tick();
    expect(pop.querySelectorAll('[role=option]').length).toBe(0);
    type(ta, '@zzz');
    await tick();
    expect(pop.querySelector('.u3-mn__none')).toBeTruthy();
    off();
  });
});

describe('low findings (.59)', () => {
  test('an emit that failed is a "failed, retry" chip, not "limit"', async () => {
    window.localStorage.setItem('beads-ui.lang', 'en');
    forceFixture(false);
    useMentionApi({
      send: async (type) =>
        type === 'mention-chips'
          ? {
              chips: [
                {
                  comment: 'c1',
                  role: 'qa',
                  chip: 'limit',
                  verdict: 'emit-failed'
                },
                { comment: 'c1', role: 'pm', chip: 'limit', verdict: 'capped' }
              ]
            }
          : {}
    });
    const { loadChips } = await import('./mention.js');
    await loadChips({}, 'b-f');
    document.body.innerHTML = '<div id="v"></div>';
    const host = document.getElementById('v');
    render(renderMentionChips('b-f', { id: 'c1' }, false), host);
    const failed = host.querySelector('[data-chip=failed]');
    expect(failed.textContent).toContain('failed, retry');
    expect(failed.textContent).toContain('@qa');
    expect(host.querySelector('[data-chip=limit]').textContent).toContain(
      '@pm'
    );
    forceFixture(true);
  });
  test('picker placement: flips below when the room above is too small', async () => {
    const { placement } = await import('./mention.js');
    expect(placement(300, 900, 200)).toBe('above');
    expect(placement(300, 40, 700)).toBe('below');
    expect(placement(300, 40, 20)).toBe('above');
  });
  test('picker near the top of the window sits below the box', async () => {
    window.localStorage.setItem('beads-ui.lang', 'en');
    forceFixture(true);
    useMentionApi({});
    document.body.innerHTML =
      '<div class="u3-ts__composer"><textarea id="u3-ts-in"></textarea><div id="pop"></div></div>';
    const ta = document.getElementById('u3-ts-in');
    const pop = document.getElementById('pop');
    ta.getBoundingClientRect = () => ({ top: 40, bottom: 100, height: 60 });
    const proto = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.classList?.contains('u3-mn__pop')
        ? { top: -35, bottom: 300, height: 335 }
        : proto.call(this);
    };
    const off = attachPicker(ta, pop);
    ta.value = '@';
    ta.setSelectionRange(1, 1);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    HTMLElement.prototype.getBoundingClientRect = proto;
    const el = pop.querySelector('.u3-mn__pop');
    expect(el.dataset.side).toBe('below');
    expect(el.style.bottom).toBe('auto');
    off();
  });
});
