/**
 * Bulk select on the tasks screen (task .59.11, UI of .63).
 *
 * `createBulk` holds the select-mode state for one mounted tasks view; the
 * view wires card events to it and draws `renderBulkBar(selected, { bulk })`
 * (the seam). Actions: close (reason), move (status), defer (date). Every
 * action goes: sheet with confirm line -> result sheet -> 10 s undo.
 * Data: ui/data/bulk.js (fixture until the server API of .63 lands).
 */
import { html, render } from 'lit-html';
import { openSheet } from '../components/sheet.js';
import { MAX_BULK, UNDO_MS, createBulkApi } from '../data/bulk.js';
import { t3 } from '../i18n.js';

export const LONG_PRESS_MS = 450;
export const ROLE_CHOICES = [
  'cto',
  'swe',
  'sre',
  'sec',
  'pm',
  'ux',
  'qa',
  'cos',
  'legal',
  'analytics',
  'sup'
];
const MOVE_TO = [
  ['open', 'u3_tk_col_ready'],
  ['in_progress', 'u3_tk_col_progress'],
  ['blocked', 'u3_tk_col_blocked'],
  ['waiting_for_test', 'u3_tk_col_test'],
  ['waiting_for_merge', 'u3_tk_col_merge']
];

/**
 * @param {string} key
 * @param {Record<string, any>} vars
 */
