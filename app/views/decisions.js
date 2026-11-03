/**
 * Decisions view: the owner's queue (status owner_decision), oldest first,
 * rendered from the bead's decision-card metadata (knowledge/decision-card.md).
 *
 * With a `feed` (the board socket) the list is the all-projects feed
 * (server/features/decisions-feed.js): "All projects" is selected by default
 * and a multi-select dropdown at the top narrows it. Without a feed, or when
 * the feed fails, it shows the current project only.
 *
 * Desk cards (never-by-phone classes) show no buttons. A tap answer takes two
 * steps (option, then Confirm) and writes: a record comment, the card_back
 * role as assignee, and status `open`, through the existing transport.
 */
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import {
  ageLabel,
  cardOptions,
  displayTitle,
  isDesk,
  meta
} from '../utils/board-model.js';
import { t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { showToast } from '../utils/toast.js';

/** Client id of the all-open-issues list. */
export const DECISIONS_CLIENT_ID = 'tab:all';

/**
 * Open decisions, oldest first.
 *
 * @param {any[]} all
 * @returns {any[]}
 */
export function pendingDecisions(all) {
  return all
    .filter((it) => it && it.status === 'owner_decision')
    .sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0));
}

/**
 * Priority first (P0 on top), then the longest-waiting.
 *
 * @param {any[]} list
 * @returns {any[]}
 */
export function byPriorityThenAge(list) {
  return [...list].sort(
    (a, b) =>
      (typeof a.priority === 'number' ? a.priority : 2) -
        (typeof b.priority === 'number' ? b.priority : 2) ||
      (a.updated_at || 0) - (b.updated_at || 0)
  );
}

/**
 * Items of the chosen projects; an empty choice means All.
 *
 * @param {any[]} list
 * @param {Set<string>} chosen - project keys
 * @returns {any[]}
 */
export function filterByProjects(list, chosen) {
  if (chosen.size === 0) {
    return list;
  }
  return list.filter((it) => it.project && chosen.has(it.project.key));
}

/**
 * @param {HTMLElement} mount_element
 * @param {(id: string) => void} gotoIssue
 * @param {{ snapshotFor?: (id: string) => any[], isLoaded?: (id: string) => boolean, subscribeFor?: (ids: string | string[], fn: (id: string) => void) => () => void }} [issueStores]
 * @param {(type: string, payload: unknown) => Promise<unknown>} [transport]
 * @param {{ send: (type: any, payload?: unknown) => Promise<any>, on: (type: any, fn: (p: any) => void) => () => void, onConnection?: (fn: (s: any) => void) => () => void }} [feed]
 *   board socket for the all-projects feed
 */
