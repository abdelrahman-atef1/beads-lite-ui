/**
 * Cards of several questions on the board server (beads-lite-1bo5.13.12.1.3):
 * state, answer, ask, feed row, notifier key. Fake bd and fake card CLI; the
 * card core (rules.mjs, core.mjs) is the real one, so partial records are
 * read the way the CLI reads them. The real CLI is in cards.multi.real.test.js.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCards, lastDecision, partialRecords } from './cards.js';
import { createDecisionsFeed } from './decisions-feed.js';

const CARDS = process.env.CARDS_DIR || 'E:/Projects/learner/scripts/cards';
const have =
  fs.existsSync(path.join(CARDS, 'card.mjs')) &&
  fs
    .readFileSync(path.join(CARDS, 'core.mjs'), 'utf8')
    .includes('questionShas');
if (!have) {
  console.warn(
    'cards.multi.test: card core with card_qs not found, multi tests NOT exercised'
  );
}

const QS = [
  {
    q: 'Which colour?',
    class: 'tap',
    opts: [
      { l: 'Red', rec: true },
      { l: 'Blue', n: 'cool' }
    ]
  },
  {
    q: 'Which size?',
    class: 'tap',
    opts: [{ l: 'Small' }, { l: 'Large', rec: true }, { l: 'Huge' }]
  },
  {
    q: 'What should we call it?',
    class: 'type',
    show: 'A name for the new thing',
    opts: [{ l: 'Name' }]
  }
];
const multiMeta = (/** @type {any} */ over = {}) => ({
  card_class: 'multi',
  card_back: 'swe',
  card_q: '3 decisions about the thing?',
  card_effect: 'We build it',
  card_blocks: 'The build',
  card_qs: JSON.stringify(QS),
  ...over
});
const singleMeta = {
  card_class: 'tap',
  card_back: 'swe',
  card_q: 'Ship it now?',
  card_effect: 'Goes to testers',
  card_blocks: 'release',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }])
};

/** @type {any} */
let core;
/** @type {any} */
let rules;
let root = '';
const OLD = { w: process.env.WAKE_ROOT, c: process.env.CARDS_HOME };

