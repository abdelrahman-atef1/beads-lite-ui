/**
 * Decision card + ask thread + wake state on a bead (detail slot `card`,
 * company-1bo5.6.9; ADR 0006 D1-D3).
 *
 * mountCard(el, issue) is called again on the same element whenever the
 * issue changes, so it updates `el` in place. All writes go through the
 * server's card-answer / card-ask (the card CLI); this file never builds a
 * record. A tap answer takes two steps (choose, then Confirm). The question
 * sha the owner saw travels with the answer, so a changed card is refused.
 */
import { html, nothing, render } from 'lit-html';
import { errorText, wakeLabel } from '../utils/card-text.js';
import { t } from '../utils/i18n.js';
import { showToast } from '../utils/toast.js';
import { createWsClient } from '../ws.js';

const ASK_MAX = 500;
const QUOTE_MAX = 300;
const TYPED_MAX = 500;

/** @type {any} */
let shared_client = null;
/**
 * Test seam: use a fake ws client.
 *
 * @param {any} c
 */
export function setCardClient(c) {
  shared_client = c;
}
function client() {
  shared_client ??= createWsClient();
  return shared_client;
}

/**
 * @typedef {object} Panel
 * @property {string} id
 * @property {any} data  last card-state reply
 * @property {number} seq  guards against a late reply for another bead
 * @property {number | null} pick  tap option index awaiting Confirm
 * @property {string} typed
 * @property {boolean} asking
 * @property {string} scope  question | part | option:<n>
 * @property {string} quote
 * @property {string} question
 * @property {boolean} busy
 * @property {string} error
 * @property {string} wake  wake result of the last write here
 * @property {string} failed  load failure
 */

/** @type {WeakMap<HTMLElement, Panel>} */
const panels = new WeakMap();

/** @param {string} template @param {Record<string, number>} vars */
function fmt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}

/** @param {any} issue */
function wantsCard(issue) {
  if (!issue || typeof issue.id !== 'string') return false;
  const m = issue.metadata;
  return (
    issue.status === 'owner_decision' ||
    (!!m && Object.keys(m).some((k) => k.startsWith('card_')))
  );
}

/**
 * @param {HTMLElement} el
 * @param {any} issue
 */
export function mountCard(el, issue) {
  if (!wantsCard(issue)) {
    panels.delete(el);
    render(nothing, el);
    el.replaceChildren();
    return;
  }
  let p = panels.get(el);
  if (!p || p.id !== issue.id) {
    p = {
      id: issue.id,
      data: null,
      seq: (p?.seq || 0) + 1,
      pick: null,
      typed: '',
      asking: false,
      scope: 'question',
      quote: '',
      question: '',
      busy: false,
      error: '',
      wake: '',
      failed: ''
    };
    panels.set(el, p);
  }
  void load(el, p);
}

/**
 * @param {HTMLElement} el
 * @param {Panel} p
 */
async function load(el, p) {
  const seq = ++p.seq;
  try {
    const data = await client().send('card-state', { id: p.id });
    if (panels.get(el) !== p || p.seq !== seq) return;
    p.data = data;
    p.failed = '';
  } catch {
    if (panels.get(el) !== p || p.seq !== seq) return;
    p.failed = t('cd_load_failed');
  }
  paint(el, p);
}

/**
 * @param {HTMLElement} el
 * @param {Panel} p
 * @param {'card-answer'|'card-ask'} type
 * @param {Record<string, unknown>} payload
 */
async function write(el, p, type, payload) {
  if (p.busy) return;
  p.busy = true;
  p.error = '';
  paint(el, p);
  try {
    const res = await client().send(type, { id: p.id, ...payload });
    p.wake = String(res?.wake || '');
    if (type === 'card-answer') {
      p.pick = null;
      p.typed = '';
    } else {
      p.asking = false;
      p.question = '';
      p.quote = '';
      p.scope = 'question';
    }
    showToast(
      type === 'card-answer' ? t('cd_recorded') : t('cd_question_sent'),
      'success',
      2000
    );
  } catch (err) {
    const code = String(/** @type {any} */ (err)?.message || '');
    p.error = errorText(code);
    if (code === 'changed') p.pick = null;
  } finally {
    p.busy = false;
  }
  await load(el, p);
}

/** @param {any} data */
function roundsLeft(data) {
  const used = (data.thread || []).filter(
    (/** @type {any} */ x) => x.kind === 'q'
  ).length;
  return Math.max(0, (data.max_rounds || 3) - used);
}

/**
 * @param {HTMLElement} el
 * @param {Panel} p
 */