export function createDecisionsView(
  mount_element,
  gotoIssue,
  issueStores = undefined,
  transport = undefined,
  feed = undefined
) {
  const log = debug('views:decisions');
  /** @type {any[]} */
  let items = [];
  let loaded = false;
  /** @type {Map<string, number>} bead id -> option index awaiting Confirm */
  const pending = new Map();
  /** @type {Set<string>} */
  const busy = new Set();
  /** @type {Map<string, string>} typed replies */
  const typed = new Map();
  // All-projects feed state. Empty `chosen` = All projects (the default).
  /** @type {any[]} */
  let feed_items = [];
  /** @type {Array<{ key: string, name: string, count: number }>} */
  let feed_projects = [];
  let feed_loaded = false;
  let feed_failed = false;
  let rules_ok = true;
  /** @type {Set<string>} */
  let chosen = new Set();
  let menu_open = false;
  const useFeed = () => Boolean(feed) && !feed_failed;
  const shown = () =>
    useFeed() ? filterByProjects(feed_items, chosen) : items;

  /**
   * @param {any} it
   * @param {string} text - record text written as a comment
   */
  async function answer(it, text) {
    if ((!transport && !feed) || busy.has(it.id)) {
      return;
    }
    busy.add(it.id);
    doRender();
    try {
      if (useFeed() && feed) {
        // The server finds the project by id prefix and writes there.
        await feed.send('answer-decision', { id: it.id, text });
        feed_items = feed_items.filter((x) => x.id !== it.id);
      } else if (transport) {
        await transport('add-comment', { id: it.id, text });
        const back = meta(it, 'card_back');
        if (back) {
          await transport('update-assignee', { id: it.id, assignee: back });
        }
        await transport('update-status', { id: it.id, status: 'open' });
      }
      showToast(t('answered'), 'success', 2000);
      pending.delete(it.id);
    } catch (err) {
      log('answer failed: %o', err);
      const why = /** @type {any} */ (err)?.message;
      showToast(
        why
          ? `${t('answer_failed')}: ${String(why).slice(0, 160)}`
          : t('answer_failed'),
        'error',
        6000
      );
    } finally {
      busy.delete(it.id);
      doRender();
    }
  }

  /**
   * @param {any} it
   */
  function cardTemplate(it) {
    const q = meta(it, 'card_q');
    const desk = isDesk(it);
    const { primary } = displayTitle(it);
    const opts = cardOptions(it);
    const cls = meta(it, 'card_class');
    const sel = pending.get(it.id);
    const pri = typeof it.priority === 'number' ? it.priority : 2;
    const effect = meta(it, 'card_effect');
    const show = meta(it, 'card_show');
    const blocks = meta(it, 'card_blocks');
    const lang_attr = meta(it, 'card_lang') || 'ar';
    return html`
      <article
        class="qcard ${desk ? 'qcard--desk' : ''}"
        data-issue-id=${it.id}
        lang=${lang_attr}
      >
        <div class="card__meta">
          <span class="card__pri">${createPriorityBadge(pri)}</span>
          ${useFeed() && it.project
            ? html`<span class="dchip" title=${it.project.name}
                >${it.project.name}</span
              >`
            : ''}
          <span class="card__id">${it.id}</span>
          <span>${t('asked')} ${ageLabel(it.updated_at)}</span>
        </div>
        <h2 dir="auto">${desk ? primary : q || primary}</h2>
        ${!desk && effect
          ? html`<p class="qcard__eff" dir="auto">
              <b>${t('effect')}:</b> ${effect}
            </p>`
          : ''}
        ${!desk && show
          ? html`<div class="qcard__show" dir="auto">
              <b>${t('today')}:</b> ${show}
            </div>`
          : ''}
        ${!desk && blocks
          ? html`<div class="qcard__blk" dir="auto">
              ${t('frozen')}: ${blocks}
            </div>`
          : ''}
        ${desk
          ? html`<div class="qcard__desk">${t('pc_only')}</div>`
          : !q || opts.length === 0
            ? html`<p class="qcard__eff">${t('no_card')}</p>`
            : cls === 'type'
              ? typedTemplate(it)
              : optionsTemplate(it, opts, sel)}
        <div class="card__meta">
          <a
            class="qcard__open"
            href=${'#/issues?issue=' + encodeURIComponent(it.id)}
            @click=${(/** @type {MouseEvent} */ ev) => {
              if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) {
                return;
              }
              ev.preventDefault();
              gotoIssue(it.id);
            }}
            >${t('open_bead')}</a
          >
        </div>
      </article>
    `;
  }

  /**
   * @param {any} it
   * @param {Array<{ l: string, n: string, rec: boolean }>} opts
   * @param {number|undefined} sel
   */
  function optionsTemplate(it, opts, sel) {
    const disabled = busy.has(it.id);
    if (sel !== undefined && opts[sel]) {
      const o = opts[sel];
      return html`<div class="opts">
        <button
          type="button"
          class="btn btn--primary"
          ?disabled=${disabled}
          @click=${() =>
            answer(
              it,
              `OWNER DECISION via web board${String.fromCharCode(10)}Option ${sel + 1}: ${o.l}`
            )}
        >
          ${t('confirm')}: ${o.l}
        </button>
        <button
          type="button"
          class="btn"
          ?disabled=${disabled}
          @click=${() => {
            pending.delete(it.id);
            doRender();
          }}
        >
          ${t('back')}
        </button>
      </div>`;
    }
    return html`<div class="opts">
      ${opts.map(
        (o, i) =>
          html`<button
            type="button"
            class="btn ${o.rec ? 'btn--primary' : ''}"
            ?disabled=${disabled}
            @click=${() => {
              pending.set(it.id, i);
              doRender();
            }}
          >
            ${i + 1} ${o.l}
            ${o.rec ? html`<small>${t('recommended')}</small>` : ''}
          </button>`
      )}
    </div>`;
  }

  /**
   * @param {any} it
   */
  function typedTemplate(it) {
    const disabled = busy.has(it.id);
    const value = typed.get(it.id) || '';
    return html`<div class="opts">
      <textarea
        class="qcard__reply"
        dir="auto"
        rows="3"
        placeholder=${t('type_reply')}
        .value=${value}
        @input=${(/** @type {Event} */ ev) =>
          typed.set(
            it.id,
            /** @type {HTMLTextAreaElement} */ (ev.target).value
          )}
      ></textarea>
      <button
        type="button"
        class="btn btn--primary"
        ?disabled=${disabled}
        @click=${() => {
          const text = (typed.get(it.id) || '').trim();
          if (!text) {
            return;
          }
          typed.delete(it.id);
          void answer(
            it,
            `OWNER DECISION via web board${String.fromCharCode(10)}${text}`
          );
        }}
      >
        ${t('send')}
      </button>
    </div>`;
  }

  /** Label of the dropdown button. */
  function filterLabel() {
    if (chosen.size === 0) {
      return t('dec_all');
    }
    if (chosen.size === 1) {
      const k = [...chosen][0];
      return feed_projects.find((p) => p.key === k)?.name || k;
    }
    return t('dec_n_projects').replace('{n}', String(chosen.size));
  }

  /** @param {string} key */
  function toggleProject(key) {
    if (chosen.has(key)) {
      chosen.delete(key);
    } else {
      chosen.add(key);
    }
    // Every project ticked is the same as All.
    if (chosen.size >= feed_projects.length) {
      chosen = new Set();
    }
    doRender();
  }

  function resetProjects() {
    chosen = new Set();
    doRender();
  }

  function filterTemplate() {
    if (!useFeed() || !feed_loaded) {
      return '';
    }
    return html`<details
      class="dfilter"
      ?open=${menu_open}
      @toggle=${(/** @type {Event} */ ev) => {
        menu_open = /** @type {HTMLDetailsElement} */ (ev.target).open;
      }}
    >
      <summary aria-label=${t('dec_filter')}>${filterLabel()}</summary>
      <div class="dfilter__panel" role="group" aria-label=${t('dec_filter')}>
        <label class="dfilter__row">
          <input
            type="checkbox"
            data-project="*"
            .checked=${chosen.size === 0}
            @change=${resetProjects}
          />
          <span>${t('dec_all')}</span>
          <span class="dfilter__n">${feed_items.length}</span>
        </label>
        ${feed_projects.map(
          (p) =>
            html`<label class="dfilter__row">
              <input
                type="checkbox"
                data-project=${p.key}
                .checked=${chosen.has(p.key)}
                @change=${() => toggleProject(p.key)}
              />
              <span dir="auto">${p.name}</span>
              <span class="dfilter__n">${p.count}</span>
            </label>`
        )}
      </div>
    </details>`;
  }

  function template() {
    const list = shown();
    const ready = useFeed() ? feed_loaded : loaded;
    const narrowed = useFeed() && chosen.size > 0;
    return html`
      <div class="decisions">
        <h1 class="decisions__title">
          ${t('waiting_title')}
          <span class="decisions__n">${ready ? list.length : ''}</span>
        </h1>
        <div class="decisions__sub">
          ${useFeed() ? t('dec_sub_all') : t('waiting_sub')}
        </div>
        ${feed && feed_failed
          ? html`<p class="dnote dnote--err">${t('dec_feed_error')}</p>`
          : ''}
        ${useFeed() && feed_loaded && !rules_ok
          ? html`<p class="dnote dnote--err">${t('dec_rules_missing')}</p>`
          : ''}
        ${filterTemplate()}
        ${!ready
          ? html`<div class="skeleton"></div>
              <div class="skeleton"></div>`
          : list.length === 0
            ? html`<div class="empty">
                <div class="empty__mark" aria-hidden="true">✓</div>
                <b>${narrowed ? t('dec_none_here') : t('empty_title')}</b>
                <div>${t('empty_sub')}</div>
                ${narrowed
                  ? html`<button
                      type="button"
                      class="btn dreset"
                      @click=${resetProjects}
                    >
                      ${t('dec_filter_reset')}
                    </button>`
                  : ''}
              </div>`
            : repeat(
                list,
                (it) => it.id,
                (it) => cardTemplate(it)
              )}
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  function refresh() {
    if (!issueStores || !issueStores.snapshotFor) {
      doRender();
      return;
    }
    loaded = Boolean(
      issueStores.isLoaded && issueStores.isLoaded(DECISIONS_CLIENT_ID)
    );
    items = pendingDecisions(issueStores.snapshotFor(DECISIONS_CLIENT_ID));
    doRender();
  }

  /** @param {any} snap */
  function applyFeed(snap) {
    if (!snap || !Array.isArray(snap.items)) {
      return;
    }
    feed_items = byPriorityThenAge(snap.items);
    feed_projects = Array.isArray(snap.projects) ? snap.projects : [];
    rules_ok = snap.rules_ok !== false;
    // A project that left the registry cannot stay ticked.
    const keys = new Set(feed_projects.map((p) => p.key));
    chosen = new Set([...chosen].filter((k) => keys.has(k)));
    feed_loaded = true;
    feed_failed = false;
    doRender();
  }

  async function fetchFeed() {
    if (!feed) {
      return;
    }
    try {
      applyFeed(await feed.send('list-decisions-all', {}));
    } catch (err) {
      log('feed failed: %o', err);
      feed_failed = true;
      refresh();
    }
  }

  /**
   * Keys 1-9 pick option N on the card that has focus, else the top card.
   *
   * @param {KeyboardEvent} ev
   */
  function onKey(ev) {
    if (
      mount_element.hidden ||
      ev.ctrlKey ||
      ev.metaKey ||
      ev.altKey ||
      !/^[1-9]$/.test(ev.key)
    ) {
      return;
    }
    const tag = /** @type {HTMLElement | null} */ (ev.target)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    const focused = /** @type {HTMLElement | null} */ (
      document.activeElement
    )?.closest?.('[data-issue-id]');
    const id = focused?.getAttribute('data-issue-id') || shown()[0]?.id;
    const it = shown().find((x) => x.id === id);
    if (!it || busy.has(it.id) || meta(it, 'card_class') === 'type') {
      return;
    }
    const opts = cardOptions(it);
    const i = Number(ev.key) - 1;
    if (pending.has(it.id) || !opts[i]) {
      return;
    }
    ev.preventDefault();
    pending.set(it.id, i);
    doRender();
  }

  if (issueStores && issueStores.subscribeFor) {
    issueStores.subscribeFor(DECISIONS_CLIENT_ID, () => refresh());
  }
  if (feed) {
    feed.on('decisions-all', applyFeed);
    // Reconnect = refetch (covers pushes missed while offline); no timer.
    feed.onConnection?.((s) => {
      if (s === 'open' && feed_loaded) {
        void fetchFeed();
      }
    });
  }
  window.addEventListener('bdui-lang', () => doRender());
  window.addEventListener('keydown', onKey);
  doRender();

  return {
    async load() {
      refresh();
      if (feed && !feed_loaded) {
        await fetchFeed();
      }
    }
  };
}
