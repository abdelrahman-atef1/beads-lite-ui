import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ROWS } from '../scripts/live-rows.mjs';

/** Keeps docs/live-behaviour.md and scripts/live-rows.mjs one list. */
describe('live-behaviour doc', () => {
  const doc = fs.readFileSync('docs/live-behaviour.md', 'utf8');
  test('every row id is in the doc with its test files', () => {
    for (const r of ROWS) {
      const line = doc.split('\n').find((l) => l.startsWith(`| ${r.id} `));
      expect(line, r.id).toBeTruthy();
      for (const f of r.files) {
        expect(line, `${r.id} lists ${f}`).toContain(f);
      }
    }
  });
  test('the doc has no row the runner does not know', () => {
    const ids = [...doc.matchAll(/^\| (LB\d+) /gm)].map((m) => m[1]);
    expect(ids).toEqual(ROWS.map((r) => r.id));
  });
  test('every listed test file exists', () => {
    for (const r of ROWS) {
      for (const f of r.files) {
        expect(fs.existsSync(f), f).toBe(true);
      }
    }
  });
});
