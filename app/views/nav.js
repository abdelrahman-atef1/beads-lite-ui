import { html, render } from 'lit-html';
import { t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';

/**
 * Render the primary navigation (design/README.md 5.1): a left rail with
 * Decisions (home; badge = beads waiting on the owner), Board and List, plus a
 * Projects button that only shows on a phone (opens the project drawer).
 * Epics is no longer a tab: it is the Type filter on Board and List.
 * On a phone CSS turns the rail into a bottom tab bar.
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

  /** Inline icons, one path each (design: no icon font, no images). */
  const ICONS = {
    board: 'M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z',
    decisions: 'M12 3a9 9 0 100 18 9 9 0 000-18zM11 7h2v6h-2zM11 15h2v2h-2z',
    issues: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z',
    menu: 'M3 6l2-2h5l2 2h9v13H3z'
  };

  /** @param {keyof typeof ICONS} k */
  function icon(k) {
    return html`<svg
      class="tab__ico"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path d=${ICONS[k]} fill="currentColor"></path>
    </svg>`;
  }

  /** Phone: ask the shell to open/close the project drawer. */
  function toggleDrawer() {
    window.dispatchEvent(new Event('bdui-side-toggle'));
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
      aria-label=${t(view)}
      title=${t(view)}
      >${icon(/** @type {any} */ (view))}<span class="tab__label"
        >${t(view)}</span
      >${badge > 0
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
      ${tab('decisions', active, n)} ${tab('board', active, 0)}
      ${tab('issues', active, 0)}
      <button
        type="button"
        class="tab tab--menu"
        id="rail-menu"
        aria-label=${t('projects')}
        title=${t('projects')}
        @click=${toggleDrawer}
      >
        ${icon('menu')}<span class="tab__label">${t('projects')}</span>
      </button>
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
