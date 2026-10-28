import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// company-1bo5.6.33: deep link to an issue of another project must not
// subscribe issue-detail in the old workspace (that popped "not found").
const COMPANY = 'C:/p/company';
const TASKS = 'C:/p/abduu-tasks';
/** @type {{ type: string, payload: any }[]} */
const calls = [];
let current = { root_dir: COMPANY, db_path: COMPANY + '/.beads' };

vi.mock('./ws.js', () => {
  const singleton = {
    /**
     * @param {string} type
     * @param {any} payload
     */
    async send(type, payload) {
      calls.push({ type, payload });
      if (type === 'list-workspaces') {
        return {
          current,
          workspaces: [
            { path: COMPANY, database: COMPANY + '/.beads' },
            { path: TASKS, database: TASKS + '/.beads' }
          ]
        };
      }
      if (type === 'set-workspace') {
        current = { root_dir: payload.path, db_path: payload.path + '/.beads' };
        return { changed: true, workspace: current };
      }
      return null;
    },
    on() {
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('detail subscribe waits for the right workspace', () => {
  test('cross-project deep link: set-workspace comes before issue-detail', async () => {
    window.location.hash = '#/issues?issue=abduu-tasks-3fk';
    document.body.innerHTML = '<main id="app"></main>';
    bootstrap(/** @type {HTMLElement} */ (document.getElementById('app')));
    for (let i = 0; i < 10; i++) await tick();

    const detail = calls
      .map((c, i) => ({ c, i }))
      .filter(
        ({ c }) =>
          c.type === 'subscribe-list' &&
          c.payload?.type === 'issue-detail' &&
          c.payload?.params?.id === 'abduu-tasks-3fk'
      );
    const sw = calls.findIndex(
      (c) => c.type === 'set-workspace' && c.payload.path === TASKS
    );
    expect(sw).toBeGreaterThan(-1);
    expect(detail.length).toBeGreaterThan(0);
    // No detail subscribe may precede the switch.
    expect(detail[0].i).toBeGreaterThan(sw);
  });
});
