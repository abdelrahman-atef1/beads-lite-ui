/**
 * Card of several questions (beads-lite-1bo5.13.12.1.4, UX spec 13.12.1.2):
 * each question is answered on its own (tap, then Confirm), is saved at once
 * and collapses to one green line; a partial answer wakes nobody (server).
 * One code path for Desk, task page and phone. Caller: views/card.js.
 */
import { html, nothing } from 'lit-html';
import { cardDir } from '../../utils/card-dir.js';
import { errorText } from '../../utils/card-text.js';
import { ageText, tc } from './common.js';

const TYPED_MAX = 500;
const NOTE_OPT =
  /ملاحظات|اكتب|اختيار (تاني|تانى|آخر|اخر)|رد تاني|notes?\b|other|something else|write/i;

const CHECK = html`<svg
  class="u3-cq__chk"
  width="16"
  height="16"
  viewBox="0 0 18 18"
  aria-hidden="true"
>
  <path
    d="M3 9.5l4 4 8-9"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
  />
</svg>`;

/** @param {any} p @param {number} n */
export function qstate(p, n) {
  p.qs ??= {};
  return (p.qs[n] ??= { pick: null, typed: '', error: '', stale: false });
}

/** @param {any} d */
export function isMulti(d) {
  return Array.isArray(d?.questions) && Number(d.total) > 1;
}

/**
 * Answers per question: live ones while waiting, the record's lines after the
 * last answer.
 *
 * @param {any} d
 * @returns {Map<number, { text: string, via: string, at: number }>}
 */
function answersOf(d) {
  /** @type {Map<number, any>} */
  const m = new Map();
  for (const q of d.questions) {
    const a = q.answered;
    if (a) {
      m.set(q.n, {
        text: a.n ? `${a.n}. ${a.label}` : String(a.text ?? ''),
        via: a.via || '',
        at: a.at ? Date.parse(a.at) : 0
      });
    }
  }
  if (d.state === 'answered' && d.decision?.answers) {
    for (const x of d.decision.answers) {
      m.set(x.q, {
        text: String(x.answer),
        via: d.decision.via === 'phone' ? 'phone' : 'pc',
        at: d.decision.at ? Date.parse(d.decision.at) : 0
      });
    }
  }
  return m;
}
/**
 * First question still open (0 when none or not waiting).
 *
 * @param {any} d
 */
export function currentQ(d) {
  if (d.state !== 'waiting') return 0;
  const done = answersOf(d);
  return d.questions.find((/** @type {any} */ q) => !done.has(q.n))?.n ?? 0;
}

/**
 * @param {{ el: HTMLElement, p: any, d: any, lang: string, now?: number,
 *   field: Function, write: Function, paint: Function, askForm: Function,
 *   roundsLeft: Function }} o
 */
export function multiBody(o) {
  const { d, lang } = o;
  const qs = /** @type {any[]} */ (d.questions);
  const total = qs.length;
  const done = answersOf(d);
  const waiting = d.state === 'waiting';
  const cur = currentQ(d);
  const all = done.size >= total;
  return html`<div
      class="u3-cd__body"
      dir=${cardDir(lang)}
      lang=${lang}
      data-cardtext
    >
      <p class="u3-cd__q" dir="auto">${d.card?.q ?? ''}</p>
      ${d.card?.blocks
        ? o.field('u3_card_blocks', lang, d.card.blocks, 'u3-cd__blk')
        : nothing}
    </div>
    <div class="u3-cq__prog" data-prog dir=${cardDir(lang)}>
      <span class="u3-cq__segs" aria-hidden="true"
        >${qs.map(
          (q) => html`<i class=${done.has(q.n) ? 'on' : ''}></i>`
        )}</span
      >
      <b>${tc('u3_card_prog', lang, { n: done.size, m: total })}</b>
    </div>
    <div class="u3-cd__qs" dir=${cardDir(lang)}>
      ${qs.map((q) =>
        done.has(q.n)
          ? answeredLine(o, q, /** @type {any} */ (done.get(q.n)))
          : block(o, q, cur, waiting)
      )}
    </div>
    ${all
      ? html`<p class="u3-cq__all" data-all dir=${cardDir(lang)}>
          ${CHECK} ${tc('u3_card_wake_all', lang)}
        </p>`
      : nothing}`;
}

/** @param {any} o @param {any} q @param {{ text: string, via: string, at: number }} a */
function answeredLine(o, q, a) {
  const { lang } = o;
  const via = a.via
    ? tc(a.via === 'phone' ? 'u3_card_via_phone' : 'u3_card_via_pc', lang)
    : '';
  const age = ageText(a.at, lang, o.now);
  return html`<div class="u3-cq u3-cq--done" data-q=${q.n} data-answered>
    <p class="u3-cq__line" dir="auto">
      ${CHECK}
      <span>${tc('u3_card_q', lang)} ${q.n}: ${q.q} <b>${a.text}</b></span>
    </p>
    ${via || age
      ? html`<small class="u3-cq__via"
          >${[via, age].filter(Boolean).join(' · ')}</small
        >`
      : nothing}
  </div>`;
}

