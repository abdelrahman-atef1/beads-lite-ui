/**
 * Ask-Claude head + sheet (beads-lite-1bo5.6.59.8, client half of .56).
 * Task routes only (mounted through the ask/head-slot.js seam). A chat of up
 * to MAX_TURNS questions: the thread lives in this closure only (the server
 * is stateless; each request carries the last few turns). Nothing is kept:
 * closing the sheet or "new chat" drops the thread, and aborts a running
 * request. Answers go through ask/markdown.js (DOM nodes
 * only, never HTML). Phone: bottom sheet. PC: popover by the head.
 */
import { html, render } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import {
  MAX_Q,
  WAIT_MAX_S,
  errorKey,
  fetchStatus,
  projectKey,
  submitAsk
} from '../ask/client.js';
import { renderMarkdown } from '../ask/markdown.js';
import { t3 } from '../i18n.js';
import { icon } from '../icons.js';

/** Questions per chat; then "new chat". Server accepts <= 8 history entries. */
export const MAX_TURNS = 8;
/** History entries sent with a follow-up (newest). */
const SEND_HISTORY = 6;

/**
 * @param {string} key
 * @param {Record<string, string | number>} [v]
 */
function tr(key, v = {}) {
  let s = t3(key);
  for (const [k, x] of Object.entries(v)) s = s.replaceAll(`{${k}}`, String(x));
  return s;
}

const SPARK = html`<svg
  viewBox="0 0 24 24"
  width="24"
  height="24"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    d="M10 3l1.7 4.6L16 9l-4.3 1.4L10 15l-1.7-4.6L4 9l4.3-1.4zM18 13l.9 2.4L21 16l-2.1.6L18 19l-.9-2.4L15 16l2.1-.6z"
  />
</svg>`;

/**
 * Mounts the widget on `host` (task id in host.dataset.id, ctx in
 * host.u3ctx). A second call on the same host returns the same handle.
 *
 * @param {HTMLElement} host
 * @param {{ fetch?: typeof fetch }} [opts]
 */