const tt = (key, vars) =>
  t3(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** @param {string} code */
const reasonText = (code) => {
  const k = 'u3_bk_r_' + code;
  const s = t3(k);
  return s === k ? code : s;
};

/**
 * @param {{
 *   host: HTMLElement,
 *   redraw: () => void,
 *   all: () => any[],
 *   visible: () => string[],
 *   transport?: (type: string, payload: any) => Promise<any>
 * }} o
 */
export function createBulk(o) {
  const api = createBulkApi({ transport: o.transport });
  /** @type {Set<string>} */
  const selected = new Set();
  let mode = false;
  let pushed = false;
  /** @type {{ close: () => void }|null} */
  let sheet = null;
  /** @type {{ batch: string, n: number }|null} */
  let undo = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let undo_timer = null;
  /** @type {(() => void)|null} */
  let resultUi = null;
  let notice = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  let press_timer = null;
  let press_xy = [0, 0];
  let suppress_click = false;

  const sheetHost = () => o.host.closest('.u3') || o.host;

  function doExit() {
    mode = false;
    selected.clear();
    notice = '';
    sheet?.close();
    o.redraw();
  }
  function enter() {
    if (mode) return;
    mode = true;
    try {
      history.pushState({ u3bulk: 1 }, '');
      pushed = true;
    } catch {
      pushed = false;
    }
    o.redraw();
  }
  function exit() {
    if (!mode) return;
    if (pushed) {
      pushed = false;
      history.back();
    }
    doExit();
  }
  const onPop = () => {
    if (pushed && mode) {
      pushed = false;
      doExit();
    }
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape' && mode && !sheet) exit();
  };
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);

  /** @param {string} id */
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    notice = '';
    o.redraw();
  }

  function clearPress() {
    if (press_timer) clearTimeout(press_timer);
    press_timer = null;
  }

  const handlers = {
    /**
     * @param {PointerEvent} ev
     * @param {string} id
     */
    down(ev, id) {
      if (ev.button > 0 || mode) return;
      press_xy = [ev.clientX, ev.clientY];
      clearPress();
      press_timer = setTimeout(() => {
        press_timer = null;
        suppress_click = true;
        enter();
        selected.add(id);
        o.redraw();
      }, LONG_PRESS_MS);
    },
    /** @param {PointerEvent} ev */
    move(ev) {
      if (!press_timer) return;
      if (
        Math.abs(ev.clientX - press_xy[0]) > 8 ||
        Math.abs(ev.clientY - press_xy[1]) > 8
      ) {
        clearPress();
      }
    },
    up() {
      clearPress();
    },
    /**
     * @param {Event} ev
     * @param {string} id
     */
    click(ev, id) {
      if (suppress_click) {
        suppress_click = false;
        ev.preventDefault();
        return;
      }
      if (!mode) return;
      ev.preventDefault();
      toggle(id);
    },
    /** @param {Event} ev */
    context(ev) {
      // The phone's long-press menu would fight select mode.
      if (press_timer || mode || suppress_click) ev.preventDefault();
    }
  };

  /* ---------- actions ---------- */

  function stopUndo() {
    if (undo_timer) clearTimeout(undo_timer);
    undo_timer = null;
    undo = null;
  }

  /**
   * @param {'close'|'move'|'defer'|'label'|'assign'} action
   * @param {any} params
   * @param {boolean} take_over
   */
  async function run(action, params, take_over) {
    const ids = [...selected];
    stopUndo();
    let r;
    try {
      r = await api.apply({ action, ids, params, take_over }, o.all());
    } catch {
      notice = t3('u3_bk_failed');
      sheet?.close();
      o.redraw();
      return;
    }
    if (r.ok.length) {
      undo = { batch: r.batch, n: r.ok.length };
      undo_timer = setTimeout(() => {
        undo = null;
        undo_timer = null;
        resultUi?.();
        o.redraw();
      }, UNDO_MS);
    }
    selected.clear();
    for (const x of r.refused) selected.add(x.id); // keep refused for a retry
    openResult(r);
    o.redraw();
  }

  /**
   * @param {{ preview: boolean, ok: string[], refused: Array<{id:string, reason:string}> }} r
   */
  function openResult(r) {
    const body = document.createElement('div');
    const paint = () =>
      render(
        html`<div class="u3bk-result" data-testid="bulk-result">
          <p class="u3bk-big">${tt('u3_bk_done', { n: r.ok.length })}</p>
          ${r.refused.length
            ? html`<p class="u3bk-big u3bk-big--bad">
                  ${tt('u3_bk_refused', { n: r.refused.length })}
                </p>
                <ul class="u3bk-refused">
                  ${r.refused.map(
                    (x) =>
                      html`<li>
                        <span class="u3-mono">${x.id}</span>
                        <span>${reasonText(x.reason)}</span>
                      </li>`
                  )}
                </ul>`
            : ''}
          ${r.preview
            ? html`<p class="u3-muted u3bk-preview">${t3('u3_bk_preview')}</p>`
            : ''}
          ${undo ? undoButton() : ''}
        </div>`,
        body
      );
    resultUi = paint;
    paint();
    sheet?.close();
    sheet = openSheet(sheetHost(), {
      title: t3('u3_bk_result'),
      body,
      closeLabel: t3('u3_bk_ok'),
      onClose: () => {
        sheet = null;
        resultUi = null;
        o.redraw();
      }
    });
  }

  function undoButton() {
    return html`<button
      type="button"
      class="u3-btn u3-btn--ghost u3bk-undo"
      data-testid="bulk-undo"
      @click=${async () => {
        const u = undo;
        if (!u) return;
        stopUndo();
        await api.undo(u.batch);
        notice = tt('u3_bk_undone', { n: u.n });
        sheet?.close();
        o.redraw();
      }}
    >
      ${t3('u3_bk_undo')}
    </button>`;
  }

  /** @param {'close'|'move'|'defer'|'label'|'assign'} action */
  function openAction(action) {
    const n = selected.size;
    if (n === 0) return;
    if (n > MAX_BULK) {
      notice = tt('u3_bk_too_many', { max: MAX_BULK, n });
      o.redraw();
      return;
    }
    const st = {
      reason: '',
      status: 'open',
      date: '',
      reopen: false,
      take: false,
      label_mode: 'add',
      label: '',
      role: ROLE_CHOICES[0]
    };
    const body = document.createElement('div');
    const valid = () =>
      action === 'close'
        ? st.reason.trim().length > 0
        : action === 'defer'
          ? st.reopen || st.date !== ''
          : action === 'label'
            ? /^[^\s,]{1,60}$/.test(st.label.trim())
            : true;
    const confirmLine = () =>
      action === 'close'
        ? tt('u3_bk_c_close', { n, reason: st.reason.trim() })
        : action === 'move'
          ? tt('u3_bk_c_move', {
              n,
              to: t3(MOVE_TO.find((m) => m[0] === st.status)?.[1] || '')
            })
          : action === 'label'
            ? tt(
                st.label_mode === 'add'
                  ? 'u3_bk_c_label_add'
                  : 'u3_bk_c_label_rm',
                {
                  n,
                  label: st.label.trim()
                }
              )
            : action === 'assign'
              ? tt(st.role ? 'u3_bk_c_assign' : 'u3_bk_c_unassign', {
                  n,
                  role: st.role
                })
              : tt('u3_bk_c_defer', {
                  n,
                  until: st.reopen ? t3('u3_bk_until_reopen') : st.date
                });
    /** @param {Event} e */
    const val = (e) => /** @type {HTMLInputElement} */ (e.target).value;
    /** @param {Event} e */
    const chk = (e) => /** @type {HTMLInputElement} */ (e.target).checked;
    const paint = () =>
      render(
        html`<form
          class="u3bk-form"
          @submit=${(/** @type {Event} */ e) => {
            e.preventDefault();
            if (!valid()) return;
            void run(
              action,
              action === 'close'
                ? { reason: st.reason.trim() }
                : action === 'move'
                  ? { status: st.status }
                  : action === 'label'
                    ? st.label_mode === 'add'
                      ? { add: [st.label.trim()], remove: [] }
                      : { add: [], remove: [st.label.trim()] }
                    : action === 'assign'
                      ? { assignee: st.role }
                      : { until: st.reopen ? '' : st.date },
              st.take
            );
          }}
        >
          ${action === 'close'
            ? html`<label class="u3bk-field"
                ><span>${t3('u3_bk_reason')}</span>
                <input
                  type="text"
                  dir="auto"
                  maxlength="200"
                  data-testid="bulk-reason"
                  .value=${st.reason}
                  @input=${(/** @type {Event} */ e) => {
                    st.reason = val(e);
                    paint();
                  }}
              /></label>`
            : ''}
          ${action === 'move'
            ? html`<label class="u3bk-field"
                ><span>${t3('u3_bk_move_to')}</span>
                <select
                  @change=${(/** @type {Event} */ e) => {
                    st.status = val(e);
                    paint();
                  }}
                >
                  ${MOVE_TO.map(
                    ([v, k]) =>
                      html`<option value=${v} ?selected=${st.status === v}>
                        ${t3(k)}
                      </option>`
                  )}
                </select></label
              >`
            : ''}
          ${action === 'label'
            ? html`<label class="u3bk-field"
                  ><span>${t3('u3_bk_label_mode')}</span>
                  <select
                    data-testid="bulk-label-mode"
                    @change=${(/** @type {Event} */ e) => {
                      st.label_mode = val(e);
                      paint();
                    }}
                  >
                    <option value="add" ?selected=${st.label_mode === 'add'}>
                      ${t3('u3_bk_label_add')}
                    </option>
                    <option
                      value="remove"
                      ?selected=${st.label_mode === 'remove'}
                    >
                      ${t3('u3_bk_label_rm')}
                    </option>
                  </select></label
                >
                <label class="u3bk-field"
                  ><span>${t3('u3_bk_label_name')}</span>
                  <input
                    type="text"
                    dir="auto"
                    maxlength="60"
                    data-testid="bulk-label-input"
                    .value=${st.label}
                    @input=${(/** @type {Event} */ e) => {
                      st.label = val(e);
                      paint();
                    }}
                /></label>`
            : ''}
          ${action === 'assign'
            ? html`<label class="u3bk-field"
                ><span>${t3('u3_bk_assign_to')}</span>
                <select
                  data-testid="bulk-role"
                  @change=${(/** @type {Event} */ e) => {
                    st.role = val(e);
                    paint();
                  }}
                >
                  ${ROLE_CHOICES.map(
                    (r) =>
                      html`<option value=${r} ?selected=${st.role === r}>
                        ${r}
                      </option>`
                  )}
                  <option value="" ?selected=${st.role === ''}>
                    ${t3('u3_bk_unassign')}
                  </option>
                </select></label
              >`
            : ''}
          ${action === 'defer'
            ? html`<label class="u3bk-field"
                  ><span>${t3('u3_bk_until')}</span>
                  <input
                    type="date"
                    .value=${st.date}
                    ?disabled=${st.reopen}
                    @input=${(/** @type {Event} */ e) => {
                      st.date = val(e);
                      paint();
                    }}
                /></label>
                <label class="u3bk-check"
                  ><input
                    type="checkbox"
                    .checked=${st.reopen}
                    @change=${(/** @type {Event} */ e) => {
                      st.reopen = chk(e);
                      paint();
                    }}
                  />
                  ${t3('u3_bk_until_reopen')}</label
                >`
            : ''}
          <label class="u3bk-check"
            ><input
              type="checkbox"
              .checked=${st.take}
              @change=${(/** @type {Event} */ e) => {
                st.take = chk(e);
              }}
            />
            ${t3('u3_bk_take_over')}</label
          >
          <p class="u3bk-confirm" data-testid="bulk-confirm">
            ${valid() ? confirmLine() : ''}
          </p>
          <button
            type="submit"
            class="u3-btn u3-btn--primary u3-btn--block"
            data-testid="bulk-apply"
            ?disabled=${!valid()}
          >
            ${tt('u3_bk_a_' + action, { n })}
          </button>
        </form>`,
        body
      );
    paint();
    sheet?.close();
    sheet = openSheet(sheetHost(), {
      title: t3('u3_bk_' + action),
      body,
      closeLabel: t3('u3_bk_cancel'),
      onClose: () => {
        sheet = null;
      }
    });
  }

  /* ---------- render ---------- */

  function toast() {
    return html`<div class="u3bk-toast" role="status">
      <span>${tt('u3_bk_done', { n: undo?.n ?? 0 })}</span>${undoButton()}
    </div>`;
  }

  function bar() {
    if (!mode) {
      return html`${undo && !sheet ? toast() : ''}
      ${notice
        ? html`<p class="u3bk-note u3-muted" role="status">${notice}</p>`
        : ''}`;
    }
    const vis = new Set(o.visible());
    let hidden = 0;
    for (const id of selected) if (!vis.has(id)) hidden++;
    const n = selected.size;
    const over = n > MAX_BULK;
    return html`${undo && !sheet ? toast() : ''}
      <div
        class="u3bk-bar"
        role="toolbar"
        aria-label=${t3('u3_bk_select')}
        data-testid="bulk-bar"
      >
        <div class="u3bk-bar__top">
          <strong class="u3bk-count" data-testid="bulk-count"
            >${n} ${t3('u3_bk_selected')}</strong
          >
          <button
            type="button"
            class="u3-btn u3-btn--ghost"
            data-testid="bulk-all"
            @click=${() => {
              for (const id of vis) selected.add(id);
              o.redraw();
            }}
          >
            ${t3('u3_bk_all')}
          </button>
          <button
            type="button"
            class="u3-btn u3-btn--ghost"
            data-testid="bulk-cancel"
            @click=${exit}
          >
            ${t3('u3_bk_cancel')}
          </button>
        </div>
        ${hidden
          ? html`<p class="u3bk-note u3-muted">
              ${tt('u3_bk_hidden', { n: hidden })}
            </p>`
          : ''}
        ${over || notice
          ? html`<p class="u3bk-note u3bk-note--bad" role="alert">
              ${over ? tt('u3_bk_too_many', { max: MAX_BULK, n }) : notice}
            </p>`
          : ''}
        <div class="u3bk-bar__acts">
          ${['close', 'move', 'defer', 'label', 'assign'].map(
            (a) =>
              html`<button
                type="button"
                class="u3-btn ${a === 'close'
                  ? 'u3-btn--danger'
                  : 'u3-btn--ghost'}"
                data-testid=${'bulk-' + a}
                ?disabled=${n === 0}
                @click=${() => openAction(/** @type {any} */ (a))}
              >
                ${t3('u3_bk_' + a)}
              </button>`
          )}
        </div>
      </div>`;
  }

  function enterButton() {
    return html`<button
      type="button"
      class="u3t-fchip u3bk-enter"
      data-testid="bulk-enter"
      aria-pressed=${mode ? 'true' : 'false'}
      @click=${() => (mode ? exit() : enter())}
    >
      ${t3('u3_bk_select')}
    </button>`;
  }

  /** @param {string[]} ids */
  function selectMany(ids) {
    for (const id of ids) selected.add(id);
    o.redraw();
  }

  return {
    selectMany,
    enterButton,
    selected,
    isMode: () => mode,
    isSelected: (/** @type {string} */ id) => selected.has(id),
    handlers,
    enter,
    exit,
    bar,
    destroy() {
      clearPress();
      stopUndo();
      sheet?.close();
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
    }
  };
}

/**
 * SEAM (task 11 owns): the bar over the tasks list. `ctx.bulk` is the
 * controller made by createBulk; without it nothing is drawn.
 *
 * @param {Set<string>} _selected
 * @param {any} ctx
 */
export function renderBulkBar(_selected, ctx) {
  return ctx && ctx.bulk ? ctx.bulk.bar() : html``;
}
