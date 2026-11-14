import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { clearBoardPosted, markBoardPosted } from './board-posted.js';
import {
  classifyAuthor,
  createMention,
  parseMentions,
  stripQuoted
} from './mention.js';

// Real wake.mjs, temporary queue only: the live queue is never touched.
const WAKE =
  process.env.MENTION_TEST_WAKE ||
  path.join(os.homedir(), 'company', 'scripts', 'wake', 'wake.mjs');
// The company wake.mjs on main gets kind `mention` with the company branch of
// beads-lite-1bo5.6.64.1. Until then the wake tests cannot run: they say so loudly
// (and MENTION_TEST_STRICT=1 turns that into a failure) instead of passing silently.
const HAS_KIND = (() => {
  try {
    return fs.readFileSync(WAKE, 'utf8').includes("'mention'");
  } catch {
    return false;
  }
})();
if (!HAS_KIND) {
  console.warn(`mention wake tests NOT EXERCISED: ${WAKE} has no kind mention`);
}
const wakeDescribe =
  HAS_KIND || process.env.MENTION_TEST_STRICT ? describe : describe.skip;
const HOUR = 3600_000;
const OWNER = 'Abdelrahman Atef';

describe('parseMentions', () => {
  test('known roles in order, unique, owner flagged', () => {
    expect(
      parseMentions('@qa please check, cc @swe and @QA and @owner')
    ).toEqual({ roles: ['qa', 'swe'], owner: true });
  });
  test('code fence, inline code, quote lines and unknown names make nothing', () => {
    const t = [
      '```',
      '@qa in a fence',
      '```',
      '> @swe quoted',
      'inline `@pm` code',
      '@nobody is unknown',
      'mail a@qa.com and path /x/@cto'
    ].join('\n');
    expect(parseMentions(t)).toEqual({ roles: [], owner: false });
    expect(stripQuoted('a\n~~~\n@qa\n~~~\nb')).toBe('a\nb');
  });
  test('an unterminated fence swallows the rest', () => {
    expect(parseMentions('hi\n```\n@qa').roles).toEqual([]);
  });
  test('sentence end and Arabic text around it still count', () => {
    expect(parseMentions('شوف @qa. وبعدين @swe، تمام').roles).toEqual([
      'qa',
      'swe'
    ]);
  });
});

describe('classifyAuthor', () => {
  test('owner, role, others', () => {
    clearBoardPosted();
    markBoardPosted('x1');
    expect(classifyAuthor(OWNER, 'x1')).toEqual({ kind: 'owner' });
    expect(classifyAuthor(OWNER, 'x2')).toBeNull();
    expect(classifyAuthor('swe')).toEqual({ kind: 'role', role: 'swe' });
    expect(classifyAuthor('marketing:brand')).toEqual({
      kind: 'role',
      role: 'brand'
    });
    expect(classifyAuthor('owner-telegram')).toBeNull();
    expect(classifyAuthor('link-inbox')).toBeNull();
    expect(classifyAuthor('')).toBeNull();
  });
});

/** @type {string} */
let base;
let n = 0;
/** @type {string[]} */
const made = [];
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'mention-'));
  made.push(base);
  clearBoardPosted();
});

