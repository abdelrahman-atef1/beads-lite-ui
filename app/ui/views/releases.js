/**
 * Releases screen (v3), same server data as legacy views/releases.js:
 *   releases-list {project?, kind?, more?} -> { releases, total, has_more, skipped, degraded }
 *   releases-get  {project, id}            -> { tasks, more, git_failed }
 * Fetched on open and when a filter changes; never polled. Every value is a
 * text node; a link is made only when safeHref passes. Digits are Western in
 * both languages (locale carries -u-nu-latn).
 */
import { html, nothing, render } from 'lit-html';
import { getLang } from '../../utils/i18n.js';
import { safeHref } from '../../views/outputs-panel.js';
import { button } from '../components/button.js';
import { chip } from '../components/chip.js';
import { t3 } from '../i18n.js';

export const T_LIST = 'releases-list';
export const T_GET = 'releases-get';
// server serves pages 0..6 (30 each); asking for page 7 silently restarts at 0 (.36 F1)
export const MAX_PAGE = 6;
const RECORD_CMD =
  'output add <bead> --kind deploy --label "..." --commit <hash> --ref <url>';

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
function tr(key, vars = {}) {
  let s = t3(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

const locale = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-GB');
/**
 * @param {number} at
 * @param {Intl.DateTimeFormatOptions} o
 */
const fmt = (at, o) => new Intl.DateTimeFormat(locale(), o).format(at);
/**
 * Short git hashes are cut to 7; versions like 1.1.0+20 stay whole.
 *
 * @param {string} c
 */
export const shortRef = (c) => (/^[0-9a-f]{12,}$/i.test(c) ? c.slice(0, 7) : c);
/** @param {number} at */
export const dayLabel = (at) => fmt(at, { day: 'numeric', month: 'long' });
/** @param {number} at */
export const dayTime = (at) =>
  fmt(at, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
/** @param {number} at */
const shortDay = (at) => fmt(at, { day: 'numeric', month: 'numeric' });

/**
 * @param {HTMLElement} el
 * @param {{ client: any, router?: any, store?: any }} ctx
 */
export function mount(el, ctx) {
  const { client } = ctx;
  /** @type {'loading'|'ready'|'error'} */
  let status = 'loading';
  /** @type {any[]} */
  let releases = [];
  let total = 0;
  let has_more = false;
  /** @type {string[]} */
  let skipped = [];
  let degraded = false;
  let pages = 0;
  let project = '';
  let kind = '';
  /** @type {Map<string, string>} */
  const known = new Map();
  let selected = '';
  /** @type {{ state: string, tasks: any[], more: number, git_failed: boolean } | null} */
  let detail = null;
  let seq = 0;
  let dead = false;

  const isCurrent = (/** @type {string} */ key) => {
    const p = ctx.store?.getState?.().workspace?.current?.path || '';
    const cur = String(p)
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop();
    return Boolean(cur) && String(cur).toLowerCase() === key;
  };

  const draw = () => {
    if (!dead) render(template(), el);
  };

  async function fetchList() {
    const mine = ++seq;
    if (status !== 'ready') {
      status = 'loading';
      draw();
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
    } catch {
      if (mine !== seq) return;
      status = 'error';
    }
    draw();
  }

  /** @param {any} r */
  async function openDetail(r) {
    selected = r.id;
    detail = { state: 'loading', tasks: [], more: 0, git_failed: false };
    draw();
    try {
      const res = await client.send(T_GET, { project: r.project, id: r.id });
      if (selected !== r.id) return;
      detail = {
        state: 'ready',
        tasks: Array.isArray(res?.tasks) ? res.tasks : [],
        more: Number(res?.more) || 0,
        git_failed: res?.git_failed === true
      };
    } catch {
      if (selected !== r.id) return;
      detail = { state: 'error', tasks: [], more: 0, git_failed: false };
    }
    draw();
  }

  function closeDetail() {
    selected = '';
    detail = null;
  }

  /**
   * @param {string} p
   * @param {string} k
   */
  function setFilter(p, k) {
    project = p;
    kind = k;
    pages = 0;
    closeDetail();
    draw();
    void fetchList();
  }

  const taskLabel = (/** @type {number} */ n) =>
    n === 0
      ? tr('rl_no_tasks')
      : n === 1
        ? tr('rl_tasks_1')
        : tr('rl_tasks_n', { n });

  /** @param {string} k */
  const kindChip = (k) =>
    chip({
      label: tr(k === 'build' ? 'rl_kind_build' : 'rl_kind_deploy'),
      tone: k === 'build' ? 'amber' : 'green'
    });

  function filters() {
    const pill = (
      /** @type {string} */ label,
      /** @type {boolean} */ on,
      /** @type {() => void} */ fn
    ) =>
      html`<button
        type="button"
        class="rl3-pill"
        aria-pressed=${on ? 'true' : 'false'}
        @click=${fn}
      >
        ${label}
      </button>`;
    return html`<div
      class="rl3-filters"
      role="group"
      aria-label=${tr('rl_filter')}
    >
      <div class="rl3-pills" data-row="projects">
        ${pill(tr('rl_all_projects'), !project, () => setFilter('', kind))}
        ${[...known].map(([key, name]) =>
          pill(name, project === key, () => setFilter(key, kind))
        )}
      </div>
      <div class="rl3-pills" data-row="kinds">
        ${pill(tr('rl_all_kinds'), !kind, () => setFilter(project, ''))}
        ${pill(tr('rl_kind_deploy'), kind === 'deploy', () =>
          setFilter(project, 'deploy')
        )}
        ${pill(tr('rl_kind_build'), kind === 'build', () =>
          setFilter(project, 'build')
        )}
      </div>
    </div>`;
  }

  /** @param {any} r */
  function card(r) {
    return html`<li class="rl3-item">
      <span class="rl3-dot" aria-hidden="true"></span>
      <button
        type="button"
        class="rl3-card"
        data-release=${r.id}
        aria-pressed=${selected === r.id ? 'true' : 'false'}
        @click=${() => void openDetail(r)}
      >
        <span class="rl3-head">
          ${kindChip(r.kind)}
          <span class="rl3-ids">
            ${r.commit
              ? html`<span class="u3-mono rl3-commit"
                  >${shortRef(r.commit)}</span
                >`
              : nothing}
            ${chip({ label: r.name || r.project, mono: true })}
          </span>
        </span>
        <span class="rl3-title" dir="auto">${r.label}</span>
        <span class="rl3-date">${dayLabel(r.at)}</span>
        <span class="rl3-foot">
          <span>${taskLabel(Number(r.n_tasks) || 0)}</span>
          <span class="rl3-chev" aria-hidden="true">›</span>
        </span>
      </button>
    </li>`;
  }

  function list() {
    return html`<ol class="rl3-list">
        ${releases.map(card)}
      </ol>
      ${has_more && pages < MAX_PAGE
        ? html`<div class="rl3-more">
            ${button({
              label: tr('rl_older'),
              variant: 'ghost',
              block: true,
              onClick: () => {
                pages += 1;
                void fetchList();
              }
            })}
          </div>`
        : has_more
          ? html`<p class="rl3-note" role="status">${tr('u3_rl_cap')}</p>`
          : nothing}`;
  }

  /**
   * @param {string} title
   * @param {string} text
   * @param {any} [extra]
   */
  function box(title, text, extra) {
    return html`<div class="rl3-empty">
      <h3>${title}</h3>
      <p>${text}</p>
      ${extra ?? nothing}
    </div>`;
  }

  function body() {
    if (status === 'error') {
      return html`<div role="alert">
        ${box(
          tr('rl_error_title'),
          tr('rl_error_body'),
          button({ label: tr('rl_retry'), onClick: () => void fetchList() })
        )}
      </div>`;
    }
    if (status !== 'ready') {
      return html`<div class="rl3-list" aria-busy="true">
        <div class="rl3-skel"></div>
        <div class="rl3-skel"></div>
        <p class="u3-muted">${tr('rl_loading')}</p>
      </div>`;
    }
    if (degraded) {
      return html`<div class="rl3-note" role="status">
        ${tr('rl_degraded')}
      </div>`;
    }
    if (!releases.length) {
      if (project || kind) {
        return box(
          tr('rl_filter_empty_title'),
          tr('rl_filter_empty_body'),
          button({
            label: tr('rl_filter_clear'),
            variant: 'ghost',
            onClick: () => setFilter('', '')
          })
        );
      }
      return box(
        tr('rl_empty_title'),
        tr('rl_empty_body'),
        html`<code class="rl3-cmd">${RECORD_CMD}</code>
          <p class="u3-muted">${tr('rl_empty_note')}</p>`
      );
    }
    return list();
  }

  /**
   * @param {any} task
   * @param {any} r
   */
  function taskRow(task, r) {
    const done = task.status === 'closed' && task.closed_at;
    return html`<li class="rl3-task">
      ${isCurrent(r.project)
        ? html`<a
            class="u3-mono rl3-id"
            href=${'#/issues?issue=' + encodeURIComponent(task.id)}
            >${task.id}</a
          >`
        : html`<span class="u3-mono rl3-id">${task.id}</span>`}
      <span class="rl3-ttl" dir="auto">${task.title}</span>
      <span class="u3-muted rl3-st"
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
    const close = () => {
      closeDetail();
      draw();
    };
    return html`<aside class="rl3-aside" aria-label=${tr('rl_detail')}>
      <div class="rl3-asidebar">
        <button type="button" class="rl3-back" @click=${close}>
          ← ${tr('rl_back')}
        </button>
        <button
          type="button"
          class="u3-iconbtn"
          aria-label=${tr('rl_close')}
          @click=${close}
        >
          ×
        </button>
      </div>
      <h3 class="rl3-dtitle" dir="auto">${r.label}</h3>
      <div class="rl3-badges">
        ${chip({ label: r.name || r.project, mono: true })}${kindChip(r.kind)}
      </div>
      <dl class="rl3-meta">
        <dt>${tr('rl_date')}</dt>
        <dd>${dayTime(r.at)}</dd>
        ${r.commit
          ? html`<dt>${tr('rl_commit')}</dt>
              <dd><span class="u3-mono">${r.commit.slice(0, 10)}</span></dd>`
          : nothing}
        ${href
          ? html`<dt>${tr('rl_link')}</dt>
              <dd>
                <a
                  class="u3-mono"
                  href=${href}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${href.replace(/^https?:\/\//, '')}</a
                >
              </dd>`
          : r.path
            ? html`<dt>${tr('rl_link')}</dt>
                <dd><span class="u3-mono">${r.path}</span></dd>`
            : nothing}
        <dt>${tr('rl_by_on')}</dt>
        <dd>${r.by} · <span class="u3-mono">${r.bead}</span></dd>
      </dl>
      ${detail.state === 'error'
        ? html`<p class="rl3-note" role="alert">${tr('rl_detail_error')}</p>`
        : detail.state === 'loading'
          ? html`<div class="rl3-skel" aria-busy="true"></div>`
          : html`<h4>${tr('rl_tasks_done', { n: detail.tasks.length })}</h4>
              ${detail.tasks.length
                ? html`<ul class="rl3-tasks">
                    ${detail.tasks.map((x) => taskRow(x, r))}
                  </ul>`
                : html`<p class="u3-muted">${tr('rl_no_tasks')}</p>`}
              ${detail.more
                ? html`<p class="u3-muted">
                    ${tr('rl_more_tasks', { n: detail.more })}
                  </p>`
                : nothing}
              <p class="u3-muted">${tr('rl_source')}</p>
              ${detail.git_failed
                ? html`<p class="rl3-note" role="status">
                    ${tr('rl_git_failed')}
                  </p>`
                : nothing}`}
    </aside>`;
  }

  function template() {
    const showBar =
      status === 'ready' && !degraded && (releases.length || project || kind);
    return html`<section
      class="rl3 ${selected && detail ? 'rl3--detail' : ''}"
      data-view="releases"
    >
      <div class="rl3-main">
        ${status === 'ready' && total
          ? html`<p class="u3-muted rl3-count">
              ${tr('rl_count', { n: total })}
            </p>`
          : nothing}
        ${showBar ? filters() : nothing}
        ${skipped.length && status === 'ready'
          ? html`<div class="rl3-note" role="status">
              ${tr('rl_skipped', { names: skipped.join(', ') })}
            </div>`
          : nothing}
        ${body()}
      </div>
      ${detailPanel()}
    </section>`;
  }

  window.addEventListener('bdui-lang', draw);
  draw();
  void fetchList();

  return {
    unmount() {
      dead = true;
      seq++;
      window.removeEventListener('bdui-lang', draw);
      render(nothing, el);
    }
  };
}
