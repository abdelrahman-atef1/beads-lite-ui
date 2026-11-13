import { html } from 'lit-html';

/**
 * @param {{ label: any, variant?: 'primary'|'ghost'|'steps'|'danger', href?: string, onClick?: (e: Event) => void, disabled?: boolean, block?: boolean, type?: string, ariaLabel?: string }} o
 */
export function button(o) {
  const cls = `u3-btn u3-btn--${o.variant || 'primary'}${o.block ? ' u3-btn--block' : ''}`;
  if (o.href) {
    return html`<a class=${cls} href=${o.href} aria-label=${o.ariaLabel ?? ''}
      >${o.label}</a
    >`;
  }
  return html`<button
    class=${cls}
    type=${o.type || 'button'}
    ?disabled=${!!o.disabled}
    aria-label=${o.ariaLabel ?? ''}
    @click=${o.onClick}
  >
    ${o.label}
  </button>`;
}
