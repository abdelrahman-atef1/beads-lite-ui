/**
 * @mention picker and chips (beads-lite-1bo5.6.59.13; screen 11, spec .64).
 *
 * Plugs into the comment composer through the seam in task/composer-ext.js:
 * typing "@" in the comment box lists the roles and @owner, picking one
 * inserts it. Under a comment, one chip per mention shows what happened:
 * waiting / woke / seen / limit / paused. Data: data/mention.js (server or
 * fixture). Nothing here runs until the composer is on screen.
 */
import { html, nothing, render } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { getLang } from '../../utils/i18n.js';
import { createMentionApi, pickerItems, tokenAt } from '../data/mention.js';
import { registerComposerExtension } from '../task/composer-ext.js';

/** @type {Record<string, { en: string, ar: string }>} */
const S = {
  hint: {
    en: 'A mention wakes the role and sends it this task',
    ar: 'المنشن بيصحّي الدور ويبعتله المهمة'
  },
  none: { en: 'No role by that name', ar: 'مفيش دور بالاسم ده' },
  list: { en: 'Mention a role', ar: 'منشن لدور' },
  waiting: { en: 'waiting', ar: 'مستني' },
  woke: { en: 'woke', ar: 'صحي' },
  seen: { en: 'seen', ar: 'اتشاف' },
  limit: { en: 'limit', ar: 'الحد' },
  paused: { en: 'paused', ar: 'واقف' },
  owner: { en: 'The owner gets a bell', ar: 'المالك بيوصله إشعار' },
  more: {
    en: 'Not woken: too many roles, a limit, or a loop was stopped',
    ar: 'ما اتصحّاش: أدوار كتير أو وصل للحد أو اتوقف تكرار'
  }
};
/** @param {string} k */
const m = (k) => (S[k] ? S[k][getLang() === 'ar' ? 'ar' : 'en'] : k);

const TONE = /** @type {Record<string, string>} */ ({
  waiting: 'amber',
  woke: 'green',
  seen: 'teal',
  limit: 'red',
  paused: 'neutral'
});

/** The page-wide adapter; app code swaps it for tests. */
let api = createMentionApi();
/** @type {any} */
let lastCtx = null;

/**
 * @param {{ send?: (type: string, payload: any) => Promise<any>, fixtureChip?: string }} [o]
 */
export function useMentionApi(o) {
  api = createMentionApi(o);
  return api;
}

/** @param {any} ctx */
function sender(ctx) {
  if (!ctx) return undefined;
  if (typeof ctx.send === 'function') return ctx.send.bind(ctx);
  if (ctx.client && typeof ctx.client.send === 'function') {
    return ctx.client.send.bind(ctx.client);
  }
  return undefined;
}

/** Bind the adapter to the live websocket the first time a composer shows. */
/** @param {any} ctx */
function bind(ctx) {
  lastCtx = ctx;
  const send = sender(ctx);
  if (send && api.fixture && !forced) api = createMentionApi({ send });
}
let forced = false;
/** Tests call this to keep a fixture adapter even when a ctx has send. */
export function forceFixture(on = true) {
  forced = on;
}

// ---------- chips under a comment ----------

/**
 * One chip row for a comment. Fixture results (no comment id) sit under the
 * newest comment.
 *
 * @param {string} beadId
 * @param {any} comment
 * @param {boolean} [newest]
 */
export function renderMentionChips(beadId, comment, newest = false) {
  const all = api.cached(beadId);
  const mine = all.filter(
    (/** @type {any} */ r) =>
      (r.comment && r.comment === comment.id) || (!r.comment && newest)
  );
  if (!mine.length) return nothing;
  return html`<div class="u3-mn__chips" data-mention-chips>
    ${mine.map(
      (/** @type {any} */ r) =>
        html`<span
          class="u3-mn__chip u3-mn__chip--${TONE[r.chip] || 'neutral'}"
          data-chip=${r.chip}
          title=${r.role === 'owner'
            ? m('owner')
            : r.chip === 'limit'
              ? m('more')
              : ''}
          dir="ltr"
          >@${r.role} <b dir="auto">${m(r.chip)}</b></span
        >`
    )}
  </div>`;
}

/**
 * Load the chips of a bead (call after its comments loaded).
 *
 * @param {any} ctx @param {string} beadId
 */
export async function loadChips(ctx, beadId) {
  bind(ctx);
  await api.chips(beadId);
}

/**
 * After a comment was saved: let the server handle the mentions in it.
 *
 * @param {any} ctx @param {string} beadId @param {string} text
 */
export async function afterCommentPosted(ctx, beadId, text) {
  bind(ctx);
  await api.scan(beadId, text);
}

// ---------- the picker ----------

/**
 * Wire the picker to one textarea. Returns a cleanup function.
 *
 * @param {HTMLTextAreaElement} ta
 * @param {HTMLElement} host where the list is drawn
 */
