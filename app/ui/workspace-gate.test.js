import { beforeEach, describe, expect, test, vi } from 'vitest';
import { hooks, switchForIssue } from './workspace-gate.js';

const LIST = {
  workspaces: [
    { path: 'E:/p/beads-lite', prefix: 'beads-lite' },
    { path: 'E:/p/rayeh', prefix: 'rayeh' }
  ],
  current: { root_dir: 'E:/p/beads-lite', db_path: 'x' }
};
const SWITCHED = { workspace: { root_dir: 'E:/p/rayeh' }, changed: true };

/** @param {Record<string, any>} replies */
const client = (replies) => ({
  send: vi.fn(async (/** @type {string} */ t) => {
    const r = replies[t];
    if (r instanceof Error) throw r;
    return r;
  })
});

/** @type {import('vitest').Mock} */
let reload;
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  reload = vi.fn();
  hooks.reload = reload;
});

describe('task link of another project (59.23)', () => {
  test('id of another workspace: set-workspace, saved key, one reload', async () => {
    const c = client({ 'list-workspaces': LIST, 'set-workspace': SWITCHED });
    expect(await switchForIssue({ client: c }, 'rayeh-1.2')).toBe(true);
    expect(c.send).toHaveBeenCalledWith('set-workspace', {
      path: 'E:/p/rayeh'
    });
    expect(window.localStorage.getItem('beads-ui.workspace')).toBe(
      'E:/p/rayeh'
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('main script switched first (server says unchanged): still reloads once', async () => {
    const c = client({
      'list-workspaces': LIST,
      'set-workspace': { ...SWITCHED, changed: false }
    });
    expect(await switchForIssue({ client: c }, 'rayeh-1')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('a second try for the same id never reloads again (no loop)', async () => {
    const c = client({ 'list-workspaces': LIST, 'set-workspace': SWITCHED });
    await switchForIssue({ client: c }, 'rayeh-1');
    expect(await switchForIssue({ client: c }, 'rayeh-1')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('id of the current workspace: no switch, no reload', async () => {
    const c = client({ 'list-workspaces': LIST });
    expect(await switchForIssue({ client: c }, 'beads-lite-9')).toBe(false);
    expect(c.send).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  test('unknown prefix, empty list or a failing server: degrade, no throw', async () => {
    for (const r of [
      { 'list-workspaces': LIST },
      { 'list-workspaces': null },
      { 'list-workspaces': new Error('down') }
    ]) {
      const id =
        'list-workspaces' in r && r['list-workspaces'] === LIST
          ? 'zzz-1'
          : 'rayeh-1';
      expect(await switchForIssue({ client: client(r) }, id)).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled();
  });
});
