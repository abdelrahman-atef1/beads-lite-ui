import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runBdJson } from './bd.js';
import { handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn(),
  getGitUserName: vi.fn()
}));

function stub() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} m */
    send(m) {
      this.sent.push(String(m));
    }
  };
}

/** @param {any} ws - @param {any} payload */
async function ask(ws, payload) {
  await handleMessage(
    /** @type {any} */ (ws),
    Buffer.from(JSON.stringify({ id: 'r', type: 'get-weights', payload }))
  );
  return JSON.parse(ws.sent[0]);
}

describe('get-weights handler', () => {
  beforeEach(() => vi.clearAllMocks());

  test('maps child id to metadata.weight, bounded read-only list', async () => {
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    rj.mockResolvedValueOnce({
      code: 0,
      stdoutJson: [
        { id: 'P.1', metadata: { weight: 8 } },
        { id: 'P.2', metadata: { weight: '2' } },
        { id: 'P.3', metadata: {} }
      ]
    });
    const reply = await ask(stub(), { id: 'P' });
    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual({ 'P.1': 8, 'P.2': '2' });
    expect(rj.mock.calls[0][0]).toEqual([
      'list',
      '--parent',
      'P',
      '--has-metadata-key',
      'weight',
      '--all',
      '--limit',
      '200',
      '--json'
    ]);
  });

  test('rejects a missing or oversized id without calling bd', async () => {
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    expect((await ask(stub(), {})).ok).toBe(false);
    expect((await ask(stub(), { id: 'x'.repeat(201) })).ok).toBe(false);
    expect(rj).not.toHaveBeenCalled();
  });

  test('bd failure is an error reply, not a throw', async () => {
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    rj.mockResolvedValueOnce({ code: 1, stderr: 'boom' });
    expect((await ask(stub(), { id: 'P' })).ok).toBe(false);
  });
});
