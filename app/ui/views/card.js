/**
 * Board v3 cards (beads-lite-1bo5.6.59.4): decision card, steps card, and the
 * steps comment. Exports renderCard (desk, task page) and renderStepsComment.
 *
 * A decision card keeps the legacy write path: reads card-state, writes only
 * through card-answer / card-ask (the card CLI), two-step confirm, and the
 * question sha the owner saw travels with the answer. This file never builds
 * a record. Reuses utils/card-text.js (error wording) and the legacy wire.
 */
import { html, nothing, render } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { errorText } from '../../utils/card-text.js';
import { showToast } from '../../utils/toast.js';
import { ageText, clientOf, stepsHref, taskHref, tc } from '../card/common.js';
import { cardDir, cardLang, detectLang } from '../card/dir.js';
import { renderStepsComment } from '../card/steps.js';
import { button } from '../components/button.js';
import { card as frame } from '../components/card.js';
import { chip } from '../components/chip.js';

export { setCardClient } from '../card/common.js';
export { renderStepsComment };

const ASK_MAX = 500;
const QUOTE_MAX = 300;
const TYPED_MAX = 500;

/**
 * @typedef {object} Panel
 * @property {any} item  feed item or {id, title}
 * @property {any} ctx
 * @property {any} data  last card-state reply
 * @property {number} seq
 * @property {number | null} pick  option index awaiting Confirm
 * @property {string} typed
 * @property {boolean} asking
 * @property {string} scope
 * @property {string} quote
 * @property {string} question
 * @property {boolean} busy
 * @property {string} error
 * @property {string} wake  wake result of the last write here
 * @property {string} failed
 */
/** @type {WeakMap<HTMLElement, Panel>} */
const panels = new WeakMap();

/**
 * Draw one feed item. kind 'steps' -> steps card; otherwise a decision card
 * that loads its own state. Call again with a new item to update in place.
 *
 * @param {any} item feed item { id, kind?, project?, title, updated_at?, metadata?, steps? }
 * @param {{ client?: any, now?: number }} [ctx]
 */
export function renderCard(item, ctx = {}) {
  if (item?.kind === 'steps') return stepsCard(item, ctx);
  return html`<div
    class="u3-cardhost"
    data-card-id=${String(item?.id ?? '')}
    ${ref((el) => {
      if (el) mountCard(/** @type {HTMLElement} */ (el), item, ctx);
    })}
  ></div>`;
}

/**
 * @param {HTMLElement} el
 * @param {any} item
 * @param {any} ctx
 */
