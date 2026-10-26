import { html, render } from 'lit-html';
import { t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';

/**
 * Render the primary navigation: Board, Decisions (with the count of beads
 * waiting on the owner), List, Epics. On a phone CSS turns it into a bottom
 * tab bar (design/README.md section 3).
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board'|'decisions') => void }} router
 * @param {{ snapshotFor?: (id: string) => any[], isLoaded?: (id: string) => boolean, subscribeFor?: (ids: string | string[], fn: (id: string) => void) => () => void }} [issueStores]
 */
export function createTopNav(
  mount_element,
  store,
  router,
  issueStores = undefined
) {
  const log = debug('views:nav');
  /** @type {(() => void) | null} */
  let unsubscribe = null;
  /** @type {(() => void) | null} */
  let unsubscribe_stores = null;

  /**
   * @param {'issues'|'epics'|'board'|'decisions'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      log('click tab %s', view);
      router.gotoView(view);
    };
  }

  /** Beads waiting on the owner, or -1 while the list has not loaded. */
  function waitingCount() {
    if (
      !issueStores ||
      !issueStores.snapshotFor ||
      !issueStores.isLoaded ||
      !issueStores.isLoaded('tab:all')
    ) {
      return -1;
    }
    return issueStores
      .snapshotFor('tab:all')
      .filter((it) => it && it.status === 'owner_decision').length;
  }

  /**
   * @param {'issues'|'epics'|'board'|'decisions'} view
   * @param {string} active
   * @param {number} badge
   */
  function tab(view, active, badge) {
    return html`<a
      href=${'#/' + view}
      class="tab ${active === view ? 'active' : ''}"
      aria-current=${active === view ? 'page' : 'false'}
      @click=${onClick(view)}
      >${t(view)}${badge > 0
        ? html`<span class="nav-badge" aria-label=${badge + ' waiting'}
            >${badge}</span
          >`
        : ''}</a
    >`;
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    const n = waitingCount();
    return html`
      <nav class="header-nav" aria-label="Primary">
        ${tab('board', active, 0)} ${tab('decisions', active, n)}
        ${tab('issues', active, 0)} ${tab('epics', active, 0)}
      </nav>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());
  if (issueStores && issueStores.subscribeFor) {
    unsubscribe_stores = issueStores.subscribeFor('tab:all', () => doRender());
  }
  window.addEventListener('bdui-lang', doRender);

  return {
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (unsubscribe_stores) {
        unsubscribe_stores();
        unsubscribe_stores = null;
      }
      window.removeEventListener('bdui-lang', doRender);
      render(html``, mount_element);
    }
  };
}
