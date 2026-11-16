/**
 * Projects screen (task .59.14, read-only since beads-lite-1bo5.13.24.1): one
 * row per project with its task count and how many wait for the owner. There
 * is no project switch: a row opens Tasks with the Project filter set to that
 * project (the saved device copy), so every screen keeps covering all projects.
 */
import { html, render } from 'lit-html';
import { chip } from '../components/index.js';
import { allIssues } from '../data/all.js';
import { projectIcon } from '../data/project-icons.js';
import { registeredProjects } from '../data/registered.js';
import { tp } from '../i18n/projects-t.js';
import { attachSearch } from '../search.js';
import { loadSaved, save } from '../tasks/saved-filters.js';

/** @param {string} p */
export function projectName(p) {
  const parts = String(p || '')
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Unknown';
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
 * Open Tasks filtered to one project. The URL's project (if any) is dropped so
 * the saved device copy, set here, is what Tasks reads.
 *
 * @param {string} key - project filter value
 */
export function openProject(key) {
  save({ ...loadSaved(), project: [key] });
  try {
    const q = new URLSearchParams(window.location.search);
    q.delete('project');
    const qs = q.toString();
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
    );
  } catch {
    // no window (tests)
  }
  window.location.hash = '#/issues';
}

/**
 * @param {HTMLElement} el
 * @param {any} ctx
 */
export function mount(el, ctx) {
  const store = ctx.store;
  const all = allIssues(ctx);
  attachSearch(ctx);

  const live = () => (all.loaded() ? all.items() : null);

  /**
   * @param {any} ws
   * @param {string} cur_path - the connection's project, whose live list is loaded
   */
  function row(ws, cur_path) {
    const name = projectName(ws.path);
    const key = (
      registeredProjects(store).find((w) => w.path === ws.path) || {
        key: name.toLowerCase()
      }
    ).key;
    const c = countsFor(ws, ws.path === cur_path, live);
    return html`<li>
      <button
        type="button"
        class="u3p-row"
        data-path=${ws.path}
        data-project=${key}
        title=${ws.path}
        @click=${() => openProject(key)}
      >
        ${projectIcon(name, 22)}
        <span class="u3p-row__name">${name}</span>
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
