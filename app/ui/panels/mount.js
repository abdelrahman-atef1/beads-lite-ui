/**
 * Panels entry (beads-lite-1bo5.6.59.16): fills the shell's top-bar slot
 * `bell` with three icon buttons: project outputs, report a bug, the bell
 * (unread dot) with its notifications + push sheet. One call from boot.js
 * (SHELL-REQ on beads-lite-1bo5.6.59); idempotent, so a second call is a no-op.
 */
import { html, render } from 'lit-html';
import { icon } from '../icons.js';
import { mountBell } from '../views/notifications.js';
import { openProjectOutputs } from '../views/outputs.js';
import { createReportEntry } from '../views/report.js';
import { tp } from './i18n.js';

/**
 * @param {HTMLElement} root - the #u3 element
 * @param {{ client: any }} ctx - the boot base (store, ws client, ...)
 * @returns {{ bell: any, report: any } | null}
 */
export function mountPanels(root, ctx) {
  const slot = /** @type {HTMLElement | null} */ (
    root.querySelector('[data-slot="bell"]')
  );
  if (!slot || slot.dataset.panels) return null;
  slot.dataset.panels = '1';
  slot.classList.add('u3-pn-actions');
  const client = ctx.client;

  const lead = document.createElement('span');
  lead.className = 'u3-pn-lead';
  slot.append(lead);
  const report = createReportEntry({ host: root });
  const draw = () =>
    render(
      html`<button
          type="button"
          class="u3-iconbtn u3-pn-btn"
          data-act="outputs"
          aria-haspopup="dialog"
          aria-label=${tp('pn_outputs')}
          title=${tp('pn_outputs')}
          @click=${() => openProjectOutputs({ client, host: root })}
        >
          ${icon('outputs', { size: 22 })}
        </button>
        <button
          type="button"
          class="u3-iconbtn u3-pn-btn"
          data-act="report"
          aria-haspopup="dialog"
          aria-label=${tp('pn_report')}
          title=${tp('pn_report')}
          @click=${() => report.open()}
        >
          ${icon('report', { size: 22 })}
        </button>`,
      lead
    );
  draw();
  window.addEventListener('bdui-lang', draw);
  const bell = mountBell(slot, { client, host: root });
  return { bell, report };
}
