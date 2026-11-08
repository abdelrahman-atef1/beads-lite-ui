// Issue Detail view implementation (lit-html based)
import { html, render } from 'lit-html';
import { parseView } from '../router.js';
import {
  commentAnchor,
  findCommentIndex,
  findLineElement,
  parseAnchor
} from '../utils/anchor.js';
import { bindAttClicks, setImgContext } from '../utils/att-images.js';
import { parseDecisionComment } from '../utils/decision-comment.js';
import { renderFolded } from '../utils/fold.js';
import { getLang, t } from '../utils/i18n.js';
import { issueHashFor } from '../utils/issue-url.js';
import { linkifyText } from '../utils/linkify-ids.js';
import { debug } from '../utils/logging.js';
import { renderMarkdown } from '../utils/markdown.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { priorityName } from '../utils/priority.js';
import {
  isSettableStatus,
  statusLabel,
  statusOptions
} from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { createTypeBadge } from '../utils/type-badge.js';
import { fitChips, renderDetailHeader } from './detail-header.js';
import { mountSlots } from './registry.js';

/**
 * Flat comment text keeps its line breaks.
 *
 * @param {string} s
 */
const flatComment = (s) =>
  html`<span class="comment-flat">${linkifyText(s)}</span>`;

/**
 * Build a failure message that includes the server reason.
 * @param {string} base
 * @param {any} err
 */
function failMsg(base, err) {
  const reason = String(err?.message || err || '').trim();
  return reason ? `${t(base)}: ${reason}` : t(base);
}

/**
 * Format a date string for display.
 *
 * @param {string} [dateStr]
 * @returns {string}
 */
export function formatCommentDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date value for display in the Dates card.
 *
 * The detail object reaches the client via `bd show --json` →
 * `normalizeIssueList`, which overwrites `created_at`/`updated_at`/`closed_at`
 * into numeric epoch-millisecond timestamps (via `parseTimestamp`, which uses
 * `Date.parse`) while leaving `started_at`/`defer_until` as raw ISO strings.
 * `new Date(value)` handles both a number(ms) and an ISO string identically.
 *
 * @param {number | string | null | undefined} value
 * @returns {string} Formatted local datetime, or '' when value is missing.
 */
