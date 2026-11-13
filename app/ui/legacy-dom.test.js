import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { bootstrap } from '../main.js';

vi.mock('../ws.js', () => ({
  createWsClient: () => ({
    async send() {
      return null;
    },
    on() {
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  })
}));

// Flag off: the legacy DOM must equal what a1bf92c (board-v2) renders. The
// snapshot was generated on a1bf92c itself; this test proves v3 added nothing.
test('legacy DOM with the flag off is identical to a1bf92c', async () => {
  const page = readFileSync('app/index.html', 'utf8');
  const body = /<body>([\s\S]*)<\/body>/.exec(page)?.[1] || '';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  window.location.hash = '#/';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  await bootstrap(root).ready;
  await new Promise((r) => setTimeout(r, 50));
  const dom = document
    .getElementById('shell')
    ?.outerHTML.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ');
  await expect(dom).toMatchFileSnapshot('./legacy-dom.a1bf92c.snap.txt');
});
