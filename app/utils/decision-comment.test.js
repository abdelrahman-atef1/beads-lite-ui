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

describe('type card (one option)', () => {
  const TYPE = [
    'ASK: Which wording?',
    '## Decision',
    'q: Which wording?',
    'show: A or B',
    'options:',
    '1. Write your reply'
  ].join('\n');
  test('is a decision with exactly one option', () => {
    expect(parseDecisionComment(TYPE)?.opts).toHaveLength(1);
  });
  test('still open on owner_decision', () => {
    const st = decisionStates([c(ID1, TYPE)], { status: 'owner_decision' });
    expect(st.get(0)?.kind).toBe('open');
  });
  test('no options at all is not a decision', () => {
    expect(
      parseDecisionComment(TYPE.replace('1. Write your reply', ''))
    ).toBeNull();
  });
});

describe('a decision with several questions (### Q<k>)', () => {
  const MULTI = [
    'ASK: 3 decisions about the thing?',
    '## Decision',
    'q: 3 decisions about the thing?',
    'effect: We build it',
    'blocks: The build',
    '### Q1',
    'q: Which colour?',
    'effect: We build it',
    'options:',
    '1. Red (recommended)',
    '2. Blue - cool',
    '### Q2',
    'q: What should we call it?',
    'effect: We build it',
    'show: A name for the new thing',
    'options:',
    '1. Name'
  ].join('\n');
  test('every question keeps its own options; the card level has none', () => {
    const d = parseDecisionComment(MULTI);
    expect(d?.q).toBe('3 decisions about the thing?');
    expect(d?.opts).toEqual([]);
    expect(d?.questions).toHaveLength(2);
    expect(d?.questions?.[0].opts).toEqual([
      { n: 1, l: 'Red', rec: true, note: '' },
      { n: 2, l: 'Blue', rec: false, note: 'cool' }
    ]);
    expect(d?.questions?.[1]).toMatchObject({
      n: 2,
      q: 'What should we call it?',
      show: 'A name for the new thing'
    });
    expect(d?.questions?.[1].opts).toHaveLength(1);
  });
  test('one question block, a missing option list or a wrong number is not a decision', () => {
    expect(parseDecisionComment(MULTI.replace('### Q2', '### Q3'))).toBeNull();
    expect(
      parseDecisionComment(MULTI.replace('options:\n1. Name', 'options:'))
    ).toBeNull();
    expect(
      parseDecisionComment(
        MULTI.split('### Q2')[0] // only Q1
      )
    ).toBeNull();
  });
  test('the answer of a final record reads as one line per question', () => {
    const rec = [
      'OWNER DECISION via board (phone)',
      'answer 1: option 2 "Blue"',
      'answer 2 (typed, as one JSON string): "Falak"',
      're: c-abcdef12'
    ].join('\n');
    const st = decisionStates([c(ID1, MULTI), c('x', rec)], {
      status: 'open'
    });
    expect(st.get(0)).toEqual({
      kind: 'answered',
      answer: '1: 2 - Blue / 2: "Falak"'
    });
  });
  test('a plain card is read exactly as before', () => {
    expect(parseDecisionComment(POST)).not.toHaveProperty('questions');
  });
});
