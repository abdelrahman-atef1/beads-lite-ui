import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  AGENT_NO_ROLE,
  GUARD_SINCE,
  guardAuthors,
  markBoardComment,
  resetAuthorGuard
} from './author-guard.js';

const OWNER = 'Abdelrahman Atef';
const NEW = '2026-11-17T01:09:21Z';
let home = '';
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  resetAuthorGuard();
});
/** @param {string} id @param {string} author @param {string} [at] */
const c = (id, author, at = NEW) => ({ id, author, text: id, created_at: at });

describe('guardAuthors', () => {
  test('a comment under the owner name that the board did not post shows as agent (no role)', async () => {
    const out = await guardAuthors([c('a', OWNER)], {
      home,
      owner: async () => OWNER
    });
    expect(out[0].author).toBe(AGENT_NO_ROLE);
    expect(out[0].author_raw).toBe(OWNER);
  });
  test('a comment the board posted stays the owner, also after a restart', async () => {
    markBoardComment('b', OWNER, { home });
    resetAuthorGuard(); // memory gone, file stays
    const out = await guardAuthors([c('b', OWNER)], {
      home,
      owner: async () => OWNER
    });
    expect(out[0].author).toBe(OWNER);
  });
  test('role authors and older comments are untouched', async () => {
    const list = [c('r', 'swe'), c('old', OWNER, '2026-11-01T00:00:00Z')];
    expect(GUARD_SINCE > '2026-11-01').toBe(true);
    const out = await guardAuthors(list, { home, owner: async () => OWNER });
    expect(out).toEqual(list);
  });
});
