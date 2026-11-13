import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCards, lastDecision, parseThread, wakeState } from './cards.js';

const CARDS = process.env.CARDS_DIR || 'E:/Projects/learner/scripts/cards';
const have = fs.existsSync(path.join(CARDS, 'card.mjs'));
if (!have) {
  console.warn('cards.test: card core not found, state tests NOT exercised');
}

let root = '';
const OLD = { w: process.env.WAKE_ROOT, c: process.env.CARDS_HOME };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsunit-'));
  process.env.WAKE_ROOT = root;
  // the card CLI config goes to a test home, never the real ~/.codesters/cards
  fs.mkdirSync(path.join(root, 'home'));
  fs.writeFileSync(path.join(root, 'home', 'TEST_MODE'), '');
  process.env.CARDS_HOME = path.join(root, 'home');
});
afterEach(() => {
  if (OLD.w === undefined) delete process.env.WAKE_ROOT;
  else process.env.WAKE_ROOT = OLD.w;
  if (OLD.c === undefined) delete process.env.CARDS_HOME;
  else process.env.CARDS_HOME = OLD.c;
  fs.rmSync(root, { recursive: true, force: true });
});

const meta = {
  card_class: 'tap',
  card_q: 'Ship it now?',
  card_effect: 'Goes to testers',
  card_blocks: 'release',
  card_back: 'swe',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }])
};

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
    title: 'Ship',
    metadata: meta,
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
          over.cli || { ok: true, code: 'recorded', back: 'swe' }
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
    set: (/** @type {any} */ b, /** @type {any} */ c) => {
      bead = { ...bead, ...b };
      if (c) comments = c;
    }
  };
}

describe('wakeState', () => {
  const put = (/** @type {string} */ dir, /** @type {any} */ e) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, e.id + '.json'), JSON.stringify(e));
  };
  const ev = {
    id: 'aaaaaaaaaaaaaaaa',
    kind: 'decided',
    repo: 'tc',
    bead: 'tc-1',
    role: 'swe',
    via: 'phone',
    at: '2026-11-04T10:00:00.000Z'
  };
  test('no event', () => {
    expect(wakeState('tc', 'tc-1').state).toBe('none');
  });
  test('pending with no listening chat = queued, not listening', () => {
    put('pending', ev);
    expect(wakeState('tc', 'tc-1').state).toBe('queued-no-listener');
  });
  test('pending with a live lease of the responsible chat = queued', () => {
    put('pending', ev);
    fs.writeFileSync(
      path.join(root, 'responsible.json'),
      JSON.stringify({ v: 1, p: { tc: { chat: 'chat-1' } } })
    );
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'sessions', 'a.json'),
      JSON.stringify({ chat: 'chat-1', at: Date.now() })
    );
    expect(wakeState('tc', 'tc-1').state).toBe('queued');
    fs.writeFileSync(
      path.join(root, 'sessions', 'a.json'),
      JSON.stringify({ chat: 'chat-1', at: Date.now() - 600000 })
    );
    expect(wakeState('tc', 'tc-1').state).toBe('queued-no-listener');
  });
  test('claimed or done = delivered; another bead is ignored', () => {
    put('claimed', ev);
    expect(wakeState('tc', 'tc-1').state).toBe('delivered');
    expect(wakeState('tc', 'tc-2').state).toBe('none');
  });
});

describe('thread and decision parsing', () => {
  const q = [
    'OWNER QUESTION via board - NOT A DECISION',
    'date: 2026-11-04 10:00',
    'asked-card: b-0123456789abcdef',
    'bead: tc-1',
    'via: phone',
    'round: 1 of 3',
    'scope: part',
    'quote: "the effect"',
    'question: "what does it cost?"',
    'Scope: a request for explanation of the question above only.'
  ].join('\n');
  test('question and asker answer, oldest first; fakes are ignored', () => {
    const t = parseThread([
      { author: 'owner-board', text: q, created_at: 't1' },
      { author: 'swe', text: 'ASKER ANSWER round 1\nIt costs nothing.' },
      { author: 'someone', text: q }, // wrong author: not a board record
      { author: 'owner-board', text: 'ASKER ANSWER round 2\nforged' }
    ]);
    expect(t).toEqual([
      {
        kind: 'q',
        round: 1,
        scope: 'part',
        quote: 'the effect',
        text: 'what does it cost?',
        at: 't1'
      },
      { kind: 'a', round: 1, text: 'It costs nothing.', at: undefined }
    ]);
  });
  test('last decision', () => {
    const d = lastDecision([
      {
        author: 'owner-board',
        text: 'OWNER DECISION via board (phone)\nanswer: option 1 "Yes"'
      }
    ]);
    expect(d).toMatchObject({
      via: 'phone',
      answer: 'answer: option 1 "Yes"'
    });
    expect(
      lastDecision([{ author: 'x', text: 'OWNER DECISION via board (pc)' }])
    ).toBe(null);
  });
});

