import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn() }));
import { runBdJson } from './bd.js';
import { clearWorkspaceCounts, withCounts } from './workspace-counts.js';

describe('withCounts', () => {
  beforeEach(() => {
    clearWorkspaceCounts();
    vi.mocked(runBdJson).mockReset();
  });

  test('adds total (non-closed) and owner_decision per project', async () => {
    vi.mocked(runBdJson).mockResolvedValue({
      code: 0,
      stdoutJson: {
        groups: [
          { group: 'open', count: 5 },
          { group: 'owner_decision', count: 2 },
          { group: 'closed', count: 90 }
        ]
      }
    });
    const out = await withCounts([{ path: '/p/a' }]);
    expect(out[0].counts).toEqual({ total: 7, owner_decision: 2 });
    expect(runBdJson).toHaveBeenCalledWith(
      ['count', '--by-status', '--json'],
      expect.objectContaining({ cwd: '/p/a' })
    );
  });

  test('a failing project has no counts and does not block the others', async () => {
    vi.mocked(runBdJson).mockImplementation(async (_a, o) =>
      o?.cwd === '/p/bad'
        ? { code: 1, stderr: 'x' }
        : { code: 0, stdoutJson: { groups: [{ group: 'open', count: 1 }] } }
    );
    const out = await withCounts([{ path: '/p/bad' }, { path: '/p/ok' }]);
    expect(out[0].counts).toBeUndefined();
    expect(out[1].counts).toEqual({ total: 1, owner_decision: 0 });
  });

  test('second call within the TTL does not respawn bd', async () => {
    vi.mocked(runBdJson).mockResolvedValue({ code: 0, stdoutJson: { groups: [] } });
    await withCounts([{ path: '/p/a' }]);
    await withCounts([{ path: '/p/a' }]);
    expect(runBdJson).toHaveBeenCalledTimes(1);
  });
});