/** One fixture: temp queue, temp board home, a mutable comment list. */
function rig(/** @type {any} */ over = {}) {
  const wakeRoot = path.join(base, `q${++n}`);
  const home = path.join(base, `h${n}`);
  const list = path.join(base, `projects${n}.list`);
  fs.writeFileSync(list, '# t\n/e/Projects/rayeh\n');
  process.env.WAKE_PROJECTS_LIST = list;
  let clock = Date.parse('2026-11-14T12:00:00Z');
  /** @type {any[]} */
  const comments = [];
  /** @type {string[]} */
  const cards = [];
  /** @type {string[][]} */
  const bells = [];
  const m = createMention({
    home,
    wakeRoot,
    wakeScript: WAKE,
    now: () => clock,
    listComments: async () => comments,
    raiseOwner: (p, b) => bells.push([p, b]),
    fileCard: async (_c, b) => {
      cards.push(b);
      return 'card-1';
    },
    ...over
  });
  let k = 0;
  const say = (
    /** @type {string} */ author,
    /** @type {string} */ text,
    /** @type {{ at?: number, notBoard?: boolean }} */ o = {}
  ) => {
    const id = `c${++k}`;
    comments.push({
      id,
      author,
      text,
      created_at: new Date(o.at ?? clock).toISOString()
    });
    // the board server marks its own posts (ws.js add-comment)
    if (author === OWNER && !o.notBoard) markBoardPosted(id);
    return id;
  };
  const scan = () => m.scan('E:/Projects/rayeh', 'rayeh-b1');
  const pending = () =>
    fs.existsSync(path.join(wakeRoot, 'pending'))
      ? fs.readdirSync(path.join(wakeRoot, 'pending'))
      : [];
  const read = () =>
    pending().map((f) =>
      JSON.parse(fs.readFileSync(path.join(wakeRoot, 'pending', f), 'utf8'))
    );
  return {
    comments,
    wakeRoot,
    home,
    m,
    say,
    scan,
    pending,
    read,
    cards,
    bells,
    tick: (/** @type {number} */ ms) => (clock += ms)
  };
}

