/**
 * Task page edit mode (v3, beads-lite-1bo5.6.59.7). Same write path as the
 * legacy detail view: edit-text (title, description), update-status,
 * update-priority, update-assignee, label-add, label-remove. Selects, assignee
 * and labels save at once; title and description save on their Save button.
 * A failed save shows a text error next to the field and keeps the old value.
 * Plugged into views/task.js, which owns the issue and the redraw.
 */
import { html, nothing } from 'lit-html';
import { SETTABLE_STATUSES } from '../../protocol.js';
import { priorityName } from '../../utils/priority.js';
import { statusLabel } from '../../utils/status.js';
import { chip } from '../components/index.js';
import { personLabel } from '../data/people.js';
import { t3 } from '../i18n.js';
import { icon } from '../icons.js';

export const TITLE_MAX = 500;
export const TEXT_MAX = 100000;
export const LABEL_MAX = 60;
const ROLES = ['cos', 'cto', 'pm', 'swe', 'qa', 'sre', 'sec', 'legal', 'ux'];

/** @param {any} err */
const why = (err) => String(err?.message || err || '').trim();

/**
 * @param {{ send: (t: string, p?: any) => Promise<any>, get: () => any,
 *   patch: (p: Record<string, any>) => void, redraw: () => void, ctx?: any }} o
 */
