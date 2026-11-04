/**
 * A real decision comment on copies (beads-lite-1bo5.6.46.7): real bd in a
 * throwaway project, the REAL card CLI `post` writes the ASK comment and the
 * metadata, the board's own parser reads that comment, a real answer goes
 * through createCards, and the thread then shows the card as answered.
 * Everything lives in one temp folder; nothing of the owner's is touched.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  decisionStates,
  parseDecisionComment
} from '../../app/utils/decision-comment.js';
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
const postOk =
  fs.existsSync(path.join(CARDS, 'card.mjs')) &&
  /post/.test(
    fs.existsSync(path.join(CARDS, 'card.mjs'))
      ? fs.readFileSync(path.join(CARDS, 'card.mjs'), 'utf8')
      : ''
  );
const have = postOk && fs.existsSync(WAKE) && bdOk;
if (!have) {
  console.warn(
    'cards.inline.real.test: card CLI (post), wake.mjs or bd missing, NOT exercised'
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardsinl-'));
const proj = path.join(tmp, 'tinl');
const saved = { ...process.env };

/** @param {string[]} args */
function bd(args) {
  const r = spawnSync(BD, args, {
    cwd: proj,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, BD_ACTOR: 'swe' }
  });
  if (r.status !== 0) throw new Error(`bd ${args[0]} failed: ${r.stderr}`);
  return r.stdout;
}
/** @param {string} id */
const comments = (id) => JSON.parse(bd(['comments', id, '--json']));
/** @param {any} input */
function post(input) {
  const r = spawnSync(
    process.execPath,
    [path.join(CARDS, 'card.mjs'), 'post'],
    {
      input: JSON.stringify(input),
      encoding: 'utf8',
      windowsHide: true,
      env: process.env
    }
  );
  return JSON.parse(r.stdout.trim().split('\n').pop() || '{}');
}

let id = '';
beforeAll(() => {
  if (!have) return;
  fs.mkdirSync(proj, { recursive: true });
  spawnSync('git', ['init', '-q', '.'], { cwd: proj, windowsHide: true });
  spawnSync('git', ['config', 'beads.role', 'maintainer'], {
    cwd: proj,
    windowsHide: true
  });
  bd(['init', '--prefix', 'tinl', '--non-interactive']);
  bd([
    'config',
    'set',
    'status.custom',
    'owner_decision:wip,waiting_for_test:wip'
  ]);
  id = bd(['create', 'Ship?', '-t', 'task', '-p', '2', '--silent']).trim();
  fs.mkdirSync(path.join(tmp, 'home'));
  fs.writeFileSync(path.join(tmp, 'home', 'TEST_MODE'), '');
  fs.writeFileSync(
    path.join(tmp, 'home', 'config.json'),
    JSON.stringify({
      owner: 'abdelrahman',
      repos: [{ name: 'tinl', path: proj }]
    })
  );
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

describe.skipIf(!have)('inline decision card on a copy', () => {
  test('post -> open card in the thread -> real answer -> answered card', async () => {
    const res = post({
      repo: 'tinl',
      bead: id,
      by: 'swe',
      class: 'tap',
      q: 'Ship the build now?',
      effect: 'Testers get it today',
      blocks: 'the release',
      opts: [{ l: 'Ship', rec: true }, { l: 'Wait' }]
    });
    expect(res).toMatchObject({ ok: true, code: 'posted' });

    let cs = comments(id);
    const idx = cs.findIndex((x) => x.text.startsWith('ASK: '));
    expect(idx).toBeGreaterThanOrEqual(0);
    const card = parseDecisionComment(cs[idx].text);
    expect(card?.opts.map((o) => o.l)).toEqual(['Ship', 'Wait']);
    const issue = JSON.parse(bd(['show', id, '--json']))[0];
    expect(issue.status).toBe('owner_decision');
    expect(decisionStates(cs, issue).get(idx)?.kind).toBe('open');

    const c = createCards({
      listProjects: () => [{ path: proj }],
      prefixes: async (ws) => ws.map((w) => ({ ...w, prefix: 'tinl' })),
      cardsDir: CARDS
    });
    const s = await c.state(id);
    expect(s.state).toBe('waiting');
    const done = await c.answer(
      { id, option: 2, sha: s.sha },
      'localhost:3000'
    );
    expect(done.code).toBe('recorded');

    cs = comments(id);
    const after = JSON.parse(bd(['show', id, '--json']))[0];
    const st = decisionStates(cs, after).get(idx);
    expect(st).toEqual({ kind: 'answered', answer: '2 - Wait' });
  }, 180000);

  test('non-blocking post leaves the status and can be answered by comment', () => {
    const id2 = bd(['create', 'Pref?', '-t', 'task', '--silent']).trim();
    const res = post({
      repo: 'tinl',
      bead: id2,
      by: 'swe',
      class: 'tap',
      q: 'Which colour do you prefer?',
      effect: 'Picks the theme',
      blocks: 'nothing',
      nonBlocking: true,
      opts: [{ l: 'Blue', rec: true }, { l: 'Green' }]
    });
    expect(res.code).toBe('posted-non-blocking');
    const issue = JSON.parse(bd(['show', id2, '--json']))[0];
    expect(issue.status).toBe('open');
    const cs = comments(id2);
    const i = cs.findIndex((x) => x.text.startsWith('ASK: '));
    expect(decisionStates(cs, issue).get(i)?.kind).toBe('nonblocking');
    const ref = 'c-' + String(cs[i].id).replace(/-/g, '').slice(0, 8);
    bd(['comments', 'add', id2, `Answered: 2 - Green, re: ${ref}`]);
    expect(decisionStates(comments(id2), issue).get(i)).toEqual({
      kind: 'answered',
      answer: '2 - Green'
    });
  }, 120000);
});
