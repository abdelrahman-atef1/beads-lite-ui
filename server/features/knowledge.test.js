import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createKnowledge, parseItem, readFailures } from './knowledge.js';

const NOTE = (
  /** @type {string} */ shared,
  extra = ''
) => `# A note title: with colon

STORE NOTICE: data

Topic: t
Shared: ${shared}

## Takeaways
${extra}- Plain advice with no tool. (transcript) [youtube-AAA]
- OmniRoute can be used so work does not stop. (both) [youtube-AAA]
- The unlimited claim is the video's promise. (transcript) [youtube-AAA]

## Tools / apps named
- OmniRoute (named in the video; not checked) [youtube-AAA]
`;

describe('knowledge parser', () => {
  test('untagged bullets: know, or try when a listed tool is named', () => {
    const it = parseItem(NOTE('2026-11-04'), 't', 'a');
    expect(it.title).toBe('A note title: with colon');
    expect(it.tools).toEqual(['OmniRoute']);
    expect(it.bullets.map((b) => b.kind)).toEqual(['know', 'try', 'know']);
    expect(it.bullets[0].text).toBe('Plain advice with no tool.');
  });

  test('a leading [kind] mark wins over the fallback', () => {
    const it = parseItem(
      NOTE('2026-11-04', '- [do] Do this now. (both) [youtube-AAA]\n'),
      't',
      'a'
    );
    expect(it.bullets[0]).toMatchObject({ kind: 'do', text: 'Do this now.' });
    const t2 = parseItem(
      '## Takeaways\n- [know] OmniRoute is named but tagged know. [x-1]\n## Tools / apps named\n- OmniRoute\n',
      't',
      'a'
    );
    expect(t2.bullets[0].kind).toBe('know');
  });
});

describe('knowledge handlers', () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kn-'));
    fs.mkdirSync(path.join(dir, 'topics', 'unsorted', 'items'), {
      recursive: true
    });
    fs.mkdirSync(path.join(dir, 'topics', 'ai', 'items'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'topics', 'unsorted', 'items', 'u1.md'),
      NOTE('2026-11-01')
    );
    fs.writeFileSync(
      path.join(dir, 'topics', 'unsorted', 'README.md'),
      '# Topic: unsorted\n'
    );
    fs.writeFileSync(
      path.join(dir, 'topics', 'ai', 'items', 'a1.md'),
      NOTE('2026-11-05')
    );
    fs.mkdirSync(path.join(dir, 'home'));
    fs.writeFileSync(
      path.join(dir, 'home', 'done.jsonl'),
      [
        '{"platform":"instagram","id":"AAAA1111","outcome":"failed","why":"no_file","at":"2026-11-02T00:00:00Z"}',
        '{"platform":"instagram","id":"BBBB2222","outcome":"failed","at":"2026-11-02T00:00:00Z"}',
        '{"platform":"instagram","id":"BBBB2222","outcome":"ok","at":"2026-11-03T00:00:00Z"}',
        'not json'
      ].join('\n')
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const mk = (/** @type {any} */ extra = {}) =>
    createKnowledge({
      topicsDir: path.join(dir, 'topics'),
      home: path.join(dir, 'home'),
      listOffers: async () => [
        {
          id: 'company-1vs',
          title: 'An idea',
          created_at: '2026-11-04T00:00:00Z'
        }
      ],
      workspaces: () => [{ path: 'C:\\x\\company' }],
      ...extra
    });

  test('last outcome per link decides failures', () => {
    const f = readFailures(path.join(dir, 'home'));
    expect(f.failed.map((r) => r.id)).toEqual(['AAAA1111']);
  });

  test('get: three groups, oldest first, caution chip, partial false', async () => {
    const s = await mk().get();
    expect(s.has_notes).toBe(true);
    expect(s.todo.map((r) => r.kind)).toEqual(['unsorted', 'failed', 'offer']);
    expect(s.todo[0].n).toBe(1);
    expect(s.know.length).toBe(2); // one know bullet per note
    expect(s.try[0]).toMatchObject({ title: 'OmniRoute', caution: true });
    expect(s.partial).toBe(false);
  });

  test('get: more than five todo rows are cut with a count', async () => {
    const offers = Array.from({ length: 8 }, (_, i) => ({
      id: 'company-x' + i,
      title: 'idea ' + i,
      created_at: 1000 + i
    }));
    const s = await mk({ listOffers: async () => offers }).get();
    expect(s.todo.length).toBe(5);
    expect(s.todo_more).toBe(5);
  });

  test('get: offers failing narrows the answer, never throws', async () => {
    const s = await mk({
      listOffers: async () => {
        throw new Error('bd down');
      }
    }).get();
    expect(s.partial).toBe(true);
    expect(s.todo.some((r) => r.kind === 'offer')).toBe(false);
  });

  test('get: no folder at all is an empty, partial answer', async () => {
    const s = await createKnowledge({
      topicsDir: path.join(dir, 'nope'),
      home: path.join(dir, 'nohome'),
      listOffers: async () => [],
      workspaces: () => []
    }).get();
    expect(s.has_notes).toBe(false);
    expect(s.todo).toEqual([]);
  });

  test('note: reads an item and a README, refuses bad names and traversal', () => {
    const k = mk();
    expect(k.note({ topic: 'ai', item: 'a1' }).text).toContain('Plain advice');
    expect(k.note({ topic: 'unsorted', item: 'README' }).title).toBe(
      'Topic: unsorted'
    );
    for (const bad of [
      { topic: '..', item: 'a1' },
      { topic: 'ai', item: '../../x' },
      { topic: 'ai/../ai', item: 'a1' },
      { topic: 'AI', item: 'a1' },
      {},
      null
    ]) {
      expect(() => k.note(bad)).toThrow();
    }
    expect(() => k.note({ topic: 'ai', item: 'missing' })).toThrow();
  });
});
