/**
 * One Tasks filter: a chip that hugs its content (icon, name, chosen value)
 * and a popover whose every option has its own icon. Replaces the native
 * <select>, which cannot show icons and stretched the chips. The open state
 * lives in the caller so a redraw keeps the popover open.
 */
import { html } from 'lit-html';
import { chipIcon } from './chip-icons.js';

/**
 * @typedef {{ value: string, label: string, icon: string, tone?: string }} Opt
 * @typedef {{ name: string, left: number, top: number }} Open
 */

/**
 * @param {{
 *   name: string,
 *   icon: string,
 *   title: string,
 *   any: string,
 *   options: Opt[],
 *   selected: string[],
 *   multi?: boolean,
 *   open: Open | null,
 *   setOpen: (o: Open | null) => void,
 *   pick: (value: string) => void
 * }} p
 */
export function filterMenu(p) {
  const on = p.selected.length > 0;
  const isOpen = p.open?.name === p.name;
  const names = p.selected.map(
    (v) => p.options.find((o) => o.value === v)?.label ?? v
  );
  const shown =
    names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] || '';
  /** @param {MouseEvent} ev */
  const toggle = (ev) => {
    const r = /** @type {HTMLElement} */ (
      ev.currentTarget
    ).getBoundingClientRect();
    p.setOpen(
      isOpen
        ? null
        : { name: p.name, left: Math.round(r.left), top: Math.round(r.bottom) }
    );
  };
  /** @param {KeyboardEvent} ev */
  const keynav = (ev) => {
    const k = ev.key;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k)) return;
    ev.preventDefault();
    const list = /** @type {HTMLElement[]} */ ([
      .../** @type {HTMLElement} */ (ev.currentTarget).querySelectorAll(
        '.u3t-opt'
      )
    ]);
    const at = list.indexOf(
      /** @type {HTMLElement} */ (document.activeElement)
    );
    const next =
      k === 'Home'
        ? 0
        : k === 'End'
          ? list.length - 1
          : Math.max(
              0,
              Math.min(list.length - 1, at + (k === 'ArrowDown' ? 1 : -1))
            );
    list[next]?.focus();
  };
  /** @param {Opt} o */
  const row = (o) => {
    const sel = o.value === '' ? !on : p.selected.includes(o.value);
    return html`<button
      type="button"
      role="option"
      class="u3t-opt"
      data-v=${o.value}
      aria-selected=${sel ? 'true' : 'false'}
      @click=${() => p.pick(o.value)}
    >
      ${chipIcon(o.icon, o.tone || '')}<span class="u3t-opt__t">${o.label}</span
      >${sel ? chipIcon('check', 'u3t-opt__ok') : ''}
    </button>`;
  };
  return html`<span class="u3t-menu-w">
    <button
      type="button"
      class="u3t-menu"
      data-name=${p.name}
      data-on=${on ? '1' : '0'}
      aria-haspopup="listbox"
      aria-expanded=${isOpen ? 'true' : 'false'}
      @click=${toggle}
    >
      ${chipIcon(p.icon)}<span>${p.title}</span>${on
        ? html`<b class="u3t-menu__v">${shown}</b>`
        : ''}${chipIcon('caret', 'u3t-menu__c')}
    </button>
    ${isOpen
      ? html`<div
          class="u3t-pop"
          role="listbox"
          aria-label=${p.title}
          @keydown=${keynav}
          style="--x:${p.open?.left}px;--y:${p.open?.top}px"
        >
          ${row({ value: '', label: p.any, icon: 'any' })} ${p.options.map(row)}
        </div>`
      : ''}
  </span>`;
}
