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
import { personLabel, uiDir } from '../data/people.js';
import { t3 } from '../i18n.js';
import { personChip } from '../people/person-chip.js';
import { createBulk, renderBulkBar } from '../tasks/bulk.js';
import { chipIcon, typeIconName } from '../tasks/chip-icons.js';
import { filterMenu } from '../tasks/filter-menu.js';
import {
  GROUPS,
  groupIssues,
  loadCollapsed,
  loadGroup,
  projectOf,
  saveCollapsed,
  saveGroup
} from '../tasks/lanes.js';
import { CLOSED_PAGE, FIRST_PAINT_CARDS, buildBoard } from '../tasks/model.js';
import { loadSaved, save } from '../tasks/saved-filters.js';
import { openNewTask } from './new-task.js';

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
  // Project filter (several allowed) and the open filter popover live here;
  // the last chosen filters come back from this device's saved copy.
  /** @type {string[]} */
  let projects = [];
  /** @type {import('../tasks/filter-menu.js').Open | null} */
  let open_menu = null;
  /** @type {'' | 'opt' | string} focus target after the next paint: 'opt' or a menu name */
  let focus_to = '';
  {
    const sv = loadSaved();
    const f0 = filter.get();
    projects = sv.projects;
    filter.set({
      chip: f0.chip === 'all' ? /** @type {any} */ (sv.chip) : f0.chip,
      type: f0.type || sv.type,
      label: f0.label || sv.label,
      assignee: f0.assignee || sv.assignee,
      prio: f0.prio || sv.prio
    });
  }
  function remember() {
    const f = filter.get();
    save({
      chip: f.chip,
      type: f.type,
      label: f.label,
      assignee: f.assignee,
      prio: f.prio,
      projects
    });
  }
  /** @type {Array<() => Promise<void>>} */
  const unsubs = [];
  let alive = true;
  let model = /** @type {ReturnType<typeof buildBoard>|null} */ (null);
  let loaded = false;
  let focus = ''; // '' = every column, else a column id
  let closed_open = false;
  let closed_shown = CLOSED_PAGE;
  /** @type {'none'|'project'|'assignee'|'epic'} */
  let group_by = loadGroup();
  const collapsed = loadCollapsed();
  let budget = Infinity;
  let first_paint_done = false;
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
    scope: () => scopeLabel()
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
        .then((/** @type {() => Promise<void>} */ u) => {
          // The all-issues list stays on (shared with desk and nav); the
          // others stop when this screen closes, so an idle user costs nothing.
          if (id !== 'tab:all') unsubs.push(u);
        })
        .catch(() => {});
    }
  }
  subscribeAll();
  // main.js restores the saved project after this screen mounted; the server
  // drops every subscription on set-workspace, so ask again for the new
  // project, from empty stores (no cards of the old project left over).
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
          for (const id of IDS) {
            try {
              stores.unregister(id);
            } catch {
              // not registered
            }
          }
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
  /** The registered project `key` when it is not the one open now, else null. */
  function otherWorkspace(/** @type {string} */ key) {
    const cur = ctx.store.getState().workspace?.current?.path || '';
    const hit = registered().find(
      (/** @type {{key:string,path:string}} */ w) => w.key === key
    );
    const seen = (model ? model.facetItems : []).some(
      (i) => projectOf(i.id) === key
    );
    return hit && hit.path !== cur && !seen ? hit : null;
  }
  /** Another project's tasks live in its own workspace: switch, like the Projects screen. */
  async function switchWorkspace(/** @type {string} */ path) {
    try {
      const r = await ctx.client.send('set-workspace', { path });
      if (r && r.workspace) {
        window.localStorage.setItem('beads-ui.workspace', path);
        // the picked project's own tasks show; a saved project filter of the old one would hide them
        projects = [];
        remember();
        if (r.changed) window.location.reload();
      }
    } catch {
      // stays on this project
    }
  }

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
      { ...filter.get(), projects },
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
    const fx = phone() && !closed_open ? effFocus() : '';
    return fx ? t3('u3_tk_col_' + fx) : '';
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
      @click=${(/** @type {Event} */ e) => h.click(e, it.id)}
      @contextmenu=${h.context}
    >
      ${bulk.isMode()
        ? html`<span
            class="u3bk-tick"
            role="checkbox"
            aria-checked=${picked ? 'true' : 'false'}
          ></span>`
        : ''}
      <span class="u3t-card__id u3-mono">${it.id}</span>
      <span class="u3t-card__title" dir="auto">${primary}</span>
      ${secondary
        ? html`<span class="u3t-card__sub" dir="auto">${secondary}</span>`
        : ''}
      <span class="u3t-card__foot">
        <span class="u3-chip u3-chip--${pri <= 1 ? 'red' : 'neutral'}"
          >${priorityName(pri)}</span
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

  function laneName(/** @type {any} */ g) {
    if (g.label && group_by === 'assignee') return personLabel(g.label).full;
    return g.label || t3('u3_tk_lane_' + (g.kind || 'none'));
  }

  function lanes() {
    const m = /** @type {NonNullable<typeof model>} */ (model);
    const everything = [...Object.values(m.columns).flat(), ...m.other];
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
      return board(m.columns, m.other);
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
              >${laneName(g)}</span
            >
            <span class="u3-chip">${g.issues.length}</span>
          </button>
          <span class="u3t-lane__counts">
            ${g.owner
              ? html`<span class="u3-chip u3-chip--amber"
                  >${t3('u3_tk_col_owner')} ${g.owner}</span
                >`
              : ''}
            ${g.blocked
              ? html`<span class="u3-chip u3-chip--red"
                  >${t3('u3_tk_col_blocked')} ${g.blocked}</span
                >`
              : ''}
            ${g.progress
              ? html`<span class="u3-chip u3-chip--blue"
                  >${t3('u3_tk_col_progress')} ${g.progress}</span
                >`
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
        ${shut ? '' : board(s.columns, s.other)}
      </section>`;
    })}`;
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

  function toolbar() {
    const f = filter.get();
    const fc = facets(model ? model.facetItems : []);
    /**
     * @param {string} key
     * @param {string} v
     */
    const quick = (key, v, ic = v) =>
      html`<button
        type="button"
        class="u3t-fchip"
        aria-pressed=${f.chip === v ? 'true' : 'false'}
        @click=${() =>
          filter.set({ chip: f.chip === v ? 'all' : /** @type {any} */ (v) })}
      >
        ${chipIcon(ic)}${t3(key)}
      </button>`;
    /**
     * @param {'type'|'label'|'assignee'|'prio'|'project'} name
     * @param {import('../tasks/filter-menu.js').Opt[]} options
     */
    const menu = (name, options) =>
      filterMenu({
        name,
        icon: name,
        title: t3('u3_tk_' + name),
        any: t3('u3_tk_any'),
        options,
        selected: name === 'project' ? projects : f[name] ? [f[name]] : [],
        multi: name === 'project',
        open: open_menu,
        setOpen: (o) => {
          open_menu = o;
          focus_to = o ? 'opt' : name;
          draw();
        },
        pick: (v) => {
          if (name === 'project') {
            const other = v ? otherWorkspace(v) : null;
            if (other) {
              void switchWorkspace(other.path);
              return;
            }
            projects = !v
              ? []
              : projects.includes(v)
                ? projects.filter((x) => x !== v)
                : [...projects, v];
            remember();
            refresh();
            return;
          }
          open_menu = null;
          focus_to = name;
          filter.set({ [name]: f[name] === v ? '' : v });
        }
      });
    const pris = ['0', '1', '2', '3', '4'];
    const menus = html`${menu(
      'type',
      fc.types.map((v) => ({ value: v, label: v, icon: typeIconName(v) }))
    )}
    ${menu(
      'label',
      fc.labels.map((v) => ({ value: v, label: v, icon: 'label' }))
    )}
    ${menu('assignee', [
      { value: '-', label: t3('u3_tk_unassigned'), icon: 'nobody' },
      ...fc.assignees.map((v) => ({
        value: v,
        label: personLabel(v).full,
        icon: 'mine'
      }))
    ])}
    ${menu(
      'prio',
      pris.map((v) => ({
        value: v,
        label: priorityName(Number(v)),
        icon: 'prio',
        tone: 'u3t-ic--p' + v
      }))
    )}
    ${menu(
      'project',
      [
        ...new Set([
          ...registered().map((/** @type {{key:string}} */ w) => w.key),
          ...(model ? model.facetItems : []).map((i) => projectOf(i.id)),
          ...projects
        ])
      ]
        .sort()
        .map((v) => ({ value: v, label: v, icon: 'project' }))
    )}`;
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
        <div class="u3t-filters" role="group" aria-label=${t3('u3_tk_filters')}>
          ${bulk.enterButton()} ${quick('u3_tk_mine', 'mine')}
          ${quick('u3_tk_p01', 'p01', 'urgent')}
          ${quick('u3_tk_decision', 'decision')}
          ${quick('u3_tk_blocked', 'blocked')} ${menus}
          ${isFiltering(f) || projects.length
            ? html`<button
                type="button"
                class="u3t-fchip u3t-fchip--clear"
                @click=${() => {
                  projects = [];
                  open_menu = null;
                  filter.set({
                    chip: 'all',
                    type: '',
                    label: '',
                    assignee: '',
                    prio: '',
                    search: ''
                  });
                  remember();
                  refresh();
                }}
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
              focus = focus === c.id ? '' : c.id;
              draw();
            }}
          >
            <span class="u3t-stat__n">${loaded ? n : ''}</span>
            <span class="u3t-stat__l">${colLabel(c)}</span>
          </button>`;
        })}
        ${phone() && model && model.other.length
          ? html`<button
              type="button"
              class="u3t-stat__chip u3t-stat__chip--other"
              aria-pressed=${effFocus() === 'other' ? 'true' : 'false'}
              @click=${() => {
                focus = focus === 'other' ? '' : 'other';
                draw();
              }}
            >
              <span class="u3t-stat__n">${model.other.length}</span>
              <span class="u3t-stat__l">${colLabel(OTHER_COLUMN)}</span>
            </button>`
          : ''}
      </div>`;
  }

  function paint() {
    shown = [];
    render(
      html`<section class="u3t" data-view="tasks" data-group=${group_by}>
        ${toolbar()}
        ${loaded && model
          ? html`${lanes()}${closedBlock()}`
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
    if (!focus_to) return;
    const t = focus_to;
    focus_to = '';
    const target =
      t === 'opt'
        ? el.querySelector('.u3t-opt[aria-selected="true"]:not([data-v=""])') ||
          el.querySelector('.u3t-opt')
        : el.querySelector(`.u3t-menu[data-name="${t}"]`);
    /** @type {HTMLElement | null} */ (target)?.focus();
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

  const offF = filter.subscribe(() => {
    remember();
    refresh();
  });
  // a tap outside or Escape closes the open filter popover
  const onDoc = (/** @type {Event} */ ev) => {
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
      for (const u of unsubs) void u().catch(() => {});
      for (const id of IDS) if (id !== 'tab:all') stores.unregister?.(id);
      render(html``, el);
    }
  };
}
