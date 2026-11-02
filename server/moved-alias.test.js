import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { resolveMovedId } from './moved-alias.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-alias-'));
const file = path.join(dir, 'moved-beads.tsv');
afterEach(() => {
  delete process.env.BEADS_MOVED_ALIAS;
});

test('resolves old ids, case-insensitive, skips header, null when absent', () => {
  fs.writeFileSync(
    file,
    'old_id\tnew_id\trepo\ncompany-j1fq.2\tworkout-tracker-ab1\tE:/Projects/workout-tracker\n'
  );
  process.env.BEADS_MOVED_ALIAS = file;
  expect(resolveMovedId('Company-J1FQ.2')).toEqual({
    id: 'workout-tracker-ab1',
    repo: 'E:/Projects/workout-tracker'
  });
  expect(resolveMovedId('company-zzz')).toBe(null);
  expect(resolveMovedId('old_id')).toBe(null);
  process.env.BEADS_MOVED_ALIAS = path.join(dir, 'nope.tsv');
  expect(resolveMovedId('company-j1fq.2')).toBe(null);
});
