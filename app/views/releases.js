/**
 * Releases screen (nav tab «الإصدارات», beads-lite-1bo5.6.36): what shipped, in
 * which project, when, and which tasks are in it. Read-only.
 *
 * Contract (server/features/releases.js):
 *   releases-list {project?, kind?, more?} -> { releases, total, has_more,
 *                                               skipped, degraded }
 *   releases-get  {project, id}            -> { tasks, more, git_failed }
 * Release = { id, project, name, bead, kind, label, commit, href, path, by,
 *             at (ms), n_tasks }
 *
 * Fetched when the tab opens and when a filter changes; never polled. Every
 * value is a text node; a link is made only when safeHref passes.
 */
import { html, nothing, render } from 'lit-html';
import { getLang, t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';
import { safeHref } from './outputs-panel.js';

export const T_LIST = 'releases-list';
export const T_GET = 'releases-get';
// load() runs on every store change while the tab is open: re-read at most this often
const STALE_MS = 15000;
// one string: pre-wrap keeps every space, so source formatting must not leak into it
const RECORD_CMD =
  'output add <bead> --kind deploy --label "..." --commit <hash> --ref <url>';

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
function tr(key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

const locale = () => (getLang() === 'ar' ? 'ar' : 'en-GB');

/** @param {number} at */
export function dayTime(at) {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(at);
}

/** @param {number} at */
export function monthOf(at) {
  return new Intl.DateTimeFormat(locale(), {
    month: 'long',
    year: 'numeric'
  }).format(at);
}

/** @param {number} at */
const shortDay = (at) =>
  new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'numeric'
  }).format(at);

/**
 * Releases grouped by month, order kept.
 *
 * @param {Array<{ at: number }>} list
 */
export function groupByMonth(list) {
  /** @type {Array<{ month: string, items: any[] }>} */
  const out = [];
  for (const r of list) {
    const m = monthOf(r.at);
    const last = out[out.length - 1];
    if (last && last.month === m) last.items.push(r);
    else out.push({ month: m, items: [r] });
  }
  return out;
}

/**
 * @param {HTMLElement} mount_element
 * @param {{ send: (type: any, payload?: unknown) => Promise<any> }} client board socket
 * @param {(id: string) => void} gotoIssue
 * @param {() => string} [currentPath] folder of the project open on the board
 */
