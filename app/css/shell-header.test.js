import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// 844px landscape leaves a 612px main column; the header overflowed it by
// ~100px (beads-lite-1bo5.6.27). Real-browser check: scrollWidth == 844.
test('tablet header rules keep the bar inside the narrow main column', () => {
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media (max-width: 900px)'));
  const tablet = block.slice(0, block.indexOf('@media (max-width: 720px)'));
  expect(tablet).toMatch(/\.rpt-open__txt/);
  expect(tablet).toMatch(/\.top-search__field\s*{[^}]*width:\s*min\(160px/);
});