beforeEach(async () => {
  if (!have) return;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsmulti-'));
  process.env.WAKE_ROOT = root;
  fs.mkdirSync(path.join(root, 'home'));
  fs.writeFileSync(path.join(root, 'home', 'TEST_MODE'), '');
  process.env.CARDS_HOME = path.join(root, 'home');
  core ??= await import(pathToFileURL(path.join(CARDS, 'core.mjs')).href);
  rules ??= await import(pathToFileURL(path.join(CARDS, 'rules.mjs')).href);
});
afterEach(() => {
  if (OLD.w === undefined) delete process.env.WAKE_ROOT;
  else process.env.WAKE_ROOT = OLD.w;
  if (OLD.c === undefined) delete process.env.CARDS_HOME;
  else process.env.CARDS_HOME = OLD.c;
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

let n = 0;
/** A partial record of question k, as the card CLI writes it. */
function partial(
  /** @type {any} */ bead,
  /** @type {number} */ k,
  /** @type {string[]} */ answerLines,
  /** @type {any} */ over = {}
) {
  const card = rules.parseCard(bead).card;
  const sha = over.sha || core.questionShas(card)[k - 1].slice(0, 12);
  const cardId = `b-${String(++n).padStart(16, '0')}`;
  return {
    id: String(n).padStart(8, 'a'),
    author: 'owner-board',
    created_at: `2026-11-16T10:0${k}:00Z`,
    text: [
      `OWNER ANSWER via board (partial ${k} of ${card.qs.length})`,
      'date: 2026-11-16 10:00',
      `card: ${cardId}`,
      `bead: ${bead.id}`,
      `via: ${over.via || 'phone'}`,
      `q: ${k}`,
      `qsha: ${sha}`,
      ...answerLines,
      'Scope: this answers this question only; it is not new work or a new permission.'
    ].join('\n')
  };
}

/** @param {any} over */
function rig(over = {}) {
  const calls = {
    exec: /** @type {any[]} */ ([]),
    wake: /** @type {any[]} */ ([])
  };
  let bead = {
    id: 'tc-1',
    status: 'owner_decision',
    assignee: 'abdelrahman',
    title: 'Pick things',
    metadata: multiMeta(),
    ...over.bead
  };
  let comments = over.comments || [];
  const cards = createCards({
    listProjects: () => [{ path: '/w/tc' }],
    prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tc' })),
    runBdJson: /** @type {any} */ (
      async (/** @type {string[]} */ args) => ({
        code: 0,
        stdoutJson: args[0] === 'show' ? [bead] : comments
      })
    ),
    exec: async (_f, args, input) => {
      calls.exec.push({ args, input: JSON.parse(input) });
      return {
        code: 0,
        stdout: JSON.stringify(
          over.cli || {
            ok: true,
            code: 'answered-partial',
            q: 1,
            answered: 1,
            total: 3
          }
        )
      };
    },
    wake: async (ev) => {
      calls.wake.push(ev);
      return 'queued';
    },
    cardsDir: CARDS
  });
  return {
    cards,
    calls,
    bead: () => bead,
    set: (/** @type {any} */ b, /** @type {any} */ c) => {
      bead = { ...bead, ...b };
      if (c) comments = c;
    }
  };
}

describe.skipIf(!have)('card-state of a card with several questions', () => {
  test('lists every question with its own options, none answered', async () => {
    const r = rig();
    const s = await r.cards.state('tc-1');
    expect(s.state).toBe('waiting');
    expect(s.total).toBe(3);
    expect(s.answeredCount).toBe(0);
    expect(s.questions.map((/** @type {any} */ x) => x.q)).toEqual([
      'Which colour?',
      'Which size?',
      'What should we call it?'
    ]);
    expect(s.questions[1].opts.map((/** @type {any} */ o) => o.l)).toEqual([
      'Small',
      'Large',
      'Huge'
    ]);
    expect(s.questions[2].class).toBe('type');
    expect(
      s.questions.every((/** @type {any} */ x) => x.answered === null)
    ).toBe(true);
    expect(s.questions.map((/** @type {any} */ x) => x.stale)).toEqual([
      false,
      false,
      false
    ]);
    // one hash per question, one for the card
    expect(new Set(s.questions.map((/** @type {any} */ x) => x.sha)).size).toBe(
      3
    );
    expect(s.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(s.card.q).toBe('3 decisions about the thing?');
  });

  test('answered questions carry the answer, who and when; the rest stay open', async () => {
    const bead = { id: 'tc-1', metadata: multiMeta() };
    const r = rig({
      comments: [
        partial(bead, 1, ['answer: option 2 "Blue"']),
        partial(bead, 3, ['answer (typed, as one JSON string): "Falak"'], {
          via: 'pc'
        })
      ]
    });
    const s = await r.cards.state('tc-1');
    expect(s.answeredCount).toBe(2);
    expect(s.questions[0].answered).toMatchObject({
      n: 2,
      label: 'Blue',
      via: 'phone',
      at: '2026-11-16T10:01:00Z'
    });
    expect(s.questions[1].answered).toBe(null);
    expect(s.questions[2].answered).toMatchObject({ text: 'Falak', via: 'pc' });
  });

  test('a question rewritten after its answer shows stale, the others keep theirs', async () => {
    const old = { id: 'tc-1', metadata: multiMeta() };
    const comments = [
      partial(old, 1, ['answer: option 1 "Red"']),
      partial(old, 2, ['answer: option 2 "Large"'])
    ];
    const changed = JSON.parse(JSON.stringify(QS));
    changed[1].q = 'Which size now?';
    const r = rig({
      bead: { metadata: multiMeta({ card_qs: JSON.stringify(changed) }) },
      comments
    });
    const s = await r.cards.state('tc-1');
    expect(s.answeredCount).toBe(1);
    expect(s.questions[0].answered).toMatchObject({ label: 'Red' });
    expect(s.questions[1].answered).toBe(null);
    expect(s.questions[1].stale).toBe(true);
    expect(s.questions[0].stale).toBe(false);
  });

  test('a partial answer before the last decision record does not count', async () => {
    const bead = { id: 'tc-1', metadata: multiMeta() };
    const r = rig({
      comments: [
        partial(bead, 1, ['answer: option 1 "Red"']),
        {
          author: 'owner-board',
          text: 'OWNER DECISION via board (phone)\nanswer 1: option 1 "Red"'
        }
      ]
    });
    expect((await r.cards.state('tc-1')).answeredCount).toBe(0);
  });

  test('a plain card is one question and reads as before', async () => {
    const r = rig({ bead: { metadata: singleMeta } });
    const s = await r.cards.state('tc-1');
    expect(s.state).toBe('waiting');
    expect(s.total).toBe(1);
    expect(s.questions).toHaveLength(1);
    expect(s.questions[0]).toMatchObject({
      n: 1,
      class: 'tap',
      answered: null
    });
    expect(s.card.opts.map((/** @type {any} */ o) => o.l)).toEqual([
      'Yes',
      'No'
    ]);
    expect(s.sha).toBe(s.questions[0].sha);
    expect(s.card.cls).toBe('tap');
  });

  test('a bad multi card is not shown (no half card)', async () => {
    const bad = JSON.parse(JSON.stringify(QS));
    bad[1].opts = [{ l: 'Only one' }];
    const r = rig({
      bead: { metadata: multiMeta({ card_qs: JSON.stringify(bad) }) }
    });
    const s = await r.cards.state('tc-1');
    expect(s.state).toBe('none');
    expect(s.card).toBe(null);
    expect(s.questions).toBeUndefined();
  });

  test('a secret in any question hides the card', async () => {
    const bad = JSON.parse(JSON.stringify(QS));
    bad[2].show = 'the key is sk-abcdefgh12345678';
    const r = rig({
      bead: { metadata: multiMeta({ card_qs: JSON.stringify(bad) }) }
    });
    const s = await r.cards.state('tc-1');
    expect(s.card).toBe(null);
    expect(s.state).not.toBe('waiting');
  });

  test('after the last answer the decision lists every answer', () => {
    const d = lastDecision([
      {
        author: 'owner-board',
        created_at: 't',
        text: [
          'OWNER DECISION via board (phone)',
          'answer 1: option 2 "Blue"',
          'answer 2: option 1 "Small"',
          'note 2 (typed, as one JSON string): "soon"',
          'answer 3 (typed, as one JSON string): "Falak"'
        ].join('\n')
      }
    ]);
    expect(d?.via).toBe('phone');
    expect(d?.answers?.map((x) => x.q)).toEqual([1, 2, 3]);
    expect(d?.answers?.[2].answer).toBe('"Falak"');
    expect(d?.answer).toContain('1: option 2 "Blue"');
    expect(d?.answer).toContain('soon');
  });

  test('partialRecords: hashes per question, who per card id', () => {
    const bead = { id: 'tc-1', metadata: multiMeta() };
    const c = partial(bead, 2, ['answer: option 1 "Small"']);
    const p = partialRecords([c], 'tc-1');
    expect([...p.shas.keys()]).toEqual([2]);
    expect([...p.byCard.values()][0]).toMatchObject({ via: 'phone' });
    expect(partialRecords([c], 'other-1').shas.size).toBe(0);
  });
});

describe.skipIf(!have)('card-answer on a card with several questions', () => {
  test('q travels to the CLI; a partial answer wakes nobody', async () => {
    const r = rig();
    const res = await r.cards.answer(
      { id: 'tc-1', q: 2, option: 1, sha: 'ab'.repeat(32) },
      'pc.tail1234.ts.net'
    );
    expect(res).toMatchObject({
      code: 'answered-partial',
      wake: 'none',
      q: 1,
      answeredCount: 1,
      total: 3
    });
    expect(r.calls.exec[0].input).toMatchObject({
      repo: 'tc',
      bead: 'tc-1',
      via: 'phone',
      q: 2,
      option: 1
    });
    expect(r.calls.wake).toEqual([]);
  });

  test('the last answer gives exactly one decided wake for card_back', async () => {
    const r = rig({
      cli: { ok: true, code: 'recorded', back: 'swe', answered: 3, total: 3 }
    });
    const res = await r.cards.answer(
      { id: 'tc-1', q: 3, text: 'Falak' },
      'localhost:3000'
    );
    expect(res).toMatchObject({
      code: 'recorded',
      wake: 'queued',
      answeredCount: 3,
      total: 3
    });
    expect(r.calls.wake).toEqual([
      { kind: 'decided', repo: 'tc', bead: 'tc-1', via: 'pc', role: 'swe' }
    ]);
  });

  test('a run of answers: wakes only on the last', async () => {
    const r = rig();
    const answers = [
      { ok: true, code: 'answered-partial', q: 1, answered: 1, total: 3 },
      { ok: true, code: 'answered-partial', q: 2, answered: 2, total: 3 },
      { ok: true, code: 'recorded', back: 'swe', answered: 3, total: 3 }
    ];
    let i = 0;
    const cards = createCards({
      listProjects: () => [{ path: '/w/tc' }],
      prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tc' })),
      exec: async () => ({
        code: 0,
        stdout: JSON.stringify(answers[i++])
      }),
      wake: async (ev) => {
        r.calls.wake.push(ev);
        return 'queued';
      },
      cardsDir: CARDS
    });
    for (let k = 1; k <= 3; k++) {
      await cards.answer({ id: 'tc-1', q: k, option: 1 }, undefined);
    }
    expect(r.calls.wake).toHaveLength(1);
    expect(r.calls.wake[0]).toMatchObject({ kind: 'decided', role: 'swe' });
  });

  test('already-answered and bad-question pass through as codes with underscores, no wake', async () => {
    for (const [code, wire] of [
      ['already-answered', 'already_answered'],
      ['bad-question', 'bad_question']
    ]) {
      const r = rig({ cli: { ok: false, code } });
      await expect(
        r.cards.answer({ id: 'tc-1', q: 1, option: 1 }, undefined)
      ).rejects.toMatchObject({ code: wire, message: code });
      expect(r.calls.wake).toEqual([]);
    }
  });

  test('q must be a whole number 1 to 5; a plain answer sends no q', async () => {
    const r = rig({ cli: { ok: true, code: 'recorded', back: 'swe' } });
    for (const q of [0, 6, 1.5, '2', null]) {
      expect(() =>
        r.cards.answer({ id: 'tc-1', q, option: 1 }, undefined)
      ).toThrow();
    }
    expect(r.calls.exec).toEqual([]);
    await r.cards.answer({ id: 'tc-1', option: 1 }, undefined);
    expect(r.calls.exec[0].input).not.toHaveProperty('q');
  });

  test('ask scope with a question prefix goes through; one asked wake', async () => {
    const r = rig({ cli: { ok: true, code: 'asked', back: 'swe', round: 1 } });
    const res = await r.cards.ask(
      { id: 'tc-1', scope: 'q2:option:3', question: 'What is Huge?' },
      'pc.tail1234.ts.net'
    );
    expect(res).toMatchObject({ code: 'asked', round: 1 });
    expect(r.calls.exec[0].input).toMatchObject({ scope: 'q2:option:3' });
    expect(r.calls.wake).toHaveLength(1);
    expect(r.calls.wake[0]).toMatchObject({ kind: 'asked' });
  });

  test('the phone door lets the new refusal codes through', async () => {
    const { redactFrame } = await import('../phone.js');
    for (const code of ['already_answered', 'bad_question']) {
      const out = JSON.parse(
        /** @type {string} */ (
          redactFrame(
            JSON.stringify({
              id: 1,
              ok: false,
              type: 'card-answer',
              error: { code, message: code.replace(/_/g, '-') }
            })
          )
        )
      );
      expect(out.error.code).toBe(code);
      expect(out.error.message).toBe(code.replace(/_/g, '-'));
    }
  });
});

describe.skipIf(!have)('decisions feed and notifier read a multi card', () => {
  test('the row carries the question count; a plain card has none', async () => {
    const real = {
      ...rules,
      questionSha: core.questionSha,
      questionShas: core.questionShas
    };
    const mk = (/** @type {string} */ id, /** @type {any} */ metadata) => ({
      id,
      title: id,
      status: 'owner_decision',
      assignee: 'abdelrahman',
      priority: 2,
      updated_at: '2026-11-01T10:00:00Z',
      labels: [],
      metadata
    });
    const feed = createDecisionsFeed({
      listProjects: () => [{ path: '/w/alpha' }],
      listParked: async () => [
        mk('a-1', multiMeta()),
        mk('a-2', singleMeta),
        mk('a-3', multiMeta({ card_qs: '[]' }))
      ],
      rules: real,
      watch: () => ({ close() {} })
    });
    const snap = await feed.list();
    const by = Object.fromEntries(
      snap.items.map((/** @type {any} */ i) => [i.id, i])
    );
    expect(by['a-1'].questions).toBe(3);
    expect(by['a-1'].metadata.card_qs).toBeTruthy();
    expect(by['a-1'].sha).toMatch(/^[0-9a-f]{64}$/);
    expect(by['a-2']).not.toHaveProperty('questions');
    // a bad multi card is not half shown: it is listed as unanswerable
    expect(by['a-3']).toBeUndefined();
    expect(snap.unanswerable.map((/** @type {any} */ u) => u.id)).toEqual([
      'a-3'
    ]);
    feed.close();
  });

  test('a secret in any question keeps the card out of the feed', async () => {
    const real = {
      ...rules,
      questionSha: core.questionSha,
      questionShas: core.questionShas
    };
    const bad = JSON.parse(JSON.stringify(QS));
    bad[0].opts[1].n = 'use sk-abcdefgh12345678';
    const feed = createDecisionsFeed({
      listProjects: () => [{ path: '/w/alpha' }],
      listParked: async () => [
        {
          id: 'a-1',
          title: 'x',
          status: 'owner_decision',
          assignee: 'abdelrahman',
          metadata: multiMeta({ card_qs: JSON.stringify(bad) })
        }
      ],
      rules: real,
      watch: () => ({ close() {} })
    });
    const snap = await feed.list();
    expect(snap.items).toEqual([]);
    expect(snap.unanswerable).toEqual([
      expect.objectContaining({ id: 'a-1', why: 'secret' })
    ]);
    feed.close();
  });
});
