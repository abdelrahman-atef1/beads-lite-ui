/**
 * Board view (design/README.md): the owner's column first, one column per
 * status, closed as a bounded rail, a skeleton until data has arrived, Arabic
 * titles first. Push-only: derives everything from per-subscription stores.
 *
 * Sources (contract board-data.md): `tab:all` (every non-closed issue, split
 * here by status), `tab:board:ready` (`bd ready`), `tab:board:blocked`
 * (`bd blocked`), `tab:board:closed` (newest closed, shown 50 at a time).
 */
import { createPriorityBadge } from '../utils/priority-badge.js';
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, cmpPriorityThenCreated } from '../data/sort.js';
import {
  currentUser,
  facets,
  isFiltering,
  matchesFilter,
  stallHoursFromQuery
} from '../utils/board-filter.js';
import {
  CLOSED_COLUMN,
  COLUMNS,
  OTHER_COLUMN,
  ageLabel,
  displayTitle,
  splitColumns
} from '../utils/board-model.js';
import { getLang, t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';

/** Client ids the board listens to. */
export const BOARD_CLIENT_IDS = [
  'tab:all',
  'tab:board:ready',
  'tab:board:blocked',
  'tab:board:closed'
];

const CLOSED_PAGE = 50;

/**
 * @param {HTMLElement} mount_element
 * @param {unknown} _data - Unused (legacy param retained for call-compat)
 * @param {(id: string) => void} gotoIssue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void }} [_store]
 * @param {unknown} [_subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], isLoaded?: (client_id: string) => boolean, subscribe?: (fn: (client_id?: string) => void) => () => void, subscribeFor?: (client_ids: string | string[], fn: (client_id: string) => void) => () => void }} [issueStores]
 * @param {{ get: () => any, set: (p: any) => void, subscribe: (fn: () => void) => () => void }} [filter] - shared chips/search state
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(
  mount_element,
  _data,
  gotoIssue,
  _store,
  _subscriptions,
  issueStores = undefined,
  filter = undefined
) {
  const log = debug('views:board');
  const selectors = issueStores ? createListSelectors(issueStores) : null;

  /** @type {Record<string, any[]>} */
  let columns = {};
  /** @type {any[]} */
  let other = [];
  /** @type {any[]} */
  let closed = [];
  let loaded = false;
  /** Unfiltered slice, for the Type and Label menus. */
  let facet_items = /** @type {any[]} */ ([]);
  let closed_open = false;
  let closed_shown = CLOSED_PAGE;

  /**
   * @param {any} it
   * @param {{ id: string, color: string }} col
   */
  function cardTemplate(it, col) {
    const { primary, secondary } = displayTitle(it);
    const pri = typeof it.priority === 'number' ? it.priority : 2;
    const who = String(it.assignee || '').trim();
    const age = ageLabel(it.updated_at);
    const claimed_ms = Date.parse(String(it.claimed_at || ''));
    const claimed = Number.isFinite(claimed_ms) ? ageLabel(claimed_ms) : '';
    const blockers = Array.isArray(it.blocked_by_detail)
      ? it.blocked_by_detail
      : [];
    return html`
      <a
        class="card"
        data-issue-id=${it.id}
        href=${'#/issues?issue=' + encodeURIComponent(it.id)}
        @click=${(/** @type {MouseEvent} */ ev) => onCardClick(ev, it.id)}
      >
        <div class="card__title" dir="auto">${primary}</div>
        ${secondary ? html`<div class="card__title2">${secondary}</div>` : ''}
        <div class="card__meta">
          <span class="card__id">${it.id}</span>
          <span class="card__pri">${createPriorityBadge(pri)}</span>
          ${col.id === 'blocked'
            ? html`<span class="tag tag--blocked">${t('blocked_tag')}</span>`
            : ''}
          ${isStalled(it)
            ? html`<span class="tag tag--stalled">${t('stalled_tag')}</span>`
            : ''}
          ${it.unblocks > 0
            ? html`<span class="tag tag--unblocks"
                >${t('unblocks_n')} ${it.unblocks}</span
              >`
            : ''}
          <span class="card__age">${age}</span>
          ${who
            ? html`<span class="avatar" title=${who} aria-label=${who}
                >${who.slice(0, 2).toUpperCase()}</span
              >`
            : ''}
        </div>
        ${who && claimed
          ? html`<div class="card__claim">
              ${who} · ${t('claimed')} ${claimed}
            </div>`
          : ''}
        ${blockers.length > 0
          ? html`<div class="card__blockers">
              ${t('blocked_by')}
              ${blockers.map(
                (/** @type {any} */ b, /** @type {number} */ i) =>
                  html`${i ? ', ' : ''}<span
                      class="blocker"
                      data-blocker=${b.id}
                      >${b.id}${b.assignee ? ` (${b.assignee})` : ''}</span
                    >`
              )}
            </div>`
          : ''}
      </a>
    `;
  }

  /**
   * Stalled: the server's flag, unless the URL sets its own threshold
   * (`?stall=N` hours), which is recomputed here from `updated_at`.
   *
   * @param {any} it
   */
  function isStalled(it) {
    const qs = window.location.search;
    if (!/[?&]stall=/.test(qs)) {
      return Boolean(it.stalled);
    }
    return (
      it.status === 'in_progress' &&
      Number.isFinite(it.updated_at) &&
      Date.now() - it.updated_at > stallHoursFromQuery(qs) * 3_600_000
    );
  }

  /** One line: how many are stalled, and which bead unblocks the most. */
  function insightsTemplate() {
    if (!loaded) {
      return html``;
    }
    const items = facet_items;
    const stalled = items.filter(isStalled).length;
    let top = null;
    for (const it of items) {
      if (it && it.unblocks > 0 && (!top || it.unblocks > top.unblocks)) {
        top = it;
      }
    }
    if (!stalled && !top) {
      return html``;
    }
    return html`<div class="insights" id="board-insights">
      ${stalled
        ? html`<span class="insights__stalled"
            >${stalled} ${t('stalled_n')}</span
          >`
        : ''}
      ${top
        ? html`<span class="insights__top"
            >${t('top_unblocker')}:
            <a
              href=${'#/issues?issue=' + encodeURIComponent(top.id)}
              @click=${(/** @type {MouseEvent} */ ev) =>
                onCardClick(ev, top.id)}
              >${top.id}</a
            >
            (${top.unblocks})</span
          >`
        : ''}
    </div>`;
  }

  /**
   * Keep plain-click navigation in the SPA (no full reload) but let the
   * browser handle ctrl/middle click so a card still opens in a new tab.
   *
   * @param {MouseEvent} ev
   * @param {string} id
   */
  function onCardClick(ev, id) {
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    gotoIssue(id);
  }

  /**
   * @param {{ id: string, glyph: string, color: string, en: string, ar: string }} col
   * @param {any[]} items
   */
  function columnTemplate(col, items) {
    const label = getLang() === 'ar' ? col.ar : col.en;
    const attn = col.id === 'owner' && items.length > 0;
    const collapsed = loaded && items.length === 0 && filtering();
    const count_label = `${items.length} ${t('issues_n')}`;
    return html`
      <section
        class="col ${attn ? 'col--attn' : ''} ${collapsed
          ? 'col--collapsed'
          : ''}"
        id=${col.id + '-col'}
        aria-label=${label}
      >
        <h3 class="col__head">
          <span
            class="glyph"
            style=${`background:var(--${col.color})`}
            aria-hidden="true"
            >${col.glyph}</span
          >
          <span class="col__title">${label}</span>
          <span class="col__count" aria-label=${count_label}
            >${loaded ? items.length : ''}</span
          >
        </h3>
        ${loaded
          ? repeat(
              items,
              (it) => it.id,
              (it) => cardTemplate(it, col)
            )
          : html`<div class="skeleton"></div>
              <div class="skeleton"></div>`}
      </section>
    `;
  }

  function closedTemplate() {
    const label = getLang() === 'ar' ? CLOSED_COLUMN.ar : CLOSED_COLUMN.en;
    const total = closed.length;
    if (!closed_open) {
      return html`
        <button
          type="button"
          class="closed-rail"
          id="closed-rail"
          aria-expanded="false"
          @click=${() => {
            closed_open = true;
            doRender();
          }}
        >
          <span
            class="glyph"
            style="background:var(--s-closed)"
            aria-hidden="true"
            >${CLOSED_COLUMN.glyph}</span
          >
          <span>${label} · ${loaded ? total : ''} · ${t('show_recent')}</span>
        </button>
      `;
    }
    const slice = closed.slice(0, closed_shown);
    return html`
      <section class="col col--closed" id="closed-col" aria-label=${label}>
        <h3 class="col__head">
          <span
            class="glyph"
            style="background:var(--s-closed)"
            aria-hidden="true"
            >${CLOSED_COLUMN.glyph}</span
          >
          <span class="col__title">${label}</span>
          <span class="col__count">${total}</span>
          <button
            type="button"
            class="btn btn--small"
            @click=${() => {
              closed_open = false;
              closed_shown = CLOSED_PAGE;
              doRender();
            }}
          >
            ${t('hide')}
          </button>
        </h3>
        ${repeat(
          slice,
          (it) => it.id,
          (it) => cardTemplate(it, CLOSED_COLUMN)
        )}
        ${total > slice.length
          ? html`<button
              type="button"
              class="btn"
              id="closed-more"
              @click=${() => {
                closed_shown += CLOSED_PAGE;
                doRender();
              }}
            >
              ${t('show_more')}
            </button>`
          : ''}
      </section>
    `;
  }

  function filtering() {
    return Boolean(filter && isFiltering(filter.get()));
  }

  /** @param {any} v */
  function field(v) {
    return String(v || '');
  }

  function chipsTemplate() {
    if (!filter) {
      return html``;
    }
    const f = filter.get();
    const { types, labels, assignees } = facets(facet_items);
    /**
     * @param {string} key
     * @param {boolean} on
     * @param {() => void} fn
     */
    const chip = (key, on, fn) =>
      html`<button
        type="button"
        class="chip"
        aria-pressed=${on ? 'true' : 'false'}
        @click=${fn}
      >
        ${t(key)}
      </button>`;
    /**
     * @param {'type'|'label'|'assignee'|'prio'} name
     * @param {string[]} values
     */
    const menu = (name, values) =>
      html`<label
        class="chip chip--menu"
        aria-pressed=${f[name] ? 'true' : 'false'}
      >
        <span>${t('chip_' + name)}</span>
        <select
          aria-label=${t('chip_' + name)}
          @change=${(/** @type {Event} */ ev) =>
            filter.set({
              [name]: /** @type {HTMLSelectElement} */ (ev.target).value
            })}
        >
          <option value="" ?selected=${!f[name]}>${t('any')}</option>
          ${values.map(
            (v) =>
              html`<option value=${v} ?selected=${f[name] === v}>${v}</option>`
          )}
          ${f[name] && !values.includes(f[name])
            ? html`<option value=${f[name]} selected>${f[name]}</option>`
            : ''}
        </select>
      </label>`;
    return html`<div class="chips" role="group" aria-label="Filters">
      ${chip(
        'chip_all',
        f.chip === 'all' && !f.type && !f.label && !f.assignee && f.prio === '',
        () =>
          filter.set({
            chip: 'all',
            type: '',
            label: '',
            assignee: '',
            prio: ''
          })
      )}
      ${chip('chip_mine', f.chip === 'mine', () =>
        filter.set({ chip: f.chip === 'mine' ? 'all' : 'mine' })
      )}
      ${chip('chip_p01', f.chip === 'p01', () =>
        filter.set({ chip: f.chip === 'p01' ? 'all' : 'p01' })
      )}
      ${menu('type', types)} ${menu('label', labels)}
      ${menu('assignee', assignees)} ${menu('prio', ['0', '1', '2', '3', '4'])}
      ${f.search.trim()
        ? html`<span class="chips__q" dir="auto">“${field(f.search)}”</span>`
        : ''}
    </div>`;
  }

  function template() {
    return html`
      ${chipsTemplate()} ${insightsTemplate()}
      <div class="board" id="board-root-inner">
        ${COLUMNS.map((c) => columnTemplate(c, columns[c.id] || []))}
        ${other.length > 0 ? columnTemplate(OTHER_COLUMN, other) : ''}
        ${closedTemplate()}
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  /** Compose columns from the subscription stores and render. */
  function refreshFromStores() {
    try {
      if (selectors && issueStores) {
        loaded = Boolean(
          issueStores.isLoaded && issueStores.isLoaded('tab:all')
        );
        const all = selectors.selectIssuesFor('tab:all');
        const ready_ids = new Set(
          selectors.selectIssuesFor('tab:board:ready').map((i) => i.id)
        );
        const blocked_ids = new Set(
          selectors.selectIssuesFor('tab:board:blocked').map((i) => i.id)
        );
        facet_items = /** @type {any[]} */ (all);
        const me = currentUser();
        const keep = (/** @type {any} */ it) =>
          !filter || matchesFilter(it, filter.get(), me);
        const split = splitColumns(
          /** @type {any[]} */ (all).filter(keep),
          ready_ids,
          blocked_ids
        );
        columns = split.columns;
        other = split.other;
        for (const id of Object.keys(columns)) {
          columns[id].sort(cmpPriorityThenCreated);
        }
        other.sort(cmpPriorityThenCreated);
        // Oldest first in the owner's column: the longest-waiting question
        // is read first (design: Decisions queue).
        columns.owner.sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0));
        closed = selectors
          .selectBoardColumn('tab:board:closed', 'closed')
          .filter(keep)
          .sort(cmpClosedDesc);
      }
    } catch (err) {
      log('refresh failed: %o', err);
    }
    doRender();
  }

  if (selectors) {
    selectors.subscribe(() => refreshFromStores(), BOARD_CLIENT_IDS);
  }
  window.addEventListener('bdui-lang', () => doRender());
  if (filter) {
    filter.subscribe(() => refreshFromStores());
  }
  doRender();

  return {
    async load() {
      refreshFromStores();
    },
    clear() {
      columns = {};
      other = [];
      closed = [];
      loaded = false;
      doRender();
    }
  };
}
