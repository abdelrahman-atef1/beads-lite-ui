/**
 * The one Filters sheet (beads-lite-1bo5.13.16.1): accordion sections, every
 * option a checkbox row with its count. A bottom sheet on a phone and a 320px
 * popover on a wide screen (same markup, css decides). Changes apply live, no
 * Apply button. Pure view: the caller owns all state.
 */
import { html } from 'lit-html';
import { projectIcon } from '../data/project-icons.js';
import { t3 } from '../i18n.js';
import { icon } from '../icons.js';

/**
 * @typedef {{ value: string, label: string, count: number, icon?: string, project?: string }} SheetOpt
 * @typedef {{ dim: string, title: string, options: SheetOpt[] }} Section
 */

/** Sections with more options than this get a find box. */
export const FIND_AFTER = 8;

/**
 * @param {{
 *   sections: Section[],
 *   selected: Record<string, string[]>,
 *   expanded: Set<string>,
 *   find: Record<string, string>,
 *   anchor: { left: number, top: number } | null,
 *   toggle: (dim: string, value: string) => void,
 *   clearDim: (dim: string) => void,
 *   clearAll: () => void,
 *   toggleSection: (dim: string) => void,
 *   setFind: (dim: string, q: string) => void,
 *   close: () => void
 * }} p
 */
export function filterSheet(p) {
  /** @param {Section} s */
  const section = (s) => {
    const sel = p.selected[s.dim] || [];
    const isOpen = p.expanded.has(s.dim) || sel.length > 0;
    const q = (p.find[s.dim] || '').trim().toLowerCase();
    const opts = q
      ? s.options.filter((o) => o.label.toLowerCase().includes(q))
      : s.options;
    return html`<section class="u3t-sh__sec" data-dim=${s.dim}>
      <h3 class="u3t-sh__h">
        <button
          type="button"
          class="u3t-sh__hb"
          aria-expanded=${isOpen ? 'true' : 'false'}
          @click=${() => p.toggleSection(s.dim)}
        >
          <span class="u3t-sh__t">${s.title}</span>
          ${sel.length
            ? html`<span class="u3-chip u3-chip--blue">${sel.length}</span>`
            : ''}${icon('caret', { size: 14 })}
        </button>
        ${sel.length
          ? html`<button
              type="button"
              class="u3t-sh__clr"
              data-clear-dim=${s.dim}
              @click=${() => p.clearDim(s.dim)}
            >
              ${t3('u3_tk_clear_one')}
            </button>`
          : ''}
      </h3>
      ${isOpen
        ? html`${s.options.length > FIND_AFTER
              ? html`<input
                  type="search"
                  class="u3t-sh__find"
                  dir="auto"
                  autocomplete="off"
                  maxlength="60"
                  placeholder=${t3('u3_tk_find')}
                  aria-label=${t3('u3_tk_find') + ' ' + s.title}
                  .value=${p.find[s.dim] || ''}
                  @input=${(/** @type {Event} */ e) =>
                    p.setFind(
                      s.dim,
                      /** @type {HTMLInputElement} */ (e.target).value
                    )}
                />`
              : ''}
            <div class="u3t-sh__opts" role="group" aria-label=${s.title}>
              ${opts.map((o) => {
                const on = sel.includes(o.value);
                return html`<button
                  type="button"
                  role="checkbox"
                  class="u3t-sh__opt"
                  data-v=${o.value}
                  data-zero=${o.count === 0 && !on ? '1' : '0'}
                  aria-checked=${on ? 'true' : 'false'}
                  @click=${() => p.toggle(s.dim, o.value)}
                >
                  <span class="u3t-sh__box" aria-hidden="true"
                    >${on ? icon('check', { size: 14 }) : ''}</span
                  >
                  ${o.project
                    ? projectIcon(o.project)
                    : o.icon
                      ? icon(o.icon, { size: 16 })
                      : ''}
                  <span class="u3t-opt__t">${o.label}</span>
                  <span class="u3t-sh__n">${o.count}</span>
                </button>`;
              })}
              ${opts.length
                ? ''
                : html`<p class="u3t-sh__none u3-muted">
                    ${t3('u3_tk_none')}
                  </p>`}
            </div>`
        : ''}
    </section>`;
  };
  const any = Object.values(p.selected).some((v) => v.length);
  const style = p.anchor ? `--x:${p.anchor.left}px;--y:${p.anchor.top}px` : '';
  return html`<div
      class="u3t-sh__back"
      data-testid="filter-back"
      @click=${p.close}
    ></div>
    <div
      class="u3t-sh"
      role="dialog"
      aria-modal="true"
      aria-label=${t3('u3_tk_filters')}
      style=${style}
    >
      <header class="u3t-sh__top">
        <b class="u3t-sh__title">${t3('u3_tk_filters')}</b>
        ${any
          ? html`<button
              type="button"
              class="u3t-sh__all"
              data-testid="sheet-clear-all"
              @click=${p.clearAll}
            >
              ${t3('u3_tk_clear_all')}
            </button>`
          : ''}
        <button
          type="button"
          class="u3t-sh__done"
          data-testid="sheet-done"
          @click=${p.close}
        >
          ${t3('u3_tk_done')}
        </button>
      </header>
      <div class="u3t-sh__body">${p.sections.map(section)}</div>
    </div>`;
}
