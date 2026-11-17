/**
 * Tasks screen (v3): status columns + count chips, filters, search, cards with
 * a time slot, closed shown 50 at a time. Lanes (task 10) and bulk (task 11)
 * plug in through ui/tasks/lanes.js and bulk.js; with the stubs the screen is
 * the plain board (groupBy none).
 */
import { takeTasksReturn } from '../tasks/return-scroll.js';
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import {
  COL_STATUS,
  DIMS,
  STATUS_COL,
  createFilterState,
  currentUser,
  facets,
  isFiltering
} from '../../utils/board-filter.js';
import {
  CLOSED_COLUMN,
  COLUMNS,
  ageLabel,
  displayTitle
} from '../../utils/board-model.js';
import { priorityName } from '../../utils/priority.js';
import {
  priorityIconName,
  priorityVal,
  typeIconName,
  typeVal
} from '../components/vicon.js';
import { personLabel, uiDir } from '../data/people.js';
import { projectLabel } from '../data/project-icons.js';
import { t3 } from '../i18n.js';
import { icon } from '../icons.js';
import { personChip } from '../people/person-chip.js';
import { createBulk, renderBulkBar } from '../tasks/bulk.js';
import { dimCounts, statusMap } from '../tasks/filter-counts.js';
import { filterMenu } from '../tasks/filter-menu.js';
import { filterSheet } from '../tasks/filter-sheet.js';
import {
  GROUPS,
  groupIssues,
  loadCollapsed,
  loadGroup,
  projectOf,
  saveCollapsed,
  saveGroup
} from '../tasks/lanes.js';
import {
  CLOSED_PAGE,
  FIRST_PAINT_CARDS,
  buildBoard,
  filterCtx
} from '../tasks/model.js';
import { loadSaved, save } from '../tasks/saved-filters.js';
import { openNewTask } from './new-task.js';

const IDS = [
  'tab:all',
  'tab:board:ready',
  'tab:board:blocked',
  'tab:board:closed'
];
// Every list spans all registered projects (scope 'all'); the project filter
// then narrows it on the device (beads-lite-1bo5.13.8.1).
const ALL = { scope: 'all' };
const SPECS =
  /** @type {Record<string, { type: string, params: typeof ALL }>} */ ({
    'tab:all': { type: 'all-issues', params: ALL },
    'tab:board:ready': { type: 'ready-issues', params: ALL },
    'tab:board:blocked': { type: 'blocked-issues', params: ALL },
    'tab:board:closed': { type: 'closed-issues', params: ALL }
  });

