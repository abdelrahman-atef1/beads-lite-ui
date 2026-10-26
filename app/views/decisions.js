/**
 * Decisions view: the owner's queue (status owner_decision), oldest first,
 * rendered from the bead's decision-card metadata (knowledge/decision-card.md).
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
 * @param {HTMLElement} mount_element
 * @param {(id: string) => void} gotoIssue
 * @param {{ snapshotFor?: (id: string) => any[], isLoaded?: (id: string) => boolean, subscribeFor?: (ids: string | string[], fn: (id: string) => void) => () => void }} [issueStores]
 * @param {(type: string, payload: unknown) => Promise<unknown>} [transport]
 */
export function createDecisionsView(
  mount_element,
  gotoIssue,
  issueStores = undefined,
  transport = undefined
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

  /**
   * @param {any} it
   * @param {string} text - record text written as a comment
   */
  async function answer(it, text) {
    if (!transport || busy.has(it.id)) {
      return;
    }
    busy.add(it.id);
    doRender();
    try {
      await transport('add-comment', { id: it.id, text });
      const back = meta(it, 'card_back');
      if (back) {
        await transport('update-assignee', { id: it.id, assignee: back });
      }
      await transport('update-status', { id: it.id, status: 'open' });
      showToast(t('answered'), 'success', 2000);
      pending.delete(it.id);
    } catch (err) {
      log('answer failed: %o', err);
      showToast(t('answer_failed'), 'error', 4000);
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
          <span
            class="card__pri"
            style=${`color:var(--p${Math.min(4, Math.max(0, pri))})`}
            >P${pri}</span
          >
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

  function template() {
    return html`
      <div class="decisions">
        <h1 class="decisions__title">
          ${t('waiting_title')}
          <span class="decisions__n">${loaded ? items.length : ''}</span>
        </h1>
        <div class="decisions__sub">${t('waiting_sub')}</div>
        ${!loaded
          ? html`<div class="skeleton"></div>
              <div class="skeleton"></div>`
          : items.length === 0
            ? html`<div class="empty">
                <div class="empty__mark" aria-hidden="true">✓</div>
                <b>${t('empty_title')}</b>
                <div>${t('empty_sub')}</div>
              </div>`
            : repeat(
                items,
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

  if (issueStores && issueStores.subscribeFor) {
    issueStores.subscribeFor(DECISIONS_CLIENT_ID, () => refresh());
  }
  window.addEventListener('bdui-lang', () => doRender());
  doRender();

  return {
    async load() {
      refresh();
    }
  };
}
