/**
 * Projects screen (task .59.14): one row per project with its task count and
 * how many wait for the owner, as in the legacy workspace picker (same
 * store.workspace and the same `set-workspace` call, same saved key
 * beads-ui.workspace). Switching reloads the page so every list loads for the
 * new project (legacy restores the saved project on boot).
 */
import { html, render } from 'lit-html';
import { chip } from '../components/index.js';
import { allIssues } from '../data/all.js';
import { tp } from '../i18n/projects-t.js';
import { attachSearch } from '../search.js';

const WS_KEY = 'beads-ui.workspace';
const DOTS = ['blue', 'teal', 'amber', 'purple', 'green', 'red'];

/** @param {string} p */
export function projectName(p) {
  const parts = String(p || '')
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Unknown';
}

/** @param {string} name */
function tone(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOTS[h % DOTS.length];
}

/**
 * Counts for one project: the loaded slice for the current project, else the
 * server counts; null = unknown.
 *
 * @param {any} ws
 * @param {boolean} is_cur
 * @param {() => any[] | null} live
 * @returns {{ total: number, owner_decision: number } | null}
 */
export function countsFor(ws, is_cur, live) {
  const items = is_cur ? live() : null;
  if (items) {
    return {
      total: items.length,
      owner_decision: items.filter((i) => i.status === 'owner_decision').length
    };
  }
  const c = ws && ws.counts;
  if (c && typeof c.total === 'number') {
    return {
      total: c.total,
      owner_decision:
        typeof c.owner_decision === 'number' ? c.owner_decision : 0
    };
  }
  return null;
}

/**
 * @param {HTMLElement} el
 * @param {any} ctx
 */
export function mount(el, ctx) {
  const store = ctx.store;
  const all = allIssues(ctx);
  let switching = '';
  let failed = false;
  attachSearch(ctx);

  const live = () => (all.loaded() ? all.items() : null);

  /** @param {string} path */
  async function choose(path) {
    const cur = store.getState().workspace?.current?.path || '';
    if (!path || path === cur || switching) return;
    switching = path;
    failed = false;
    draw();
    try {
      const r = await ctx.client.send('set-workspace', { path });
      if (r && r.workspace) {
        window.localStorage.setItem(WS_KEY, path);
        if (r.changed) {
          window.location.reload();
          return;
        }
      }
    } catch {
      failed = true;
    }
    switching = '';
    draw();
  }

  /**
   * @param {any} ws
   * @param {string} cur_path
   */
  function row(ws, cur_path) {
    const name = projectName(ws.path);
    const is_cur = ws.path === cur_path;
    const c = countsFor(ws, is_cur, live);
    return html`<li>
      <button
        type="button"
        class="u3p-row"
        aria-current=${is_cur ? 'true' : 'false'}
        ?disabled=${!!switching}
        data-path=${ws.path}
        title=${ws.path}
        @click=${() => void choose(ws.path)}
      >
        <i class="u3-dot u3-dot--${tone(name)}" aria-hidden="true"></i>
        <span class="u3p-row__name">${name}</span>
        ${is_cur ? chip({ label: tp('u3p_current'), tone: 'blue' }) : ''}
        <span class="u3p-row__count"
          >${c ? c.total : '-'} <small>${tp('u3p_beads')}</small></span
        >
        ${c && c.owner_decision > 0
          ? chip({
              label: c.owner_decision,
              tone: 'amber',
              title: tp('u3p_waiting')
            })
          : ''}
      </button>
    </li>`;
  }

  function draw() {
    const ws = store.getState().workspace || {};
    const list = ws.available || [];
    const cur_path = ws.current?.path || '';
    render(
      html`<section class="u3p" data-view="projects">
        ${list.length
          ? html`<ul class="u3p-list">
              ${list.map((/** @type {any} */ w) => row(w, cur_path))}
            </ul>`
          : html`<p class="u3-muted">${tp('u3p_empty')}</p>`}
        ${switching
          ? html`<p class="u3-muted" role="status">${tp('u3p_switching')}</p>`
          : ''}
        ${failed
          ? html`<p class="u3p-err" role="alert">${tp('u3p_failed')}</p>`
          : ''}
      </section>`,
      el
    );
  }

  draw();
  const offStore = store.subscribe(draw);
  const offAll = all.on(draw);
  window.addEventListener('bdui-lang', draw);
  return {
    unmount() {
      offStore();
      offAll();
      window.removeEventListener('bdui-lang', draw);
      render(html``, el);
    }
  };
}
