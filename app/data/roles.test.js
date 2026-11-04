import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ROLES, actorInfo } from './roles.js';

const GLOSSARY = join(homedir(), 'company', 'knowledge', 'glossary.md');

describe('roles map vs glossary', () => {
  test('every glossary role id and Arabic name matches (fails if missing)', () => {
    // Not skipped silently: a missing glossary is a failure, not "passed".
    expect(existsSync(GLOSSARY), `glossary not found: ${GLOSSARY}`).toBe(true);
    const rows = [
      ...readFileSync(GLOSSARY, 'utf8').matchAll(/^\| `(\w+)` \| ([^|]+?) \|/gm)
    ];
    expect(rows.length).toBeGreaterThan(10);
    /** @type {Record<string, {ar: string}>} */
    const map = ROLES;
    for (const [, id, ar] of rows) {
      expect(map[id], `role ${id} missing in roles.js`).toBeDefined();
      expect(map[id].ar).toBe(ar.trim());
    }
    expect(Object.keys(ROLES).sort()).toEqual(rows.map((r) => r[1]).sort());
  });
});

describe('actorInfo', () => {
  test('role gives Arabic name (EN) and icon', () => {
    expect(actorInfo('swe')).toMatchObject({ name: 'أندل (SWE)', known: true });
    expect(actorInfo('swe').icon).not.toBe('');
  });
  test('owner and unknown never throw', () => {
    expect(actorInfo('abdelrahman').name).toBe('المالك');
    expect(actorInfo('zed')).toMatchObject({ name: 'zed', known: false });
    expect(actorInfo('constructor').known).toBe(false);
    expect(actorInfo('').name).toBe('');
  });
});