/** @type {Record<string, string>} */
const TONE = {
  owner: 'amber',
  progress: 'blue',
  test: 'teal',
  merge: 'green',
  ready: 'neutral',
  blocked: 'red',
  deferred: 'neutral',
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
  // The saved device copy seeds the filters; a URL with filter keys wins as a
  // whole (no per-key merge), so a cleared filter never comes back.
  const filter = createFilterState(loadSaved());
  const me = currentUser();
  /** @type {import('../tasks/filter-menu.js').Open | null} */
  let open_menu = null;
  /** @type {'' | 'opt' | 'sheet' | 'filters' | string} focus target after the next paint */
  let focus_to = '';
  /** The Filters sheet: where it opens on a wide screen, null = closed. @type {{ left: number, top: number } | null} */
  let sheet = null;
  /** @type {Set<string>} */
  const sheet_open = new Set();
  /** @type {Record<string, string>} */
  const sheet_find = {};
  function remember() {
    save(filter.get());
  }
  /** @type {Array<() => Promise<void>>} */
  const unsubs = [];
  let alive = true;
  let model = /** @type {ReturnType<typeof buildBoard>|null} */ (null);
  let loaded = false;
  let closed_open = false;
  let closed_shown = CLOSED_PAGE;
  /** @type {'none'|'project'|'assignee'|'epic'} */
  let group_by = loadGroup();
  const collapsed = loadCollapsed();
  let budget = Infinity;
  let first_paint_done = false;
  /** Scroll place to go back to (Back from a task), applied once the list is whole. */
  let return_y = takeTasksReturn();
  /** Projects the server could not read for the All list (shown as a note). @type {string[]} */
  let skipped = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let rest_timer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let q_timer = null;
  const bulk = createBulk({
    host: el,
    // Real server API when the app has a socket; fixture (preview) in tests.
    transport: ctx.client
      ? (/** @type {string} */ t, /** @type {any} */ p) => ctx.client.send(t, p)
      : undefined,
    redraw: () => draw(),
    all: () => snap('tab:all'),
    visible: () => visibleIds(),
    scope: () => scopeLabel(),
    foreign: (id) => !!otherWorkspace(id)
  });
  const selected = bulk.selected;

  // v3 skips the legacy subscribe step: subscribe here.
  function subscribeAll() {
    for (const id of IDS) {
      try {
        stores.register(id, SPECS[id]);
      } catch {
        // already registered
      }
      void subs
        .subscribeList(id, SPECS[id])
        .then((/** @type {any} */ u) => {
          if (id === 'tab:all') {
            skipped = Array.isArray(u && u.skipped) ? u.skipped : [];
            if (skipped.length) draw();
          }
          // The all-issues list stays on (shared with desk and nav); the
          // others stop when this screen closes, so an idle user costs nothing.
          if (id !== 'tab:all') unsubs.push(u);
        })
        .catch(() => {});
    }
  }
  subscribeAll();
  // The server says which projects it could not read (also when that changes later).
  const onSkipped = (/** @type {any} */ e) => {
    if (!e.detail || e.detail.id !== 'tab:all') return;
    skipped = e.detail.skipped;
    draw();
  };
  window.addEventListener('u3:skipped', onSkipped);
  // main.js restores the saved project after this screen mounted; the server
  // drops every subscription on set-workspace, so ask again.
  const wsPath = () => ctx.store?.getState?.().workspace?.current?.path || '';
  let ws_seen = wsPath();
  const offWs =
    ctx.store && typeof ctx.store.subscribe === 'function'
      ? ctx.store.subscribe(() => {
          const p = wsPath();
          if (!p || p === ws_seen) return;
          const first = !ws_seen;
          ws_seen = p;
          if (first) return;
          unsubs.length = 0;
          // Every list spans all projects, so the cards on screen stay right
          // while the server re-attaches them to the new connection project:
          // keep the stores (no old cards of another project, no empty flash).
          subscribeAll();
          refresh();
        })
      : () => {};

  const snap = (/** @type {string} */ id) => selectors.selectIssuesFor(id);

  /** Every registered project: its id prefix (else folder name) and path. */
  function registered() {
    const ws = (ctx.store && ctx.store.getState().workspace) || {};
    return (ws.available || [])
      .map((/** @type {any} */ w) => {
        const parts = String(w.path || '')
          .split(/[\\/]/)
          .filter(Boolean);
        return {
          key: String(w.prefix || parts[parts.length - 1] || '').toLowerCase(),
          path: String(w.path || '')
        };
      })
      .filter((/** @type {{key:string}} */ w) => w.key);
  }
  /** The registered project of task `id` when it is not the one open now, else null. */
  function otherWorkspace(/** @type {string} */ id) {
    const cur = ctx.store?.getState?.().workspace?.current?.path || '';
    const key = projectOf(id);
    const hit = registered().find(
      (/** @type {{key:string,path:string}} */ w) => w.key === key
    );
    return hit && hit.path !== cur ? hit : null;
  }
  /**
   * A task of another project opens in that project's workspace (its detail
   * is read there): switch like the Projects screen, then show the task.
   */
  async function openInWorkspace(
    /** @type {string} */ path,
    /** @type {string} */ id
  ) {
    try {
      const r = await ctx.client.send('set-workspace', { path });
      if (r && r.workspace) {
        window.localStorage.setItem('beads-ui.workspace', path);
        window.location.hash = '#/issues?issue=' + encodeURIComponent(id);
        if (r.changed) window.location.reload();
      }
    } catch {
      // stays on this project
    }
  }

  function refresh() {
    if (!alive) return;
    // Both lists: the Blocked column is "open + in the blocked list", so with
    // only tab:all in, blocked cards sit in Ready and a Blocked filter reads
    // as empty (beads-lite-1bo5.13.31).
    loaded = Boolean(
      stores.isLoaded &&
      stores.isLoaded('tab:all') &&
      stores.isLoaded('tab:board:blocked')
    );
    model = buildBoard(
      {
        all: snap('tab:all'),
        ready: snap('tab:board:ready'),
        blocked: snap('tab:board:blocked'),
        closed: snap('tab:board:closed')
      },
      filter.get()
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
    if (selCols().length || !phone() || !model) return '';
    const first = COLUMNS.find((c) => (model?.columns[c.id] || []).length);
    return first ? first.id : '';
  }
  /** Board columns picked in the status filter (empty = no status filter). */
  const selCols = () =>
    filter
      .get()
      .status.map((v) => STATUS_COL[v])
      .filter(Boolean);
  /** Columns drawn now: the picked ones, else the phone's one column, else all ([]). */
  function visibleCols() {
    const sel = selCols();
    if (sel.length) return sel;
    const fx = effFocus();
    return fx ? [fx] : [];
  }
  /** Cards on the board after every filter, closed list not counted. */
  function visibleTotal() {
    if (!model) return 0;
    const v = visibleCols();
    const cols = COLUMNS.filter((c) => !v.length || v.includes(c.id)).reduce(
      (n, c) => n + (model?.columns[c.id] || []).length,
      0
    );
    return cols + model.unknown.length;
  }

  /**
   * Ids of the cards drawn right now (filter, search, collapsed lanes, the
   * phone's single column and the closed list only when open). Filled by the
   * render below, so it can never disagree with the screen.
   * @type {string[]}
   */
  let shown = [];
  const visibleIds = () => shown.slice();
  /** Phone only: the column the single-column view shows, for the label. */
  function scopeLabel() {
    const v = phone() && !closed_open ? visibleCols() : [];
    return v.length === 1 ? t3('u3_tk_col_' + v[0]) : '';
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
    const picked = bulk.isSelected(it.id);
    const h = bulk.handlers;
    return html`<a
      class="u3t-card ${picked ? 'is-selected' : ''}"
      data-issue-id=${it.id}
      data-selected=${picked ? '1' : '0'}
      href=${'#/issues?issue=' + encodeURIComponent(it.id)}
      @pointerdown=${(/** @type {PointerEvent} */ e) => h.down(e, it.id)}
      @pointermove=${h.move}
      @pointerup=${h.up}
      @pointercancel=${h.up}
      @pointerleave=${h.up}
      @click=${(/** @type {Event} */ e) => {
        const other = bulk.isMode() ? null : otherWorkspace(it.id);
        if (other) {
          e.preventDefault();
          void openInWorkspace(other.path, it.id);
          return;
        }
        h.click(e, it.id);
      }}
      @contextmenu=${h.context}
    >
      ${bulk.isMode()
        ? html`<span
            class="u3bk-tick"
            role="checkbox"
            aria-checked=${picked ? 'true' : 'false'}
          ></span>`
        : ''}
      <span class="u3t-card__id u3-mono"
        ><span class="u3t-card__proj">${projectOf(it.id)}</span>${it.id.slice(
          projectOf(it.id).length
        )}</span
      >
      <span class="u3t-card__title" dir="auto">${primary}</span>
      ${secondary
        ? html`<span class="u3t-card__sub" dir="auto">${secondary}</span>`
        : ''}
      ${blockers.length
        ? html`<span class="u3t-card__sub u3t-card__waits" dir="auto"
            >${t3('u3_tk_waits').replace(
              '{id}',
              blockers[0].id +
                (blockers.length > 1 ? ' +' + (blockers.length - 1) : '')
            )}</span
          >`
        : ''}
      <span class="u3t-card__foot">
        <span class="u3t-card__ics"
          >${it.issue_type
            ? typeVal(String(it.issue_type), { iconOnly: true })
            : ''}${priorityVal(pri, { iconOnly: true })}</span
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
        ${who ? personChip({ role: who, short: true }) : ''}
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
    for (const it of items.slice(0, take)) shown.push(it.id);
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
   * @param {any[]} unknown
   */
  function board(cols, unknown) {
    const fx = visibleCols();
    const list = COLUMNS.filter((c) => !fx.length || fx.includes(c.id)).map(
      (c) => column(c, cols[c.id] || [])
    );
    return html`${unknownRows(unknown)}
      <div class="u3t-board">${list}</div>`;
  }

  /**
   * A status outside the 8 is an error, never a silent bucket: one visible row
   * per task, naming the task and its status.
   *
   * @param {any[]} unknown
   */
  function unknownRows(unknown) {
    if (!unknown.length) return '';
    return html`<ul
      class="u3t-unknown"
      role="alert"
      data-testid="unknown-status"
    >
      ${unknown.map(
        (it) =>
          html`<li class="u3-chip u3-chip--red">
            <a href=${'#/issues?issue=' + encodeURIComponent(it.id)}
              >${t3('u3_tk_unknown_status')
                .replace('{s}', String(it.status || ''))
                .replace('{id}', it.id)}</a
            >
          </li>`
      )}
    </ul>`;
  }

  function laneName(/** @type {any} */ g) {
    if (g.label && group_by === 'assignee') return personLabel(g.label).full;
    return g.label || t3('u3_tk_lane_' + (g.kind || 'none'));
  }

  function lanes() {
    const m = /** @type {NonNullable<typeof model>} */ (model);
    const sel = selCols();
    const everything = [
      ...COLUMNS.filter((c) => !sel.length || sel.includes(c.id)).flatMap(
        (c) => m.columns[c.id] || []
      ),
      ...m.unknown
    ];
    const ready_ids = new Set(
      snap('tab:board:ready').map((/** @type {any} */ i) => i.id)
    );
    const blocked_ids = new Set(
      snap('tab:board:blocked').map((/** @type {any} */ i) => i.id)
    );
    const groups = groupIssues(everything, group_by, {
      all: m.facetItems,
      ready_ids,
      blocked_ids
    });
    if (group_by === 'none') {
      return board(m.columns, m.unknown);
    }
    return html`${groups.map((g) => {
      const id = group_by + ':' + g.key;
      const shut = collapsed.has(id);
      const s = /** @type {NonNullable<typeof g.s>} */ (g.s);
      return html`<section
        class="u3t-lane"
        data-lane=${g.key}
        data-collapsed=${shut ? '1' : '0'}
      >
        <h2 class="u3t-lane__head">
          <button
            type="button"
            class="u3t-lane__btn"
            aria-expanded=${shut ? 'false' : 'true'}
            @click=${() => {
              if (shut) collapsed.delete(id);
              else collapsed.add(id);
              saveCollapsed(collapsed);
              draw();
            }}
          >
            <span class="u3t-lane__chev" aria-hidden="true"></span>
            <span
              class="u3t-lane__name"
              dir=${group_by === 'assignee' ? uiDir() : 'auto'}
              >${group_by === 'project' && g.label
                ? projectLabel(g.label)
                : laneName(g)}</span
            >
            <span class="u3-chip">${g.issues.length}</span>
          </button>
          <span class="u3t-lane__counts">
            ${g.owner
              ? html`<button
                  type="button"
                  class="u3-chip u3-chip--amber u3t-lane__stat"
                  data-lane-status="owner_decision"
                  @click=${() => laneStatus('owner_decision', id, g.key)}
                >
                  ${t3('u3_tk_col_owner')} ${g.owner}
                </button>`
              : ''}
            ${g.blocked
              ? html`<button
                  type="button"
                  class="u3-chip u3-chip--red u3t-lane__stat"
                  data-lane-status="blocked"
                  @click=${() => laneStatus('blocked', id, g.key)}
                >
                  ${t3('u3_tk_col_blocked')} ${g.blocked}
                </button>`
              : ''}
            ${g.progress
              ? html`<button
                  type="button"
                  class="u3-chip u3-chip--blue u3t-lane__stat"
                  data-lane-status="in_progress"
                  @click=${() => laneStatus('in_progress', id, g.key)}
                >
                  ${t3('u3_tk_col_progress')} ${g.progress}
                </button>`
              : ''}
          </span>
          ${bulk.isMode()
            ? html`<button
                type="button"
                class="u3-btn u3-btn--ghost u3bk-lane-all"
                data-testid="bulk-lane-all"
                @click=${() =>
                  bulk.selectMany(g.issues.map((/** @type {any} */ i) => i.id))}
              >
                ${t3('u3_bk_lane_all')}
              </button>`
            : ''}
        </h2>
        ${shut ? '' : board(s.columns, s.unknown)}
      </section>`;
    })}`;
  }

  /**
   * A count chip on a lane header: open that lane, filtered to that status
   * (beads-lite-1bo5.13.18).
   *
   * @param {string} status
   * @param {string} lane_id
   * @param {string} key
   */
  function laneStatus(status, lane_id, key) {
    collapsed.delete(lane_id);
    saveCollapsed(collapsed);
    filter.set({ status: [status] });
    setTimeout(() => {
      /** @type {HTMLElement | null} */ (
        [...el.querySelectorAll('.u3t-lane')].find(
          (n) => n.getAttribute('data-lane') === key
        ) || null
      )?.scrollIntoView?.({ block: 'start' });
    }, 0);
  }

  function groupBar() {
    return html`<div
      class="u3t-group"
      role="group"
      aria-label=${t3('u3_tk_group')}
    >
      <span class="u3t-group__l">${t3('u3_tk_group')}</span>
      ${GROUPS.map(
        (g) =>
          html`<button
            type="button"
            class="u3t-group__b"
            data-group-by=${g}
            aria-pressed=${group_by === g ? 'true' : 'false'}
            @click=${() => {
              group_by = /** @type {import('../tasks/lanes.js').GroupBy} */ (g);
              saveGroup(group_by);
              draw();
            }}
          >
            ${t3('u3_tk_group_' + g)}
          </button>`
      )}
    </div>`;
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
    for (const it of slice) shown.push(it.id);
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

  /** Add or remove one value of one dimension. */
  function toggleValue(/** @type {string} */ dim, /** @type {string} */ v) {
    const cur = /** @type {string[]} */ (
      /** @type {any} */ (filter.get())[dim]
    );
    filter.set({
      [dim]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    });
  }
  const clearDim = (/** @type {string} */ dim) => filter.set({ [dim]: [] });
  function clearAll() {
    open_menu = null;
    filter.set({
      ...Object.fromEntries(DIMS.map((d) => [d, []])),
      search: ''
    });
  }

  /** Open issues of the loaded slice (the facets and the counts read these). */
  const openItems = () =>
    (model ? model.facetItems : []).filter((i) => i.status !== 'closed');

  /** Every sheet section: its options with labels, icons and counts. */
  function sheetSections() {
    const all = model ? model.facetItems : [];
    const items = openItems();
    const f = filter.get();
    const ready_ids = new Set(
      snap('tab:board:ready').map((/** @type {any} */ i) => i.id)
    );
    const blocked_ids = new Set(
      snap('tab:board:blocked').map((/** @type {any} */ i) => i.id)
    );
    const st = statusMap(items, ready_ids, blocked_ids);
    const ctx = {
      ...filterCtx(all),
      status: (/** @type {any} */ it) => st.get(it.id) || ''
    };
    const by_id = new Map(all.map((/** @type {any} */ i) => [i.id, i]));
    const names = new Map(
      facets(items).assignees.map((a) => [a.toLowerCase(), a])
    );
    /** @type {Record<string, string>} */
    const status_icon = {
      owner: 's_decide',
      progress: 's_prog',
      test: 's_test',
      merge: 's_merge',
      ready: 's_open',
      blocked: 's_block',
      deferred: 's_defer'
    };
    /** @type {Record<string, (v: string) => { label: string, icon?: string, project?: string }>} */
    const look = {
      status: (v) => ({
        label: t3('u3_tk_col_' + STATUS_COL[v]),
        icon: status_icon[STATUS_COL[v]]
      }),
      assignee: (v) =>
        v === '-'
          ? { label: t3('u3_tk_unassigned'), icon: 'nobody' }
          : { label: personLabel(names.get(v) || v).full, icon: 'mine' },
      prio: (v) => ({
        label: priorityName(Number(v)),
        icon: priorityIconName(Number(v))
      }),
      type: (v) => ({ label: v, icon: typeIconName(v) }),
      label: (v) => ({ label: v, icon: 'label' }),
      epic: (v) =>
        v === '-'
          ? { label: t3('u3_tk_lane_noepic'), icon: 'epic' }
          : { label: String(by_id.get(v)?.title || v), icon: 'epic' },
      project: (v) => ({ label: v, icon: 'project', project: v })
    };
    return DIMS.map((dim) => ({
      dim,
      title: t3('u3_tk_' + dim),
      options: dimCounts(items, f, dim, ctx).map((o) => ({
        ...look[dim](o.value),
        value: o.value,
        count: o.count
      }))
    }));
  }

  /** Display text of one value, for the removable chips. */
  function valueLabel(/** @type {string} */ dim, /** @type {string} */ v) {
    if (dim === 'status') return t3('u3_tk_col_' + STATUS_COL[v]);
    if (dim === 'assignee') {
      return v === '-' ? t3('u3_tk_unassigned') : personLabel(v).name;
    }
    if (dim === 'prio') return priorityName(Number(v));
    if (dim === 'epic') {
      if (v === '-') return t3('u3_tk_lane_noepic');
      const e = (model ? model.facetItems : []).find(
        (/** @type {any} */ i) => i.id === v
      );
      return String(e?.title || v);
    }
    return v;
  }

  function openSheet(
    /** @type {string} */ dim,
    /** @type {HTMLElement} */ btn
  ) {
    const r = btn.getBoundingClientRect();
    sheet = { left: Math.round(r.left), top: Math.round(r.bottom) };
    open_menu = null;
    if (dim) sheet_open.add(dim);
    focus_to = 'sheet';
    draw();
  }
  function closeSheet() {
    if (!sheet) return;
    sheet = null;
    focus_to = 'filters';
    draw();
  }

  /** One removable chip per active dimension: body opens it, the x clears it. */
  function activeChips() {
    const f = filter.get();
    const chips = DIMS.filter((d) => /** @type {any} */ (f)[d].length).map(
      (d) => {
        const vals = /** @type {string[]} */ (/** @type {any} */ (f)[d]);
        const text =
          t3('u3_tk_' + d) +
          ': ' +
          valueLabel(d, vals[0]) +
          (vals.length > 1 ? ` +${vals.length - 1}` : '');
        return html`<span class="u3t-ac" data-dim=${d}>
          <button
            type="button"
            class="u3t-ac__b"
            @click=${(/** @type {Event} */ e) =>
              openSheet(d, /** @type {HTMLElement} */ (e.currentTarget))}
          >
            ${text}
          </button>
          <button
            type="button"
            class="u3t-ac__x"
            data-remove=${d}
            aria-label=${t3('u3_tk_remove') + ': ' + t3('u3_tk_' + d)}
            @click=${() => clearDim(d)}
          >
            ${icon('a_close', { size: 14 })}
          </button>
        </span>`;
      }
    );
    if (!chips.length) return '';
    return html`<div
      class="u3t-active"
      role="toolbar"
      aria-label=${t3('u3_tk_filters')}
    >
      ${chips}
      <button
        type="button"
        class="u3t-fchip u3t-fchip--clear"
        data-testid="chips-clear-all"
        @click=${clearAll}
      >
        ${t3('u3_tk_clear_all')}
      </button>
    </div>`;
  }

  function toolbar() {
    const f = filter.get();
    const mine = me.toLowerCase();
    const urgent = f.prio.includes('0') && f.prio.includes('1');
    const n_active = DIMS.filter(
      (d) => /** @type {any} */ (f)[d].length
    ).length;
    /**
     * @param {string} key
     * @param {boolean} on
     * @param {() => void} fn
     * @param {string} ic
     */
    const quick = (key, on, fn, ic) =>
      html`<button
        type="button"
        class="u3t-fchip"
        data-quick=${key}
        aria-pressed=${on ? 'true' : 'false'}
        @click=${fn}
      >
        ${icon(ic, { size: 16 })}${t3(key)}
      </button>`;
    const projectMenu = filterMenu({
      name: 'project',
      icon: 'project',
      title: t3('u3_tk_project'),
      any: t3('u3_tk_all'),
      options: [
        ...new Set([
          ...registered().map((/** @type {{key:string}} */ w) => w.key),
          ...(model ? model.facetItems : []).map((i) => projectOf(i.id)),
          ...f.project
        ])
      ]
        .sort()
        .map((v) => ({ value: v, label: v, icon: 'project', project: v })),
      selected: f.project,
      multi: true,
      open: open_menu,
      setOpen: (o) => {
        open_menu = o;
        focus_to = o ? 'opt' : 'project';
        draw();
      },
      pick: (v) => (v ? toggleValue('project', v) : clearDim('project'))
    });
    return html`<div class="u3t-bar">
        ${groupBar()}
        <button
          type="button"
          class="u3-btn u3-btn--primary u3t-new"
          @click=${() => openNewTask(el.closest('.u3') || el, ctx)}
        >
          + ${t3('u3_nt_new')}
        </button>
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
        <button
          type="button"
          class="u3t-fbtn"
          data-testid="filters-btn"
          aria-haspopup="dialog"
          aria-expanded=${sheet ? 'true' : 'false'}
          data-on=${n_active ? '1' : '0'}
          @click=${(/** @type {Event} */ e) =>
            sheet
              ? closeSheet()
              : openSheet('', /** @type {HTMLElement} */ (e.currentTarget))}
        >
          ${icon('f_filter', { size: 16 })}<span>${t3(
            'u3_tk_filters'
          )}</span>${n_active
            ? html`<b class="u3t-fbtn__n">${n_active}</b>`
            : ''}
        </button>
        <div class="u3t-filters" role="group" aria-label=${t3('u3_tk_filters')}>
          ${quick(
            'u3_tk_mine',
            f.assignee.includes(mine),
            () => toggleValue('assignee', mine),
            'mine'
          )}
          ${quick(
            'u3_tk_p01',
            urgent,
            () =>
              filter.set({
                prio: urgent
                  ? f.prio.filter((p) => p !== '0' && p !== '1')
                  : [...new Set([...f.prio, '0', '1'])]
              }),
            'urgent'
          )}
          ${projectMenu} ${bulk.enterButton()}
        </div>
      </div>
      ${activeChips()}
      ${skipped.length
        ? html`<p class="u3t-note u3-muted" role="status">
            ${t3('u3_tk_skipped')} ${skipped.join(', ')}
          </p>`
        : ''}
      <div class="u3t-stat" role="group" aria-label=${t3('u3_tasks')}>
        ${COLUMNS.map((c) => {
          const n = model ? (model.columns[c.id] || []).length : 0;
          const on = f.status.includes(COL_STATUS[c.id]);
          return html`<button
            type="button"
            class="u3t-stat__chip u3t-stat__chip--${c.id}"
            aria-pressed=${on ? 'true' : 'false'}
            data-shown=${!on && effFocus() === c.id ? '1' : '0'}
            @click=${() => toggleValue('status', COL_STATUS[c.id])}
          >
            <span class="u3t-stat__n">${loaded ? n : ''}</span>
            <span class="u3t-stat__l">${colLabel(c)}</span>
          </button>`;
        })}
      </div>
      ${sheet
        ? filterSheet({
            sections: sheetSections(),
            selected: /** @type {any} */ (f),
            expanded: sheet_open,
            find: sheet_find,
            anchor: sheet,
            toggle: toggleValue,
            clearDim,
            clearAll,
            toggleSection: (d) => {
              if (sheet_open.has(d)) sheet_open.delete(d);
              else sheet_open.add(d);
              draw();
            },
            setFind: (d, q) => {
              sheet_find[d] = q;
              draw();
            },
            close: closeSheet
          })
        : ''}`;
  }

  /** No card matches: say so, show what is on, one tap to clear. */
  function emptyState() {
    return html`<div class="u3t-nomatch" role="status" data-testid="no-match">
      <h2 class="u3t-nomatch__h">${t3('u3_tk_no_match')}</h2>
      <button
        type="button"
        class="u3-btn u3-btn--primary"
        data-testid="no-match-clear"
        @click=${clearAll}
      >
        ${t3('u3_tk_no_match_btn')}
      </button>
    </div>`;
  }

  function paint() {
    shown = [];
    render(
      html`<section class="u3t" data-view="tasks" data-group=${group_by}>
        ${toolbar()}
        ${loaded && model
          ? html`${visibleTotal() === 0 && isFiltering(filter.get())
              ? emptyState()
              : lanes()}${closedBlock()}`
          : html`<div
              class="u3t-skel"
              aria-label=${t3('u3_tk_loading')}
            ></div>`}
        ${renderBulkBar(selected, { ...ctx, bulk })}
      </section>`,
      el
    );
    placePopover();
  }

  /** Keep the open popover inside the screen, then hand focus where it belongs. */
  function placePopover() {
    const pop = /** @type {HTMLElement | null} */ (
      el.querySelector('.u3t-pop')
    );
    if (pop && open_menu) {
      const w = pop.getBoundingClientRect().width;
      const left = Math.max(
        8,
        Math.min(open_menu.left, window.innerWidth - w - 8)
      );
      pop.style.left = left + 'px';
    }
    const sh = /** @type {HTMLElement | null} */ (el.querySelector('.u3t-sh'));
    if (sh && sheet && !phone()) {
      const w = sh.getBoundingClientRect().width;
      sh.style.left =
        Math.max(8, Math.min(sheet.left, window.innerWidth - w - 8)) + 'px';
    }
    if (!focus_to) return;
    const t = focus_to;
    focus_to = '';
    const target =
      t === 'sheet'
        ? el.querySelector('.u3t-sh__hb')
        : t === 'filters'
          ? el.querySelector('[data-testid="filters-btn"]')
          : t === 'opt'
            ? el.querySelector(
                '.u3t-opt[aria-selected="true"]:not([data-v=""])'
              ) || el.querySelector('.u3t-opt')
            : el.querySelector(`.u3t-menu[data-name="${t}"]`);
    /** @type {HTMLElement | null} */ (target)?.focus();
  }

  /** After the full list is drawn, go back to where the reader was (once). */
  function restoreScroll() {
    if (!return_y || !loaded || !first_paint_done) return;
    const y = return_y;
    return_y = 0;
    // Next frame: the router scrolls to the top right after mounting.
    requestAnimationFrame(() => {
      if (alive) window.scrollTo(0, y);
    });
  }

  function draw() {
    if (!alive) return;
    if (rest_timer) {
      clearTimeout(rest_timer);
      rest_timer = null;
    }
    const total = model
      ? Object.values(model.columns).reduce((n, c) => n + c.length, 0) +
        model.unknown.length
      : 0;
    const trim = !first_paint_done;
    budget = trim ? FIRST_PAINT_CARDS : Infinity;
    paint();
    if (trim && loaded) {
      if (total <= FIRST_PAINT_CARDS) {
        first_paint_done = true;
        restoreScroll();
      } else {
        // The rest of the cards, once the first screen is on the glass.
        rest_timer = setTimeout(() => {
          rest_timer = null;
          first_paint_done = true;
          budget = Infinity;
          paint();
          restoreScroll();
        }, 0);
      }
    }
  }

  const offF = filter.subscribe(() => {
    remember();
    refresh();
  });
  // a tap outside or Escape closes the open filter popover
  const onDoc = (/** @type {Event} */ ev) => {
    if (sheet && ev.type === 'keydown') {
      const k = /** @type {KeyboardEvent} */ (ev);
      if (k.key === 'Escape') {
        closeSheet();
        return;
      }
      if (k.key === 'Tab') {
        // focus trap: Tab cycles inside the dialog
        const box = el.querySelector('.u3t-sh');
        const list = /** @type {HTMLElement[]} */ ([
          ...(box ? box.querySelectorAll('button, input') : [])
        ]);
        if (list.length) {
          const at = list.indexOf(
            /** @type {HTMLElement} */ (document.activeElement)
          );
          const next = k.shiftKey
            ? at <= 0
              ? list.length - 1
              : at - 1
            : at < 0 || at === list.length - 1
              ? 0
              : at + 1;
          k.preventDefault();
          list[next].focus();
        }
        return;
      }
    }
    if (!open_menu) return;
    if (
      ev.type === 'keydown'
        ? /** @type {KeyboardEvent} */ (ev).key !== 'Escape'
        : /** @type {HTMLElement} */ (ev.target).closest?.('.u3t-menu-w')
    ) {
      return;
    }
    if (ev.type === 'keydown') focus_to = open_menu.name;
    open_menu = null;
    draw();
  };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onDoc);
  const offS = selectors.subscribe(() => refresh(), IDS);
  const onLang = () => draw();
  window.addEventListener('bdui-lang', onLang);
  refresh();

  return {
    unmount() {
      alive = false;
      if (rest_timer) clearTimeout(rest_timer);
      if (q_timer) clearTimeout(q_timer);
      bulk.destroy();
      offF();
      if (typeof offWs === 'function') offWs();
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onDoc);
      if (typeof offS === 'function') offS();
      window.removeEventListener('bdui-lang', onLang);
      window.removeEventListener('u3:skipped', onSkipped);
      for (const u of unsubs) void u().catch(() => {});
      for (const id of IDS) if (id !== 'tab:all') stores.unregister?.(id);
      render(html``, el);
    }
  };
}
