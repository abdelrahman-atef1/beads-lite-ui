import { html, render } from 'lit-html';
import { getLang, t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';

/**
 * @typedef {import('../state.js').WorkspaceInfo} WorkspaceInfo
 */

/**
 * Extract the project name from a workspace path (either separator).
 *
 * @param {string} workspace_path
 * @returns {string}
 */
export function getProjectName(workspace_path) {
  if (!workspace_path) return 'Unknown';
  const parts = workspace_path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'Unknown';
}

const DOTS = [
  's-progress',
  's-merge',
  's-test',
  's-ready',
  's-owner',
  's-blocked'
];

/**
 * Stable colour per project name.
 *
 * @param {string} name
 */
function dotFor(name) {
  let h = 0;
  for (const ch of name) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return 'var(--' + DOTS[h % DOTS.length] + ')';
}

/**
 * Workspace switcher (design/README.md 5.5): a button showing the project
 * name that opens a popover with one row per project (colour dot, name,
 * bead count, owner-decision count). Arrow keys + Enter, Esc closes.
 * Counts come from `workspace.counts` when the server sends them (contract
 * board-data.md); the current project falls back to `liveCounts()`; else "-".
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {(workspace_path: string) => Promise<void>} onWorkspaceChange
 * @param {() => ({ total: number, owner_decision: number } | null)} [liveCounts]
 * @param {{ list?: boolean }} [opts] - list: always-open project list for the
 * sidebar (one row per project) instead of the popover button.
 */
export function createWorkspacePicker(
  mount_element,
  store,
  onWorkspaceChange,
  liveCounts = () => null,
  opts = {}
) {
  const log = debug('views:workspace-picker');
  /** @type {(() => void) | null} */
  let unsubscribe = null;
  let is_switching = false;
  let open = false;
  let active = 0;

  /** @returns {any[]} */
  function available() {
    return store.getState().workspace?.available || [];
  }

  /**
   * @param {any} ws
   * @param {boolean} is_current
   * @returns {{ total: number, owner_decision: number } | null}
   */
  function countsFor(ws, is_current) {
    const live = is_current ? liveCounts() : null;
    if (live) {
      return live;
    }
    const c = ws.counts;
    if (c && typeof c.total === 'number') {
      return {
        total: c.total,
        owner_decision:
          typeof c.owner_decision === 'number' ? c.owner_decision : 0
      };
    }
    return null;
  }

  /** @param {string} new_path */
  async function choose(new_path) {
    const current_path = store.getState().workspace?.current?.path || '';
    open = false;
    if (new_path && new_path !== current_path) {
      log('switching workspace to %s', new_path);
      is_switching = true;
      doRender();
      try {
        await onWorkspaceChange(new_path);
      } catch (err) {
        log('workspace switch failed: %o', err);
      } finally {
        is_switching = false;
        doRender();
      }
    } else {
      doRender();
    }
  }

  function focusActive() {
    /** @type {HTMLElement|null} */ (
      mount_element.querySelector('.ws-row[data-active="true"]')
    )?.focus();
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    const list = available();
    if (ev.key === 'Escape' && open) {
      open = false;
      doRender();
      /** @type {HTMLElement|null} */ (
        mount_element.querySelector('.ws-btn')
      )?.focus();
    } else if (
      open &&
      list.length > 0 &&
      (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')
    ) {
      ev.preventDefault();
      const d = ev.key === 'ArrowDown' ? 1 : -1;
      active = (active + d + list.length) % list.length;
      doRender();
      focusActive();
    } else if (ev.key === 'Enter' && open && list[active]) {
      ev.preventDefault();
      void choose(list[active].path);
    }
  }

  /** @param {MouseEvent} ev */
  function onDocClick(ev) {
    if (open && !mount_element.contains(/** @type {Node} */ (ev.target))) {
      open = false;
      doRender();
    }
  }

  function toggle() {
    open = !open;
    if (open) {
      const cur = store.getState().workspace?.current?.path;
      active = Math.max(
        0,
        available().findIndex((w) => w.path === cur)
      );
    }
    doRender();
    if (open) {
      focusActive();
    }
  }

  /**
   * Sidebar mode: every project is a row, the current one is selected.
   *
   * @param {any[]} list
   * @param {string} cur_path
   */
  function listTemplate(list, cur_path) {
    return html`
      <div class="side-projects__h">${t('projects')}</div>
      <div class="ws-list" role="listbox" aria-label=${t('workspace')}>
        ${list.map((ws) => {
          const name = getProjectName(ws.path);
          const is_cur = ws.path === cur_path;
          const c = countsFor(ws, is_cur);
          return html`<div
            class="ws-row"
            role="option"
            tabindex="0"
            aria-selected=${is_cur ? 'true' : 'false'}
            data-path=${ws.path}
            title=${ws.path}
            @click=${() => void choose(ws.path)}
            @keydown=${(/** @type {KeyboardEvent} */ ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                void choose(ws.path);
              }
            }}
          >
            <span class="ws-dot" style=${'background:' + dotFor(name)}></span>
            <div class="ws-row__main">
              <span class="ws-row__name">${name}</span>
              <span class="ws-row__sub">${c ? c.total : '-'}</span>
            </div>
            ${c && c.owner_decision > 0
              ? html`<span
                  class="nav-badge"
                  aria-label=${c.owner_decision + ' waiting'}
                  >${c.owner_decision}</span
                >`
              : ''}
          </div>`;
        })}
      </div>
    `;
  }

  function template() {
    const list = available();
    if (list.length === 0) {
      return html``;
    }
    const cur_path = store.getState().workspace?.current?.path || '';
    const cur = list.find((w) => w.path === cur_path) || list[0];
    const cur_name = getProjectName(cur.path);
    if (opts.list) {
      return listTemplate(list, cur_path);
    }
    const cur_counts = countsFor(cur, true);
    const waiting = cur_counts ? cur_counts.owner_decision : 0;
    if (list.length === 1) {
      return html`<div class="workspace-picker workspace-picker--single">
        <span class="workspace-picker__label" title=${cur.path}
          >${cur_name}</span
        >
      </div>`;
    }
    return html`
      <div class="workspace-picker" @keydown=${onKey}>
        <button
          type="button"
          class="btn ws-btn"
          aria-haspopup="listbox"
          aria-expanded=${open ? 'true' : 'false'}
          aria-label=${t('workspace') + ': ' + cur_name}
          ?disabled=${is_switching}
          @click=${toggle}
        >
          <span class="ws-dot" style=${'background:' + dotFor(cur_name)}></span>
          <span class="ws-name">${cur_name}</span>
          ${waiting > 0
            ? html`<span class="nav-badge" aria-label=${waiting + ' waiting'}
                >${waiting}</span
              >`
            : ''}
          <span aria-hidden="true">▾</span>
        </button>
        ${open
          ? html`<div
              class="pop"
              role="listbox"
              aria-label=${t('workspace')}
              dir=${getLang() === 'ar' ? 'rtl' : 'ltr'}
            >
              ${list.map((ws, i) => {
                const name = getProjectName(ws.path);
                const is_cur = ws.path === cur_path;
                const c = countsFor(ws, is_cur);
                return html`<div
                  class="ws-row"
                  role="option"
                  tabindex="-1"
                  aria-selected=${is_cur ? 'true' : 'false'}
                  data-active=${i === active ? 'true' : 'false'}
                  data-path=${ws.path}
                  title=${ws.path}
                  @click=${() => void choose(ws.path)}
                >
                  <span
                    class="ws-dot"
                    style=${'background:' + dotFor(name)}
                  ></span>
                  <div class="ws-row__main">
                    <span class="ws-row__name">${name}</span>
                    <span class="ws-row__sub"
                      >${c ? c.total : '-'} ${t('beads_n')}</span
                    >
                  </div>
                  <span class="ws-row__wait"
                    >${c && c.owner_decision > 0
                      ? c.owner_decision + ' ⚑'
                      : ''}</span
                  >
                </div>`;
              })}
            </div>`
          : ''}
        ${is_switching
          ? html`<span
              class="workspace-picker__loading"
              aria-hidden="true"
            ></span>`
          : ''}
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());
  document.addEventListener('click', onDocClick);
  window.addEventListener('bdui-lang', doRender);

  return {
    /** Re-render, e.g. when the loaded slice (live counts) changed. */
    refresh: doRender,
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('bdui-lang', doRender);
      render(html``, mount_element);
    }
  };
}