wakeDescribe('mention wakes', () => {
  test('one mention: one event, bead and role only, chip waiting then woke', async () => {
    const r = rig();
    r.say(OWNER, '@qa check the phone layout');
    const out = await r.scan();
    expect(out.results).toEqual([
      { comment: 'c1', role: 'qa', chip: 'waiting', verdict: 'queued' }
    ]);
    const ev = r.read();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: 'mention',
      role: 'qa',
      bead: 'rayeh-b1'
    });
    expect(JSON.stringify(ev[0])).not.toContain('phone layout');
    // the router hands it to a chat: the file moves to claimed
    const f = r.pending()[0];
    fs.mkdirSync(path.join(r.wakeRoot, 'claimed'), { recursive: true });
    fs.renameSync(
      path.join(r.wakeRoot, 'pending', f),
      path.join(r.wakeRoot, 'claimed', f)
    );
    expect(r.m.chips('E:/Projects/rayeh', 'rayeh-b1').chips[0].chip).toBe(
      'woke'
    );
  });

  test('a comment is handled once: rescan fires nothing', async () => {
    const r = rig();
    r.say(OWNER, '@qa one');
    await r.scan();
    const again = await r.scan();
    expect(again.results).toEqual([]);
    expect(r.pending()).toHaveLength(1);
  });

  test('unknown roles, code, quotes and strangers make no event', async () => {
    const r = rig();
    r.say(OWNER, '@nobody hi\n```\n@qa\n```\n> @swe');
    r.say('link-inbox', '@qa from an import');
    r.say('owner-telegram', '@qa typed on the phone');
    await r.scan();
    expect(r.pending()).toHaveLength(0);
  });

  test('5 roles in one comment: 3 wake, 2 flagged limit', async () => {
    const r = rig();
    r.say(OWNER, '@pm @cos @swe @qa @ux');
    const out = await r.scan();
    expect(out.results.map((x) => x.chip)).toEqual([
      'waiting',
      'waiting',
      'waiting',
      'limit',
      'limit'
    ]);
    expect(r.pending()).toHaveLength(3);
  });

  test('same role again within 10 minutes adds no second event', async () => {
    const r = rig();
    r.say(OWNER, '@qa first');
    await r.scan();
    r.tick(5 * 60_000);
    r.say(OWNER, '@qa again');
    const out = await r.scan();
    expect(out.results[0].verdict).toBe('merged');
    expect(r.pending()).toHaveLength(1);
  });

  test('7th mention wake on one bead in an hour is refused', async () => {
    const r = rig();
    r.say(OWNER, '@pm @cos @swe');
    await r.scan();
    r.tick(11 * 60_000);
    r.say(OWNER, '@qa @ux @sre');
    await r.scan();
    expect(r.pending()).toHaveLength(6);
    r.tick(11 * 60_000);
    r.say(OWNER, '@sec');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({
      chip: 'limit',
      verdict: 'bead-hour'
    });
    expect(r.pending()).toHaveLength(6);
    r.tick(HOUR + 1);
    r.say(OWNER, '@sec again');
    expect((await r.scan()).results[0].chip).toBe('waiting');
  });

  test('project cap still holds: wake.mjs counts it into many', async () => {
    const r = rig();
    fs.mkdirSync(r.wakeRoot, { recursive: true });
    const t = Date.now();
    fs.writeFileSync(
      path.join(r.wakeRoot, 'rate.json'),
      JSON.stringify({ t: [], p: { rayeh: Array(30).fill(t) } })
    );
    r.say(OWNER, '@qa');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({ chip: 'limit', verdict: 'capped' });
    expect(r.pending().some((f) => f.startsWith('many-'))).toBe(true);
  });

  test('a corrupt rate counter fails closed', async () => {
    const r = rig();
    fs.mkdirSync(r.wakeRoot, { recursive: true });
    fs.writeFileSync(path.join(r.wakeRoot, 'rate.json'), '{nope');
    r.say(OWNER, '@qa');
    expect((await r.scan()).results[0]).toMatchObject({
      chip: 'limit',
      verdict: 'emit-failed'
    });
  });

  test('loop: owner -> qa -> swe -> qa stops at hop 2, one card, no third wake', async () => {
    const r = rig();
    r.say(OWNER, '@qa look');
    await r.scan();
    r.tick(60_000);
    r.say('qa', 'found it, @swe fix it');
    await r.scan();
    expect(r.pending()).toHaveLength(2);
    r.tick(60_000);
    r.say('swe', 'fixed, @qa recheck');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({ chip: 'limit' });
    expect(out.results[0].verdict).toMatch(/^loop/);
    expect(r.pending()).toHaveLength(2);
    expect(r.cards).toEqual(['rayeh-b1']);
    // more bouncing in the same hour: still no wake, still one card
    r.tick(60_000);
    r.say('qa', '@swe again');
    r.say('swe', '@qa again');
    await r.scan();
    expect(r.pending()).toHaveLength(2);
    expect(r.cards).toHaveLength(1);
  });

  test('bounce from a non-woken start: qa -> swe -> qa refused', async () => {
    const r = rig();
    r.say('qa', '@swe please');
    await r.scan();
    r.tick(60_000);
    r.say('swe', '@qa done');
    const out = await r.scan();
    expect(out.results[0].verdict).toBe('loop-bounce');
    expect(r.pending()).toHaveLength(1);
    expect(r.cards).toHaveLength(1);
  });

  test('a role cannot wake itself, but can wake others', async () => {
    const r = rig();
    r.say('qa', '@qa myself and @ux you');
    const out = await r.scan();
    expect(out.results.map((x) => x.verdict)).toEqual(['self', 'queued']);
    expect(r.read().map((e) => e.role)).toEqual(['ux']);
  });

  test('router.off: nothing emitted, chip paused', async () => {
    const r = rig();
    fs.mkdirSync(r.wakeRoot, { recursive: true });
    fs.writeFileSync(path.join(r.wakeRoot, 'router.off'), '');
    r.say(OWNER, '@qa hi');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({ chip: 'paused' });
    expect(r.pending()).toHaveLength(0);
  });

  test('@owner raises the bell and creates no wake file', async () => {
    const r = rig();
    r.say('qa', '@owner need your call');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({ role: 'owner', chip: 'seen' });
    expect(r.bells).toEqual([['rayeh', 'rayeh-b1']]);
    expect(r.pending()).toHaveLength(0);
  });

  test('each mention leaves a router.log line and a provenance record', async () => {
    const r = rig();
    r.say(OWNER, '@qa one @swe two');
    await r.scan();
    const lg = fs
      .readFileSync(path.join(r.wakeRoot, 'router.log'), 'utf8')
      .trim()
      .split('\n');
    expect(lg).toHaveLength(2);
    expect(lg[0]).toMatch(/rayeh mention rayeh-b1 qa queued$/);
    const pv = fs
      .readFileSync(path.join(r.home, 'mention-log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(pv.map((p) => p.role)).toEqual(['qa', 'swe']);
    expect(pv[0]).toMatchObject({
      kind: 'mention',
      bead: 'rayeh-b1',
      by: 'owner'
    });
    expect(JSON.stringify(pv)).not.toContain(' one ');
  });

  test('an old comment on a bead never seen before wakes nobody', async () => {
    const r = rig();
    r.say(OWNER, '@qa old');
    r.tick(10 * 60_000);
    r.say(OWNER, 'plain');
    await r.scan();
    expect(r.pending()).toHaveLength(0);
  });

  test('bad bead id is refused', async () => {
    const r = rig();
    await expect(r.m.scan('E:/Projects/rayeh', '--force')).rejects.toThrow();
  });
});

