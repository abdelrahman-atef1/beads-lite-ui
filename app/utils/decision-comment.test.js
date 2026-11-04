import { describe, expect, test } from 'vitest';
import {
  answerText,
  decisionStates,
  parseDecisionComment
} from './decision-comment.js';

const POST = [
  'ASK: Ship the build?',
  '## Decision',
  'q: Ship the build?',
  'effect: Testers get it',
  'blocks: the release',
  'options:',
  '1. Ship (recommended) - today',
  '2. Wait'
].join('\n');
const NB = POST.replace(
  'options:',
  'mode: non-blocking (status unchanged)\noptions:'
);
const c = (id, text) => ({ id, text });
const ID1 = 'abcdef12-0000-0000-0000-000000000001';

describe('parseDecisionComment', () => {
  test('reads question, effect, blocks and options', () => {
    expect(parseDecisionComment(POST)).toEqual({
      q: 'Ship the build?',
      effect: 'Testers get it',
      blocks: 'the release',
      show: '',
      nonBlocking: false,
      opts: [
        { n: 1, l: 'Ship', rec: true, note: 'today' },
        { n: 2, l: 'Wait', rec: false, note: '' }
      ]
    });
    expect(parseDecisionComment(NB)?.nonBlocking).toBe(true);
  });
  test('ordinary comments are not decisions', () => {
    expect(parseDecisionComment('hello')).toBeNull();
    expect(parseDecisionComment('ASK: only a title')).toBeNull();
    expect(
      parseDecisionComment('Status\n## Decision\nq: x\noptions:\n1. a')
    ).toBeNull();
    expect(parseDecisionComment(undefined)).toBeNull();
  });
});

describe('decisionStates', () => {
  test('open only while the bead is parked and no record cites it', () => {
    const cs = [c(ID1, POST)];
    expect(decisionStates(cs, { status: 'owner_decision' }).get(0)?.kind).toBe(
      'open'
    );
    expect(decisionStates(cs, { status: 'open' }).get(0)?.kind).toBe('closed');
  });
  test('a record with re: c-<8hex> answers it', () => {
    const rec = c(
      'x',
      'OWNER DECISION via board (pc)\nre: c-abcdef12\nanswer: option 2 "Wait"\nScope: x'
    );
    const st = decisionStates([c(ID1, POST), rec], { status: 'open' });
    expect(st.get(0)).toEqual({ kind: 'answered', answer: '2 - Wait' });
  });
  test('non-blocking stays open to answer, then shows the pick', () => {
    const cs = [c(ID1, NB)];
    expect(decisionStates(cs, { status: 'open' }).get(0)?.kind).toBe(
      'nonblocking'
    );
    const txt = answerText(
      { n: 1, l: 'Ship', rec: true, note: '' },
      'c-abcdef12'
    );
    expect(txt).toBe('Answered: 1 - Ship, re: c-abcdef12');
    const st = decisionStates([...cs, c('y', txt)], { status: 'open' });
    expect(st.get(0)).toEqual({ kind: 'answered', answer: '1 - Ship' });
  });
  test('a record for another card does not answer this one', () => {
    const st = decisionStates(
      [
        c(ID1, POST),
        c(
          'x',
          'OWNER DECISION via board\nre: c-99999999\nanswer: option 1 "Ship"'
        )
      ],
      { status: 'owner_decision' }
    );
    expect(st.get(0)?.kind).toBe('open');
  });
});
