/**
 * Ask Claude about this task (detail slot `ask`; beads-lite-1bo5.6.56).
 * A floating head opens a one-question box; the answer stays until the owner
 * closes it. No history, nothing saved. Server: server/features/ask.js.
 *
 * Everything the model returns is shown as text nodes only (SEC B9): never
 * innerHTML, never an auto-loaded image or link.
 */
import { getAskProject } from '../utils/ask-context.js';
import { t } from '../utils/i18n.js';

export const MAX_Q = 1000;
export const WAIT_MAX_S = 90;
const POS_KEY = 'bdui.ask.pos';
const DRAFT = 'bdui.ask.draft.';
const DRAG_PX = 8;

/** @param {string} key @param {Record<string, string | number>} [vars] */
function tr(key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars))
    s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/**
 * Server error code to the string key shown to the owner.
 *
 * @param {string} code
 */
export function errorKey(code) {
  const m = /** @type {Record<string, string>} */ ({
    timeout: 'ask_e_timeout',
    busy: 'ask_e_busy',
    rate_limited: 'ask_e_rate',
    claude_signed_out: 'ask_e_signed_out',
    claude_offline: 'ask_e_offline_claude',
    claude_missing: 'ask_e_missing',
    disabled: 'ask_e_disabled',
    claude_failed: 'ask_e_failed',
    forbidden: 'ask_e_forbidden',
    not_found: 'ask_e_notfound',
    bad_request: 'ask_e_bad',
    too_large: 'ask_e_bad',
    bad_type: 'ask_e_forbidden',
    length_required: 'ask_e_bad'
  });
  return m[code] || 'ask_e_failed';
}

/**
 * Split an answer into text and fenced-code blocks.
 *
 * @param {string} text
 * @returns {Array<{ code: boolean, text: string }>}
 */
