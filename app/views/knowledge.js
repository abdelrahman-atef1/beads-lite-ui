/**
 * Knowledge tab (beads-lite-1bo5.6.54, design learner-eqt1.92 v2): three
 * groups, one row per thing: what to do, what to know, what to try. Read-only:
 * a button only opens the note or the bead. Data: server/features/knowledge.js.
 * Every string from the notes is rendered as text (never as HTML).
 */
import { html, nothing, render } from 'lit-html';
import { t } from '../utils/i18n.js';
import { debug } from '../utils/logging.js';

/**
 * @param {string} key
 * @param {Record<string, string | number>} vars
 */
function tv(key, vars) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split('{' + k + '}').join(String(v));
  }
  return s;
}

/**
 * @param {HTMLElement} mount
 * @param {{ send: (type: string, payload?: unknown) => Promise<any> }} client
 * @param {(id: string, project_path: string) => void | Promise<void>} openBead
 */
export function createKnowledgeView(mount, client, openBead) {
  const log = debug('views:knowledge');
  /** @type {any} */
  let snap = null;
  let loading = false;
  let failed = false;
  /** @type {{ title: string, text: string } | null} */
  let dialog = null;

  async function load() {
    if (loading) {
      return;
    }
    loading = true;
    failed = false;
    doRender();
    try {
      snap = await client.send('knowledge-get', {});
    } catch (err) {
      log('load failed: %o', err);
      failed = true;
    }
    loading = false;
    doRender();
  }

  /** @param {{ topic: string, item: string }} note */
  async function openNote(note) {
    try {
      const r = await client.send('knowledge-note', note);
      dialog = { title: String(r.title || ''), text: String(r.text || '') };
    } catch (err) {
      log('note failed: %o', err);
      dialog = { title: '', text: t('kn_failed_load') };
    }
    doRender();
  }

  /** @param {any} row */
  function doRow(row) {
    switch (row.kind) {
      case 'unsorted':
        return {
          title: tv('kn_unsorted', { n: row.n }),
          line: t('kn_unsorted_why'),
          btn: t('kn_unsorted_btn'),
          act: () => openNote(row.note)
        };
      case 'failed': {
        const title = tv('kn_failed', { platform: row.platform, id: row.id });
        return {
          title,
          line: t('kn_failed_why'),
          btn: t('kn_failed_btn'),
          act: () => {
            dialog = {
              title,
              text: t(row.why === 'no_file' ? 'kn_why_no_file' : 'kn_why_other')
            };
            doRender();
          }
        };
      }
      case 'cookie':
        return {
          title: t('kn_cookie'),
          line: t('kn_cookie_why'),
          btn: '',
          act: null
        };
      default:
        return {
          title: tv('kn_offer', { title: row.title }),
          line: t('kn_offer_why'),
          btn: row.bead.path ? t('kn_offer_btn') : '',
          act: () => openBead(row.bead.id, row.bead.path)
        };
    }
  }

  /** @param {any} row */
  function doTemplate(row) {
    const r = doRow(row);
    return rowTemplate('do', r.title, r.line, r.btn, r.act, false);
  }

  /**
   * @param {'do'|'know'|'try'} group
   * @param {string} title
   * @param {string} line
   * @param {string} btn
   * @param {(() => unknown) | null} act
   * @param {boolean} caution
   */
  function rowTemplate(group, title, line, btn, act, caution) {
    return html`<li class="kn-row kn-row--${group}">
      <div class="kn-row__body">
        <div class="kn-row__title" dir="auto">
          ${caution
            ? html`<span class="kn-chip">${t('kn_promo')}</span>`
            : nothing}${title}
        </div>
        ${line
          ? html`<div class="kn-row__line" dir="auto">${line}</div>`
          : nothing}
      </div>
      ${btn && act
        ? html`<button type="button" class="btn kn-row__btn" @click=${act}>
            ${btn}
          </button>`
        : nothing}
    </li>`;
  }

  /**
   * @param {'do'|'know'|'try'} group
   * @param {number} n
   * @param {any[]} rows
   * @param {(row: any) => any} row_tpl
   * @param {number} more
   * @param {string} empty_line
   */
  function groupTemplate(group, n, rows, row_tpl, more, empty_line) {
    return html`<section class="kn-group" aria-labelledby=${'kn-h-' + group}>
      <h2 class="kn-group__h" id=${'kn-h-' + group}>
        <span class="kn-num kn-num--${group}">${n}</span>${t('kn_' + group)}
      </h2>
      ${rows.length
        ? html`<ul class="kn-list">
            ${rows.map(row_tpl)}
            ${more > 0
              ? html`<li class="kn-more">${tv('kn_more', { n: more })}</li>`
              : nothing}
          </ul>`
        : empty_line
          ? html`<p class="kn-empty">${empty_line}</p>`
          : nothing}
    </section>`;
  }

  function skeleton() {
    return html`${[0, 1, 2].map(
      () =>
        html`<section class="kn-group" aria-busy="true">
          <ul class="kn-list">
            ${[0, 1, 2].map(() => html`<li class="kn-row kn-skel"></li>`)}
          </ul>
        </section>`
    )}`;
  }

  function dialogTemplate() {
    if (!dialog) {
      return nothing;
    }
    const d = dialog;
    const close = () => {
      dialog = null;
      doRender();
    };
    return html`<div
      class="kn-modal"
      @click=${(/** @type {MouseEvent} */ ev) => {
        if (ev.target === ev.currentTarget) {
          close();
        }
      }}
    >
      <div
        class="kn-modal__box"
        role="dialog"
        aria-modal="true"
        aria-label=${d.title}
      >
        <h3 class="kn-modal__h" dir="auto">${d.title}</h3>
        <pre class="kn-modal__text" dir="auto">${d.text}</pre>
        <button type="button" class="btn kn-row__btn" @click=${close}>
          ${t('kn_close')}
        </button>
      </div>
    </div>`;
  }

  function body() {
    if (failed) {
      return html`<p class="kn-error" role="alert">
        ${t('kn_failed_load')}
        <button type="button" class="btn" @click=${load}>
          ${t('kn_retry')}
        </button>
      </p>`;
    }
    if (!snap) {
      return skeleton();
    }
    if (!snap.has_notes && snap.todo.length === 0) {
      return html`<p class="kn-empty kn-empty--solo">${t('kn_no_notes')}</p>`;
    }
    return html`
      ${snap.partial
        ? html`<p class="kn-partial">${t('kn_partial')}</p>`
        : nothing}
      ${groupTemplate(
        'do',
        1,
        snap.todo,
        doTemplate,
        snap.todo_more,
        t('kn_empty')
      )}
      ${groupTemplate(
        'know',
        2,
        snap.know,
        (/** @type {any} */ r) =>
          rowTemplate(
            'know',
            r.title,
            tv('kn_from', { title: r.line }),
            t('kn_read'),
            () => openNote(r.note),
            false
          ),
        0,
        ''
      )}
      ${groupTemplate(
        'try',
        3,
        snap.try,
        (/** @type {any} */ r) =>
          rowTemplate(
            'try',
            r.title,
            r.line,
            t('kn_read_try'),
            () => openNote(r.note),
            !!r.caution
          ),
        0,
        ''
      )}
      <p class="kn-foot">${t('kn_footer')}</p>
    `;
  }

  function doRender() {
    render(
      html`<div class="kn">
        <h1 class="kn__title">${t('knowledge')}</h1>
        <p class="kn__sub">${t('kn_sub')}</p>
        ${body()}${dialogTemplate()}
      </div>`,
      mount
    );
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (ev.key === 'Escape' && dialog) {
      dialog = null;
      doRender();
    }
  }

  window.addEventListener('bdui-lang', doRender);
  window.addEventListener('keydown', onKey);
  doRender();

  return {
    /** Every open of the tab reads again (files only, no timer). */
    async load() {
      await load();
    },
    destroy() {
      window.removeEventListener('bdui-lang', doRender);
      window.removeEventListener('keydown', onKey);
      render(nothing, mount);
    }
  };
}
