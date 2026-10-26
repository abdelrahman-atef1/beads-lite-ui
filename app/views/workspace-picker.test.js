import { describe, expect, test, vi } from 'vitest';
import fx from '../data/fixtures/list-workspaces.counts.json' with { type: 'json' };
import { createWorkspacePicker, getProjectName } from './workspace-picker.js';

/** @param {{ total: number, owner_decision: number } | null} [live] */
function setup(live = null) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const state = {
    workspace: {
      current: { path: fx.current.root_dir },
      available: fx.workspaces
    }
  };
  const store = { getState: () => state, subscribe: () => () => {} };
  const change = vi.fn(async () => {});
  createWorkspacePicker(mount, store, change, () => live);
  return { mount, change };
}

describe('views/workspace-picker', () => {
  test('project name from a Windows or POSIX path', () => {
    expect(getProjectName('C:\\Users\\a\\company')).toBe('company');
    expect(getProjectName('/home/a/rayeh')).toBe('rayeh');
  });

  test('rows show name, count, waiting; "-" when the server sent none', () => {
    const { mount } = setup();
    mount.querySelector('button')?.click();
    const rows = Array.from(mount.querySelectorAll('.ws-row'));
    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain('company');
    expect(rows[0].textContent).toContain('1619');
    expect(rows[0].textContent).toContain('2 ⚑');
    expect(rows[2].textContent).not.toContain('⚑');
    expect(rows[3].textContent).toContain('- beads');
  });

  test('current project uses the live slice count over the server value', () => {
    const { mount } = setup({ total: 7, owner_decision: 3 });
    expect(mount.querySelector('.ws-btn .nav-badge')?.textContent).toBe('3');
    mount.querySelector('button')?.click();
    expect(mount.querySelector('.ws-row')?.textContent).toContain('7 beads');
  });

  test('Enter selects with the keyboard, Esc closes', () => {
    const { mount, change } = setup();
    mount.querySelector('button')?.click();
    const root = /** @type {HTMLElement} */ (
      mount.querySelector('.workspace-picker')
    );
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(change).toHaveBeenCalledWith('H:\\Projects\\rayeh');
    mount.querySelector('button')?.click();
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(mount.querySelector('.pop')).toBeNull();
  });
});