export function mountCard(el, item, ctx = {}) {
  let p = panels.get(el);
  if (!p || p.item?.id !== item?.id) {
    p = {
      item,
      ctx,
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
  } else {
    p.item = item;
    p.ctx = ctx;
  }
  paint(el, p);
  void load(el, p);
}

/** @param {HTMLElement} el @param {Panel} p */
async function load(el, p) {
  const seq = ++p.seq;
  try {
    const data = await clientOf(p.ctx).send('card-state', { id: p.item.id });
    if (panels.get(el) !== p || p.seq !== seq) return;
    p.data = data;
    p.failed = '';
  } catch {
    if (panels.get(el) !== p || p.seq !== seq) return;
    p.failed = tc('u3_card_load_failed', langOf(p));
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
  const lang = langOf(p);
  try {
    const res = await clientOf(p.ctx).send(type, { id: p.item.id, ...payload });
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
      tc(type === 'card-answer' ? 'u3_card_recorded' : 'u3_card_sent', lang),
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

/** @param {Panel} p */
function langOf(p) {
  const c = p.data?.card;
  if (c?.lang) return cardLang(c.lang);
  const m = p.item?.metadata;
  if (m?.card_lang) return cardLang(m.card_lang);
  return detectLang(m?.card_q || p.item?.title || '');
}

/** @param {any} data */
function roundsLeft(data) {
  const used = (data.thread || []).filter(
    (/** @type {any} */ x) => x.kind === 'q'
  ).length;
  return Math.max(0, (data.max_rounds || 3) - used);
}

/** @param {Panel} p @param {string} lang */
function headRow(p, lang) {
  const it = p.item;
  return html`<div class="u3-cd__head">
    ${it.project?.name
      ? chip({ label: it.project.name, tone: 'neutral' })
      : nothing}
    <span class="u3-cd__id u3-mono" dir="ltr">${it.id}</span>
    <span class="u3-cd__age">${ageText(it.updated_at, lang, p.ctx.now)}</span>
  </div>`;
}

/** @param {string} key @param {string} lang @param {string} value @param {string} [cls] */
function field(key, lang, value, cls = '') {
  return html`<div class="u3-cd__field ${cls}">
    <b class="u3-cd__fl">${tc(key, lang)}</b>
    <span class="u3-cd__fv" dir="auto">${value}</span>
  </div>`;
}

/** @param {any} c @param {string} lang */
function cardBody(c, lang) {
  return html`<div
    class="u3-cd__body"
    dir=${cardDir(lang)}
    lang=${lang}
    data-cardtext
  >
    <p class="u3-cd__q" dir="auto">${c.q}</p>
    ${c.effect ? field('u3_card_effect', lang, c.effect) : nothing}
    ${c.show ? field('u3_card_show', lang, c.show) : nothing}
    ${c.blocks
      ? field('u3_card_blocks', lang, c.blocks, 'u3-cd__blk')
      : nothing}
  </div>`;
}

/** @param {HTMLElement} el @param {Panel} p */
function paint(el, p) {
  const d = p.data;
  const lang = langOf(p);
  const meta = p.item.metadata || {};
  // before card-state arrives, draw what the feed item already says
  const c =
    d?.card ||
    (meta.card_q
      ? {
          q: meta.card_q,
          effect: meta.card_effect,
          show: meta.card_show,
          blocks: meta.card_blocks,
          opts: []
        }
      : null);
  const state = d?.state || 'waiting';
  if (p.failed && !d) {
    render(html`<p class="u3-cd__err" role="alert">${p.failed}</p>`, el);
    return;
  }
  const foot = html`<div class="u3-cd__foot">
    ${state === 'waiting' && d && !p.asking ? askArea(el, p, d, lang) : nothing}
    <a class="u3-cd__link" href=${taskHref(p.item.id)}
      >${tc('u3_card_open_task', lang)}</a
    >
  </div>`;
  const body = html`${c
    ? cardBody(c, lang)
    : html`<p class="u3-cd__q" dir="auto">${p.item.title}</p>`}
  ${state === 'waiting' && d ? answerArea(el, p, d, lang) : nothing}
  ${state === 'asked'
    ? html`<p class="u3-cd__note" data-asked>${tc('u3_card_waiting', lang)}</p>`
    : nothing}
  ${state === 'answered' && d?.decision
    ? html`<p class="u3-cd__rec" dir="auto" data-answered>
        ${d.decision.answer}
        <small
          >${tc(
            d.decision.via === 'phone' ? 'u3_card_via_phone' : 'u3_card_via_pc',
            lang
          )}</small
        >
      </p>`
    : nothing}
  ${d?.thread?.length ? threadView(d.thread, lang) : nothing}
  ${state === 'waiting' && d && p.asking ? askForm(el, p, d, lang) : nothing}
  ${p.error ? html`<p class="u3-cd__err" role="alert">${p.error}</p>` : nothing}
  ${wakeChip(p, d, lang)}`;
  render(
    html`<div class="u3-cd" data-state=${state} lang=${lang}>
      ${frame({
        accent: state === 'answered' ? 'none' : 'amber',
        label: tc('u3_card_decision', lang),
        head: headRow(p, lang),
        body,
        foot
      })}
    </div>`,
    el
  );
}

/** @param {Panel} p @param {any} d @param {string} lang */
function wakeChip(p, d, lang) {
  const s = p.wake === 'failed' ? 'failed' : d?.wake?.state;
  const map = /** @type {Record<string, [string, string]>} */ ({
    delivered: ['u3_card_wake_delivered', 'green'],
    queued: ['u3_card_wake_queued', 'amber'],
    'queued-no-listener': ['u3_card_wake_nolisten', 'neutral'],
    failed: ['u3_card_wake_failed', 'red']
  });
  const m = s ? map[s] : null;
  if (!m) return nothing;
  return html`<p class="u3-cd__wake" data-wake=${s}>
    ${chip({ label: tc(m[0], lang), tone: m[1] })}
  </p>`;
}

/** @param {Array<any>} thread @param {string} lang */
function threadView(thread, lang) {
  return html`<div class="u3-cd__thread" dir=${cardDir(lang)}>
    <div class="u3-cd__thead">${tc('u3_card_ask_head', lang)}</div>
    ${thread.map(
      (m) =>
        html`<div class="u3-cd__msg u3-cd__msg--${m.kind}">
          <b class="u3-cd__who"
            >${tc(m.kind === 'q' ? 'u3_card_you' : 'u3_card_asker', lang)}</b
          >
          ${m.quote
            ? html`<blockquote dir="auto">${m.quote}</blockquote>`
            : nothing}
          <p dir="auto">${m.text}</p>
        </div>`
    )}
  </div>`;
}

/** @param {HTMLElement} el @param {Panel} p @param {any} d @param {string} lang */
function answerArea(el, p, d, lang) {
  const c = d.card;
  if (!c) return nothing;
  if (c.cls === 'type') {
    return html`<div class="u3-cd__opts">
      <textarea
        class="u3-cd__text"
        dir="auto"
        rows="3"
        maxlength=${TYPED_MAX}
        placeholder=${tc('u3_card_type_ph', lang)}
        .value=${p.typed}
        @input=${(/** @type {Event} */ ev) => {
          p.typed = /** @type {HTMLTextAreaElement} */ (ev.target).value;
        }}
      ></textarea>
      <button
        type="button"
        class="u3-btn u3-btn--primary u3-btn--block"
        data-act="send"
        ?disabled=${p.busy}
        @click=${() => {
          const text = p.typed.trim();
          if (!text) {
            p.error = errorText('empty');
            paint(el, p);
            return;
          }
          void write(el, p, 'card-answer', { text, sha: d.sha });
        }}
      >
        ${tc('u3_card_send', lang)}
      </button>
    </div>`;
  }
  if (p.pick !== null && c.opts[p.pick]) {
    const o = c.opts[p.pick];
    return html`<div class="u3-cd__opts">
      <button
        type="button"
        class="u3-btn u3-btn--primary u3-btn--block u3-cd__opt"
        data-act="confirm"
        ?disabled=${p.busy}
        @click=${() => write(el, p, 'card-answer', { option: o.n, sha: d.sha })}
      >
        <span dir="auto">${tc('u3_card_confirm', lang)}: ${o.l}</span>
      </button>
      <button
        type="button"
        class="u3-btn u3-btn--ghost u3-btn--block"
        data-act="back"
        ?disabled=${p.busy}
        @click=${() => {
          p.pick = null;
          paint(el, p);
        }}
      >
        ${tc('u3_card_back', lang)}
      </button>
    </div>`;
  }
  return html`<div class="u3-cd__opts">
    ${c.opts.map(
      (/** @type {any} */ o, /** @type {number} */ i) =>
        html`<button
          type="button"
          class="u3-btn u3-btn--block u3-cd__opt ${o.rec
            ? 'u3-btn--primary'
            : 'u3-btn--ghost'}"
          data-opt=${o.n}
          ?disabled=${p.busy}
          @click=${() => {
            p.pick = i;
            p.error = '';
            paint(el, p);
          }}
        >
          <span dir="auto">${o.n}. ${o.l}</span>
          ${o.rec ? html`<small>${tc('u3_card_rec', lang)}</small>` : nothing}
          ${o.note ? html`<small dir="auto">${o.note}</small>` : nothing}
        </button>`
    )}
  </div>`;
}

/** The "ask before you answer" opener (foot). @param {HTMLElement} el @param {Panel} p @param {any} d @param {string} lang */
function askArea(el, p, d, lang) {
  if (roundsLeft(d) <= 0) {
    return html`<p class="u3-cd__note">
      ${tc('u3_card_rounds_used', lang, { max: d.max_rounds || 3 })}
    </p>`;
  }
  return html`<button
    type="button"
    class="u3-cd__ask"
    data-act="ask-open"
    ?disabled=${p.busy}
    @click=${() => {
      p.asking = true;
      paint(el, p);
    }}
  >
    ${tc('u3_card_ask', lang)}
  </button>`;
}

/** @param {HTMLElement} el @param {Panel} p @param {any} d @param {string} lang */
function askForm(el, p, d, lang) {
  const max = d.max_rounds || 3;
  const left = roundsLeft(d);
  const isPart = p.scope === 'part';
  return html`<form
    class="u3-cd__form"
    dir=${cardDir(lang)}
    @submit=${(/** @type {Event} */ ev) => {
      ev.preventDefault();
      const question = p.question.trim();
      if (!question) {
        p.error = errorText('empty');
        paint(el, p);
        return;
      }
      /** @type {Record<string, unknown>} */
      const body = { scope: p.scope, question };
      if (isPart) body.quote = p.quote.trim();
      void write(el, p, 'card-ask', body);
    }}
  >
    <p class="u3-cd__note">
      ${tc('u3_card_round', lang, { n: max - left + 1, max })}
    </p>
    <label class="u3-cd__lbl"
      ><span>${tc('u3_card_scope', lang)}</span>
      <select
        class="u3-cd__sel"
        .value=${p.scope}
        @change=${(/** @type {Event} */ ev) => {
          p.scope = /** @type {HTMLSelectElement} */ (ev.target).value;
          if (p.scope === 'part' && !p.quote) p.quote = selectedText(el);
          paint(el, p);
        }}
      >
        <option value="question" ?selected=${p.scope === 'question'}>
          ${tc('u3_card_scope_q', lang)}
        </option>
        <option value="part" ?selected=${isPart}>
          ${tc('u3_card_scope_part', lang)}
        </option>
        ${d.card.opts.map(
          (/** @type {any} */ o) =>
            html`<option
              value=${'option:' + o.n}
              ?selected=${p.scope === 'option:' + o.n}
            >
              ${tc('u3_card_scope_opt', lang)} ${o.n}
            </option>`
        )}
      </select>
    </label>
    ${isPart
      ? html`<textarea
          class="u3-cd__text"
          dir="auto"
          rows="2"
          maxlength=${QUOTE_MAX}
          placeholder=${tc('u3_card_quote_ph', lang)}
          .value=${p.quote}
          @input=${(/** @type {Event} */ ev) => {
            p.quote = /** @type {HTMLTextAreaElement} */ (ev.target).value;
          }}
        ></textarea>`
      : nothing}
    <textarea
      class="u3-cd__text"
      dir="auto"
      rows="3"
      maxlength=${ASK_MAX}
      placeholder=${tc('u3_card_ask_ph', lang)}
      .value=${p.question}
      @input=${(/** @type {Event} */ ev) => {
        p.question = /** @type {HTMLTextAreaElement} */ (ev.target).value;
      }}
    ></textarea>
    <div class="u3-cd__row">
      <button
        type="submit"
        class="u3-btn u3-btn--primary"
        data-act="ask-send"
        ?disabled=${p.busy}
      >
        ${tc('u3_card_ask_send', lang)}
      </button>
      <button
        type="button"
        class="u3-btn u3-btn--ghost"
        data-act="ask-cancel"
        ?disabled=${p.busy}
        @click=${() => {
          p.asking = false;
          paint(el, p);
        }}
      >
        ${tc('u3_card_ask_cancel', lang)}
      </button>
    </div>
  </form>`;
}

/** @param {HTMLElement} el */
function selectedText(el) {
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

/**
 * Steps card (kind 'steps'): teal, numbered 1-3, one button to the steps
 * comment on the task page (&at=c-<id>).
 *
 * @param {any} item
 * @param {any} [ctx]
 */
export function stepsCard(item, ctx = {}) {
  const s = item.steps || {};
  const lang = detectLang(s.title || item.title || '');
  const n = Number(s.n) || 0;
  const nums = Array.from({ length: Math.min(n, 3) }, (_v, i) => i + 1);
  return html`<div class="u3-cd u3-cd--steps" data-kind="steps" lang=${lang}>
    ${frame({
      accent: 'teal',
      label: tc('u3_steps_badge', lang),
      head: html`<div class="u3-cd__head">
        ${chip({ label: tc('u3_steps_badge', lang), tone: 'teal' })}
        ${item.project?.name
          ? chip({ label: item.project.name, tone: 'neutral' })
          : nothing}
        <span class="u3-cd__age"
          >${ageText(s.at ? Date.parse(s.at) : 0, lang, ctx.now)}</span
        >
      </div>`,
      body: html`<div class="u3-cd__body" dir=${cardDir(lang)} lang=${lang}>
        <p class="u3-cd__q" dir="auto">${s.title || item.title}</p>
        <div class="u3-cd__nums">
          <span class="u3-cd__id u3-mono" dir="ltr">${item.id}</span>
          ${n
            ? html`<ol class="u3-cd__numlist" aria-hidden="true">
                  ${nums.map((x) => html`<li>${x}</li>`)}
                </ol>
                <span class="u3-cd__count"
                  >${n === 1
                    ? tc('u3_steps_n1', lang)
                    : tc('u3_steps_n', lang, { n })}</span
                >`
            : nothing}
        </div>
      </div>`,
      foot: button({
        label: tc('u3_steps_open', lang),
        variant: 'steps',
        href: stepsHref(item.id, s.comment || '')
      })
    })}
  </div>`;
}
