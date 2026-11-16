/**
 * A real three-question card on copies (beads-lite-1bo5.13.12.1.3): a
 * throwaway bd project in the temp folder, the REAL card CLI, the REAL
 * wake.mjs, real bd. The cards home (TEST_MODE), the wake queue and the
 * project all live in one temp folder this test creates and removes.
 * The card core must be the multi-question one (CARDS_DIR).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createCards } from './cards.js';

const CARDS = process.env.CARDS_DIR || 'E:/Projects/learner/scripts/cards';
const WAKE = path.join(os.homedir(), 'company', 'scripts', 'wake', 'wake.mjs');
const BD =
  process.env.BD_BIN ||
  path.join(
    process.env.APPDATA || '',
    'npm',
    'node_modules',
    '@beads',
    'bd',
    'bin',
    'bd.exe'
  );
process.env.BD_BIN = BD;
const bdOk =
  spawnSync(BD, ['--version'], { windowsHide: true, encoding: 'utf8' })
    .status === 0;
const multiCore =
  fs.existsSync(path.join(CARDS, 'core.mjs')) &&
  fs
    .readFileSync(path.join(CARDS, 'core.mjs'), 'utf8')
    .includes('questionShas');
const have =
  fs.existsSync(path.join(CARDS, 'card.mjs')) &&
  multiCore &&
  fs.existsSync(WAKE) &&
  bdOk;
if (!have) {
  console.warn(
    'cards.multi.real.test: multi-question card CLI, wake.mjs or bd missing, real test NOT exercised'
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsmulti-real-'));
const proj = path.join(tmp, 'tmulti');
const saved = { ...process.env };

/** @param {string[]} args @param {string} [actor] */
function bd(args, actor = 'swe') {
  const r = spawnSync(BD, args, {
    cwd: proj,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, BD_ACTOR: actor }
  });
  if (r.status !== 0) throw new Error(`bd ${args[0]} failed: ${r.stderr}`);
  return r.stdout;
}
/** @param {string} id */
const show = (id) => JSON.parse(bd(['show', id, '--json']))[0];
/** @param {string} id */
const comments = (id) => JSON.parse(bd(['comments', id, '--json']));
const pending = () =>
  fs.existsSync(path.join(tmp, 'wake', 'pending'))
    ? fs
        .readdirSync(path.join(tmp, 'wake', 'pending'))
        .map((f) =>
          JSON.parse(
            fs.readFileSync(path.join(tmp, 'wake', 'pending', f), 'utf8')
          )
        )
    : [];

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

/** @type {string} */
let id = '';

beforeAll(() => {
  if (!have) return;
  fs.mkdirSync(proj, { recursive: true });
  spawnSync('git', ['init', '-q', '.'], { cwd: proj, windowsHide: true });
  spawnSync('git', ['config', 'beads.role', 'maintainer'], {
    cwd: proj,
    windowsHide: true
  });
  bd(['init', '--prefix', 'tmulti', '--non-interactive']);
  bd([
    'config',
    'set',
    'status.custom',
    'owner_decision:wip,waiting_for_test:wip'
  ]);
  id = bd([
    'create',
    'Pick things',
    '-t',
    'task',
    '-p',
    '2',
    '--silent',
    '--metadata',
    JSON.stringify({
      card_class: 'multi',
      card_q: '3 decisions about the thing?',
      card_effect: 'We build it',
      card_blocks: 'The build',
      card_back: 'swe',
      card_qs: JSON.stringify(QS)
    })
  ]).trim();
  bd(['update', id, '-s', 'owner_decision', '-a', 'abdelrahman']);
  fs.mkdirSync(path.join(tmp, 'home'));
  fs.writeFileSync(path.join(tmp, 'home', 'TEST_MODE'), '');
  fs.writeFileSync(path.join(tmp, 'projects.list'), proj + '\n');
  process.env.CARDS_HOME = path.join(tmp, 'home');
  process.env.WAKE_ROOT = path.join(tmp, 'wake');
  process.env.WAKE_PROJECTS_LIST = path.join(tmp, 'projects.list');
}, 120000);

