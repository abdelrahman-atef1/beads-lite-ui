/**
 * v3 top search (task .59.14). Lives in the shell header slot
 * [data-slot="search"]. Finds a task by title (either language) or id over the
 * lazily loaded all-issues list; a result opens the task page. `/` focuses it,
 * Esc clears. On a phone it folds into an icon. Titles keep their own
 * direction (dir="auto"); the box itself follows the board language.
 */
import { html, nothing, render, svg } from 'lit-html';
import { getLang } from '../utils/i18n.js';
import { allIssues } from './data/all.js';
import { tp } from './i18n/projects-t.js';

const MAX = 8;
const MAGNIFIER = html`<svg
  viewBox="0 0 24 24"
  width="20"
  height="20"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  aria-hidden="true"
>
  ${svg`<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>`}
</svg>`;

/**
 * Pure match: id or title (en/ar), case-insensitive, bounded result list.
 *
 * @param {any[]} items
 * @param {string} query
 * @param {number} [max]
 */
export function searchIssues(items, query, max = MAX) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
  if (!q) return [];
  /** @type {any[]} */
  const exact = [];
  /** @type {any[]} */
  const rest = [];
  for (const it of items) {
    if (!it) continue;
    const id = String(it.id || '').toLowerCase();
    const hay =
      id +
      '\n' +
      String(it.title || '').toLowerCase() +
      '\n' +
      String(it.title_ar || '').toLowerCase();
    if (!hay.includes(q)) continue;
    (id === q || id.endsWith('-' + q) ? exact : rest).push(it);
    if (exact.length >= max) break;
  }
  return exact.concat(rest).slice(0, max);
}

/**
 * @param {HTMLElement} slot
 * @param {any} base
 * @returns {{ destroy: () => void }}
 */
export function mountSearch(slot, base) {
  const data = allIssues(base);
  let query = '';
  let open = false;
  let phone_open = false;
  let active = 0;
  /** @type {any[]} */
  let results = [];

  const input = () =>
    /** @type {HTMLInputElement|null} */ (slot.querySelector('input'));

  function recompute() {
    results = query.trim() ? searchIssues(data.items(), query) : [];
    if (active >= results.length) active = 0;
  }

  /** @param {string} id */
  function go(id) {
    window.location.hash = '#/issues?issue=' + encodeURIComponent(id);
    close(true);
  }

  /** @param {boolean} clear */
  function close(clear) {
    open = false;
    phone_open = false;
    if (clear) {
      query = '';
      results = [];
    }
    draw();
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (ev.key === 'Escape') {
      close(true);
      input()?.blur();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!results.length) return;
      ev.preventDefault();
      active =
        (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) %
        results.length;
      draw();
    } else if (ev.key === 'Enter' && results[active]) {
      ev.preventDefault();
      go(results[active].id);
    }
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
      phone_open = true;
      draw();
      input()?.focus();
    }
  }

  /** @param {MouseEvent} ev */
  function onDoc(ev) {
    if (open && !slot.contains(/** @type {Node} */ (ev.target))) {
      open = false;
      draw();
    }
  }

  function panel() {
    if (!open || !query.trim()) return nothing;
    if (!results.length) {
      return html`<div class="u3-search__pop" role="status">
        ${data.loaded() ? tp('u3s_none') : tp('u3s_loading')}
      </div>`;
    }
    return html`<ul
      class="u3-search__pop"
      role="listbox"
      aria-label=${tp('u3s_results')}
    >
      ${results.map(
        (it, i) =>
          html`<li
            role="option"
            aria-selected=${i === active ? 'true' : 'false'}
          >
            <a
              class="u3-search__hit"
              href=${'#/issues?issue=' + encodeURIComponent(it.id)}
              data-active=${i === active ? 'true' : 'false'}
              @click=${(/** @type {Event} */ e) => {
                e.preventDefault();
                go(it.id);
              }}
            >
              <span class="u3-search__title" dir="auto"
                >${it.title || it.title_ar}</span
              >
              <span class="u3-search__id u3-mono" dir="ltr">${it.id}</span>
            </a>
          </li>`
      )}
    </ul>`;
  }

  function draw() {
    render(
      html`<div class="u3-search${phone_open ? ' is-open' : ''}">
        <button
          type="button"
          class="u3-btn u3-btn--ghost u3-search__btn"
          aria-label=${tp('u3s_btn')}
          @click=${() => {
            phone_open = !phone_open;
            draw();
            if (phone_open) input()?.focus();
          }}
        >
          ${MAGNIFIER}
        </button>
        <label class="u3-search__field">
          <input
            type="search"
            class="u3-search__input"
            placeholder=${tp('u3s_ph')}
            aria-label=${tp('u3s_btn')}
            maxlength="200"
            autocomplete="off"
            .value=${query}
            @input=${(/** @type {Event} */ ev) => {
              query = /** @type {HTMLInputElement} */ (ev.target).value;
              open = true;
              recompute();
              draw();
            }}
            @focus=${() => {
              if (query.trim()) {
                open = true;
                recompute();
                draw();
              } else {
                data.items(); // start the lazy list on first focus
              }
            }}
            @keydown=${onKey}
          />
        </label>
        ${panel()}
      </div>`,
      slot
    );
    slot.setAttribute('dir', getLang() === 'ar' ? 'rtl' : 'ltr');
  }

  const off = data.on(() => {
    if (open && query.trim()) {
      recompute();
      draw();
    }
  });
  document.addEventListener('keydown', onGlobalKey);
  document.addEventListener('click', onDoc);
  window.addEventListener('bdui-lang', draw);
  draw();
  return {
    destroy() {
      off();
      document.removeEventListener('keydown', onGlobalKey);
      document.removeEventListener('click', onDoc);
      window.removeEventListener('bdui-lang', draw);
      render(html``, slot);
    }
  };
}

/**
 * Mount into the shell's search slot once per page (idempotent). The shell
 * redraws around the slot but never clears it.
 *
 * @param {any} base
 */
export function attachSearch(base) {
  const slot = /** @type {HTMLElement|null} */ (
    document.querySelector('#u3 [data-slot="search"]')
  );
  if (!slot || slot.dataset.u3search === '1') return;
  slot.dataset.u3search = '1';
  mountSearch(slot, base);
}