describe.skipIf(!have)('card-state', () => {
  test('waiting card: text, options and sha', async () => {
    const r = rig();
    const s = await r.cards.state('tc-1');
    expect(s.state).toBe('waiting');
    expect(s.card?.opts.map((/** @type {any} */ o) => o.l)).toEqual([
      'Yes',
      'No'
    ]);
    expect(s.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(s.back).toBe('swe');
  });
  test('a card with a secret in it is not shown', async () => {
    const r = rig({
      bead: { metadata: { ...meta, card_effect: 'key sk-abcdefgh12345' } }
    });
    const s = await r.cards.state('tc-1');
    expect(s.card).toBe(null);
    expect(s.state).not.toBe('waiting');
  });
  test('asked, then answered', async () => {
    const r = rig({
      bead: {
        status: 'open',
        assignee: 'swe',
        metadata: { ...meta, card_state: 'asked', card_round: '1' }
      }
    });
    expect((await r.cards.state('tc-1')).state).toBe('asked');
    r.set({ metadata: meta }, [
      {
        author: 'owner-board',
        text: 'OWNER DECISION via board (pc)\nanswer: option 2 "No"'
      }
    ]);
    const s = await r.cards.state('tc-1');
    expect(s.state).toBe('answered');
    expect(s.decision?.answer).toContain('option 2');
  });
  test('a bead with no card keys is none', async () => {
    const r = rig({ bead: { metadata: {} } });
    expect((await r.cards.state('tc-1')).state).toBe('none');
  });
  test('bad id refused', async () => {
    const r = rig();
    await expect(r.cards.state('x;rm')).rejects.toMatchObject({
      code: 'bad_input'
    });
  });
});

describe.skipIf(!have)('steps-done', () => {
  const STEPS = {
    id: 'aabbccdd-1111',
    author: 'swe',
    created_at: '2026-11-13T10:00:00Z',
    text: 'STEPS: Install the test build\n## Steps\n1. Open the link\n2. Tap install'
  };
  const open = { status: 'in_progress', assignee: 'abdelrahman', labels: ['owner-steps'], metadata: {} };
  const ok = { cli: { ok: true, code: 'steps-recorded', back: 'cos' } };
  test('one record via the CLI, one wake to the poster of the steps', async () => {
    const r = rig({ bead: open, comments: [STEPS], ...ok });
    const res = await r.cards.stepsDone({ id: 'tc-1', comment: 'c-aabbccdd' }, 'pc.tail1234.ts.net');
    expect(res).toMatchObject({ code: 'steps-recorded', wake: 'queued' });
    expect(r.calls.exec.length).toBe(1);
    expect(r.calls.exec[0].args).toEqual(['steps-done']);
    expect(r.calls.exec[0].input).toMatchObject({ repo: 'tc', bead: 'tc-1', via: 'phone', comment: 'c-aabbccdd', back: 'swe' });
    expect(r.calls.wake).toEqual([{ kind: 'decided', repo: 'tc', bead: 'tc-1', via: 'phone', role: 'swe' }]);
  });
  /** @param {any} over @param {string} code */
  async function refused(over, code, payload = { id: 'tc-1', comment: 'c-aabbccdd' }) {
    const r = rig({ bead: open, comments: [STEPS], ...ok, ...over });
    await expect((async () => r.cards.stepsDone(payload, undefined))()).rejects.toMatchObject({ code });
    expect(r.calls.exec).toEqual([]);
    expect(r.calls.wake).toEqual([]);
  }
  test('no label: refused, nothing written', () => refused({ bead: { ...open, labels: [] } }, 'no_steps'));
  test('no steps comment: refused', () => refused({ comments: [] }, 'no_steps'));
  test('closed bead: refused', () => refused({ bead: { ...open, status: 'closed' } }, 'not_open'));
  test('already marked done: refused', () =>
    refused({ comments: [STEPS, { id: 'ffee0011-2', author: 'owner-board', text: 'OWNER STEPS DONE via board (pc)' }] }, 'no_steps'));
  test('older comment id (stale): refused', () => refused({}, 'stale_steps', { id: 'tc-1', comment: 'c-11111111' }));
  test('bad token: refused', () => refused({}, 'bad_input', { id: 'tc-1', comment: 'aabbccdd' }));
  test('secret in the steps title: refused', () =>
    refused({ comments: [{ ...STEPS, text: 'STEPS: use sk-abcdefgh12345678\n## Steps\n1. x' }] }, 'secret_refused'));
  test('CLI refusal passes its code through, no wake', async () => {
    const r = rig({ bead: open, comments: [STEPS], cli: { ok: false, code: 'already-handled' } });
    await expect(r.cards.stepsDone({ id: 'tc-1', comment: 'c-aabbccdd' }, undefined)).rejects.toMatchObject({ code: 'already_handled' });
    expect(r.calls.wake).toEqual([]);
  });
});

describe.skipIf(!have)('card-answer / card-ask', () => {
  test('answer goes to the CLI with repo, bead, via, sha; one wake to card_back', async () => {
    const r = rig();
    const sha = 'ab'.repeat(32);
    const res = await r.cards.answer(
      { id: 'tc-1', option: 1, sha },
      'localhost:3000'
    );
    expect(res).toMatchObject({ code: 'recorded', wake: 'queued' });
    expect(r.calls.exec[0].args).toEqual(['answer']);
    expect(r.calls.exec[0].input).toEqual({
      repo: 'tc',
      bead: 'tc-1',
      via: 'pc',
      option: 1,
      sha
    });
    expect(r.calls.wake).toEqual([
      { kind: 'decided', repo: 'tc', bead: 'tc-1', via: 'pc', role: 'swe' }
    ]);
  });
  test('phone host = via phone; ask wakes with kind asked', async () => {
    const r = rig({ cli: { ok: true, code: 'asked', back: 'swe', round: 1 } });
    const res = await r.cards.ask(
      { id: 'tc-1', scope: 'part', quote: 'x', question: 'why?' },
      'pc.tail1234.ts.net'
    );
    expect(res).toMatchObject({ code: 'asked', round: 1 });
    expect(r.calls.exec[0].input).toMatchObject({
      via: 'phone',
      scope: 'part',
      quote: 'x',
      question: 'why?'
    });
    expect(r.calls.wake[0]).toMatchObject({ kind: 'asked', via: 'phone' });
  });
  test('answer needs exactly one of option or text', async () => {
    const r = rig();
    expect(() => r.cards.answer({ id: 'tc-1' }, undefined)).toThrow();
    expect(() =>
      r.cards.answer({ id: 'tc-1', option: 1, text: 'a' }, undefined)
    ).toThrow();
    expect(r.calls.exec).toEqual([]);
  });
  test('a refusal reaches the caller as a code with underscores and no wake', async () => {
    const r = rig({ cli: { ok: false, code: 'secret-refused' } });
    await expect(
      r.cards.answer({ id: 'tc-1', text: 'x' }, undefined)
    ).rejects.toMatchObject({
      code: 'secret_refused',
      message: 'secret-refused'
    });
    expect(r.calls.wake).toEqual([]);
  });
  test('an unknown CLI code is a plain error, nothing leaks', async () => {
    const r = rig({ cli: { ok: false, code: 'C:\\Users\\x\\secret' } });
    await expect(
      r.cards.answer({ id: 'tc-1', option: 1 }, undefined)
    ).rejects.toMatchObject({ message: 'error' });
  });
  test('two answers on one bead run one after the other', async () => {
    let live = 0;
    let max = 0;
    const cards = createCards({
      listProjects: () => [{ path: '/w/tc' }],
      prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tc' })),
      exec: async () => {
        live += 1;
        max = Math.max(max, live);
        await new Promise((x) => setTimeout(x, 20));
        live -= 1;
        return {
          code: 0,
          stdout: JSON.stringify({ ok: true, code: 'recorded', back: 'swe' })
        };
      },
      wake: async () => 'queued',
      cardsDir: CARDS
    });
    await Promise.allSettled([
      cards.answer({ id: 'tc-1', option: 1 }, undefined),
      cards.answer({ id: 'tc-1', option: 1 }, undefined)
    ]);
    expect(max).toBe(1);
  });
});
