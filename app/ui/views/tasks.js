/**
 * Tasks screen (v3): status columns + count chips, filters, search, cards with
 * a time slot, closed shown 50 at a time. Lanes (task 10) and bulk (task 11)
 * plug in through ui/tasks/lanes.js and bulk.js; with the stubs the screen is
 * the plain board (groupBy none).
 */
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import {
  createFilterState,
  currentUser,
  facets,
  isFiltering
} from '../../utils/board-filter.js';
import {
  CLOSED_COLUMN,
  COLUMNS,
  OTHER_COLUMN,
  ageLabel,
  displayTitle
} from '../../utils/board-model.js';
import { priorityName } from '../../utils/priority.js';
import { roleChip } from '../components/index.js';
import { t3 } from '../i18n.js';
import { renderBulkBar } from '../tasks/bulk.js';
import { groupIssues } from '../tasks/lanes.js';
import {
  CLOSED_PAGE,
  FIRST_PAINT_CARDS,
  buildBoard,
  columnsOf
} from '../tasks/model.js';

const IDS = [
  'tab:all',
  'tab:board:ready',
  'tab:board:blocked',
  'tab:board:closed'
];
const SPECS = /** @type {Record<string, { type: string }>} */ ({
  'tab:all': { type: 'all-issues' },
  'tab:board:ready': { type: 'ready-issues' },
  'tab:board:blocked': { type: 'blocked-issues' },
  'tab:board:closed': { type: 'closed-issues' }
});

/** @type {Record<string, string>} */
const TONE = {
  owner: 'amber',
  progress: 'blue',
  test: 'teal',
  merge: 'green',
  ready: 'neutral',
  blocked: 'red',
  other: 'neutral',
  closed: 'neutral'
};

/**
 * @param {HTMLElement} el
 * @param {any} ctx
 */