afterAll(() => {
  for (const k of ['CARDS_HOME', 'WAKE_ROOT', 'WAKE_PROJECTS_LIST', 'BD_BIN']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
});

describe.skipIf(!have)('a real card with three questions on a copy', () => {
  const cards = () =>
    createCards({
      listProjects: () => [{ path: proj }],
      prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tmulti' })),
      cardsDir: CARDS
    });
  const partials = () =>
    comments(id).filter((/** @type {any} */ x) =>
      x.text.startsWith('OWNER ANSWER via board (partial')
    );
  const finals = () =>
    comments(id).filter((/** @type {any} */ x) =>
      x.text.startsWith('OWNER DECISION via board')
    );

  test('partials wake nobody, an ask keeps them, a rewritten question goes stale, the last answer wakes once', async () => {
    const c = cards();
    let s = await c.state(id);
    expect(s.state).toBe('waiting');
    expect(s.total).toBe(3);
    expect(s.answeredCount).toBe(0);

    // 1. question 1: recorded at once, bead stays with the owner, no wake
    const r1 = await c.answer(
      { id, q: 1, option: 2, sha: s.questions[0].sha },
      'pc.tail1234.ts.net'
    );
    expect(r1).toMatchObject({ code: 'answered-partial', wake: 'none' });
    expect(show(id).status).toBe('owner_decision');
    expect(show(id).assignee).toBe('abdelrahman');
    expect(partials()).toHaveLength(1);
    expect(partials()[0].author).toBe('owner-board');
    expect(pending()).toEqual([]);
    s = await c.state(id);
    expect(s.answeredCount).toBe(1);
    expect(s.questions[0].answered).toMatchObject({
      n: 2,
      label: 'Blue',
      via: 'phone'
    });

    // 2. the same question again, a question that is not there, no q at all
    await expect(
      c.answer({ id, q: 1, option: 1 }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'already_answered' });
    await expect(
      c.answer({ id, q: 4, option: 1 }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'bad_question' });
    await expect(
      c.answer({ id, option: 1 }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'bad_input' });
    expect(partials()).toHaveLength(1);

    // 3. an ask about one option of question 2: one asked wake, bead goes to the asker, the partial stays
    const asked = await c.ask(
      { id, scope: 'q2:option:3', question: 'What is Huge?' },
      'pc.tail1234.ts.net'
    );
    expect(asked).toMatchObject({ code: 'asked', round: 1, wake: 'queued' });
    expect(show(id).status).toBe('open');
    expect((await c.state(id)).state).toBe('asked');
    expect(pending().map((e) => e.kind)).toEqual(['asked']);
    bd(['comments', 'add', id, 'ASKER ANSWER round 1\nHuge is 2 metres.']);
    bd([
      'update',
      id,
      '-s',
      'owner_decision',
      '-a',
      'abdelrahman',
      '--set-metadata',
      'card_state=explained'
    ]);
    s = await c.state(id);
    expect(s.state).toBe('waiting');
    expect(s.answeredCount).toBe(1);
    expect(s.thread.map((/** @type {any} */ m) => m.kind)).toEqual(['q', 'a']);
    expect(s.thread[0]).toMatchObject({ scope: 'q2:option:3', round: 1 });

    // 4. question 2 answered, then the asker rewrites it: only that answer goes stale
    const sha2 = s.questions[1].sha;
    await c.answer({ id, q: 2, option: 3, sha: sha2 }, 'localhost:3000');
    expect((await c.state(id)).answeredCount).toBe(2);
    const edited = JSON.parse(JSON.stringify(QS));
    edited[1].q = 'Which size now?';
    bd(['update', id, '--set-metadata', `card_qs=${JSON.stringify(edited)}`]);
    s = await c.state(id);
    expect(s.answeredCount).toBe(1);
    expect(s.questions[0].answered).not.toBe(null);
    expect(s.questions[1]).toMatchObject({ answered: null, stale: true });
    await expect(
      c.answer({ id, q: 2, option: 1, sha: sha2 }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'changed' });
    const r2 = await c.answer(
      { id, q: 2, option: 1, sha: s.questions[1].sha },
      'localhost:3000'
    );
    expect(r2).toMatchObject({ code: 'answered-partial', wake: 'none' });
    expect(pending().map((e) => e.kind)).toEqual(['asked']);

    // 5. the last answer: bead back to the asker, one final record, one decided wake
    const done = await c.answer(
      { id, q: 3, text: 'Falak', sha: s.questions[2].sha },
      'localhost:3000'
    );
    expect(done).toMatchObject({
      code: 'recorded',
      wake: 'queued',
      answeredCount: 3,
      total: 3
    });
    const b = show(id);
    expect(b.status).toBe('open');
    expect(b.assignee).toBe('swe');
    expect(finals()).toHaveLength(1);
    expect(finals()[0].text).toContain('answer 1: option 2 "Blue"');
    expect(finals()[0].text).toContain('answer 2: option 1 "Small"');
    expect(finals()[0].text).toContain('"Falak"');
    expect(
      pending()
        .map((e) => [e.kind, e.role])
        .sort()
    ).toEqual([
      ['asked', 'swe'],
      ['decided', 'swe']
    ]);

    // 6. a late tap changes nothing; the card reads as answered with all three answers
    await expect(
      c.answer({ id, q: 3, text: 'Other' }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'not_open' });
    expect(finals()).toHaveLength(1);
    s = await c.state(id);
    expect(s.state).toBe('answered');
    expect(s.decision.answers.map((/** @type {any} */ a) => a.q)).toEqual([
      1, 2, 3
    ]);
    expect(s.decision.answer).toContain('Falak');
  }, 300000);

  test('a bad multi card shows no card and refuses an answer', async () => {
    const bad = bd([
      'create',
      'Broken',
      '-t',
      'task',
      '--silent',
      '--metadata',
      JSON.stringify({
        card_class: 'multi',
        card_q: 'Two things?',
        card_effect: 'x',
        card_blocks: 'y',
        card_back: 'swe',
        card_qs: JSON.stringify([QS[0]]) // one question is not a multi card
      })
    ]).trim();
    bd(['update', bad, '-s', 'owner_decision', '-a', 'abdelrahman']);
    const c = cards();
    const s = await c.state(bad);
    expect(s.card).toBe(null);
    expect(s.state).toBe('none');
    await expect(
      c.answer({ id: bad, q: 1, option: 1 }, 'localhost:3000')
    ).rejects.toMatchObject({ code: 'bad_card' });
    expect(show(bad).status).toBe('owner_decision');
  }, 120000);
});