afterAll(() => {
  // only the temp folders this file made
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

wakeDescribe('sec review fixes M1-M6', () => {
  const STATE = (/** @type {any} */ r) =>
    path.join(r.home, 'mention-state.json');

  test('M1 owner_name_not_board_posted_is_no_actor', async () => {
    const r = rig();
    r.say(OWNER, '@qa sneaky', { notBoard: true });
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({
      chip: 'limit',
      verdict: 'no-actor'
    });
    expect(r.pending()).toHaveLength(0);
  });
  test('M1 abdelrahman_prefix_is_not_owner', async () => {
    const r = rig();
    r.say('abdelrahman-swe', '@qa hi');
    r.say('swe ', '@qa trailing space is not a role');
    r.say('SWE', '@qa case is not a role');
    const out = await r.scan();
    expect(out.results.map((x) => x.verdict)).toEqual([
      'no-actor',
      'no-actor',
      'no-actor'
    ]);
    expect(r.pending()).toHaveLength(0);
  });
  test('M1 a role under its own name works, a board post is the owner', async () => {
    const r = rig();
    r.say('swe', '@qa ok');
    r.say(OWNER, '@ux ok');
    const out = await r.scan();
    expect(out.results.map((x) => x.verdict)).toEqual(['queued', 'queued']);
  });

  test('M2 old_comment_on_known_bead_wakes_nobody', async () => {
    const r = rig();
    r.say(OWNER, 'first');
    await r.scan();
    r.tick(3 * HOUR);
    r.say('qa', '@swe stale ask', { at: Date.parse('2026-11-14T12:00:01Z') });
    r.say(OWNER, 'a new post');
    await r.scan();
    expect(r.pending()).toHaveLength(0);
  });
  test('M2 bead_with_301_comments_replays_nothing', async () => {
    const r = rig();
    r.say(OWNER, '@qa the old ask');
    await r.scan();
    expect(r.pending()).toHaveLength(1);
    for (let i = 0; i < 305; i++) r.say('qa', 'chatter ' + i);
    await r.scan();
    r.tick(3 * HOUR);
    r.say(OWNER, 'later');
    const out = await r.scan();
    expect(out.results).toEqual([]);
    expect(r.pending()).toHaveLength(1);
  });
  test('M2 a comment with no usable date never fires', async () => {
    const r = rig();
    r.comments.push({
      id: 'z1',
      author: 'qa',
      text: '@swe x',
      created_at: 'nope'
    });
    await r.scan();
    expect(r.pending()).toHaveLength(0);
  });

  test('M3 corrupt_state_fails_closed', async () => {
    const r = rig();
    fs.mkdirSync(r.home, { recursive: true });
    fs.writeFileSync(STATE(r), '{not json');
    r.say(OWNER, '@qa one');
    const out = await r.scan();
    expect(out.results[0]).toMatchObject({
      chip: 'limit',
      verdict: 'state-unreadable'
    });
    expect(r.pending()).toHaveLength(0);
    expect(fs.readFileSync(STATE(r), 'utf8')).toBe('{not json');
  });
  test('M3 save_failure_never_refires', async () => {
    let calls = 0;
    let broken = false;
    const r = rig({
      writeState: (/** @type {string} */ file, /** @type {any} */ obj) => {
        calls++;
        if (calls % 2 === 0) {
          // the write after the emits fails; the first one (seen) is on disk
          broken = true;
          throw new Error('EPERM');
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(obj));
      }
    });
    r.say(OWNER, '@qa once');
    await r.scan();
    expect(broken).toBe(true);
    expect(r.pending()).toHaveLength(1);
    await r.scan();
    expect(r.pending()).toHaveLength(1);
  });
  test('M3 a failed first write emits nothing', async () => {
    const r = rig({
      writeState: () => {
        throw new Error('EPERM');
      }
    });
    r.say(OWNER, '@qa once');
    await expect(r.scan()).rejects.toThrow();
    expect(r.pending()).toHaveLength(0);
  });
  test('M3 a held lock refuses instead of racing', async () => {
    const r = rig({ lockWaitMs: 150 });
    fs.mkdirSync(path.join(r.home, 'mention.lock'), { recursive: true });
    r.say(OWNER, '@qa once');
    await expect(r.scan()).rejects.toMatchObject({ code: 'busy' });
    expect(r.pending()).toHaveLength(0);
    fs.rmdirSync(path.join(r.home, 'mention.lock'));
    expect((await r.scan()).results[0].verdict).toBe('queued');
    expect(fs.existsSync(path.join(r.home, 'mention.lock'))).toBe(false);
  });

  test('M5 loop_card_holds_until_closed', async () => {
    let open = true;
    const r = rig({
      fileCard: async (/** @type {string} */ _c, /** @type {string} */ b) => {
        r.cards.push(b);
        return 'card-9';
      },
      cardOpen: async () => open
    });
    r.say(OWNER, '@qa look');
    await r.scan();
    r.tick(60_000);
    r.say('qa', '@swe fix');
    await r.scan();
    r.tick(60_000);
    r.say('swe', '@qa back');
    await r.scan();
    expect(r.cards).toHaveLength(1);
    // 2 hours later the hop window is empty, but the open card still holds role mentions
    r.tick(2 * HOUR);
    r.say('qa', '@swe again');
    const held = await r.scan();
    expect(held.results[0].verdict).toBe('loop-hold');
    expect(r.cards).toHaveLength(1);
    expect(r.pending()).toHaveLength(2);
    // the owner's mention still wakes
    r.say(OWNER, '@pm your turn');
    expect((await r.scan()).results[0].verdict).toBe('queued');
    // closing the card releases the hold
    open = false;
    r.tick(60_000);
    r.say('qa', '@ux after close');
    expect((await r.scan()).results[0].verdict).toBe('queued');
  });

  test('M6 bad_project_key_refused', async () => {
    const r = rig();
    r.say(OWNER, '@qa x');
    await expect(r.m.scan('E:/Projects/bad name', 'rayeh-b1')).rejects.toThrow(
      /bad project/
    );
    expect(fs.existsSync(path.join(r.wakeRoot, 'router.log'))).toBe(false);
  });
});

wakeDescribe('sec M7 async lock', () => {
  test('M7 other work runs while the lock is held (event loop not blocked)', async () => {
    const r = rig({ lockWaitMs: 600 });
    fs.mkdirSync(path.join(r.home, 'mention.lock'), { recursive: true });
    r.say(OWNER, '@qa once');
    const p = r.scan().catch((e) => e);
    let ticks = 0;
    const iv = setInterval(() => ticks++, 20);
    const e = await p;
    clearInterval(iv);
    expect(e.code).toBe('busy'); // same timeout, fail closed
    expect(ticks).toBeGreaterThan(10); // the loop kept answering during ~600 ms
    expect(r.pending()).toHaveLength(0);
  });
});
