/**
 * Board view (design/README.md): the owner's column first, one column per
 * status, closed as a bounded rail, a skeleton until data has arrived, Arabic
 * titles first. Push-only: derives everything from per-subscription stores.
 *
 * Sources (contract board-data.md): `tab:all` (every non-closed issue, split
 * here by status), `tab:board:ready` (`bd ready`), `tab:board:blocked`
 * (`bd blocked`), `tab:board:closed` (newest closed, shown 50 at a time).
 */
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, cmpPriorityThenCreated } from '../data/sort.js';
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
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(
  mount_element,
  _data,
  gotoIssue,
  _store,
  _subscriptions,
  issueStores = undefined
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
          <span
            class="card__pri"
            style=${`color:var(--p${Math.min(4, Math.max(0, pri))})`}
            >P${pri}</span
          >
          ${col.id === 'blocked'
            ? html`<span class="tag tag--blocked">${t('blocked_tag')}</span>`
            : ''}
          <span class="card__age">${age}</span>
          ${who
            ? html`<span class="avatar" title=${who} aria-label=${who}
                >${who.slice(0, 2).toUpperCase()}</span
              >`
            : ''}
        </div>
      </a>
    `;
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
    const count_label = `${items.length} ${t('issues_n')}`;
    return html`
      <section
        class="col ${attn ? 'col--attn' : ''}"
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

  function template() {
    return html`
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
        const split = splitColumns(
          /** @type {any[]} */ (all),
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
          .slice()
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