export function mount(el, ctx) {
  const stores = ctx.sub_issue_stores;
  const subs = ctx.subscriptions;
  const selectors = ctx.listSelectors;
  const filter = createFilterState();
  const me = currentUser();
  /** @type {Array<() => Promise<void>>} */
  const unsubs = [];
  let alive = true;
  let model = /** @type {ReturnType<typeof buildBoard>|null} */ (null);
  let loaded = false;
  let focus = ''; // '' = every column, else a column id
  let closed_open = false;
  let closed_shown = CLOSED_PAGE;
  /** @type {'none'|'project'|'assignee'|'epic'} */
  const group_by = 'none'; // task 10 turns this on
  let budget = Infinity;
  let first_paint_done = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let rest_timer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let q_timer = null;
  /** @type {Set<string>} */
  const selected = new Set(); // task 11 fills it

  // v3 skips the legacy subscribe step: subscribe here.
  for (const id of IDS) {
    try {
      stores.register(id, SPECS[id]);
    } catch {
      // already registered
    }
    void subs
      .subscribeList(id, SPECS[id])
      .then((/** @type {() => Promise<void>} */ u) => {
        // The all-issues list stays on (shared with desk and nav); the others
        // stop when this screen closes, so an idle user costs nothing.
        if (id !== 'tab:all') unsubs.push(u);
      })
      .catch(() => {});
  }

  const snap = (/** @type {string} */ id) => selectors.selectIssuesFor(id);

  function refresh() {
    if (!alive) return;
    loaded = Boolean(stores.isLoaded && stores.isLoaded('tab:all'));
    model = buildBoard(
      {
        all: snap('tab:all'),
        ready: snap('tab:board:ready'),
        blocked: snap('tab:board:blocked'),
        closed: snap('tab:board:closed')
      },
      filter.get(),
      me
    );
    draw();
  }

  const phone = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches;

  /**
   * On a phone one column at a time (a long stack of every column is slow and
   * hard to scan): the picked chip, else the first column that has cards.
   */
  function effFocus() {
    if (focus || !phone() || !model) return focus;
    const first = COLUMNS.find((c) => (model?.columns[c.id] || []).length);
    return first ? first.id : '';
  }

  const colLabel = (/** @type {{id:string}} */ c) => t3('u3_tk_col_' + c.id);

  /**
   * @param {any} it
   * @param {string} colId
   */
  function card(it, colId) {
    const { primary, secondary } = displayTitle(it);
    const who = String(it.assignee || '').trim();
    const blockers = Array.isArray(it.blocked_by_detail)
      ? it.blocked_by_detail
      : [];
    const pri = typeof it.priority === 'number' ? it.priority : 2;
    return html`<a
      class="u3t-card"
      data-issue-id=${it.id}
      href=${'#/issues?issue=' + encodeURIComponent(it.id)}
    >
      <span class="u3t-card__id u3-mono">${it.id}</span>
      <span class="u3t-card__title" dir="auto">${primary}</span>
      ${secondary
        ? html`<span class="u3t-card__sub" dir="auto">${secondary}</span>`
        : ''}
      <span class="u3t-card__foot">
        <span class="u3-chip u3-chip--${pri <= 1 ? 'red' : 'neutral'}"
          >P${pri}</span
        >
        ${colId === 'blocked' || blockers.length
          ? html`<span class="u3-chip u3-chip--red"
              >${t3('u3_tk_blocked_tag')}</span
            >`
          : ''}
        ${it.stalled
          ? html`<span class="u3-chip u3-chip--amber"
              >${t3('u3_tk_stalled')}</span
            >`
          : ''}
        <span class="u3t-time" data-slot="time"
          >${ageLabel(it.updated_at)}</span
        >
        ${who ? roleChip({ role: who }) : ''}
      </span>
    </a>`;
  }

  /**
   * @param {{id:string}} col
   * @param {any[]} items
   */
  function column(col, items) {
    const take = Math.min(items.length, Math.max(0, budget));
    budget -= take;
    return html`<section
      class="u3t-col u3t-col--${col.id}"
      id=${'u3t-' + col.id}
      aria-label=${colLabel(col)}
    >
      <h3 class="u3t-col__head">
        <span class="u3t-col__title">${colLabel(col)}</span>
        <span class="u3-chip u3-chip--${TONE[col.id]}">${items.length}</span>
      </h3>
      ${items.length === 0
        ? html`<p class="u3t-empty u3-muted">${t3('u3_tk_none')}</p>`
        : repeat(
            items.slice(0, take),
            (it) => it.id,
            (it) => card(it, col.id)
          )}
    </section>`;
  }

  /**
   * @param {Record<string, any[]>} cols
   * @param {any[]} other
   */
  function board(cols, other) {
    const fx = effFocus();
    const list = COLUMNS.filter((c) => !fx || fx === c.id).map((c) =>
      column(c, cols[c.id] || [])
    );
    if (other.length && (!fx || fx === 'other')) {
      list.push(column(OTHER_COLUMN, other));
    }
    return html`<div class="u3t-board">${list}</div>`;
  }

  function lanes() {
    const m = /** @type {NonNullable<typeof model>} */ (model);
    const everything = [...Object.values(m.columns).flat(), ...m.other];
    const groups = groupIssues(everything, group_by);
    if (groups.length === 1 && !groups[0].key) {
      return board(m.columns, m.other);
    }
    const ready_ids = new Set(
      snap('tab:board:ready').map((/** @type {any} */ i) => i.id)
    );
    const blocked_ids = new Set(
      snap('tab:board:blocked').map((/** @type {any} */ i) => i.id)
    );
    return html`${groups.map((g) => {
      const s = columnsOf(g.issues, ready_ids, blocked_ids);
      return html`<section class="u3t-lane" data-lane=${g.key}>
        <h2 class="u3t-lane__head">
          <span dir="auto">${g.key}</span>
          <span class="u3-chip">${g.issues.length}</span>
        </h2>
        ${board(s.columns, s.other)}
      </section>`;
    })}`;
  }

  function closedBlock() {
    const m = /** @type {NonNullable<typeof model>} */ (model);
    const total = m.closed.length;
    if (!closed_open) {
      return html`<button
        type="button"
        class="u3-btn u3-btn--ghost u3t-closed-rail"
        id="u3t-closed-rail"
        aria-expanded="false"
        @click=${() => {
          closed_open = true;
          draw();
        }}
      >
        ${t3('u3_tk_closed')} · ${total}
      </button>`;
    }
    const slice = m.closed.slice(0, closed_shown);
    return html`<section class="u3t-col u3t-col--closed" id="u3t-closed">
      <h3 class="u3t-col__head">
        <span class="u3t-col__title">${t3('u3_tk_closed')}</span>
        <span class="u3-chip">${total}</span>
        <button
          type="button"
          class="u3-btn u3-btn--ghost"
          @click=${() => {
            closed_open = false;
            closed_shown = CLOSED_PAGE;
            draw();
          }}
        >
          ${t3('u3_tk_hide')}
        </button>
      </h3>
      <div class="u3t-closed-grid">
        ${repeat(
          slice,
          (it) => it.id,
          (it) => card(it, CLOSED_COLUMN.id)
        )}
      </div>
      ${total > slice.length
        ? html`<button
            type="button"
            class="u3-btn u3-btn--ghost"
            id="u3t-closed-more"
            @click=${() => {
              closed_shown += CLOSED_PAGE;
              draw();
            }}
          >
            ${t3('u3_tk_more')}
          </button>`
        : ''}
    </section>`;
  }

  function toolbar() {
    const f = filter.get();
    const fc = facets(model ? model.facetItems : []);
    /**
     * @param {string} key
     * @param {string} v
     */
    const quick = (key, v) =>
      html`<button
        type="button"
        class="u3t-fchip"
        aria-pressed=${f.chip === v ? 'true' : 'false'}
        @click=${() =>
          filter.set({ chip: f.chip === v ? 'all' : /** @type {any} */ (v) })}
      >
        ${t3(key)}
      </button>`;
    /**
     * @param {'type'|'label'|'assignee'|'prio'} name
     * @param {string[]} values
     * @param {(v: string) => string} [show]
     */
    const menu = (name, values, show = (v) => v) =>
      html`<label class="u3t-menu" data-on=${f[name] ? '1' : '0'}>
        <span>${t3('u3_tk_' + name)}</span>
        <select
          aria-label=${t3('u3_tk_' + name)}
          @change=${(/** @type {Event} */ ev) =>
            filter.set({
              [name]: /** @type {HTMLSelectElement} */ (ev.target).value
            })}
        >
          <option value="" ?selected=${!f[name]}>${t3('u3_tk_any')}</option>
          ${values.map(
            (v) =>
              html`<option value=${v} ?selected=${f[name] === v}>
                ${show(v)}
              </option>`
          )}
        </select>
      </label>`;
    return html`<div class="u3t-bar">
        <input
          class="u3t-search"
          type="search"
          dir="auto"
          autocomplete="off"
          maxlength="200"
          placeholder=${t3('u3_tk_search')}
          aria-label=${t3('u3_tk_search')}
          .value=${f.search}
          @input=${(/** @type {Event} */ ev) => {
            const v = /** @type {HTMLInputElement} */ (ev.target).value;
            if (q_timer) clearTimeout(q_timer);
            q_timer = setTimeout(() => filter.set({ search: v }), 120);
          }}
        />
        <div class="u3t-filters" role="group" aria-label=${t3('u3_tk_filters')}>
          ${quick('u3_tk_mine', 'mine')} ${quick('u3_tk_p01', 'p01')}
          ${quick('u3_tk_decision', 'decision')}
          ${quick('u3_tk_blocked', 'blocked')} ${menu('type', fc.types)}
          ${menu('label', fc.labels)} ${menu('assignee', fc.assignees)}
          ${menu('prio', ['0', '1', '2', '3', '4'], (v) =>
            priorityName(Number(v))
          )}
          ${isFiltering(f)
            ? html`<button
                type="button"
                class="u3t-fchip u3t-fchip--clear"
                @click=${() =>
                  filter.set({
                    chip: 'all',
                    type: '',
                    label: '',
                    assignee: '',
                    prio: '',
                    search: ''
                  })}
              >
                ${t3('u3_tk_clear')}
              </button>`
            : ''}
        </div>
      </div>
      <div class="u3t-stat" role="group" aria-label=${t3('u3_tasks')}>
        ${COLUMNS.map((c) => {
          const n = model ? (model.columns[c.id] || []).length : 0;
          return html`<button
            type="button"
            class="u3t-stat__chip u3t-stat__chip--${c.id}"
            aria-pressed=${effFocus() === c.id ? 'true' : 'false'}
            @click=${() => {
              focus = focus === c.id && !phone() ? '' : c.id;
              draw();
            }}
          >
            <span class="u3t-stat__n">${loaded ? n : ''}</span>
            <span class="u3t-stat__l">${colLabel(c)}</span>
          </button>`;
        })}
      </div>`;
  }

  function paint() {
    render(
      html`<section class="u3t" data-view="tasks" data-group=${group_by}>
        ${toolbar()}
        ${loaded && model
          ? html`${lanes()}${closedBlock()}`
          : html`<div
              class="u3t-skel"
              aria-label=${t3('u3_tk_loading')}
            ></div>`}
        ${renderBulkBar(selected, ctx)}
      </section>`,
      el
    );
  }

  function draw() {
    if (!alive) return;
    if (rest_timer) {
      clearTimeout(rest_timer);
      rest_timer = null;
    }
    const total = model
      ? Object.values(model.columns).reduce((n, c) => n + c.length, 0) +
        model.other.length
      : 0;
    const trim = !first_paint_done;
    budget = trim ? FIRST_PAINT_CARDS : Infinity;
    paint();
    if (trim && loaded) {
      if (total <= FIRST_PAINT_CARDS) {
        first_paint_done = true;
      } else {
        // The rest of the cards, once the first screen is on the glass.
        rest_timer = setTimeout(() => {
          rest_timer = null;
          first_paint_done = true;
          budget = Infinity;
          paint();
        }, 0);
      }
    }
  }

  const offF = filter.subscribe(() => refresh());
  const offS = selectors.subscribe(() => refresh(), IDS);
  const onLang = () => draw();
  window.addEventListener('bdui-lang', onLang);
  refresh();

  return {
    unmount() {
      alive = false;
      if (rest_timer) clearTimeout(rest_timer);
      if (q_timer) clearTimeout(q_timer);
      offF();
      if (typeof offS === 'function') offS();
      window.removeEventListener('bdui-lang', onLang);
      for (const u of unsubs) void u().catch(() => {});
      for (const id of IDS) if (id !== 'tab:all') stores.unregister?.(id);
      render(html``, el);
    }
  };
}