export function createReleasesView(
  mount_element,
  client,
  gotoIssue,
  currentPath = () => ''
) {
  const log = debug('views:releases');
  /** @type {'idle'|'loading'|'ready'|'error'} */
  let status = 'idle';
  /** @type {any[]} */
  let releases = [];
  let total = 0;
  let has_more = false;
  /** @type {string[]} */
  let skipped = [];
  let degraded = false;
  let pages = 0;
  /** @type {string} */
  let project = '';
  /** @type {string} */
  let kind = '';
  /** @type {Map<string, string>} key -> display name, grows as lists load */
  const known = new Map();
  /** @type {string} */
  let selected = '';
  /** @type {{ state: 'loading'|'ready'|'error', tasks: any[], more: number, git_failed: boolean } | null} */
  let detail = null;
  let seq = 0;
  let fetched_at = 0;

  /** @param {string} key */
  const isCurrent = (key) => {
    const cur = String(currentPath() || '')
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop();
    return Boolean(cur) && String(cur).toLowerCase() === key;
  };

  async function fetchList() {
    const mine = ++seq;
    fetched_at = Date.now();
    if (status !== 'ready') {
      status = 'loading';
      doRender();
    }
    try {
      /** @type {Record<string, unknown>} */
      const payload = { more: pages };
      if (project) payload.project = project;
      if (kind) payload.kind = kind;
      const res = await client.send(T_LIST, payload);
      if (mine !== seq) return;
      releases = Array.isArray(res?.releases) ? res.releases : [];
      total = Number(res?.total) || 0;
      has_more = res?.has_more === true;
      skipped = Array.isArray(res?.skipped) ? res.skipped.map(String) : [];
      degraded = res?.degraded === true;
      for (const r of releases) known.set(r.project, r.name || r.project);
      if (selected && !releases.some((r) => r.id === selected)) closeDetail();
      status = 'ready';
    } catch (err) {
      if (mine !== seq) return;
      log('list failed: %o', err);
      status = 'error';
    }
    doRender();
  }

  /** @param {any} r */
  async function openDetail(r) {
    selected = r.id;
    detail = { state: 'loading', tasks: [], more: 0, git_failed: false };
    doRender();
    try {
      const res = await client.send(T_GET, { project: r.project, id: r.id });
      if (selected !== r.id) return;
      detail = {
        state: 'ready',
        tasks: Array.isArray(res?.tasks) ? res.tasks : [],
        more: Number(res?.more) || 0,
        git_failed: res?.git_failed === true
      };
    } catch (err) {
      log('get failed: %o', err);
      if (selected !== r.id) return;
      detail = { state: 'error', tasks: [], more: 0, git_failed: false };
    }
    doRender();
  }

  function closeDetail() {
    selected = '';
    detail = null;
  }

  /** @param {string} p @param {string} k */
  function setFilter(p, k) {
    project = p;
    kind = k;
    pages = 0;
    closeDetail();
    doRender();
    void fetchList();
  }

  const taskLabel = (/** @type {number} */ n) =>
    n === 0
      ? tr('rl_no_tasks')
      : n === 1
        ? tr('rl_tasks_1')
        : tr('rl_tasks_n', { n });

  /** @param {string} k */
  function kindBadge(k) {
    return html`<span class="rl-kind rl-k-${k === 'build' ? 'build' : 'deploy'}"
      >${k === 'build' ? '■ ' : '▲ '}${tr(
        k === 'build' ? 'rl_kind_build' : 'rl_kind_deploy'
      )}</span
    >`;
  }

  function filters() {
    const chip = (
      /** @type {string} */ label,
      /** @type {boolean} */ on,
      /** @type {() => void} */ fn
    ) =>
      html`<button
        type="button"
        class="rl-chip"
        aria-pressed=${on ? 'true' : 'false'}
        @click=${fn}
      >
        ${label}
      </button>`;
    return html`<div
      class="rl-filters"
      role="group"
      aria-label=${tr('rl_filter')}
    >
      ${chip(tr('rl_all_projects'), !project, () => setFilter('', kind))}
      ${[...known].map(([key, name]) =>
        chip(name, project === key, () => setFilter(key, kind))
      )}
      <span class="rl-sep"></span>
      ${chip(tr('rl_all_kinds'), !kind, () => setFilter(project, ''))}
      ${chip(tr('rl_kind_deploy'), kind === 'deploy', () =>
        setFilter(project, 'deploy')
      )}
      ${chip(tr('rl_kind_build'), kind === 'build', () =>
        setFilter(project, 'build')
      )}
    </div>`;
  }

  /** @param {any} r */
  function row(r) {
    return html`<li>
      <button
        type="button"
        class="rl-row"
        data-release=${r.id}
        aria-selected=${selected === r.id ? 'true' : 'false'}
        @click=${() => void openDetail(r)}
      >
        <span class="rl-l1"
          ><span class="rl-proj">${r.name || r.project}</span
          ><span class="rl-lbl">${r.label}</span>${kindBadge(r.kind)}</span
        >
        <span class="rl-cnt">${taskLabel(Number(r.n_tasks) || 0)}</span>
        <span class="rl-l2"
          ><span>${dayTime(r.at)}</span>${r.commit
            ? html`<span class="rl-mono">${r.commit.slice(0, 7)}</span>`
            : nothing}${r.by
            ? html`<span>${tr('rl_by', { who: r.by })}</span>`
            : nothing}</span
        >
      </button>
    </li>`;
  }

  function list() {
    return html`${groupByMonth(releases).map(
      (g) =>
        html`<div class="rl-month">${g.month}</div>
          <ul class="rl-rows">
            ${g.items.map(row)}
          </ul>`
    )}
    ${has_more
      ? html`<p class="rl-center">
          <button
            type="button"
            class="rl-btn rl-ghost"
            @click=${() => {
              pages += 1;
              void fetchList();
            }}
          >
            ${tr('rl_older')}
          </button>
        </p>`
      : nothing}`;
  }

  function emptyBox() {
    return html`<div class="rl-empty">
      <div class="rl-ic" aria-hidden="true">📦</div>
      <h3>${tr('rl_empty_title')}</h3>
      <p>${tr('rl_empty_body')}</p>
      <code class="rl-cmd">${RECORD_CMD}</code>
      <p class="rl-src">${tr('rl_empty_note')}</p>
    </div>`;
  }

  function body() {
    if (status === 'error') {
      return html`<div class="rl-empty" role="alert">
        <div class="rl-ic" aria-hidden="true">⚠️</div>
        <h3>${tr('rl_error_title')}</h3>
        <p>${tr('rl_error_body')}</p>
        <button type="button" class="rl-btn" @click=${() => void fetchList()}>
          ${tr('rl_retry')}
        </button>
      </div>`;
    }
    if (status !== 'ready') {
      return html`<div class="rl-rows" aria-busy="true">
        <div class="rl-skel"></div>
        <div class="rl-skel"></div>
        <div class="rl-skel"></div>
        <p class="rl-src rl-center">${tr('rl_loading')}</p>
      </div>`;
    }
    if (degraded) {
      return html`<div class="rl-note" role="status">
        ${tr('rl_degraded')}
      </div>`;
    }
    if (!releases.length) {
      if (project || kind) {
        return html`<div class="rl-empty">
          <h3>${tr('rl_filter_empty_title')}</h3>
          <p>${tr('rl_filter_empty_body')}</p>
          <button
            type="button"
            class="rl-btn rl-ghost"
            @click=${() => setFilter('', '')}
          >
            ${tr('rl_filter_clear')}
          </button>
        </div>`;
      }
      return emptyBox();
    }
    return list();
  }

  /** @param {any} task @param {any} r */
  function taskRow(task, r) {
    const done = task.status === 'closed' && task.closed_at;
    return html`<li>
      ${isCurrent(r.project)
        ? html`<a
            class="rl-id rl-mono"
            href=${'#/issues?issue=' + encodeURIComponent(task.id)}
            @click=${(/** @type {Event} */ e) => {
              e.preventDefault();
              gotoIssue(task.id);
            }}
            >${task.id}</a
          >`
        : html`<span class="rl-id rl-mono">${task.id}</span>`}
      <span class="rl-ttl">${task.title}</span>
      <span class="rl-st"
        >${done
          ? '✓ ' + tr('rl_closed_on', { d: shortDay(task.closed_at) })
          : tr('rl_open')}</span
      >
    </li>`;
  }

  function detailPanel() {
    const r = releases.find((x) => x.id === selected);
    if (!r || !detail) return nothing;
    const href = safeHref(r.href);
    return html`<aside class="rl-aside">
      <button
        type="button"
        class="rl-back"
        @click=${() => {
          closeDetail();
          doRender();
        }}
      >
        ← ${tr('rl_back')}
      </button>
      <article class="rl-detail" aria-label=${tr('rl_detail')}>
        <div class="rl-top">
          <h3>${r.label}</h3>
          <button
            type="button"
            class="rl-x"
            aria-label=${tr('rl_close')}
            @click=${() => {
              closeDetail();
              doRender();
            }}
          >
            ×
          </button>
        </div>
        <div class="rl-badges">
          <span class="rl-proj">${r.name || r.project}</span>${kindBadge(
            r.kind
          )}
        </div>
        <dl class="rl-meta">
          <dt>${tr('rl_date')}</dt>
          <dd>${dayTime(r.at)}</dd>
          ${r.commit
            ? html`<dt>${tr('rl_commit')}</dt>
                <dd><span class="rl-mono">${r.commit.slice(0, 10)}</span></dd>`
            : nothing}
          ${href
            ? html`<dt>${tr('rl_link')}</dt>
                <dd>
                  <a
                    class="rl-mono"
                    href=${href}
                    target="_blank"
                    rel="noopener noreferrer"
                    >${href.replace(/^https?:\/\//, '')}</a
                  >
                </dd>`
            : r.path
              ? html`<dt>${tr('rl_link')}</dt>
                  <dd><span class="rl-mono">${r.path}</span></dd>`
              : nothing}
          <dt>${tr('rl_by_on')}</dt>
          <dd>${r.by} · <span class="rl-mono">${r.bead}</span></dd>
        </dl>
        ${detail.state === 'error'
          ? html`<p class="rl-note" role="alert">${tr('rl_detail_error')}</p>`
          : detail.state === 'loading'
            ? html`<div class="rl-skel" aria-busy="true"></div>`
            : html`<h4>${tr('rl_tasks_done', { n: detail.tasks.length })}</h4>
                ${detail.tasks.length
                  ? html`<ul class="rl-tasks">
                      ${detail.tasks.map((x) => taskRow(x, r))}
                    </ul>`
                  : html`<p class="rl-src">${tr('rl_no_tasks')}</p>`}
                ${detail.more
                  ? html`<p class="rl-src">
                      ${tr('rl_more_tasks', { n: detail.more })}
                    </p>`
                  : nothing}
                <p class="rl-src">${tr('rl_source')}</p>
                ${detail.git_failed
                  ? html`<p class="rl-note" role="status">
                      ${tr('rl_git_failed')}
                    </p>`
                  : nothing}`}
      </article>
    </aside>`;
  }

  function template() {
    const showBar =
      status === 'ready' && !degraded && (releases.length || project || kind);
    return html`<div
      class="rl-wrap ${selected && detail ? 'rl-has-detail' : ''}"
    >
      <main class="rl-main">
        <div class="rl-title">
          <h2>${tr('rl_title')}</h2>
          ${status === 'ready' && total
            ? html`<small>${tr('rl_count', { n: total })}</small>`
            : nothing}
        </div>
        ${showBar ? filters() : nothing}
        ${skipped.length && status === 'ready'
          ? html`<div class="rl-note" role="status">
              ${tr('rl_skipped', { names: skipped.join(', ') })}
            </div>`
          : nothing}
        ${body()}
      </main>
      ${detailPanel()}
    </div>`;
  }

  function doRender() {
    render(template(), mount_element);
  }

  window.addEventListener('bdui-lang', doRender);
  doRender();

  return {
    /** Called each time the tab opens: fetch fresh, no timer. */
    async load() {
      if (status === 'idle' || Date.now() - fetched_at > STALE_MS) {
        await fetchList();
      }
    },
    destroy() {
      window.removeEventListener('bdui-lang', doRender);
      render(nothing, mount_element);
    }
  };
}