export function formatDateValue(value) {
  if (value === null || value === undefined || value === '') return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/**
 * @typedef {Object} Dependency
 * @property {string} id
 * @property {string} [title]
 * @property {string} [status]
 * @property {number} [priority]
 * @property {string} [issue_type]
 */

/**
 * @typedef {Object} Comment
 * @property {number} id
 * @property {string} [author]
 * @property {string} text
 * @property {string} [created_at]
 */

/**
 * @typedef {Object} IssueDetail
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [design]
 * @property {string} [acceptance]
 * @property {string} [notes]
 * @property {string} [status]
 * @property {(string|null)} [close_reason]
 * @property {(number|string)} [created_at]
 * @property {(number|string)} [updated_at]
 * @property {(number|string|null)} [closed_at]
 * @property {string} [started_at]
 * @property {string} [defer_until]
 * @property {string} [assignee]
 * @property {number} [priority]
 * @property {string[]} [labels]
 * @property {Dependency[]} [dependencies]
 * @property {Dependency[]} [dependents]
 * @property {Comment[]} [comments]
 */

/**
 * Merge a mutation reply into the issue on screen. The tracker's data layer
 * answers a mutation with just `{ id }` (the change is pushed to every
 * subscriber by one refresh), so the reply must never replace the issue.
 *
 * @param {any} current
 * @param {any} reply
 */
function mergeReply(current, reply) {
  return { ...(current || {}), ...(reply || {}) };
}

/**
 * @param {string} hash
 */
function defaultNavigateFn(hash) {
  window.location.hash = hash;
}

/**
 * Create the Issue Detail view.
 *
 * @param {HTMLElement} mount_element - Element to render into.
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn - RPC transport.
 * @param {(hash: string) => void} [navigateFn] - Navigation function; defaults to setting location.hash.
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: (client_id?: string) => void) => () => void }} [issue_stores] - Optional issue stores for live updates.
 * @returns {{ load: (id: string) => Promise<void>, clear: () => void, destroy: () => void }} View API.
 */
export function createDetailView(
  mount_element,
  sendFn,
  navigateFn = defaultNavigateFn,
  issue_stores = undefined
) {
  const log = debug('views:detail');
  bindAttClicks(mount_element);
  /** @type {IssueDetail | null} */
  let current = null;
  /** @type {string | null} */
  let current_id = null;
  /** @type {boolean} */
  let pending = false;
  /** @type {boolean} */
  let edit_title = false;
  /** @type {boolean} */
  let edit_desc = false;
  /** @type {boolean} */
  let edit_design = false;
  /** @type {boolean} */
  let edit_notes = false;
  /** @type {boolean} */
  let edit_accept = false;
  /** @type {boolean} */
  let edit_assignee = false;
  /** @type {string} */
  let new_label_text = '';
  /** @type {string} */
  let comment_text = '';
  /** @type {boolean} */
  let comment_pending = false;
  /** @type {Set<string>} */
  const comments_loading = new Set();
  /** @type {Map<string, number>} */
  const comments_loaded_counts = new Map();
  /** @type {Map<string, string>} */
  const comments_load_errors = new Map();

  /** @type {HTMLDialogElement | null} */
  let delete_dialog = null;
  /** @type {string | null} */
  let delete_target_id = null;

  function closeDeleteDialog() {
    if (!delete_dialog) {
      return;
    }
    if (typeof delete_dialog.close === 'function') {
      delete_dialog.close();
    }
    delete_dialog.removeAttribute('open');
  }

  /**
   * @param {Event} ev
   */
  function onDeleteDialogCancel(ev) {
    ev.preventDefault();
    closeDeleteDialog();
  }

  async function onDeleteConfirm() {
    const id = delete_target_id;
    closeDeleteDialog();
    if (id) {
      await performDelete(id);
    }
  }

  function ensureDeleteDialog() {
    if (delete_dialog) {
      return delete_dialog;
    }
    delete_dialog = document.createElement('dialog');
    delete_dialog.id = 'delete-confirm-dialog';
    delete_dialog.setAttribute('role', 'alertdialog');
    delete_dialog.setAttribute('aria-modal', 'true');
    delete_dialog.setAttribute('aria-labelledby', 'delete-confirm-title');
    delete_dialog.setAttribute('aria-describedby', 'delete-confirm-message');
    delete_dialog.addEventListener('cancel', onDeleteDialogCancel);
    document.body.appendChild(delete_dialog);
    return delete_dialog;
  }

  function openDeleteDialog() {
    if (!current) {
      return;
    }
    const dialog = ensureDeleteDialog();
    const issue_id = current.id;
    const issue_title = current.title || t('(no title)');
    delete_target_id = issue_id;
    render(
      html`
        <div class="delete-confirm">
          <h2 class="delete-confirm__title" id="delete-confirm-title">
            ${t('Delete Issue')}
          </h2>
          <p class="delete-confirm__message" id="delete-confirm-message">
            ${t('Are you sure you want to delete issue')}
            <strong>${issue_id}</strong> — <strong>${issue_title}</strong>?
            ${t('This action cannot be undone.')}
          </p>
          <div class="delete-confirm__actions">
            <button
              type="button"
              class="btn"
              id="delete-cancel-btn"
              @click=${closeDeleteDialog}
            >
              ${t('Cancel')}
            </button>
            <button
              type="button"
              class="btn danger"
              id="delete-confirm-btn"
              @click=${onDeleteConfirm}
            >
              ${t('Delete')}
            </button>
          </div>
        </div>
      `,
      dialog
    );

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
        dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
    } else {
      dialog.setAttribute('open', '');
    }
    const cancel_button = /** @type {HTMLButtonElement | null} */ (
      dialog.querySelector('#delete-cancel-btn')
    );
    cancel_button?.focus();
  }

  /**
   * @param {string} id
   */
  async function performDelete(id) {
    try {
      await sendFn('delete-issue', { id });
      if (current?.id === id) {
        current = null;
        current_id = null;
        doRender();
        // Navigate back to close the dialog
        const view = parseView(window.location.hash || '');
        navigateFn(`#/${view}`);
      }
    } catch (err) {
      log('delete failed: %o', err);
      showToast(failMsg('Failed to delete issue', err), 'error', 8000);
    }
  }

  /**
   * @param {Event} ev
   */
  function onDeleteClick(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    openDeleteDialog();
  }

  /** @param {string} id */
  function issueHref(id) {
    /** @type {'issues'|'epics'|'board'|'decisions'|'knowledge'} */
    const view = parseView(window.location.hash || '');
    return issueHashFor(view, id);
  }

  /**
   * @param {string} message
   */
  function renderPlaceholder(message) {
    render(
      html`
        <div class="panel__body" id="detail-root">
          <p class="muted">${t(message)}</p>
        </div>
      `,
      mount_element
    );
  }

  /** Skeleton shown at once while the first snapshot is on its way. */
  function renderSkeleton() {
    render(
      html`
        <div
          class="panel__body detail-skeleton"
          id="detail-root"
          role="status"
          aria-busy="true"
          aria-label=${t('Loading issue')}
        >
          <span class="sr-only">${t('Loading issue')}</span>
          <div class="sk sk--title"></div>
          <div class="sk sk--line"></div>
          <div class="sk sk--line sk--short"></div>
          <div class="sk sk--block"></div>
          <div class="sk sk--block"></div>
        </div>
      `,
      mount_element
    );
  }

  /**
   * Refresh current from subscription store snapshot if available.
   */
  function refreshFromStore() {
    if (
      !current_id ||
      !issue_stores ||
      typeof issue_stores.snapshotFor !== 'function'
    ) {
      return;
    }
    const arr = /** @type {IssueDetail[]} */ (
      issue_stores.snapshotFor(`detail:${current_id}`)
    );
    if (Array.isArray(arr) && arr.length > 0) {
      // First item is the issue for this subscription
      const found =
        arr.find((it) => String(it.id) === String(current_id)) || arr[0];
      current = /** @type {IssueDetail} */ (found);
    }
  }

  /**
   * @param {IssueDetail} issue
   */
  function issueCommentCount(issue) {
    const count = Number(/** @type {any} */ (issue).comment_count);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  /**
   * @param {IssueDetail} issue
   */
  function hasCurrentComments(issue) {
    const comments = /** @type {any} */ (issue).comments;
    if (!Array.isArray(comments)) {
      if (issueCommentCount(issue) === 0) {
        return true;
      }
      return false;
    }
    const count = issueCommentCount(issue);
    if (count === null) {
      return true;
    }
    const id = String(issue.id);
    return (
      comments.length === count || comments_loaded_counts.get(id) === count
    );
  }

  /**
   * @param {IssueDetail} issue
   * @param {Comment[]} comments
   * @param {boolean} for_current_count
   */
  function markCommentsLoaded(issue, comments, for_current_count) {
    const id = String(issue.id);
    const count = issueCommentCount(issue);
    comments_loaded_counts.set(
      id,
      count !== null && for_current_count ? count : comments.length
    );
  }

  /**
   * Fetch comments for the selected issue once the detail subscription has
   * arrived. This enriches the current store issue object; the subscription
   * store preserves that field until the server explicitly sends comments.
   *
   * @param {string | null} id
   */
  async function ensureCommentsLoaded(id) {
    const issue_id = id ? String(id) : '';
    if (
      !issue_id ||
      current_id !== issue_id ||
      !current ||
      String(current.id) !== issue_id ||
      hasCurrentComments(current) ||
      comments_loading.has(issue_id) ||
      comments_load_errors.has(issue_id)
    ) {
      return;
    }
    comments_loading.add(issue_id);
    try {
      const comments = await sendFn('get-comments', { id: issue_id });
      if (
        Array.isArray(comments) &&
        current &&
        current_id === issue_id &&
        String(current.id) === issue_id
      ) {
        const count = issueCommentCount(current);
        if (count !== null && comments.length !== count) {
          comments_loaded_counts.set(issue_id, comments.length);
          log(
            'comment count mismatch for %s: expected %d, got %d',
            issue_id,
            count,
            comments.length
          );
          return;
        }
        /** @type {any} */ (current).comments = comments;
        markCommentsLoaded(current, comments, true);
        comments_load_errors.delete(issue_id);
        doRender();
      }
    } catch (err) {
      log('fetch comments failed %s %o', issue_id, err);
      comments_load_errors.set(issue_id, errorMessage(err));
    } finally {
      comments_loading.delete(issue_id);
      if (
        current &&
        current_id === issue_id &&
        String(current.id) === issue_id
      ) {
        doRender();
      }
    }
  }

  /**
   * @param {unknown} err
   */
  function errorMessage(err) {
    if (err && typeof err === 'object') {
      const maybe_message = /** @type {{ message?: unknown }} */ (err).message;
      if (typeof maybe_message === 'string' && maybe_message.length > 0) {
        return maybe_message;
      }
    }
    return 'Unable to load comments';
  }

  /** Retry loading comments for the active issue. */
  function onCommentsRetry() {
    if (!current_id) {
      return;
    }
    comments_load_errors.delete(current_id);
    doRender();
    void ensureCommentsLoaded(current_id);
  }

  // Live updates: re-render when issue stores change
  /** @type {(() => void) | null} */
  let unsubscribe_issue_stores = null;
  if (issue_stores && typeof issue_stores.subscribe === 'function') {
    unsubscribe_issue_stores = issue_stores.subscribe((client_id) => {
      try {
        if (!current_id) {
          return;
        }
        const active_client_id = `detail:${current_id}`;
        if (client_id && client_id !== active_client_id) {
          return;
        }
        refreshFromStore();
        doRender();
        void ensureCommentsLoaded(current_id);
      } catch (err) {
        log('issue stores listener error %o', err);
      }
    });
  }

  /**
   * Toast the server's real reason; the editor stays open with the typed text.
   * @param {string} what
   * @param {any} err
   * @param {string} sel - editor control, re-enabled so the owner can retry
   */
  const saveFailed = (what, err, sel) => {
    const reason = String(err?.message || err || '').trim();
    try {
      const el = /** @type {HTMLInputElement|null} */ (
        mount_element.querySelector(sel)
      );
      if (el) el.disabled = false;
    } catch {
      // ignore
    }
    showToast(
      reason
        ? `${t(`Failed to save ${what}`)}: ${reason}`
        : t(`Failed to save ${what}`),
      'error',
      8000
    );
  };

  // Handlers
  const onTitleSpanClick = () => {
    edit_title = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onTitleKeydown = (ev) => {
    if (ev.key === 'Enter') {
      edit_title = true;
      doRender();
    } else if (ev.key === 'Escape') {
      edit_title = false;
      doRender();
    }
  };
  const onTitleSave = async () => {
    if (!current || pending) {
      return;
    }
    const input = /** @type {HTMLInputElement|null} */ (
      mount_element.querySelector('h2 input')
    );
    const prev = current.title || '';
    const next = input ? input.value : '';
    if (next === prev) {
      edit_title = false;
      doRender();
      return;
    }
    pending = true;
    if (input) {
      input.disabled = true;
    }
    try {
      log('save title %s → %s', String(current.id), next);
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'title',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_title = false;
        doRender();
      }
    } catch (err) {
      log('save title failed %s %o', String(current.id), err);
      edit_title = true;
      saveFailed('title', err, 'h2 input');
    } finally {
      pending = false;
    }
  };
  const onTitleCancel = () => {
    edit_title = false;
    doRender();
  };
  // Assignee inline edit handlers
  const onAssigneeSpanClick = () => {
    edit_assignee = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onAssigneeKeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      edit_assignee = true;
      doRender();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      edit_assignee = false;
      doRender();
    }
  };
  const onAssigneeSave = async () => {
    if (!current || pending) {
      return;
    }
    const input = /** @type {HTMLInputElement|null} */ (
      mount_element.querySelector('#detail-root .prop.assignee input')
    );
    const prev = current?.assignee ?? '';
    const next = input?.value ?? '';
    if (next === prev) {
      edit_assignee = false;
      doRender();
      return;
    }
    pending = true;
    if (input) {
      input.disabled = true;
    }
    try {
      log('save assignee %s → %s', String(current.id), next);
      const updated = await sendFn('update-assignee', {
        id: current.id,
        assignee: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_assignee = false;
        doRender();
      }
    } catch (err) {
      log('save assignee failed %s %o', String(current.id), err);
      // revert visually
      current.assignee = prev;
      edit_assignee = false;
      doRender();
      showToast(failMsg('Failed to update assignee', err), 'error', 8000);
    } finally {
      pending = false;
    }
  };
  const onAssigneeCancel = () => {
    edit_assignee = false;
    doRender();
  };

  // Labels handlers
  /**
   * @param {Event} ev
   */
  const onLabelInput = (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.currentTarget);
    new_label_text = el.value || '';
  };
  /**
   * @param {KeyboardEvent} e
   */
  function onLabelKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onAddLabel();
    }
  }
  async function onAddLabel() {
    if (!current || pending) {
      return;
    }
    const text = new_label_text.trim();
    if (!text) {
      return;
    }
    pending = true;
    try {
      log('add label %s → %s', String(current.id), text);
      const updated = await sendFn('label-add', {
        id: current.id,
        label: text
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        new_label_text = '';
        doRender();
      }
    } catch (err) {
      log('add label failed %s %o', String(current.id), err);
      showToast(failMsg('Failed to add label', err), 'error', 8000);
    } finally {
      pending = false;
    }
  }
  /**
   * @param {string} label
   */
  async function onRemoveLabel(label) {
    if (!current || pending) {
      return;
    }
    pending = true;
    try {
      log('remove label %s → %s', String(current?.id || ''), label);
      const updated = await sendFn('label-remove', {
        id: current.id,
        label
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        doRender();
      }
    } catch (err) {
      log('remove label failed %s %o', String(current?.id || ''), err);
      showToast(failMsg('Failed to remove label', err), 'error', 8000);
    } finally {
      pending = false;
    }
  }
  /**
   * @param {Event} ev
   */
  const onStatusChange = async (ev) => {
    if (!current || pending) {
      doRender();
      return;
    }
    const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
    const prev = current.status || 'open';
    const next = sel.value;
    if (next === prev) {
      return;
    }
    pending = true;
    current.status = next;
    doRender();
    try {
      log('update status %s → %s', String(current.id), next);
      const updated = await sendFn('update-status', {
        id: current.id,
        status: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        doRender();
      }
    } catch (err) {
      log('update status failed %s %o', String(current.id), err);
      current.status = prev;
      doRender();
      showToast(failMsg('Failed to update status', err), 'error', 8000);
    } finally {
      pending = false;
    }
  };
  /**
   * @param {Event} ev
   */
  const onPriorityChange = async (ev) => {
    if (!current || pending) {
      doRender();
      return;
    }
    const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
    const prev = typeof current.priority === 'number' ? current.priority : 2;
    const next = Number(sel.value);
    if (next === prev) {
      return;
    }
    pending = true;
    current.priority = next;
    doRender();
    try {
      log('update priority %s → %d', String(current.id), next);
      const updated = await sendFn('update-priority', {
        id: current.id,
        priority: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        doRender();
      }
    } catch (err) {
      log('update priority failed %s %o', String(current.id), err);
      current.priority = prev;
      doRender();
      showToast(failMsg('Failed to update priority', err), 'error', 8000);
    } finally {
      pending = false;
    }
  };

  /** @param {Event} [ev] */
  const onDescEdit = (ev) => {
    if (ev?.target instanceof Element && ev.target.closest('a')) return;
    edit_desc = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onDescKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_desc = false;
      doRender();
    } else if (ev.key === 'Enter' && ev.ctrlKey) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector('#detail-root .editable-actions button')
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onDescSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root textarea')
    );
    const prev = current.description || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_desc = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      log('save description %s', String(current?.id || ''));
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'description',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_desc = false;
        doRender();
      }
    } catch (err) {
      log('save description failed %s %o', String(current?.id || ''), err);
      edit_desc = true;
      saveFailed('description', err, '#detail-root textarea');
    } finally {
      pending = false;
    }
  };
  const onDescCancel = () => {
    edit_desc = false;
    doRender();
  };

  // Design inline edit handlers (same UX as Description)
  /** @param {Event} [ev] */
  const onDesignEdit = (ev) => {
    if (ev?.target instanceof Element && ev.target.closest('a')) return;
    edit_design = true;
    doRender();
    try {
      const ta = /** @type {HTMLTextAreaElement|null} */ (
        mount_element.querySelector('#detail-root .design textarea')
      );
      if (ta) {
        ta.focus();
      }
    } catch (err) {
      log('focus design textarea failed %o', err);
    }
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onDesignKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_design = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .design .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onDesignSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .design textarea')
    );
    const prev = current.design || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_design = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      log('save design %s', String(current?.id || ''));
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'design',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_design = false;
        doRender();
      }
    } catch (err) {
      log('save design failed %s %o', String(current?.id || ''), err);
      edit_design = true;
      saveFailed('design', err, '#detail-root .design textarea');
    } finally {
      pending = false;
    }
  };
  const onDesignCancel = () => {
    edit_design = false;
    doRender();
  };

  // Notes inline edit handlers
  /** @param {Event} [ev] */
  const onNotesEdit = (ev) => {
    if (ev?.target instanceof Element && ev.target.closest('a')) return;
    edit_notes = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onNotesKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_notes = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .notes .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onNotesSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .notes textarea')
    );
    const prev = current.notes || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_notes = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      log('save notes %s', String(current?.id || ''));
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'notes',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_notes = false;
        doRender();
      }
    } catch (err) {
      log('save notes failed %s %o', String(current?.id || ''), err);
      edit_notes = true;
      saveFailed('notes', err, '#detail-root .notes textarea');
    } finally {
      pending = false;
    }
  };
  const onNotesCancel = () => {
    edit_notes = false;
    doRender();
  };

  /** @param {Event} [ev] */
  const onAcceptEdit = (ev) => {
    if (ev?.target instanceof Element && ev.target.closest('a')) return;
    edit_accept = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onAcceptKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_accept = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .acceptance .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onAcceptSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .acceptance textarea')
    );
    const prev = current.acceptance || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_accept = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      log('save acceptance %s', String(current?.id || ''));
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'acceptance',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (mergeReply(current, updated));
        edit_accept = false;
        doRender();
      }
    } catch (err) {
      log('save acceptance failed %s %o', String(current?.id || ''), err);
      edit_accept = true;
      saveFailed('acceptance', err, '#detail-root .acceptance textarea');
    } finally {
      pending = false;
    }
  };
  const onAcceptCancel = () => {
    edit_accept = false;
    doRender();
  };

  // Comment input handlers
  /**
   * @param {Event} ev
   */
  const onCommentInput = (ev) => {
    const el = /** @type {HTMLTextAreaElement} */ (ev.currentTarget);
    const prev_has_text = comment_text.trim().length > 0;
    comment_text = el.value || '';
    const has_text = comment_text.trim().length > 0;
    // Re-render when the "has content" state changes to update button disabled state
    if (prev_has_text !== has_text) {
      doRender();
    }
  };

  const onCommentSubmit = async () => {
    if (!current || comment_pending || !comment_text.trim()) {
      return;
    }
    comment_pending = true;
    doRender();
    try {
      log('add comment to %s', String(current.id));
      const result = await sendFn('add-comment', {
        id: current.id,
        text: comment_text.trim()
      });
      if (Array.isArray(result)) {
        // Update comments in current issue
        /** @type {any} */ (current).comments = result;
        markCommentsLoaded(current, result, false);
        comments_load_errors.delete(String(current.id));
        comment_text = '';
        doRender();
      }
    } catch (err) {
      log('add comment failed %s %o', String(current.id), err);
      saveFailed('comment', err, '#detail-root textarea');
    } finally {
      comment_pending = false;
      doRender();
    }
  };

  /**
   * @param {KeyboardEvent} ev
   */
  const onCommentKeydown = (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      onCommentSubmit();
    }
  };

  /**
   * @param {'Dependencies'|'Dependents'} title
   * @param {Dependency[]} items
   */
  function depsSection(title, items) {
    const test_id =
      title === 'Dependencies' ? 'add-dependency' : 'add-dependent';
    return html`
      <div class="props-card">
        <div>
          <div class="props-card__title">${t(title)}</div>
        </div>
        <ul>
          ${!items || items.length === 0
            ? null
            : items.map((dep) => {
                const did = dep.id;
                const href = issueHref(did);
                return html`<li
                  data-href=${href}
                  @click=${() => navigateFn(href)}
                >
                  ${createTypeBadge(dep.issue_type || '')}
                  <span class="text-truncate">${dep.title || ''}</span>
                  <button
                    aria-label=${`Remove dependency ${did}`}
                    @click=${makeDepRemoveClick(did, title)}
                  >
                    ×
                  </button>
                </li>`;
              })}
        </ul>
        <div class="props-card__footer">
          <input
            type="text"
            placeholder=${t('Issue ID')}
            data-testid=${test_id}
          />
          <button @click=${makeDepAddClick(items, title)}>${t('Add')}</button>
        </div>
      </div>
    `;
  }

  /**
   * @param {IssueDetail} issue
   */
  function detailTemplate(issue) {
    const title_zone = edit_title
      ? html`<div class="detail-title">
          <h2>
            <input
              type="text"
              aria-label=${t('Edit title')}
              .value=${issue.title || ''}
              @keydown=${onTitleInputKeydown}
            />
            <button @click=${onTitleSave}>${t('Save')}</button>
            <button @click=${onTitleCancel}>${t('Cancel')}</button>
          </h2>
        </div>`
      : html`<div class="detail-title">
          <h2>
            <span
              class="editable"
              tabindex="0"
              role="button"
              aria-label=${t('Edit title')}
              @click=${onTitleSpanClick}
              @keydown=${onTitleKeydown}
              >${issue.title || ''}</span
            >
          </h2>
        </div>`;

    const status_select = html`<select
      class=${`badge-select badge--status is-${issue.status || 'open'}`}
      @change=${onStatusChange}
      .value=${issue.status || 'open'}
      ?disabled=${pending}
    >
      ${(() => {
        const cur = String(issue.status || 'open');
        return statusOptions(cur).map(
          (s) =>
            // An out-of-set current status (e.g. `pinned`) is shown so the
            // select tells the truth, but disabled so it cannot be re-chosen:
            // the server rejects `update-status pinned`.
            html`<option
              value=${s}
              ?selected=${cur === s}
              ?disabled=${!isSettableStatus(s)}
            >
              ${statusLabel(s)}
            </option>`
        );
      })()}
    </select>`;

    const priority_select = html`${createPriorityBadge(
        typeof issue.priority === 'number' ? issue.priority : 2
      )}<select
        class=${`badge-select badge--priority is-p${String(
          typeof issue.priority === 'number' ? issue.priority : 2
        )}`}
        @change=${onPriorityChange}
        .value=${String(
          typeof issue.priority === 'number' ? issue.priority : 2
        )}
        ?disabled=${pending}
      >
        ${(() => {
          const cur = String(
            typeof issue.priority === 'number' ? issue.priority : 2
          );
          return [0, 1, 2, 3, 4].map(
            (i) =>
              html`<option value=${String(i)} ?selected=${cur === String(i)}>
                ${priorityName(i)}
              </option>`
          );
        })()}
      </select>`;

    const desc_block = edit_desc
      ? html`<div class="description" data-anchor="description">
          <textarea
            @keydown=${onDescKeydown}
            .value=${issue.description || ''}
            rows="8"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onDescSave}>${t('Save')}</button>
            <button @click=${onDescCancel}>${t('Cancel')}</button>
          </div>
        </div>`
      : html`<div
          data-anchor="description"
          class="md editable"
          tabindex="0"
          role="button"
          aria-label=${t('Edit description')}
          @click=${onDescEdit}
          @keydown=${onDescEditableKeydown}
        >
          ${(() => {
            const text = issue.description || '';
            if (text.trim() === '') {
              return html`<div class="muted">${t('Description')}</div>`;
            }
            return renderFolded(text, renderMarkdown);
          })()}
        </div>`;

    // Normalize acceptance text: prefer issue.acceptance, fallback to acceptance_criteria from bd
    const ac_title = t('Acceptance Criteria');
    const acceptance_text = (() => {
      /** @type {any} */
      const any_issue = issue;
      const raw = String(
        issue.acceptance || any_issue.acceptance_criteria || ''
      );
      return raw;
    })();

    const accept_block = edit_accept
      ? html`<div class="acceptance" data-anchor="acceptance">
          ${acceptance_text.trim().length > 0
            ? html`<div class="props-card__title">${ac_title}</div>`
            : ''}
          <textarea
            @keydown=${onAcceptKeydown}
            .value=${acceptance_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onAcceptSave}>${t('Save')}</button>
            <button @click=${onAcceptCancel}>${t('Cancel')}</button>
          </div>
        </div>`
      : html`<div class="acceptance" data-anchor="acceptance">
          ${(() => {
            const text = acceptance_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">${ac_title}</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label=${t('Edit acceptance criteria')}
                @click=${onAcceptEdit}
                @keydown=${onAcceptEditableKeydown}
              >
                ${has
                  ? renderFolded(text, renderMarkdown)
                  : html`<div class="muted">
                      ${t('Add acceptance criteria…')}
                    </div>`}
              </div>`;
          })()}
        </div>`;

    // Notes: editable in-place similar to Description
    const notes_text = String(issue.notes || '');
    const notes_block = edit_notes
      ? html`<div class="notes" data-anchor="notes">
          ${notes_text.trim().length > 0
            ? html`<div class="props-card__title">${t('Notes')}</div>`
            : ''}
          <textarea
            @keydown=${onNotesKeydown}
            .value=${notes_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onNotesSave}>${t('Save')}</button>
            <button @click=${onNotesCancel}>${t('Cancel')}</button>
          </div>
        </div>`
      : html`<div class="notes" data-anchor="notes">
          ${(() => {
            const text = notes_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">${t('Notes')}</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label=${t('Edit notes')}
                @click=${onNotesEdit}
                @keydown=${onNotesEditableKeydown}
              >
                ${has
                  ? renderFolded(text, renderMarkdown)
                  : html`<div class="muted">${t('Add notes…')}</div>`}
              </div>`;
          })()}
        </div>`;

    // Labels section
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    const labels_block = html`<div class="props-card labels">
      <div>
        <div class="props-card__title">${t('Labels')}</div>
      </div>
      <ul>
        ${labels.map(
          (l) =>
            html`<li>
              <span class="badge" title=${l}
                >${l}
                <button
                  class="icon-button"
                  title=${t('Remove label')}
                  aria-label=${t('Remove label') + ' ' + l}
                  @click=${() => onRemoveLabel(l)}
                  style="margin-left:6px"
                >
                  ×
                </button></span
              >
            </li>`
        )}
      </ul>
      <div class="props-card__footer">
        <input
          type="text"
          placeholder=${t('Label')}
          size="12"
          .value=${new_label_text}
          @input=${onLabelInput}
          @keydown=${onLabelKeydown}
        />
        <button @click=${onAddLabel}>${t('Add')}</button>
      </div>
    </div>`;

    // Dates section block — rendered below Properties. Rows render
    // conditionally; absent values are omitted (no blank rows).
    // Date only — the close reason is shown in the Properties card, not
    // duplicated here.
    const closed_display = formatDateValue(issue.closed_at);
    const dates_block = html`<div class="props-card dates">
      <div class="props-card__header">
        <div class="props-card__title">${t('Dates')}</div>
      </div>
      <div class="prop">
        <div class="label">${t('Created')}</div>
        <div class="value">${formatDateValue(issue.created_at)}</div>
      </div>
      ${issue.started_at
        ? html`<div class="prop">
            <div class="label">${t('Started')}</div>
            <div class="value">${formatDateValue(issue.started_at)}</div>
          </div>`
        : ''}
      <div class="prop">
        <div class="label">${t('Updated')}</div>
        <div class="value">${formatDateValue(issue.updated_at)}</div>
      </div>
      ${closed_display
        ? html`<div class="prop">
            <div class="label">${t('Closed')}</div>
            <div class="value">${closed_display}</div>
          </div>`
        : ''}
      ${issue.defer_until
        ? html`<div class="prop">
            <div class="label">${t('Deferred until')}</div>
            <div class="value">${formatDateValue(issue.defer_until)}</div>
          </div>`
        : ''}
    </div>`;

    // Design section block
    const design_text = String(issue.design || '');
    const design_block = edit_design
      ? html`<div class="design" data-anchor="design">
          ${design_text.trim().length > 0
            ? html`<div class="props-card__title">${t('Design')}</div>`
            : ''}
          <textarea
            @keydown=${onDesignKeydown}
            .value=${design_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onDesignSave}>${t('Save')}</button>
            <button @click=${onDesignCancel}>${t('Cancel')}</button>
          </div>
        </div>`
      : html`<div class="design" data-anchor="design">
          ${(() => {
            const text = design_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">${t('Design')}</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label=${t('Edit design')}
                @click=${onDesignEdit}
                @keydown=${onDesignEditableKeydown}
              >
                ${has
                  ? renderFolded(text, renderMarkdown)
                  : html`<div class="muted">${t('Add design…')}</div>`}
              </div>`;
          })()}
        </div>`;

    // Comments section
    const comments = Array.isArray(/** @type {any} */ (issue).comments)
      ? /** @type {Comment[]} */ (/** @type {any} */ (issue).comments)
      : [];
    const comments_newest_first = comments.slice().reverse();
    const comments_error = comments_load_errors.get(String(issue.id)) || '';
    const comments_pending =
      comments.length === 0 && !comments_error && !hasCurrentComments(issue);
    const comments_block = html`<div class="comments" data-anchor="comments">
      <div class="props-card__title">${t('Comments')}</div>
      ${comments_error
        ? html`<div class="muted" role="alert">
            ${comments_error}
            <button type="button" @click=${onCommentsRetry}>
              ${t('Retry')}
            </button>
          </div>`
        : comments.length === 0
          ? html`<div class="muted">
              ${comments_pending
                ? t('Loading comments…')
                : t('No comments yet')}
            </div>`
          : comments_newest_first.map(
              (c) => html`
                <div class="comment-item" data-anchor=${commentAnchor(c)}>
                  <div class="comment-header">
                    <span class="comment-author"
                      >${c.author || t('Unknown')}</span
                    >
                    <span class="comment-date"
                      >${formatCommentDate(c.created_at)}</span
                    >
                    <a
                      class="comment-link"
                      title=${t('Link to this comment')}
                      href=${issueHashFor(
                        parseView(window.location.hash || ''),
                        String(issue.id)
                      ) +
                      '&at=' +
                      commentAnchor(c)}
                      >#</a
                    >
                  </div>
                  <div class="comment-text">
                    ${parseDecisionComment(c.text)
                      ? html`<div
                          class="detail-slot"
                          data-slot="dcard"
                          data-cid=${commentAnchor(c)}
                        ></div>`
                      : renderFolded(c.text, renderMarkdown, flatComment)}
                  </div>
                </div>
              `
            )}
      <div class="comment-input">
        <textarea
          placeholder=${t('Add a comment... (Ctrl+Enter to submit)')}
          rows="3"
          .value=${comment_text}
          @input=${onCommentInput}
          @keydown=${onCommentKeydown}
          ?disabled=${comment_pending}
        ></textarea>
        <button
          @click=${onCommentSubmit}
          ?disabled=${comment_pending || !comment_text.trim()}
        >
          ${comment_pending ? t('Adding...') : t('Add Comment')}
        </button>
      </div>
    </div>`;

    return html`
      <div class="panel__body" id="detail-root">
        <div class="detail-layout">
          <div class="detail-main">
            ${title_zone}
            ${renderDetailHeader(issue, {
              weights: weights_by_id.get(String(issue.id))
            })}
            ${desc_block} ${design_block} ${notes_block}
            ${accept_block} ${comments_block}
          </div>
          <div class="detail-side">
            <div class="detail-slot" data-slot="card"></div>
            <div class="props-card" data-anchor="card">
              <div class="props-card__header">
                <div class="props-card__title">${t('Properties')}</div>
                <button class="delete-issue-btn" title=${t('Delete issue')} aria-label=${t('Delete issue')} @click=${onDeleteClick}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  <span class="tooltip">${t('Delete issue')}</span>
                </button>
              </div>
                <div class="prop">
                  <div class="label">${t('Type')}</div>
                  <div class="value">
                    ${createTypeBadge(/** @type {any} */ (issue).issue_type)}
                  </div>
                </div>
                <div class="prop">
                  <div class="label">${t('Status')}</div>
                  <div class="value">${status_select}</div>
                </div>
                ${
                  issue.close_reason
                    ? html`<div class="prop">
                        <div class="label">${t('Close Reason')}</div>
                        <div class="value">${issue.close_reason}</div>
                      </div>`
                    : ''
                }
                <div class="prop">
                  <div class="label">${t('Priority')}</div>
                  <div class="value">${priority_select}</div>
                </div>
                <div class="prop assignee">
                  <div class="label">${t('Assignee')}</div>
                  <div class="value">
                    ${
                      edit_assignee
                        ? html`<input
                              type="text"
                              aria-label=${t('Edit assignee')}
                              .value=${
                                /** @type {any} */ (issue).assignee || ''
                              }
                              size=${Math.min(
                                40,
                                Math.max(12, (issue.assignee || '').length + 3)
                              )}
                              @keydown=${
                                /** @param {KeyboardEvent} e */ (e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    onAssigneeCancel();
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onAssigneeSave();
                                  }
                                }
                              }
                            />
                            <button
                              class="btn"
                              style="margin-left:6px"
                              @click=${onAssigneeSave}
                            >
                              Save
                            </button>
                            <button
                              class="btn"
                              style="margin-left:6px"
                              @click=${onAssigneeCancel}
                            >
                              Cancel
                            </button>`
                        : html`${(() => {
                            const raw = issue.assignee || '';
                            const has = raw.trim().length > 0;
                            const text = has ? raw : t('Unassigned');
                            const cls = has ? 'editable' : 'editable muted';
                            return html`<span
                              class=${cls}
                              tabindex="0"
                              role="button"
                              aria-label=${t('Edit assignee')}
                              @click=${onAssigneeSpanClick}
                              @keydown=${onAssigneeKeydown}
                              >${text}</span
                            >`;
                          })()}`
                    }
                  </div>
                </div>
              </div>
              ${dates_block}
              ${labels_block}
              ${depsSection('Dependencies', issue.dependencies || [])}
              ${depsSection('Dependents', issue.dependents || [])}
              <div class="detail-slot" data-slot="outputs"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** Explicit child weights (metadata.weight) by bead id; fetched lazily. */
  /** @type {Map<string, Record<string, number|string>>} */
  const weights_by_id = new Map();
  /** @type {Map<string, string>} */
  const weights_asked = new Map();

  /**
   * Fingerprint of the children (id, status, updated_at): a child closing or
   * its weight changing makes it differ, so the bar refreshes while the parent
   * stays open (beads-lite-1bo5.6.47.1).
   *
   * @param {any} issue
   */
  function childrenSig(issue) {
    return (issue.dependents || [])
      .filter(
        (/** @type {any} */ d) => d && d.dependency_type === 'parent-child'
      )
      .map(
        (/** @type {any} */ d) => `${d.id}:${d.status}:${d.updated_at || ''}`
      )
      .sort()
      .join('|');
  }

  /**
   * One lazy read-only call after first paint, only for beads with children.
   * A failure leaves priority defaults in place (degrade, never break).
   *
   * @param {any} issue
   */
  function ensureWeightsLoaded(issue) {
    const id = String(issue.id);
    const has_children = (issue.dependents || []).some(
      (/** @type {any} */ d) => d && d.dependency_type === 'parent-child'
    );
    const sig = childrenSig(issue);
    if (!has_children || weights_asked.get(id) === sig) {
      return;
    }
    weights_asked.set(id, sig);
    setTimeout(async () => {
      try {
        const w = await sendFn('get-weights', { id });
        if (w && typeof w === 'object') {
          weights_by_id.set(id, /** @type {any} */ (w));
          if (current_id === id) {
            doRender();
          }
        }
      } catch (err) {
        log('weights failed %s %o', id, err);
      }
    }, 0);
  }

  function doRender() {
    if (!current) {
      if (current_id) renderSkeleton();
      else renderPlaceholder('No issue selected');
      return;
    }
    setImgContext({ bead: String(current.id) });
    render(detailTemplate(current), mount_element);
    // Slots (card, outputs): fire and forget, a failed slot never breaks the
    // detail. The registry calls mount(el, issue) again when the issue changes.
    void mountSlots(mount_element, current);
    ensureWeightsLoaded(current);
    fitChips(mount_element, fmtNum);
    applyAnchor();
  }

  /** @param {number} n */
  function fmtNum(n) {
    return new Intl.NumberFormat(getLang() === 'ar' ? 'ar-EG' : 'en').format(n);
  }
  const onResize = () => fitChips(mount_element, fmtNum);
  window.addEventListener('resize', onResize);

  // Deep link `&at=<anchor>`: scroll to and highlight one section, comment or
  // line, once per (bead, anchor); retried on later renders until it exists.
  let anchor_done = '';
  function applyAnchor() {
    const a = parseAnchor(window.location.hash || '');
    if (!a || !current) {
      anchor_done = '';
      return;
    }
    const key = `${current.id}|${a.target}|${a.from}-${a.to}`;
    if (anchor_done === key) {
      return;
    }
    const cur = /** @type {any} */ (current);
    let attr = a.target;
    let source = '';
    if (a.target.startsWith('c-')) {
      const list = Array.isArray(cur.comments) ? cur.comments : [];
      const idx = findCommentIndex(a.target, list);
      if (idx < 0) {
        if (hasCurrentComments(current)) {
          anchor_done = key; // loaded, no such comment: give up quietly
        }
        return;
      }
      attr = commentAnchor(list[idx]);
      source = String(list[idx].text || '');
    } else if (a.target === 'acceptance') {
      source = String(cur.acceptance || cur.acceptance_criteria || '');
    } else if (['description', 'design', 'notes'].includes(a.target)) {
      source = String(cur[a.target] || '');
    }
    const root = mount_element.querySelector(`[data-anchor="${attr}"]`);
    if (!root) {
      return;
    }
    anchor_done = key;
    mount_element
      .querySelectorAll('.anchor-hit')
      .forEach((n) => n.classList.remove('anchor-hit'));
    /** @type {Element[]} */
    const hits = [];
    if (a.from > 0) {
      for (let n = a.from; n <= a.to; n++) {
        const el = findLineElement(root, source, n);
        if (el && !hits.includes(el)) {
          hits.push(el);
        }
      }
    }
    const marks = hits.length ? hits : [root];
    // A line inside a folded section: open the section first (its toggle
    // handler records it as open, so it stays open across re-renders).
    marks.forEach((m) => {
      const d = m.closest('details.fold-sec');
      if (d) /** @type {HTMLDetailsElement} */ (d).open = true;
    });
    marks.forEach((m) => m.classList.add('anchor-hit'));
    marks[0].scrollIntoView({ block: 'start' });
  }

  /**
   * Create a click handler for the remove button of a dependency row.
   *
   * @param {string} did
   * @param {'Dependencies'|'Dependents'} title
   * @returns {(ev: Event) => Promise<void>}
   */
  function makeDepRemoveClick(did, title) {
    return async (ev) => {
      ev.stopPropagation();
      if (!current || pending) {
        return;
      }
      pending = true;
      try {
        if (title === 'Dependencies') {
          const updated = await sendFn('dep-remove', {
            a: current.id,
            b: did,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (mergeReply(current, updated));
            doRender();
          }
        } else {
          const updated = await sendFn('dep-remove', {
            a: did,
            b: current.id,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (mergeReply(current, updated));
            doRender();
          }
        }
      } catch (err) {
        log('dep-remove failed %o', err);
      } finally {
        pending = false;
      }
    };
  }

  /**
   * Create a click handler for the Add button in a dependency section.
   *
   * @param {Dependency[]} items
   * @param {'Dependencies'|'Dependents'} title
   * @returns {(ev: Event) => Promise<void>}
   */
  function makeDepAddClick(items, title) {
    return async (ev) => {
      if (!current || pending) {
        return;
      }
      const btn = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      const input = /** @type {HTMLInputElement|null} */ (
        btn.previousElementSibling
      );
      const target = input ? input.value.trim() : '';
      if (!target || target === current.id) {
        showToast(t('Enter a different issue id'));
        return;
      }
      const set = new Set((items || []).map((d) => d.id));
      if (set.has(target)) {
        showToast(t('Link already exists'));
        return;
      }
      pending = true;
      if (btn) {
        btn.disabled = true;
      }
      if (input) {
        input.disabled = true;
      }
      try {
        if (title === 'Dependencies') {
          const updated = await sendFn('dep-add', {
            a: current.id,
            b: target,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (mergeReply(current, updated));
            doRender();
          }
        } else {
          const updated = await sendFn('dep-add', {
            a: target,
            b: current.id,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (mergeReply(current, updated));
            doRender();
          }
        }
      } catch (err) {
        log('dep-add failed %o', err);
        showToast(failMsg('Failed to add dependency', err), 'error', 8000);
      } finally {
        pending = false;
      }
    };
  }
  /**
   * @param {KeyboardEvent} ev
   */
  function onTitleInputKeydown(ev) {
    if (ev.key === 'Escape') {
      edit_title = false;
      doRender();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      onTitleSave();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onDescEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onDescEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onAcceptEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onAcceptEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onNotesEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onNotesEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onDesignEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onDesignEdit();
    }
  }

  window.addEventListener('hashchange', applyAnchor);
  // Clicking a permalink whose hash is already the current one fires no
  // hashchange: re-apply it by hand.
  mount_element.addEventListener('click', (ev) => {
    const a = /** @type {any} */ (ev.target)?.closest?.('a.comment-link');
    if (a && a.getAttribute('href') === window.location.hash) {
      ev.preventDefault();
      anchor_done = '';
      applyAnchor();
    }
  });

  return {
    async load(id) {
      if (!id) {
        renderPlaceholder('No issue selected');
        return;
      }
      current_id = String(id);
      anchor_done = ''; // an explicit open re-applies the deep link
      // Try from store first; show placeholder while waiting for snapshot
      current = null;
      refreshFromStore();
      if (!current) {
        renderSkeleton();
      }
      // Render from current (if available) or keep placeholder until push arrives
      pending = false;
      comment_text = '';
      comment_pending = false;
      comments_load_errors.delete(current_id);
      doRender();

      void ensureCommentsLoaded(current_id);
    },
    clear() {
      anchor_done = '';
      current_id = null;
      current = null;
      comments_load_errors.clear();
      renderPlaceholder('Select an issue to view details');
    },
    destroy() {
      window.removeEventListener('hashchange', applyAnchor);
      window.removeEventListener('resize', onResize);
      mount_element.replaceChildren();
      if (unsubscribe_issue_stores) {
        unsubscribe_issue_stores();
        unsubscribe_issue_stores = null;
      }
      if (delete_dialog && delete_dialog.parentNode) {
        delete_dialog.removeEventListener('cancel', onDeleteDialogCancel);
        delete_dialog.parentNode.removeChild(delete_dialog);
        delete_dialog = null;
        delete_target_id = null;
      }
    }
  };
}