export function splitAnswer(text) {
  /** @type {Array<{ code: boolean, text: string }>} */
  const out = [];
  const parts = String(text).split(/^```[^\n]*\n?/m);
  parts.forEach((p, i) => {
    const code = i % 2 === 1;
    const body = code ? p.replace(/\n$/, '') : p.trim();
    if (body) out.push({ code, text: body });
  });
  return out;
}

/** @returns {string} */
function boardToken() {
  const m = document.querySelector('meta[name="board-token"]');
  return m ? m.getAttribute('content') || '' : '';
}

/**
 * Send one question. Never throws.
 *
 * @param {{ project: string, id: string, question: string }} d
 * @param {{ fetch?: typeof fetch, token?: string, signal?: AbortSignal }} [o]
 * @returns {Promise<{ ok: true, answer: string, truncated: boolean } | { ok: false, offline?: boolean, aborted?: boolean, error?: string, retryAfter?: number }>}
 */
export async function submitAsk(d, o = {}) {
  const f = o.fetch || globalThis.fetch.bind(globalThis);
  let res;
  try {
    res = await f('/api/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-board-token': o.token ?? boardToken()
      },
      body: JSON.stringify(d),
      signal: o.signal
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.name === 'AbortError') {
      return { ok: false, aborted: true };
    }
    return { ok: false, offline: true };
  }
  /** @type {any} */
  let j = null;
  try {
    j = await res.json();
  } catch {
    // not json (proxy error page)
  }
  if (res.ok && j && j.ok && typeof j.answer === 'string') {
    return { ok: true, answer: j.answer, truncated: !!j.truncated };
  }
  if (!j && (res.status === 502 || res.status === 503 || res.status === 504)) {
    return { ok: false, offline: true };
  }
  return {
    ok: false,
    error: (j && j.error) || 'claude_failed',
    retryAfter: Number(j?.retry_after_s) || 0
  };
}

/**
 * @param {string} tag
 * @param {Record<string, string | boolean | null | undefined>} [attrs]
 * @param {Array<Node | string>} [kids]
 */
function h(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) e.append(c);
  return e;
}

/** Speech-bubble glyph, built with DOM calls (no innerHTML). */
function glyph() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute(
    'd',
    'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'
  );
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

/** @param {string} id */
function readDraft(id) {
  try {
    return window.sessionStorage.getItem(DRAFT + id) || '';
  } catch {
    return '';
  }
}
/** @param {string} id @param {string} v */
function writeDraft(id, v) {
  try {
    if (v) window.sessionStorage.setItem(DRAFT + id, v);
    else window.sessionStorage.removeItem(DRAFT + id);
  } catch {
    // storage off: the draft is just not kept
  }
}

const phoneQuery = () =>
  typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
const coarse = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Detail slot mount: (el, issue). Called again on the same element when the
 * issue changes; it only swaps the task id, the open box is kept.
 *
 * @param {HTMLElement} el
 * @param {any} issue
 * @param {{ fetch?: typeof fetch }} [opts]
 */
export function mountAsk(el, issue, opts = {}) {
  const id = issue && typeof issue.id === 'string' ? issue.id : '';
  const title = issue && typeof issue.title === 'string' ? issue.title : '';
  /** @type {any} */
  const slot = el;
  if (slot._ask) {
    slot._ask.setTask(id, title);
    return;
  }
  slot._ask = build(el, opts);
  slot._ask.setTask(id, title);
}

/**
 * @param {HTMLElement} el
 * @param {{ fetch?: typeof fetch }} opts
 */
function build(el, opts) {
  let taskId = '';
  /** @type {'idle' | 'wait' | 'answer' | 'error' | 'busy'} */
  let phase = 'idle';
  /** @type {AbortController | null} */
  let abort = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let tick = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let busyTimer = null;
  let secs = 0;
  let isOpen = false;

  const head = h(
    'button',
    {
      type: 'button',
      class: 'ask-head',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': tr('ask_open'),
      title: tr('ask_open')
    },
    [glyph()]
  );
  const titleEl = h('h2', { class: 'ask-title', id: 'ask-title' }, [
    tr('ask_title')
  ]);
  const closeBtn = h(
    'button',
    { type: 'button', class: 'ask-x', 'aria-label': tr('ask_close') },
    ['×']
  );
  const ctx = h('div', { class: 'ask-ctx', dir: 'ltr' });
  const ta = /** @type {HTMLTextAreaElement} */ (
    h('textarea', {
      class: 'ask-ta',
      rows: '1',
      maxlength: String(MAX_Q),
      dir: 'auto',
      'aria-label': tr('ask_ph'),
      placeholder: tr('ask_ph')
    })
  );
  const sendBtn = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', class: 'ask-send' }, [tr('ask_send')])
  );
  const hint = h('div', { class: 'ask-hint', role: 'alert' });
  const note = h('div', { class: 'ask-note' }, [tr('ask_note')]);
  const banner = h('div', { class: 'ask-banner', role: 'alert', hidden: true });
  const retryBtn = h(
    'button',
    { type: 'button', class: 'ask-btn ask-retry', hidden: true },
    [tr('ask_retry')]
  );
  const bar = h('div', {
    class: 'ask-bar',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': String(WAIT_MAX_S),
    hidden: true
  });
  const waitText = h('div', { class: 'ask-wait' });
  const cancelBtn = h('button', { type: 'button', class: 'ask-btn' }, [
    tr('ask_cancel')
  ]);
  const waitRow = h('div', { class: 'ask-waitrow', hidden: true }, [
    bar,
    waitText,
    cancelBtn
  ]);
  const qEcho = h('div', { class: 'ask-qecho', dir: 'auto' });
  const answerEl = h('div', {
    class: 'ask-answer',
    'aria-live': 'polite',
    tabindex: '0'
  });
  const aiLabel = h('div', { class: 'ask-ailabel' }, [tr('ask_label')]);
  const newBtn = h('button', { type: 'button', class: 'ask-btn ask-primary' }, [
    tr('ask_new')
  ]);
  const copyBtn = h('button', { type: 'button', class: 'ask-btn' }, [
    tr('ask_copy')
  ]);
  const answerRow = h('div', { class: 'ask-answerrow', hidden: true }, [
    qEcho,
    answerEl,
    aiLabel,
    h('div', { class: 'ask-actions' }, [newBtn, copyBtn])
  ]);
  const inputRow = h('div', { class: 'ask-inputrow' }, [ta, sendBtn]);
  const box = h(
    'div',
    {
      class: 'ask-box',
      role: 'dialog',
      'aria-labelledby': 'ask-title',
      hidden: true
    },
    [
      h('div', { class: 'ask-hd' }, [titleEl, closeBtn]),
      ctx,
      banner,
      retryBtn,
      inputRow,
      hint,
      waitRow,
      answerRow,
      note
    ]
  );
  el.append(head, box);

  /** @param {boolean} on */
  const lockInput = (on) => {
    ta.readOnly = on;
    sendBtn.disabled = on;
  };

  function showBanner(/** @type {string} */ text) {
    banner.textContent = text;
    banner.hidden = !text;
  }

  function stopTimers() {
    if (tick) clearInterval(tick);
    if (busyTimer) clearTimeout(busyTimer);
    tick = busyTimer = null;
  }

  function setPhase(/** @type {typeof phase} */ p) {
    phase = p;
    waitRow.hidden = p !== 'wait';
    bar.hidden = p !== 'wait';
    answerRow.hidden = p !== 'answer';
    inputRow.hidden = p === 'answer';
    retryBtn.hidden = p !== 'error';
    lockInput(p === 'wait' || p === 'busy');
    head.classList.toggle('ask-working', p === 'wait');
    if (p !== 'error' && p !== 'busy') showBanner('');
  }

  function updateWait() {
    waitText.textContent = tr('ask_wait', { n: secs, max: WAIT_MAX_S });
    bar.setAttribute('aria-valuenow', String(secs));
    bar.setAttribute(
      'aria-valuetext',
      tr('ask_progress', { n: secs, max: WAIT_MAX_S })
    );
    bar.style.setProperty(
      '--ask-p',
      `${Math.min(100, (secs / WAIT_MAX_S) * 100)}%`
    );
  }

  async function send() {
    if (phase === 'wait') return;
    const q = ta.value.trim();
    hint.textContent = '';
    ta.classList.remove('ask-bad');
    if (!q) {
      hint.textContent = tr('ask_empty');
      ta.classList.add('ask-bad');
      ta.focus();
      return;
    }
    const project = getAskProject();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase('error');
      showBanner(tr('ask_e_offline'));
      return;
    }
    abort = new AbortController();
    secs = 0;
    setPhase('wait');
    updateWait();
    tick = setInterval(() => {
      secs += 1;
      updateWait();
    }, 1000);
    const mine = abort;
    const r = await submitAsk(
      { project, id: taskId, question: q },
      { fetch: opts.fetch, signal: mine.signal }
    );
    stopTimers();
    if (mine !== abort) return; // cancelled or superseded
    abort = null;
    if (!isOpen) return;
    if (r.ok) {
      writeDraft(taskId, '');
      renderAnswer(q, r.answer, r.truncated);
      return;
    }
    if (r.aborted) return;
    if (r.offline) {
      setPhase('error');
      showBanner(tr('ask_e_offline'));
      return;
    }
    if (r.error === 'busy') {
      setPhase('busy');
      showBanner(tr('ask_e_busy'));
      pollBusy();
      return;
    }
    setPhase('error');
    showBanner(tr(errorKey(r.error || ''), { n: r.retryAfter || 60 }));
  }

  /** Busy: cheap status call every 5 s until the other question is done. */
  function pollBusy() {
    busyTimer = setTimeout(async () => {
      busyTimer = null;
      if (!isOpen || phase !== 'busy') return;
      try {
        const f = opts.fetch || globalThis.fetch.bind(globalThis);
        const res = await f('/api/ask/status');
        const j = await res.json();
        if (j && j.busy === false) {
          setPhase('idle');
          ta.focus();
          return;
        }
      } catch {
        // keep waiting; closing the box stops this
      }
      pollBusy();
    }, 5000);
  }

  /** @param {string} q @param {string} text @param {boolean} truncated */
  function renderAnswer(q, text, truncated) {
    qEcho.textContent = q;
    answerEl.replaceChildren();
    for (const b of splitAnswer(text)) {
      if (b.code) {
        answerEl.append(
          h('pre', { class: 'ask-code', dir: 'ltr' }, [h('code', {}, [b.text])])
        );
      } else {
        for (const para of b.text.split(/\n{2,}/)) {
          answerEl.append(h('p', { dir: 'auto' }, [para]));
        }
      }
    }
    if (truncated)
      answerEl.append(h('p', { class: 'ask-trunc' }, [tr('ask_truncated')]));
    setPhase('answer');
    answerEl.focus();
  }

  function cancelRun() {
    if (abort) {
      const a = abort;
      abort = null;
      a.abort();
    }
    stopTimers();
  }

  function open() {
    isOpen = true;
    box.hidden = false;
    head.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.toggle('ask-open', true);
    box.setAttribute('aria-modal', phoneQuery() ? 'true' : 'false');
    if (phase === 'answer') answerEl.focus();
    else ta.focus();
    placeBox();
  }

  function close() {
    cancelRun();
    isOpen = false;
    box.hidden = true;
    head.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('ask-open');
    if (phase === 'wait' || phase === 'busy') setPhase('idle');
    head.focus();
  }

  /** Keep the sheet above the on-screen keyboard (phone). */
  function placeBox() {
    const vv = window.visualViewport;
    const kb = vv
      ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      : 0;
    box.style.setProperty('--ask-kb', `${kb}px`);
  }
  window.visualViewport?.addEventListener('resize', placeBox);

  head.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (isOpen) close();
    else open();
  });
  closeBtn.addEventListener('click', close);
  sendBtn.addEventListener('click', () => void send());
  retryBtn.addEventListener('click', () => void send());
  cancelBtn.addEventListener('click', () => {
    cancelRun();
    setPhase('idle');
    ta.focus();
  });
  newBtn.addEventListener('click', () => {
    ta.value = '';
    writeDraft(taskId, '');
    setPhase('idle');
    ta.focus();
  });
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(
        answerEl.innerText || answerEl.textContent || ''
      );
      copyBtn.textContent = tr('ask_copied');
      setTimeout(() => (copyBtn.textContent = tr('ask_copy')), 1500);
    } catch {
      // clipboard blocked: nothing to do
    }
  });
  ta.addEventListener('input', () => {
    hint.textContent = '';
    ta.classList.remove('ask-bad');
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    writeDraft(taskId, ta.value);
  });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    // Enter sends on PC, is a newline on a phone; Ctrl/Cmd+Enter always sends.
    if (ev.ctrlKey || ev.metaKey || (!ev.shiftKey && !coarse())) {
      ev.preventDefault();
      void send();
    }
  });
  box.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      // The task sits in a modal <dialog>: without this Esc would close it too.
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    if (ev.key === 'Tab' && box.getAttribute('aria-modal') === 'true') {
      const f = /** @type {HTMLElement[]} */ (
        Array.from(box.querySelectorAll('button, textarea, [tabindex="0"]'))
      ).filter(
        (x) =>
          !x.hidden &&
          !(x instanceof HTMLButtonElement && x.disabled) &&
          !x.closest('[hidden]')
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });
  // PC popover is non-modal: a click outside closes it.
  document.addEventListener('pointerdown', (ev) => {
    if (!isOpen || phoneQuery()) return;
    const n = /** @type {Node} */ (ev.target);
    if (!box.contains(n) && !head.contains(n)) close();
  });
  window.addEventListener('online', () => {
    if (phase === 'error') setPhase('idle');
  });

  // Drag along the edge: a move over 8 px is a drag, never a tap.
  let dragged = false;
  restorePos(head);
  head.addEventListener('pointerdown', (ev) => {
    const sx = ev.clientX;
    const sy = ev.clientY;
    const r = head.getBoundingClientRect();
    let moved = false;
    /** @param {PointerEvent} e */
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < DRAG_PX)
        return;
      moved = true;
      const x = r.left + (e.clientX - sx);
      const y = r.top + (e.clientY - sy);
      head.style.insetInlineEnd = 'auto';
      head.style.left = `${Math.max(0, Math.min(window.innerWidth - r.width, x))}px`;
      head.style.top = `${Math.max(0, Math.min(window.innerHeight - r.height, y))}px`;
      head.style.bottom = 'auto';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      dragged = true;
      setTimeout(() => (dragged = false), 0);
      savePos(head);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  setPhase('idle');
  return {
    /** @param {string} id @param {string} title */
    setTask(id, title) {
      if (id !== taskId) {
        cancelRun();
        taskId = id;
        ta.value = readDraft(id);
        if (phase !== 'idle') setPhase('idle');
        if (isOpen) ta.focus();
      }
      ctx.replaceChildren(`${id}${title ? ' · ' + title : ''}`);
      head.hidden = !id;
      if (!id && isOpen) close();
    }
  };
}

/** Snap to the nearest side edge and remember the height. */
function savePos(/** @type {HTMLElement} */ head) {
  const r = head.getBoundingClientRect();
  const left = r.left + r.width / 2 < window.innerWidth / 2;
  const top = Math.max(0, Math.min(window.innerHeight - r.height, r.top));
  head.style.left = left ? '16px' : `${window.innerWidth - r.width - 16}px`;
  head.style.top = `${top}px`;
  try {
    window.localStorage.setItem(
      POS_KEY,
      JSON.stringify({ left, from_bottom: window.innerHeight - top - r.height })
    );
  } catch {
    // not kept
  }
}

function restorePos(/** @type {HTMLElement} */ head) {
  try {
    const p = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
    if (!p || typeof p.from_bottom !== 'number') return;
    const size = head.getBoundingClientRect().width || 56;
    const top = Math.max(
      0,
      Math.min(
        window.innerHeight - size,
        window.innerHeight - p.from_bottom - size
      )
    );
    head.style.insetInlineEnd = 'auto';
    head.style.bottom = 'auto';
    head.style.top = `${top}px`;
    head.style.left = p.left ? '16px' : `${window.innerWidth - size - 16}px`;
  } catch {
    // bad value: default place
  }
}
