import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('priority icon wiring (company-1bo5.6.27)', () => {
  for (const f of ['./board.js', './decisions.js']) {
    test(`${f} cards use createPriorityBadge, no P-text`, () => {
      const s = read(f);
      expect(s).toContain('createPriorityBadge(pri)');
      expect(s).not.toMatch(/>P\$\{pri\}</);
    });
  }
  for (const f of ['./issue-row.js', './detail.js']) {
    test(`${f} uses the icon and no emoji`, () => {
      const s = read(f);
      expect(s).toContain('createPriorityBadge(');
      expect(s).not.toContain('emojiForPriority');
    });
  }
});
