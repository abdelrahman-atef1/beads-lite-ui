import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { PEOPLE, personLabel } from './people.js';

const strip = (/** @type {string} */ s) => s.replace(/[⁨⁩]/g, '');

describe('people', () => {
  beforeEach(() => localStorage.clear());
  test('Arabic names match the glossary', () => {
    const g = join(homedir(), 'company', 'knowledge', 'glossary.md');
    expect(existsSync(g), 'glossary missing').toBe(true);
    const rows = [
      ...readFileSync(g, 'utf8').matchAll(/^\| `(\w+)` \| ([^|]+?) \|/gm)
    ];
    for (const [, id, ar] of rows) expect(PEOPLE[id].name).toBe(ar.trim());
    expect(Object.keys(PEOPLE).sort()).toEqual(rows.map((r) => r[1]).sort());
  });
  test('English titles match the role file header', () => {
    const dir = join(homedir(), 'company', 'agents');
    const en = {
      cos: 'Chief of Staff',
      pm: 'Product Lead',
      qa: 'QA Engineer',
      swe: 'Software Engineer',
      sre: 'Infrastructure & Unit-Cost Engineer'
    };
    for (const [id, t] of Object.entries(en)) {
      expect(PEOPLE[id].en).toBe(t);
      if (existsSync(join(dir, id + '.md'))) {
        expect(readFileSync(join(dir, id + '.md'), 'utf8')).toContain(t);
      }
    }
  });
  test('Arabic UI gives name - Arabic title, English UI the English title', () => {
    localStorage.setItem('beads-ui.lang', 'ar');
    expect(strip(personLabel('cos').full)).toBe('مارد وشوشني - مدير المكتب');
    localStorage.setItem('beads-ui.lang', 'en');
    expect(strip(personLabel('cos').full)).toBe('مارد وشوشني - Chief of Staff');
  });
  test('unknown shows raw; legal does not repeat itself in Arabic', () => {
    expect(personLabel('Zed')).toMatchObject({ full: 'Zed', known: false });
    localStorage.setItem('beads-ui.lang', 'ar');
    expect(strip(personLabel('legal').full)).toBe('المستشار القانوني');
  });
});