/** @param {any} o @param {any} q @param {number} cur @param {boolean} waiting */
function block(o, q, cur, waiting) {
  const { p, d, lang } = o;
  const st = qstate(p, q.n);
  const isCur = q.n === cur;
  const effect = q.effect || d.card?.effect;
  const show = q.show || d.card?.show;
  const stale = q.stale || st.stale;
  return html`<section
    class="u3-cq ${isCur ? 'u3-cq--cur' : ''} ${isCur && p.pulse === q.n
      ? 'u3-cq--pulse'
      : ''}"
    data-q=${q.n}
    aria-current=${isCur ? 'step' : 'false'}
  >
    <div class="u3-cq__head">
      <span class="u3-cq__n" aria-hidden="true">${q.n}</span>
      <p class="u3-cq__t" dir="auto">${q.q}</p>
    </div>
    ${waiting && !isCur
      ? html`<small class="u3-cq__wait">${tc('u3_card_waitq', lang)}</small>`
      : nothing}
    ${effect ? o.field('u3_card_effect', lang, effect) : nothing}
    ${show ? o.field('u3_card_show', lang, show) : nothing}
    ${stale
      ? html`<p class="u3-cq__stale" role="alert" data-stale>
          ${tc('u3_card_stale', lang)}
        </p>`
      : nothing}
    ${waiting ? controls(o, q, st) : nothing}
  </section>`;
}

/** @param {any} o @param {any} q @param {any} st */
function controls(o, q, st) {
  const { el, p, lang } = o;
  const send = (/** @type {Record<string, unknown>} */ body) => {
    st.retry = () =>
      o.write(el, p, 'card-answer', { q: q.n, sha: q.sha, ...body }, q.n);
    return st.retry();
  };
  const err = st.error
    ? html`<div class="u3-cq__err" role="alert" data-qerr>
        <p>${st.error}</p>
        <div class="u3-cd__row">
          ${st.retry
            ? html`<button
                type="button"
                class="u3-btn u3-btn--primary"
                data-act="retry"
                ?disabled=${p.busy}
                @click=${() => st.retry()}
              >
                ${tc('u3_card_retry', lang)}
              </button>`
            : nothing}
          <button
            type="button"
            class="u3-btn u3-btn--ghost"
            data-act="back"
            @click=${() => {
              st.pick = null;
              st.error = '';
              o.paint(el, p);
            }}
          >
            ${tc('u3_card_back', lang)}
          </button>
        </div>
      </div>`
    : nothing;
  const ask = askBit(o, q);
  if (q.class === 'type') {
    return html`<div class="u3-cd__opts">
      <textarea
        class="u3-cd__text"
        data-type
        dir="auto"
        rows="3"
        maxlength=${TYPED_MAX}
        placeholder=${tc('u3_card_type_ph', lang)}
        .value=${st.typed}
        @input=${(/** @type {Event} */ ev) => {
          st.typed = /** @type {HTMLTextAreaElement} */ (ev.target).value;
        }}
      ></textarea>
      <button
        type="button"
        class="u3-btn u3-btn--primary u3-btn--block"
        data-act="send"
        ?disabled=${p.busy}
        @click=${() => {
          const text = st.typed.trim();
          if (!text) {
            st.error = errorText('empty');
            st.retry = null;
            o.paint(el, p);
            return;
          }
          send({ text });
        }}
      >
        ${tc('u3_card_send', lang)}
      </button>
      ${err} ${ask}
    </div>`;
  }
  const picked = st.pick !== null ? q.opts[st.pick] : null;
  const need = picked ? NOTE_OPT.test(picked.l) : false;
  return html`<div class="u3-cd__opts">
    ${q.opts.map(
      (/** @type {any} */ x, /** @type {number} */ i) =>
        html`<button
          type="button"
          class="u3-cq__opt ${st.pick === i ? 'is-picked' : ''}"
          data-opt=${x.n}
          aria-pressed=${st.pick === i ? 'true' : 'false'}
          ?disabled=${p.busy}
          @click=${() => {
            st.pick = i;
            st.typed = '';
            st.error = '';
            st.stale = false;
            o.paint(el, p);
          }}
        >
          ${st.pick === i ? CHECK : nothing}
          <span dir="auto">${x.n}. ${x.l}</span>
          ${x.rec ? html`<small>${tc('u3_card_rec', lang)}</small>` : nothing}
          ${x.note ? html`<small dir="auto">${x.note}</small>` : nothing}
        </button>`
    )}
    ${picked
      ? html`<textarea
            class="u3-cd__text"
            data-note
            dir="auto"
            rows="3"
            maxlength=${TYPED_MAX}
            placeholder=${tc(
              need ? 'u3_card_note_req_ph' : 'u3_card_note_ph',
              lang
            )}
            .value=${st.typed}
            @input=${(/** @type {Event} */ ev) => {
              st.typed = /** @type {HTMLTextAreaElement} */ (ev.target).value;
            }}
          ></textarea>
          <div class="u3-cd__row">
            <button
              type="button"
              class="u3-btn u3-btn--primary u3-cq__go"
              data-act="confirm"
              ?disabled=${p.busy}
              @click=${() => {
                const text = st.typed.trim();
                if (need && !text) {
                  st.error = errorText('empty');
                  st.retry = null;
                  o.paint(el, p);
                  return;
                }
                send({ option: picked.n, ...(text ? { text } : {}) });
              }}
            >
              ${tc('u3_card_confirm', lang)}
            </button>
            <button
              type="button"
              class="u3-btn u3-btn--ghost"
              data-act="back"
              ?disabled=${p.busy}
              @click=${() => {
                st.pick = null;
                st.error = '';
                o.paint(el, p);
              }}
            >
              ${tc('u3_card_back', lang)}
            </button>
          </div>`
      : nothing}
    ${err} ${ask}
  </div>`;
}

/** @param {any} o @param {any} q */
function askBit(o, q) {
  const { el, p, d, lang } = o;
  if (p.askq === q.n) return o.askForm(el, p, d, lang, q);
  if (o.roundsLeft(d) <= 0) return nothing;
  return html`<button
    type="button"
    class="u3-cq__ask"
    data-act="ask-open"
    data-q=${q.n}
    ?disabled=${p.busy}
    @click=${() => {
      p.askq = q.n;
      p.scope = 'question';
      o.paint(el, p);
    }}
  >
    ${tc('u3_card_ask', lang)}
  </button>`;
}