function paint(el, p) {
  const d = p.data;
  if (!d || d.state === 'none') {
    render(p.failed ? html`<p class="cd__err">${p.failed}</p>` : nothing, el);
    return;
  }
  const lang = d.card?.lang || 'ar';
  const wake = wakeLabel(d.wake, p.wake);
  const title =
    d.state === 'waiting'
      ? t('cd_title')
      : d.state === 'asked'
        ? t('cd_asked_title')
        : t('cd_done_title');
  render(
    html`<section class="cd" data-state=${d.state} lang=${lang}>
      <h3 class="cd__title">${title}</h3>
      ${d.card ? cardBody(d.card) : nothing}
      ${d.state === 'waiting' ? answerArea(el, p, d) : nothing}
      ${d.state === 'asked'
        ? html`<p class="cd__note">${t('cd_waiting_expl')}</p>`
        : nothing}
      ${d.state === 'answered' && d.decision
        ? html`<p class="cd__rec" dir="auto">
            ${d.decision.answer}
            <small
              >${d.decision.via === 'phone'
                ? t('cd_via_phone')
                : t('cd_via_pc')}</small
            >
          </p>`
        : nothing}
      ${d.thread?.length ? threadView(d.thread) : nothing}
      ${d.state === 'waiting' ? askArea(el, p, d) : nothing}
      ${p.error
        ? html`<p class="cd__err" role="alert">${p.error}</p>`
        : nothing}
      ${wake
        ? html`<p class="cd__wake" data-wake=${d.wake?.state}>${wake}</p>`
        : nothing}
    </section>`,
    el
  );
}

/** @param {any} c */
function cardBody(c) {
  return html`<div class="cd__body" dir="auto" data-cardtext>
    <p class="cd__q">${c.q}</p>
    ${c.effect
      ? html`<p class="cd__line"><b>${t('cd_effect')}:</b> ${c.effect}</p>`
      : nothing}
    ${c.show
      ? html`<p class="cd__line"><b>${t('cd_show')}:</b> ${c.show}</p>`
      : nothing}
    ${c.blocks
      ? html`<p class="cd__line cd__blk">${t('cd_blocks')}: ${c.blocks}</p>`
      : nothing}
  </div>`;
}

/**
 * @param {HTMLElement} el
 * @param {Panel} p
 * @param {any} d
 */
function answerArea(el, p, d) {
  const c = d.card;
  if (c.cls === 'type') {
    return html`<div class="cd__opts">
      <textarea
        class="cd__text"
        dir="auto"
        rows="3"
        maxlength=${TYPED_MAX}
        placeholder=${t('cd_type_ph')}
        .value=${p.typed}
        @input=${(/** @type {Event} */ ev) => {
          p.typed = /** @type {HTMLTextAreaElement} */ (ev.target).value;
        }}
      ></textarea>
      <button
        type="button"
        class="btn btn--primary cd__btn"
        data-act="send"
        ?disabled=${p.busy}
        @click=${() => {
          const text = p.typed.trim();
          if (!text) {
            p.error = t('cd_err_empty');
            paint(el, p);
            return;
          }
          void write(el, p, 'card-answer', { text, sha: d.sha });
        }}
      >
        ${t('cd_send')}
      </button>
    </div>`;
  }
  if (p.pick !== null && c.opts[p.pick]) {
    const o = c.opts[p.pick];
    return html`<div class="cd__opts">
      <button
        type="button"
        class="btn btn--primary cd__btn"
        data-act="confirm"
        ?disabled=${p.busy}
        @click=${() => write(el, p, 'card-answer', { option: o.n, sha: d.sha })}
      >
        ${t('cd_confirm')}: ${o.l}
      </button>
      <button
        type="button"
        class="btn cd__btn"
        data-act="back"
        ?disabled=${p.busy}
        @click=${() => {
          p.pick = null;
          paint(el, p);
        }}
      >
        ${t('cd_back')}
      </button>
    </div>`;
  }
  return html`<div class="cd__opts">
    ${c.opts.map(
      (/** @type {any} */ o, /** @type {number} */ i) =>
        html`<button
          type="button"
          class="btn cd__btn ${o.rec ? 'btn--primary' : ''}"
          data-opt=${o.n}
          ?disabled=${p.busy}
          @click=${() => {
            p.pick = i;
            p.error = '';
            paint(el, p);
          }}
        >
          <span>${o.n}. ${o.l}</span>
          ${o.rec ? html`<small>${t('cd_rec')}</small>` : nothing}
          ${o.note ? html`<small dir="auto">${o.note}</small>` : nothing}
        </button>`
    )}
  </div>`;
}

