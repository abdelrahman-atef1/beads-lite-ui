import { html, render } from 'lit-html';

/**
 * Bottom sheet (phone) / centred panel (PC). Mounts into `host`, closes on
 * scrim tap, Escape and the close button; returns { close }.
 *
 * @param {HTMLElement} host
 * @param {{ title: string, body: any, closeLabel: string, onClose?: () => void }} o
 */
export function openSheet(host, o) {
  const box = document.createElement('div');
  host.appendChild(box);
  const prev = /** @type {HTMLElement|null} */ (document.activeElement);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    render(html``, box);
    box.remove();
    o.onClose?.();
    prev?.focus?.();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  render(
    html`<div
      class="u3-sheet"
      role="dialog"
      aria-modal="true"
      aria-label=${o.title}
    >
      <div class="u3-sheet__scrim" @click=${close}></div>
      <div class="u3-sheet__panel">
        <div class="u3-sheet__grip" aria-hidden="true"></div>
        <div class="u3-sheet__head">
          <h2>${o.title}</h2>
          <button
            class="u3-iconbtn"
            type="button"
            aria-label=${o.closeLabel}
            @click=${close}
          >
            ×
          </button>
        </div>
        <div class="u3-sheet__body">${o.body}</div>
      </div>
    </div>`,
    box
  );
  /** @type {HTMLElement|null} */ (
    box.querySelector('.u3-sheet__panel button')
  )?.focus();
  return { close };
}
