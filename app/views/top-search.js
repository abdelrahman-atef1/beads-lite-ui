import { html, render } from 'lit-html';
import { t } from '../utils/i18n.js';

/**
 * Top-bar search (design/README.md 5.6). `/` focuses it, Esc clears. Typing
 * updates the shared board filter after a 120 ms debounce; matching is done
 * client-side over the loaded slice, so typing never waits on the server.
 * On a phone the input hides behind a search icon button.
 *
 * @param {HTMLElement} mount_element
 * @param {{ get: () => any, set: (p: any) => void, subscribe: (fn: () => void) => () => void }} filter
 * @param {{ onSearch?: () => void }} [opts]
 */
export function createTopSearch(mount_element, filter, opts = {}) {
  let open_phone = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  /** @returns {HTMLInputElement | null} */
  function input() {
    return mount_element.querySelector('input');
  }

  /** @param {string} v */
  function push(v) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      filter.set({ search: v });
      if (v.trim() && opts.onSearch) {
        opts.onSearch();
      }
    }, 120);
  }

  /** @param {KeyboardEvent} ev */
  function onGlobalKey(ev) {
    const el = /** @type {HTMLElement|null} */ (ev.target);
    const typing =
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable);
    if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      open_phone = true;
      doRender();
      input()?.focus();
    }
  }

  /** @param {KeyboardEvent} ev */
  function onInputKey(ev) {
    if (ev.key === 'Escape') {
      const el = /** @type {HTMLInputElement} */ (ev.target);
      el.value = '';
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      filter.set({ search: '' });
      open_phone = false;
      doRender();
    }
  }

  function template() {
    return html`
      <button
        type="button"
        class="btn btn--small top-search__btn"
        aria-label=${t('search_btn')}
        @click=${() => {
          open_phone = !open_phone;
          doRender();
          if (open_phone) {
            input()?.focus();
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M10 3a7 7 0 105 12l5 5 1.4-1.4-5-5A7 7 0 0010 3zm0 2a5 5 0 110 10 5 5 0 010-10z"
            fill="currentColor"
          ></path>
        </svg>
      </button>
      <label class="top-search__field ${open_phone ? 'is-open' : ''}">
        <input
          type="search"
          id="board-search"
          placeholder=${t('search_ph')}
          aria-label=${t('search_btn')}
          maxlength="200"
          autocomplete="off"
          .value=${filter.get().search}
          @input=${(/** @type {Event} */ ev) =>
            push(/** @type {HTMLInputElement} */ (ev.target).value)}
          @keydown=${onInputKey}
          @blur=${(/** @type {FocusEvent} */ ev) => {
            // Phone: an empty search box folds back into the icon.
            if (
              open_phone &&
              !/** @type {HTMLInputElement} */ (ev.target).value
            ) {
              open_phone = false;
              doRender();
            }
          }}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  document.addEventListener('keydown', onGlobalKey);
  window.addEventListener('bdui-lang', doRender);
  const unsub = filter.subscribe(() => {
    // Keep the box in sync when something else clears the filter.
    const el = input();
    if (el && el.value !== filter.get().search && !timer) {
      el.value = filter.get().search;
    }
  });

  return {
    destroy() {
      unsub();
      document.removeEventListener('keydown', onGlobalKey);
      window.removeEventListener('bdui-lang', doRender);
      render(html``, mount_element);
    }
  };
}
