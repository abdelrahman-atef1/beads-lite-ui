/**
 * Holder row of the task page (beads-lite-1bo5.13.20.1): who holds the task,
 * as one 52px tap target. One tap opens the assign sheet (bottom sheet on a
 * phone, popover on a PC), one tap on a name saves at once through the same
 * optimistic update-assignee as edit mode (task-edit.js assign()). Undo for
 * 6 s; a failed save reverts and shows the reason with Retry.
 */
import { html, nothing } from 'lit-html';
import { personLabel } from '../data/people.js';
import { t3 } from '../i18n.js';
import { personChip } from '../people/person-chip.js';

export const UNDO_MS = 6000;
const FIND_OVER = 8;

/**
 * @param {{ edit: ReturnType<typeof import('../views/task-edit.js').createTaskEdit>,
 *   get: () => any, redraw: () => void }} o
 */
export function createHolder(o) {
  /** @type {'' | 'top' | 'side'} */
  let open_in = '';
  let find = '';
  /** @type {null | { prev: string, msg: string }} */
  let undo = null;
  /** @type {null | { value: string }} */
  let failed = null;
  /** @type {any} */
  let timer = null;

  const full = (/** @type {string} */ v) =>
    v ? personLabel(v).full : t3('u3_tk_unassigned');

  function clearUndo() {
    clearTimeout(timer);
    timer = null;
    undo = null;
  }

  function close() {
    open_in = '';
    find = '';
    document.removeEventListener('keydown', onKey, true);
    o.redraw();
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  /** @param {'top' | 'side'} where */
  function openSheet(where) {
    if (o.edit.busy()) return;
    open_in = where;
    find = '';
    document.addEventListener('keydown', onKey, true);
    o.redraw();
  }

  /** Save `v`; `quiet` = it is an Undo (no new toast). */
  async function assign(/** @type {string} */ v, quiet = false) {
    const prev = String(o.get()?.assignee || '');
    if (v === prev || o.edit.busy()) return;
    failed = null;
    if (!quiet) clearUndo();
    const run = o.edit.assign(v); // patches the issue before its first await
    o.redraw();
    const ok = await run;
    if (!ok) {
      failed = { value: v };
      clearUndo();
    } else if (!quiet) {
      undo = {
        prev,
        msg: v
          ? t3('u3_hd_assigned').replace('{name}', full(v))
          : t3('u3_hd_unassigned_done')
      };
      timer = setTimeout(() => {
        clearUndo();
        o.redraw();
      }, UNDO_MS);
    } else {
      clearUndo();
    }
    o.redraw();
  }

  /** @param {string} v */
  function pick(v) {
    document.removeEventListener('keydown', onKey, true);
    open_in = '';
    find = '';
    void assign(v);
  }

  /** @param {any} i */
  function sheet(i) {
    const cur = String(i.assignee || '');
    const names = o.edit
      .assignees(i)
      .filter((/** @type {string} */ r) => r !== cur);
    const q = find.trim().toLowerCase();
    // current first (checked), then Unassigned, then everyone else
    const all = cur ? [cur, '', ...names] : ['', ...names];
    const shown = all.filter(
      (r) =>
        !q || r.toLowerCase().includes(q) || full(r).toLowerCase().includes(q)
    );
    return html`<div class="u3-hd__scrim" @click=${() => close()}></div>
      <div
        class="u3-hd__sheet"
        role="dialog"
        aria-modal="true"
        aria-label=${t3('u3_hd_assign_to')}
      >
        <div class="u3-hd__sh-head">
          <b>${t3('u3_hd_assign_to')}</b>
          <button
            type="button"
            class="u3-hd__x"
            aria-label=${t3('u3_hd_close')}
            @click=${() => close()}
          >
            &#10005;
          </button>
        </div>
        ${all.length > FIND_OVER
          ? html`<input
              class="u3-hd__find u3-ed__in"
              dir="auto"
              placeholder=${t3('u3_hd_find')}
              aria-label=${t3('u3_hd_find')}
              .value=${find}
              @input=${(/** @type {Event} */ e) => {
                find = /** @type {HTMLInputElement} */ (e.target).value;
                o.redraw();
              }}
            />`
          : nothing}
        <div class="u3-hd__list" role="radiogroup">
          ${shown.map(
            (r) =>
              html`<button
                type="button"
                role="radio"
                class="u3-hd__opt"
                data-role=${r}
                aria-checked=${r === cur ? 'true' : 'false'}
                @click=${() => pick(r)}
              >
                <i class="u3-hd__radio" aria-hidden="true"></i>
                <span dir="auto">${full(r)}</span>
              </button>`
          )}
        </div>
      </div>`;
  }

  return {
    /** Cancel the toast and the sheet (route change). */
    reset() {
      clearUndo();
      failed = null;
      open_in = '';
      find = '';
      document.removeEventListener('keydown', onKey, true);
    },

    /**
     * @param {any} i
     * @param {'top' | 'side'} where
     */
    row(i, where) {
      const cur = String(i.assignee || '');
      const busy = o.edit.busy() === 'assignee';
      return html`<div
        class="u3-hd u3-hd--${where}"
        data-holder=${where}
        ?data-open=${open_in === where}
      >
        <button
          type="button"
          class="u3-hd__row${cur ? '' : ' is-none'}"
          aria-haspopup="dialog"
          aria-expanded=${open_in === where ? 'true' : 'false'}
          ?aria-busy=${busy}
          @click=${() => (busy ? undefined : openSheet(where))}
        >
          <span class="u3-hd__k">${t3('u3_hd_label')}</span>
          <span class="u3-hd__v">
            ${cur
              ? personChip({ role: cur })
              : html`<span class="u3-hd__none"
                  >${t3('u3_tk_unassigned')}</span
                >`}
          </span>
          ${busy
            ? html`<i
                class="u3-hd__spin"
                role="status"
                aria-label=${t3('u3_hd_saving')}
              ></i>`
            : html`<i class="u3-hd__caret" aria-hidden="true"></i>`}
        </button>
        ${failed
          ? html`<p role="alert" class="u3-hd__err" dir="auto">
              ${t3('u3_hd_fail')}${o.edit.error('assignee')
                ? ': ' + o.edit.error('assignee').replace(/^[^:]*:\s*/, '')
                : ''}
              <button
                type="button"
                class="u3-btn u3-btn--ghost"
                @click=${() => {
                  const v = failed?.value ?? '';
                  void assign(v);
                }}
              >
                ${t3('u3_ts_retry')}
              </button>
            </p>`
          : nothing}
        ${open_in === where ? sheet(i) : nothing}
      </div>`;
    },

    /** Undo toast (one per page). */
    toast() {
      if (!undo) return nothing;
      const u = undo;
      return html`<div class="u3-hd__toast" role="status">
        <span dir="auto">${u.msg}</span>
        <button
          type="button"
          class="u3-btn u3-btn--ghost"
          @click=${() => {
            clearUndo();
            void assign(u.prev, true);
          }}
        >
          ${t3('u3_bk_undo')}
        </button>
      </div>`;
    }
  };
}