/** @param {Array<any>} thread */
function threadView(thread) {
  return html`<div class="cd__thread" aria-label=${t('cd_thread')}>
    ${thread.map(
      (m) =>
        html`<div class="cd__msg cd__msg--${m.kind}">
          <b>${m.kind === 'q' ? t('cd_you') : t('cd_asker')}</b>
          ${m.quote
            ? html`<blockquote dir="auto">${m.quote}</blockquote>`
            : nothing}
          <p dir="auto">${m.text}</p>
        </div>`
    )}
  </div>`;
}

/**
 * @param {HTMLElement} el
 * @param {Panel} p
 * @param {any} d
 */
function askArea(el, p, d) {
  const left = roundsLeft(d);
  if (left <= 0) {
    return html`<p class="cd__note">
      ${fmt(t('cd_rounds_used'), { max: d.max_rounds || 3 })}
    </p>`;
  }
  if (!p.asking) {
    return html`<button
      type="button"
      class="btn cd__btn cd__ask"
      data-act="ask-open"
      ?disabled=${p.busy}
      @click=${() => {
        p.asking = true;
        paint(el, p);
      }}
    >
      ${t('cd_ask')}
    </button>`;
  }
  const n = (d.max_rounds || 3) - left + 1;
  const isPart = p.scope === 'part';
  return html`<form
    class="cd__form"
    @submit=${(/** @type {Event} */ ev) => {
      ev.preventDefault();
      const question = p.question.trim();
      if (!question) {
        p.error = t('cd_err_empty');
        paint(el, p);
        return;
      }
      /** @type {Record<string, unknown>} */
      const body = { scope: p.scope, question };
      if (isPart) body.quote = p.quote.trim();
      void write(el, p, 'card-ask', body);
    }}
  >
    <p class="cd__note">${fmt(t('cd_round'), { n, max: d.max_rounds || 3 })}</p>
    <label class="cd__lbl"
      >${t('cd_scope')}
      <select
        class="cd__sel"
        .value=${p.scope}
        @change=${(/** @type {Event} */ ev) => {
          p.scope = /** @type {HTMLSelectElement} */ (ev.target).value;
          if (p.scope === 'part' && !p.quote) {
            p.quote = selectedCardText(el);
          }
          paint(el, p);
        }}
      >
        <option value="question" ?selected=${p.scope === 'question'}>
          ${t('cd_scope_question')}
        </option>
        <option value="part" ?selected=${isPart}>${t('cd_scope_part')}</option>
        ${d.card.opts.map(
          (/** @type {any} */ o) =>
            html`<option
              value=${'option:' + o.n}
              ?selected=${p.scope === 'option:' + o.n}
            >
              ${t('cd_scope_option')} ${o.n}
            </option>`
        )}
      </select>
    </label>
    ${isPart
      ? html`<textarea
          class="cd__text cd__quote"
          dir="auto"
          rows="2"
          maxlength=${QUOTE_MAX}
          placeholder=${t('cd_ask_quote_ph')}
          .value=${p.quote}
          @input=${(/** @type {Event} */ ev) => {
            p.quote = /** @type {HTMLTextAreaElement} */ (ev.target).value;
          }}
        ></textarea>`
      : nothing}
    <textarea
      class="cd__text cd__qtext"
      dir="auto"
      rows="3"
      maxlength=${ASK_MAX}
      placeholder=${t('cd_ask_q_ph')}
      .value=${p.question}
      @input=${(/** @type {Event} */ ev) => {
        p.question = /** @type {HTMLTextAreaElement} */ (ev.target).value;
      }}
    ></textarea>
    <div class="cd__opts">
      <button
        type="submit"
        class="btn btn--primary cd__btn"
        data-act="ask-send"
        ?disabled=${p.busy}
      >
        ${t('cd_ask_send')}
      </button>
      <button
        type="button"
        class="btn cd__btn"
        data-act="ask-cancel"
        ?disabled=${p.busy}
        @click=${() => {
          p.asking = false;
          paint(el, p);
        }}
      >
        ${t('cd_ask_cancel')}
      </button>
    </div>
  </form>`;
}

/**
 * The text the owner selected inside the card body, if any.
 *
 * @param {HTMLElement} el
 */
function selectedCardText(el) {
  try {
    const sel = window.getSelection();
    const s = sel ? sel.toString().trim() : '';
    const body = el.querySelector('[data-cardtext]');
    if (s && body && sel?.anchorNode && body.contains(sel.anchorNode)) {
      return s.slice(0, QUOTE_MAX);
    }
  } catch {
    // no selection support
  }
  return '';
}
