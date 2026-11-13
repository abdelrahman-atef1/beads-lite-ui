/**
 * v3 outputs (beads-lite-1bo5.6.59.16). Same server calls as legacy
 * app/views/outputs-panel.js: outputs-project {more?} for the project sheet,
 * outputs-get {id, more?, rollup?} for a bead (task page seam). The row and
 * list builders are the legacy ones (bodyOf / rowOf): every value is a text
 * node and every link passes safeHref (SEC O1-O4), so v3 cannot loosen them.
 * Fetched when opened; never polled.
 */
import { html, render } from 'lit-html';
import {
  T_PROJECT,
  bodyOf,
  mountOutputs as legacyMountOutputs
} from '../../views/outputs-panel.js';
import { openSheet } from '../components/index.js';
import { tp } from '../panels/i18n.js';

/**
 * Bead outputs for the task page: `mountBeadOutputs(el, issue, {client})`,
 * same contract as the legacy detail slot (call again when the issue changes).
 *
 * @param {HTMLElement} el
 * @param {any} issue
 * @param {{ client?: any }} [opts]
 */
export function mountBeadOutputs(el, issue, opts = {}) {
  el.classList.add('u3-pn-outputs');
  return legacyMountOutputs(el, issue, opts);
}

/**
 * Open the project Outputs sheet (active project, newest first, filter by kind).
 *
 * @param {{ client: any, host: HTMLElement }} o
 * @returns {{ close: () => void }}
 */
export function openProjectOutputs(o) {
  const st = {
    kind: 'all',
    pages: 0,
    data: /** @type {any} */ (null),
    failed: false
  };
  let seq = 0;
  const box = document.createElement('div');

  const body = () => {
    if (st.failed) {
      return html`<p class="u3-pn__note u3-pn__err" role="alert">
        ${tp('ou_failed')}
        <button type="button" class="u3-pn__lnk" @click=${() => void load()}>
          ${tp('ou_retry')}
        </button>
      </p>`;
    }
    if (!st.data) {
      return html`<p class="u3-pn__note" role="status">${tp('ou_loading')}</p>`;
    }
    return bodyOf(st.data, {
      root: '',
      kind: st.kind,
      onKind: (k) => {
        st.kind = k;
        paint();
      },
      onMore: () => {
        st.pages += 1;
        void load();
      }
    });
  };
  const paint = () =>
    render(
      html`<div class="u3-pn u3-pn-outputs" data-panel="outputs">
        ${body()}
      </div>`,
      box
    );

  async function load() {
    const my = ++seq;
    try {
      const r = await o.client.send(T_PROJECT, { more: st.pages });
      if (my !== seq) return;
      st.data = r;
      st.failed = false;
    } catch {
      if (my !== seq) return;
      st.failed = true;
    }
    paint();
  }

  const sheet = openSheet(o.host, {
    title: tp('pn_outputs'),
    closeLabel: tp('ou_close'),
    body: box,
    onClose: () => {
      seq++;
    }
  });
  paint();
  void load();
  return sheet;
}
