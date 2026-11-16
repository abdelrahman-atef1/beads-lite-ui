import { describe, expect, test, vi } from 'vitest';

// bd in a store without the custom status rejects `--status owner_decision`
// ("invalid status"); the feed must list all and filter (beads-lite-1bo5.13.15).
const calls = /** @type {string[][]} */ ([]);
vi.mock('../bd.js', () => ({
  runBdJson: async (/** @type {string[]} */ args) => {
    calls.push(args);
    if (args.includes('--status')) {
      return { code: 1, stderr: 'Error: invalid status "owner_decision"' };
    }
    return {
      code: 0,
      stdoutJson: [
        { id: 'x-1', status: 'owner_decision', metadata: { card_q: 'Q' } },
        { id: 'x-2', status: 'open' }
      ]
    };
  }
}));

const { createDecisionsFeed } = await import('./decisions-feed.js');

describe('decisions-feed status fallback', () => {
  test('a store that rejects the status filter still lists its decisions', async () => {
    const feed = createDecisionsFeed({
      listProjects: () => [{ path: '/w/old' }],
      listSteps: async () => [],
      rules: {
        parseCard: (/** @type {any} */ b) => ({
          ok: !!b.metadata?.card_q,
          card: {
            q: 'Q',
            effect: '',
            show: '',
            blocks: '',
            title: '',
            titleAr: '',
            opts: []
          }
        }),
        scanText: () => []
      },
      watch: () => ({ close() {} })
    });
    const snap = await feed.list();
    expect(snap.items.map((i) => i.id)).toEqual(['x-1']);
    expect(snap.projects[0].count).toBe(1);
    expect(calls.length).toBe(2);
    feed.close();
  });
});