export function createTaskEdit(o) {
  let editing = false;
  let busy = '';
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, string>} */
  const drafts = {};
  let new_label = '';

  /** @param {string} key */
  const err = (key) =>
    errors[key]
      ? html`<p role="alert" class="u3-ed__err" dir="auto">${errors[key]}</p>`
      : nothing;

  /**
   * Run one save. `apply` is the optimistic local change; undone on failure.
   *
   * @param {string} key
   * @param {string} type
   * @param {any} payload
   * @param {Record<string, any>} local
   * @param {string} fail_key i18n key of the failure text
   * @param {HTMLInputElement | HTMLSelectElement} [ctl] control to put back on failure
   */
  async function save(key, type, payload, local, fail_key, ctl) {
    const cur = o.get();
    if (!cur || busy) return false;
    busy = key;
    errors[key] = '';
    /** @type {Record<string, any>} */
    const before = {};
    for (const k of Object.keys(local)) before[k] = cur[k];
    o.patch(local);
    try {
      await o.send(type, { id: cur.id, ...payload });
      busy = '';
      delete drafts[key];
      o.redraw();
      return true;
    } catch (e) {
      busy = '';
      o.patch(before);
      // lit does not reset a control the user changed, so put it back.
      if (ctl) ctl.value = String(Object.values(before)[0] ?? '');
      const r = why(e);
      errors[key] = r ? `${t3(fail_key)}: ${r}` : t3(fail_key);
      o.redraw();
      return false;
    }
  }

  /** @param {any} i */
  function knownAssignees(i) {
    /** @type {Set<string>} */
    const s = new Set(ROLES);
    try {
      const rows = o.ctx?.listSelectors?.selectIssuesFor('tab:all') || [];
      for (const r of rows) if (r?.assignee) s.add(String(r.assignee));
    } catch {
      // list not loaded: roles only
    }
    if (i?.assignee) s.add(String(i.assignee));
    return [...s].sort();
  }

  /** @param {string} key - @param {string} v */
  const setDraft = (key, v) => {
    drafts[key] = v;
  };

  return {
    isEditing: () => editing,
    toggle() {
      editing = !editing;
      if (!editing) this.reset();
      o.redraw();
    },

    /** Leave edit mode and drop drafts and errors (also on a route change). */
    reset() {
      editing = false;
      new_label = '';
      for (const k of Object.keys(errors)) delete errors[k];
      for (const k of Object.keys(drafts)) delete drafts[k];
    },

    /** Pencil button for the top bar. */
    toggleButton() {
      return html`<button
        type="button"
        class="u3-iconbtn u3-ed__toggle"
        aria-pressed=${editing ? 'true' : 'false'}
        aria-label=${editing ? t3('u3_ed_done') : t3('u3_ed_edit')}
        title=${editing ? t3('u3_ed_done') : t3('u3_ed_edit')}
        @click=${() => this.toggle()}
      >
        ${editing
          ? icon('a_approve', { size: 18 })
          : icon('a_edit', { size: 18 })}
      </button>`;
    },

    /** @param {any} i */
    title(i) {
      if (!editing) {
        return html`<h2 class="u3-ts__title" dir="auto">${i.title}</h2>`;
      }
      const val = drafts.title ?? String(i.title || '');
      return html`<div class="u3-ed__block">
        <label class="u3-ed__lbl" for="u3-ed-title">${t3('u3_ed_title')}</label>
        <input
          id="u3-ed-title"
          class="u3-ed__in"
          dir="auto"
          maxlength=${TITLE_MAX}
          .value=${val}
          @input=${(/** @type {Event} */ e) =>
            setDraft('title', /** @type {HTMLInputElement} */ (e.target).value)}
          @keydown=${(/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void this.saveTitle();
            }
          }}
        />
        <button
          type="button"
          class="u3-btn u3-btn--primary"
          ?disabled=${busy === 'title'}
          @click=${() => void this.saveTitle()}
        >
          ${t3('u3_ed_save')}
        </button>
        ${err('title')}
      </div>`;
    },

    async saveTitle() {
      const i = o.get();
      const v = String(drafts.title ?? i.title ?? '').trim();
      if (!v) {
        errors.title = t3('u3_ed_title_req');
        o.redraw();
        return;
      }
      if (v === i.title) {
        delete drafts.title;
        o.redraw();
        return;
      }
      await save(
        'title',
        'edit-text',
        { field: 'title', value: v },
        { title: v },
        'u3_ed_fail_title'
      );
    },

    /** Description block in edit mode (always shown, even when empty). */
    description(/** @type {any} */ i) {
      const val = drafts.description ?? String(i.description || '');
      return html`<section
        class="u3-ts__sec u3-ed__block"
        data-anchor="description"
      >
        <label class="u3-ts__h u3-ed__lbl" for="u3-ed-desc"
          >${t3('u3_ts_description')}</label
        >
        <textarea
          id="u3-ed-desc"
          class="u3-ed__in u3-ed__ta"
          dir="auto"
          rows="8"
          maxlength=${TEXT_MAX}
          .value=${val}
          @input=${(/** @type {Event} */ e) =>
            setDraft(
              'description',
              /** @type {HTMLTextAreaElement} */ (e.target).value
            )}
        ></textarea>
        <button
          type="button"
          class="u3-btn u3-btn--primary"
          ?disabled=${busy === 'description'}
          @click=${() => void this.saveDescription()}
        >
          ${t3('u3_ed_save')}
        </button>
        ${err('description')}
      </section>`;
    },

    async saveDescription() {
      const i = o.get();
      const v = String(drafts.description ?? i.description ?? '');
      if (v === String(i.description || '')) {
        delete drafts.description;
        o.redraw();
        return;
      }
      await save(
        'description',
        'edit-text',
        { field: 'description', value: v },
        { description: v },
        'u3_ed_fail_desc'
      );
    },

    /** Editable detail rows: status, priority, assignee, labels. */
    rows(/** @type {any} */ i) {
      const status = String(i.status || 'open');
      const statuses = SETTABLE_STATUSES.includes(/** @type {any} */ (status))
        ? [...SETTABLE_STATUSES]
        : [status, ...SETTABLE_STATUSES];
      const prio = Number(i.priority ?? 2);
      const labels = Array.isArray(i.labels) ? i.labels : [];
      const assignee = drafts.assignee ?? String(i.assignee || '');
      return html`
        <div class="u3-ed__row">
          <label class="u3-ts__k" for="u3-ed-status"
            >${t3('u3_ts_status')}</label
          >
          <select
            id="u3-ed-status"
            class="u3-ed__in"
            @change=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLSelectElement} */ (e.target).value;
              if (v !== status)
                void save(
                  'status',
                  'update-status',
                  { status: v },
                  { status: v },
                  'u3_ed_fail_status',
                  /** @type {HTMLSelectElement} */ (e.target)
                );
            }}
          >
            ${statuses.map(
              (s) =>
                html`<option value=${s} ?selected=${s === status}>
                  ${statusLabel(s)}
                </option>`
            )}
          </select>
          ${err('status')}
        </div>
        <div class="u3-ed__row">
          <label class="u3-ts__k" for="u3-ed-prio"
            >${t3('u3_ts_priority')}</label
          >
          <select
            id="u3-ed-prio"
            class="u3-ed__in"
            @change=${(/** @type {Event} */ e) => {
              const v = Number(
                /** @type {HTMLSelectElement} */ (e.target).value
              );
              if (v !== prio)
                void save(
                  'priority',
                  'update-priority',
                  { priority: v },
                  { priority: v },
                  'u3_ed_fail_prio',
                  /** @type {HTMLSelectElement} */ (e.target)
                );
            }}
          >
            ${[0, 1, 2, 3, 4].map(
              (p) =>
                html`<option value=${String(p)} ?selected=${p === prio}>
                  ${priorityName(p)}
                </option>`
            )}
          </select>
          ${err('priority')}
        </div>
        <div class="u3-ed__row">
          <label class="u3-ts__k" for="u3-ed-asg"
            >${t3('u3_ts_assignee')}</label
          >
          <select
            id="u3-ed-asg"
            class="u3-ed__in"
            @input=${(/** @type {Event} */ e) =>
              setDraft(
                'assignee',
                /** @type {HTMLSelectElement} */ (e.target).value
              )}
            @change=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLSelectElement} */ (
                e.target
              ).value.trim();
              if (v !== String(i.assignee || ''))
                void save(
                  'assignee',
                  'update-assignee',
                  { assignee: v },
                  { assignee: v },
                  'u3_ed_fail_assignee',
                  /** @type {HTMLSelectElement} */ (e.target)
                );
            }}
          >
            <option value="" ?selected=${assignee === ''}>
              ${t3('u3_tk_unassigned')}
            </option>
            ${knownAssignees(i).map(
              (r) =>
                html`<option value=${r} ?selected=${assignee === r}>
                  ${personLabel(r).full}
                </option>`
            )}
          </select>
          ${err('assignee')}
        </div>
        <div class="u3-ed__row">
          <span class="u3-ts__k">${t3('u3_ts_labels')}</span>
          <span class="u3-ts__labels">
            ${labels.map(
              (/** @type {string} */ l) =>
                html`<span class="u3-ed__lab"
                  >${chip({ label: l })}<button
                    type="button"
                    class="u3-ed__x"
                    aria-label=${t3('u3_ed_rm_label') + ' ' + l}
                    ?disabled=${busy !== ''}
                    @click=${() =>
                      void save(
                        'labels',
                        'label-remove',
                        { label: l },
                        {
                          labels: labels.filter(
                            (/** @type {string} */ x) => x !== l
                          )
                        },
                        'u3_ed_fail_label'
                      )}
                  >
                    ${icon('a_close', { size: 16 })}
                  </button></span
                >`
            )}
          </span>
          <span class="u3-ed__add">
            <input
              class="u3-ed__in"
              dir="auto"
              maxlength=${LABEL_MAX}
              placeholder=${t3('u3_ed_label_ph')}
              aria-label=${t3('u3_ed_add_label')}
              .value=${new_label}
              @input=${(/** @type {Event} */ e) => {
                new_label = /** @type {HTMLInputElement} */ (e.target).value;
              }}
              @keydown=${(/** @type {KeyboardEvent} */ e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void this.addLabel();
                }
              }}
            />
            <button
              type="button"
              class="u3-btn u3-btn--ghost"
              ?disabled=${busy !== ''}
              @click=${() => void this.addLabel()}
            >
              ${t3('u3_ed_add')}
            </button>
          </span>
          ${err('labels')}
        </div>
      `;
    },

    async addLabel() {
      const i = o.get();
      const v = new_label.trim();
      if (!v) return;
      const labels = Array.isArray(i.labels) ? i.labels : [];
      if (labels.includes(v)) {
        new_label = '';
        o.redraw();
        return;
      }
      const ok = await save(
        'labels',
        'label-add',
        { label: v },
        { labels: [...labels, v] },
        'u3_ed_fail_label'
      );
      if (ok) {
        new_label = '';
        o.redraw();
      }
    }
  };
}
