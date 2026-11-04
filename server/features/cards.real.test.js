/**
 * A real answer on copies (company-1bo5.6.9): a throwaway bd project in the
 * temp folder, the REAL card CLI (learner/scripts/cards/card.mjs), the REAL
 * wake.mjs, real bd. Nothing of the owner's data or queue is touched: the
 * project, the cards home (TEST_MODE) and the wake queue are all in one temp
 * folder that this test creates and removes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createCards } from './cards.js';

const CARDS = process.env.CARDS_DIR || 'E:/Projects/learner/scripts/cards';
const WAKE = path.join(os.homedir(), 'company', 'scripts', 'wake', 'wake.mjs');
// The npm `bd` is a .cmd shim that spawn() cannot start; use the real exe.
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
  spawnSync(BD, ['--version'], {
    windowsHide: true,
    encoding: 'utf8'
  }).status === 0;
const have =
  fs.existsSync(path.join(CARDS, 'card.mjs')) && fs.existsSync(WAKE) && bdOk;
if (!have) {
  console.warn(
    'cards.real.test: card CLI, wake.mjs or bd missing, real-answer test NOT exercised'
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsreal-'));
const proj = path.join(tmp, 'tcard');
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
  bd(['init', '--prefix', 'tcard', '--non-interactive']);
  bd([
    'config',
    'set',
    'status.custom',
    'owner_decision:wip,waiting_for_test:wip'
  ]);
  id = bd([
    'create',
    'Ship the build?',
    '-t',
    'task',
    '-p',
    '2',
    '--silent',
    '--metadata',
    JSON.stringify({
      card_class: 'tap',
      card_q: 'Ship the build now?',
      card_effect: 'Testers get it today',
      card_blocks: 'the release',
      card_back: 'swe',
      card_opts: JSON.stringify([{ l: 'Ship', rec: true }, { l: 'Wait' }])
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

describe.skipIf(!have)('real card answer on a copy', () => {
  const cards = () =>
    createCards({
      listProjects: () => [{ path: proj }],
      prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tcard' })),
      cardsDir: CARDS
    });

  test('ask (option) -> thread -> stale sha refused -> answer once -> wake', async () => {
    const c = cards();

    let s = await c.state(id);
    expect(s.state).toBe('waiting');
    expect(s.card?.opts).toHaveLength(2);
    const sha1 = s.sha;

    // 1. a question about option 2 on the phone
    const asked = await c.ask(
      { id, scope: 'option:2', question: 'What does waiting cost?' },
      'pc.tail1234.ts.net'
    );
    expect(asked).toMatchObject({ code: 'asked', round: 1, wake: 'queued' });
    let b = show(id);
    expect(b.status).toBe('open');
    expect(b.assignee).toBe('swe');
    expect(b.metadata.card_state).toBe('asked');
    expect((await c.state(id)).state).toBe('asked');
    expect(pending().map((e) => [e.kind, e.role, e.via])).toEqual([
      ['asked', 'swe', 'phone']
    ]);
    expect((await c.state(id)).wake.state).toBe('queued-no-listener');

    // 2. the asker explains and re-parks the card with a changed question
    bd(['comments', 'add', id, 'ASKER ANSWER round 1\nWaiting costs a day.']);
    bd([
      'update',
      id,
      '-s',
      'owner_decision',
      '-a',
      'abdelrahman',
      '--set-metadata',
      'card_state=explained',
      '--set-metadata',
      'card_q=Ship the build today?'
    ]);
    s = await c.state(id);
    expect(s.state).toBe('waiting');
    expect(s.thread.map((/** @type {any} */ m) => m.kind)).toEqual(['q', 'a']);
    expect(s.thread[0]).toMatchObject({ scope: 'option:2', round: 1 });
    expect(s.thread[1].text).toBe('Waiting costs a day.');

    // 3. an answer on the card he saw before the change is refused, nothing written
    await expect(
      c.answer({ id, option: 1, sha: sha1 }, 'localhost:3000')
    ).rejects.toMatchObject({ message: 'changed' });
    expect(show(id).status).toBe('owner_decision');

    // 4. the real answer, with the sha he sees now
    const done = await c.answer(
      { id, option: 1, sha: s.sha },
      'localhost:3000'
    );
    expect(done).toMatchObject({ code: 'recorded', wake: 'queued' });
    b = show(id);
    expect(b.status).toBe('open');
    expect(b.assignee).toBe('swe');
    const rec = comments(id).filter((/** @type {any} */ x) =>
      x.text.startsWith('OWNER DECISION via board')
    );
    expect(rec).toHaveLength(1);
    expect(rec[0].author).toBe('owner-board');
    expect(rec[0].text).toContain('answer: option 1 "Ship"');
    expect(rec[0].text).toContain('(pc)');

    // 5. a second tap is a no-op: still one record, no second decided event
    await expect(
      c.answer({ id, option: 2, sha: s.sha }, 'localhost:3000')
    ).rejects.toMatchObject({ message: 'not-open' });
    expect(
      comments(id).filter((/** @type {any} */ x) =>
        x.text.startsWith('OWNER DECISION via board')
      )
    ).toHaveLength(1);
    expect(pending().filter((e) => e.kind === 'decided')).toHaveLength(1);

    // 6. the card now reads as answered, with the recorded line and the wake
    s = await c.state(id);
    expect(s.state).toBe('answered');
    expect(s.decision.answer).toContain('option 1');
    expect(s.wake.kind).toBe('decided');
  }, 180000);

  test('a secret in a typed answer is refused and nothing is written', async () => {
    const c = cards();
    const id2 = bd([
      'create',
      'Name it?',
      '-t',
      'task',
      '--silent',
      '--metadata',
      JSON.stringify({
        card_class: 'type',
        card_q: 'What should it be called?',
        card_effect: 'Sets the name',
        card_show: 'Working name: Tool',
        card_blocks: 'the page',
        card_back: 'swe',
        card_opts: JSON.stringify([{ l: 'Name' }])
      })
    ]).trim();
    bd(['update', id2, '-s', 'owner_decision', '-a', 'abdelrahman']);
    const before = comments(id2).length;
    await expect(
      c.answer({ id: id2, text: 'password: hunter2hunter2' }, 'localhost:3000')
    ).rejects.toMatchObject({ message: 'secret-refused' });
    expect(comments(id2).length).toBe(before);
    expect(show(id2).status).toBe('owner_decision');
    const ok = await c.answer({ id: id2, text: 'Falak' }, 'localhost:3000');
    expect(ok.code).toBe('recorded');
    expect(show(id2).status).toBe('open');
  }, 120000);
});
