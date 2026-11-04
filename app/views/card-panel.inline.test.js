// @ts-nocheck -- fixture-heavy view test
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mountDecisionComment, setCardClient } from './card-panel.js';

const POST = [
  'ASK: Ship the build?',
  '## Decision',
  'q: Ship the build?',
  'effect: Testers get it',
  'blocks: the release',
  'options:',
  '1. Ship (recommended)',
  '2. Wait'
].join('\n');
const ID = 'abcdef12-0000-0000-0000-000000000001';
const STATE = {
  id: 'p-1',
  state: 'waiting',
  sha: 'f'.repeat(64),
  max_rounds: 3,
  thread: [],
  wake: { state: 'none' },
  card: {
    cls: 'tap',
    lang: 'en',
    q: 'Ship the build?',
    effect: 'Testers get it',
    blocks: 'the release',
    opts: [
      { n: 1, l: 'Ship', note: '', rec: true },
      { n: 2, l: 'Wait', note: '', rec: false }
    ]
  }
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const mk = () => {
  const el = document.createElement('div');
  el.dataset.cid = 'c-abcdef12';
  document.body.append(el);
  return el;
};
let send;
beforeEach(() => {
  document.body.innerHTML = '';
  send = vi.fn(async (type) =>
    type === 'card-state' ? STATE : { code: 'recorded', wake: 'queued' }
  );
  setCardClient({ send });
});

describe('inline decision card', () => {
  test('open: badge, options, tap then Confirm sends card-answer with sha', async () => {
    const el = mk();
    mountDecisionComment(el, {
      id: 'p-1',
      status: 'owner_decision',
      comments: [{ id: ID, text: POST }]
    });
    await flush();
    expect(el.querySelector('.dc__badge')?.textContent).toBe('Decision');
    expect(el.querySelectorAll('[data-opt]')).toHaveLength(2);
    el.querySelector('[data-opt="2"]').click();
    await flush();
    el.querySelector('[data-act="confirm"]').click();
    await flush();
    expect(send).toHaveBeenCalledWith('card-answer', {
      id: 'p-1',
      option: 2,
      sha: STATE.sha
    });
  });
  test('answered: shows his pick, no buttons', () => {
    const el = mk();
    mountDecisionComment(el, {
      id: 'p-1',
      status: 'open',
      comments: [
        { id: ID, text: POST },
        {
          id: 'z',
          text: 'OWNER DECISION via board (pc)\nre: c-abcdef12\nanswer: option 2 "Wait"'
        }
      ]
    });
    expect(el.querySelector('[data-answered]').textContent).toContain(
      '2 - Wait'
    );
    expect(el.querySelector('.is-picked').textContent).toContain('Wait');
    expect(el.querySelector('button')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  test('non-blocking: Confirm writes "Answered: N - label, re: c-id" as a comment', async () => {
    const el = mk();
    const issue = {
      id: 'p-1',
      status: 'open',
      comments: [
        {
          id: ID,
          text: POST.replace(
            'options:',
            'mode: non-blocking (status unchanged)\noptions:'
          )
        }
      ]
    };
    mountDecisionComment(el, issue);
    el.querySelector('[data-opt="1"]').click();
    el.querySelector('[data-act="confirm"]').click();
    await flush();
    expect(send).toHaveBeenCalledWith('add-comment', {
      id: 'p-1',
      text: 'Answered: 1 - Ship, re: c-abcdef12'
    });
    expect(el.querySelector('[data-answered]').textContent).toContain(
      '1 - Ship'
    );
    expect(send).not.toHaveBeenCalledWith('card-answer', expect.anything());
  });
  test('a non-decision comment mounts nothing', () => {
    const el = mk();
    mountDecisionComment(el, { id: 'p-1', comments: [{ id: ID, text: 'hi' }] });
    expect(el.innerHTML).toBe('');
  });
});