export function mountAsk(host, opts = {}) {
  const h = /** @type {any} */ (host);
  if (h.u3ask) return h.u3ask;

  /** @type {'idle'|'wait'|'answer'|'error'|'busy'} */
  let phase = 'idle';
  let isOpen = false;
  let secs = 0;
  let question = '';
  let hint = '';
  let banner = '';
  /** blocked = signed out / disabled: shown at once, input off */
  let blocked = '';
  let copied = false;
  /** @type {Array<{ q: string, a: string, nodes: DocumentFragment, truncated: boolean }>} */
  let turns = [];
  /** @type {AbortController | null} */
  let abort = null;
  /** @type {AbortController | null} */
  let statusAbort = null;
  /** @type {any} */
  let tick = null;
  /** @type {any} */
  let busyTimer = null;

  const taskId = () => host.dataset.id || '';
  const project = () =>
    projectKey(h.u3ctx?.store?.getState?.().workspace?.current?.path || '');
  const stopTimers = () => {
    clearInterval(tick);
    clearTimeout(busyTimer);
    tick = busyTimer = null;
  };

  function reset() {
    abort?.abort();
    statusAbort?.abort();
    abort = statusAbort = null;
    stopTimers();
    phase = 'idle';
    question = hint = banner = blocked = '';
    turns = [];
    copied = false;
  }

  async function loadStatus() {
    statusAbort?.abort();
    const mine = (statusAbort = new AbortController());
    const s = await fetchStatus({ fetch: opts.fetch, signal: mine.signal });
    if (mine !== statusAbort || !isOpen) return;
    statusAbort = null;
    if (!s.enabled) blocked = tr('u3_ask_e_disabled');
    else if (s.signed_in === false) blocked = tr('u3_ask_e_signed_out');
    else if (s.busy && phase === 'idle') {
      phase = 'busy';
      banner = tr('u3_ask_e_busy');
      pollBusy();
    }
    draw();
  }

  /** Busy: cheap status call every 5 s until the other question is done. */
  function pollBusy() {
    busyTimer = setTimeout(async () => {
      busyTimer = null;
      if (!isOpen || phase !== 'busy') return;
      const s = await fetchStatus({ fetch: opts.fetch });
      if (!isOpen || phase !== 'busy') return;
      if (s.known && !s.busy) {
        phase = 'idle';
        banner = '';
        draw();
        return;
      }
      pollBusy();
    }, 5000);
  }

  /** @param {Event} [e] */
  async function send(e) {
    e?.preventDefault?.();
    if (phase === 'wait' || blocked) return;
    const q = question.trim();
    hint = '';
    if (!q) {
      hint = tr('u3_ask_empty');
      draw();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      phase = 'error';
      banner = tr('u3_ask_e_offline');
      draw();
      return;
    }
    const mine = (abort = new AbortController());
    secs = 0;
    phase = 'wait';
    banner = '';
    draw();
    tick = setInterval(() => {
      secs += 1;
      draw();
    }, 1000);
    /** @type {Array<{ role: 'user' | 'assistant', text: string }>} */
    const history = turns
      .flatMap((x) => [
        { role: /** @type {const} */ ('user'), text: x.q },
        { role: /** @type {const} */ ('assistant'), text: x.a }
      ])
      .slice(-SEND_HISTORY);
    const r = await submitAsk(
      {
        project: project(),
        id: taskId(),
        question: q,
        ...(history.length ? { history } : {})
      },
      { fetch: opts.fetch, signal: mine.signal }
    );
    stopTimers();
    if (mine !== abort) return; // cancelled, closed or superseded
    abort = null;
    if (!isOpen) return;
    if (r.ok) {
      turns.push({
        q,
        a: r.answer,
        nodes: renderMarkdown(r.answer),
        truncated: r.truncated
      });
      question = '';
      phase = 'answer';
    } else if (r.aborted) {
      return;
    } else if (r.offline) {
      phase = 'error';
      banner = tr('u3_ask_e_offline');
    } else if (r.error === 'busy') {
      phase = 'busy';
      banner = tr('u3_ask_e_busy');
      pollBusy();
    } else {
      phase = 'error';
      banner = tr(errorKey(r.error || ''), { n: r.retryAfter || 60 });
      if (r.error === 'claude_signed_out' || r.error === 'disabled')
        blocked = banner;
    }
    draw();
  }

  function open() {
    isOpen = true;
    // Escape on the document: focus may be on the body (answer shown, input off).
    document.addEventListener('keydown', onKey);
    draw();
    void loadStatus();
    setTimeout(() => host.querySelector('textarea')?.focus(), 0);
  }
  function close() {
    isOpen = false;
    document.removeEventListener('keydown', onKey);
    reset(); // nothing kept
    draw();
    /** @type {HTMLElement | null} */ (
      host.querySelector('.u3-ask__head')
    )?.focus();
  }
  function cancel() {
    abort?.abort();
    abort = null;
    stopTimers();
    phase = 'idle';
    draw();
  }
  function again() {
    question = '';
    phase = 'idle';
    turns = [];
    banner = hint = '';
    draw();
    host.querySelector('textarea')?.focus();
  }
  async function copy() {
    const a = /** @type {HTMLElement | null} */ (
      [...host.querySelectorAll('.u3-ask__answer')].pop() || null
    );
    try {
      await navigator.clipboard.writeText(a?.innerText || a?.textContent || '');
      copied = true;
      draw();
      setTimeout(() => {
        copied = false;
        draw();
      }, 1500);
    } catch {
      // clipboard blocked: nothing to do
    }
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close();
    }
  }
  /** @param {KeyboardEvent} e */
  function onTaKey(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    const coarse =
      typeof matchMedia === 'function' &&
      matchMedia('(pointer: coarse)').matches;
    if (e.ctrlKey || e.metaKey || (!e.shiftKey && !coarse)) void send(e);
  }

  function draw() {
    const busy = phase === 'wait' || phase === 'busy';
    const note = html`<p class="u3-ask__label">${tr('u3_ask_label')}</p>`;
    const form = html`<form @submit=${send}>
      <textarea
        class="u3-ask__ta"
        dir="auto"
        rows="3"
        maxlength=${MAX_Q}
        aria-label=${tr(turns.length ? 'u3_ask_ph_more' : 'u3_ask_ph')}
        placeholder=${tr(turns.length ? 'u3_ask_ph_more' : 'u3_ask_ph')}
        .value=${live(question)}
        ?readonly=${busy}
        ?disabled=${!!blocked}
        @input=${(/** @type {any} */ e) => {
          question = e.target.value;
          hint = '';
        }}
        @keydown=${onTaKey}
      ></textarea>
      ${hint ? html`<div class="u3-ask__hint" role="alert">${hint}</div>` : ''}
      ${phase === 'wait'
        ? html`<div class="u3-ask__waitrow">
            <div
              class="u3-ask__bar"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax=${WAIT_MAX_S}
              aria-valuenow=${secs}
              style=${`--u3-ask-p:${Math.min(100, (secs / WAIT_MAX_S) * 100)}%`}
            ></div>
            <div class="u3-ask__wait">
              ${tr('u3_ask_wait', { n: secs, max: WAIT_MAX_S })}
            </div>
            <button type="button" class="u3-ask__btn" @click=${cancel}>
              ${tr('u3_ask_cancel')}
            </button>
          </div>`
        : html`<div class="u3-ask__actions">
            <button
              type="submit"
              class="u3-ask__btn u3-ask__btn--primary"
              ?disabled=${busy || !!blocked}
            >
              ${phase === 'error' && !blocked
                ? tr('u3_ask_retry')
                : tr('u3_ask_send')}
            </button>
          </div>`}
    </form>`;
    const capped = turns.length >= MAX_TURNS;
    const thread = html`${turns.map(
        (x) => html`<div class="u3-ask__q" dir="auto">${x.q}</div>
          <div class="u3-ask__answer" aria-live="polite" tabindex="0">
            ${x.nodes}${x.truncated
              ? html`<p class="u3-ask__trunc">${tr('u3_ask_truncated')}</p>`
              : ''}
          </div>`
      )}
      <div class="u3-ask__actions">
        <button
          type="button"
          class="u3-ask__btn"
          data-act="new-chat"
          @click=${again}
        >
          ${tr('u3_ask_new')}
        </button>
        <button type="button" class="u3-ask__btn" @click=${copy}>
          ${copied ? tr('u3_ask_copied') : tr('u3_ask_copy')}
        </button>
      </div>
      ${capped ? html`<p class="u3-ask__note">${tr('u3_ask_cap')}</p>` : ''}`;
    const msg = blocked || banner;
    render(
      html`<button
          type="button"
          class="u3-ask__head"
          aria-haspopup="dialog"
          aria-expanded=${isOpen ? 'true' : 'false'}
          aria-label=${tr('u3_ask_open')}
          title=${tr('u3_ask_open')}
          data-working=${phase === 'wait' ? '1' : '0'}
          @click=${() => (isOpen ? close() : open())}
        >
          ${SPARK}
        </button>
        ${isOpen
          ? html`<div class="u3-ask__sheet" data-phase=${phase}>
              <div class="u3-ask__scrim" @click=${close}></div>
              <div
                class="u3-ask__panel"
                role="dialog"
                aria-modal="false"
                aria-labelledby="u3-ask-title"
              >
                <div class="u3-ask__grip" aria-hidden="true"></div>
                <div class="u3-ask__hd">
                  <h2 id="u3-ask-title">
                    ${SPARK}<span>${tr('u3_ask_title')}</span>
                  </h2>
                  <button
                    type="button"
                    class="u3-ask__x"
                    aria-label=${tr('u3_ask_close')}
                    @click=${close}
                  >
                    ${icon('a_close', { size: 16 })}
                  </button>
                </div>
                <div class="u3-ask__ctx u3-mono" dir="ltr">${taskId()}</div>
                <p class="u3-ask__note">${tr('u3_ask_note')}</p>
                ${msg
                  ? html`<div
                      class="u3-ask__banner"
                      role="alert"
                      data-state=${blocked ? 'blocked' : phase}
                    >
                      ${msg}
                    </div>`
                  : ''}
                ${turns.length ? thread : ''} ${capped ? '' : form} ${note}
              </div>
            </div>`
          : ''}`,
      host
    );
  }

  // The task id lives in data-id; a new task drops the open question.
  const mo = new MutationObserver(() => {
    if (isOpen || phase !== 'idle') {
      reset();
      draw();
      if (isOpen) void loadStatus();
    }
  });
  mo.observe(host, { attributes: true, attributeFilter: ['data-id'] });
  const onLang = () => draw();
  window.addEventListener('bdui-lang', onLang);
  draw();

  const handle = {
    destroy() {
      document.removeEventListener('keydown', onKey);
      reset();
      mo.disconnect();
      window.removeEventListener('bdui-lang', onLang);
      render(html``, host);
      delete h.u3ask;
    }
  };
  h.u3ask = handle;
  return handle;
}