export function attachPicker(ta, host) {
  /** @type {{ role: string, ar: string, en: string }[]} */
  let rows = [];
  /** @type {{ role: string, ar: string, en: string }[]} */
  let all = [];
  let index = 0;
  let open = false;
  /** @type {{ start: number, query: string } | null} */
  let tok = null;
  void api.roles().then((r) => {
    all = r;
  });

  const close = () => {
    open = false;
    tok = null;
    ta.removeAttribute('aria-activedescendant');
    ta.setAttribute('aria-expanded', 'false');
    draw();
  };

  /** @param {{ role: string }} row */
  const pick = (row) => {
    if (!tok) return;
    const caret = ta.selectionStart ?? ta.value.length;
    const ins = `@${row.role} `;
    ta.value = ta.value.slice(0, tok.start) + ins + ta.value.slice(caret);
    const at = tok.start + ins.length;
    ta.setSelectionRange(at, at);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    ta.focus();
  };

  function update() {
    tok = tokenAt(ta.value, ta.selectionStart ?? 0);
    if (!tok) return close();
    const q = tok.query;
    rows = (all.length ? all : pickerItems('')).filter((r) =>
      r.role.startsWith(q)
    );
    index = Math.min(index, Math.max(rows.length - 1, 0));
    open = true;
    ta.setAttribute('aria-expanded', 'true');
    draw();
  }

  function draw() {
    if (!open) {
      render(nothing, host);
      return;
    }
    const comp = ta.closest('.u3-ts__composer');
    const pos =
      comp instanceof HTMLElement
        ? `bottom:${Math.max(comp.clientHeight - ta.offsetTop + 6, 0)}px`
        : '';
    if (rows[index])
      ta.setAttribute('aria-activedescendant', `u3-mn-o-${rows[index].role}`);
    render(
      html`<div class="u3-mn__pop" style=${pos}>
        <ul
          class="u3-mn__list"
          role="listbox"
          id="u3-mn-list"
          aria-label=${m('list')}
        >
          ${rows.length
            ? rows.map(
                (r, i) =>
                  html`<li
                    id=${'u3-mn-o-' + r.role}
                    role="option"
                    class="u3-mn__row${i === index ? ' is-on' : ''}"
                    aria-selected=${i === index ? 'true' : 'false'}
                    @pointerdown=${(/** @type {Event} */ e) => {
                      e.preventDefault();
                      pick(r);
                    }}
                  >
                    <span class="u3-mn__av u3-mn__av--${r.role}" dir="ltr"
                      >${r.role.slice(0, 2).toUpperCase()}</span
                    >
                    <span class="u3-mn__nm">
                      <span class="u3-mn__r" dir="ltr">@${r.role}</span>
                      <span class="u3-mn__d" dir="auto"
                        >${getLang() === 'ar' ? r.ar : r.en}</span
                      >
                    </span>
                    ${i === index
                      ? html`<span class="u3-mn__ret" aria-hidden="true"
                          >↵</span
                        >`
                      : nothing}
                  </li>`
              )
            : html`<li class="u3-mn__none" role="presentation">
                ${m('none')}
              </li>`}
        </ul>
        <p class="u3-mn__hint">${m('hint')}</p>
      </div>`,
      host
    );
  }

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      index =
        (index + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      draw();
    } else if (
      (e.key === 'Enter' || e.key === 'Tab') &&
      rows[index] &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      e.stopPropagation();
      pick(rows[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const onInput = () => {
    index = 0;
    update();
  };
  ta.setAttribute('aria-haspopup', 'listbox');
  ta.setAttribute('aria-controls', 'u3-mn-list');
  ta.setAttribute('aria-expanded', 'false');
  ta.addEventListener('keydown', onKey, true);
  ta.addEventListener('input', onInput);
  ta.addEventListener('click', update);
  ta.addEventListener('blur', () => {
    setTimeout(() => {
      if (open && document.activeElement !== ta) close();
    }, 120);
  });
  return () => {
    ta.removeEventListener('keydown', onKey, true);
    ta.removeEventListener('input', onInput);
    ta.removeEventListener('click', update);
    render(nothing, host);
  };
}

/** @type {null | (() => void)} */
let detach = null;
/** @param {Element | undefined} el */
function onRef(el) {
  if (detach) detach();
  detach = null;
  if (!el) return;
  // lit runs this while the element is still in a detached fragment: wait for the insert
  queueMicrotask(() => {
    if (!el.isConnected || detach) return;
    const ta = el.closest('.u3-ts__composer')?.querySelector('textarea');
    if (ta instanceof HTMLTextAreaElement) {
      detach = attachPicker(ta, /** @type {HTMLElement} */ (el));
    }
  });
}

registerComposerExtension((ctx) => {
  bind(ctx);
  return html`<div class="u3-mn" ${ref(onRef)}></div>`;
});

export { lastCtx as _lastCtx };
