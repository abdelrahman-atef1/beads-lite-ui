/**
 * Status, priority and type as icon + name (Jira style, beads-lite-1bo5.13.9):
 * one distinct icon per value, icon first, name second. `iconOnly` keeps the
 * name for screen readers and the tooltip. Icons come from ../icons.js.
 */
import { html } from 'lit-html';
import { clampPriority, priorityName } from '../../utils/priority.js';
import { statusLabel } from '../../utils/status.js';
import { icon } from '../icons.js';

const STATUS_ICON = /** @type {Record<string, string>} */ ({
  open: 's_open',
  in_progress: 's_prog',
  blocked: 's_block',
  deferred: 's_defer',
  owner_decision: 's_decide',
  waiting_for_test: 's_test',
  waiting_for_merge: 's_merge',
  closed: 's_done',
  pinned: 's_pinned',
  hooked: 's_hooked'
});
const PRIORITY_ICON = ['p_urgent', 'p_high', 'p_norm', 'p_low', 'p_backlog'];
const TYPES = ['bug', 'feature', 'task', 'epic', 'story', 'chore'];

/** @param {string} s */
export const statusIconName = (s) => STATUS_ICON[s] || 's_open';
/** @param {number | null | undefined} p */
export const priorityIconName = (p) => PRIORITY_ICON[clampPriority(p)];
/** @param {string} t  unknown types fall back to the Type icon */
export const typeIconName = (t) => (TYPES.includes(t) ? t : 'f_type');

/**
 * @param {string} name
 * @param {string} text
 * @param {{ size?: number, iconOnly?: boolean }} [o]
 */
function val(name, text, o = {}) {
  return html`<span
    class="u3-val${o.iconOnly ? ' u3-val--icon' : ''}"
    title=${text}
    >${icon(name, { size: o.size || 16 })}<span class="u3-val__t"
      >${text}</span
    ></span
  >`;
}

/**
 * @param {string} status
 * @param {{ size?: number, iconOnly?: boolean }} [o]
 */
export const statusVal = (status, o) =>
  val(statusIconName(status), statusLabel(status), o);

/**
 * @param {number | null | undefined} p
 * @param {{ size?: number, iconOnly?: boolean }} [o]
 */
export const priorityVal = (p, o) =>
  val(priorityIconName(p), priorityName(p), o);

/**
 * @param {string} type
 * @param {{ size?: number, iconOnly?: boolean }} [o]
 */
export const typeVal = (type, o) => val(typeIconName(type), type, o);
