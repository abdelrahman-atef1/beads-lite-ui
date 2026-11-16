/**
 * v3 report-a-bug sheet (beads-lite-1bo5.6.59.16). Same wire format and
 * helpers as legacy app/views/report.js (submitReport, createQueue,
 * flushQueue, loadShrunk, encodeCanvas, validVersion, projectKey): POST
 * /api/report, offline reports kept in IndexedDB and retried, same
 * localStorage keys for draft, project and recent versions. The image is
 * shrunk in the browser; it can be drawn on with a finger (panels/draw.js).
 */
import { html, render } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import {
  createQueue,
  encodeCanvas,
  flushQueue,
  loadShrunk,
  projectKey,
  submitReport,
  validVersion
} from '../../views/report.js';
import { openSheet } from '../components/index.js';
import { PENS, openEditor, paintStrokes } from '../panels/draw.js';
import { tp } from '../panels/i18n.js';

const LS_VERSIONS = 'bdui.report.versions';
const LS_PROJECT = 'bdui.report.project';
const LS_DRAFT = 'bdui.report.draft';
const ROUTE_RE = /^#\/?report(?![a-z])/;

/** @param {string} k */
function lsGet(k) {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
/**
 * @param {string} k
 * @param {string} v
 */
function lsSet(k, v) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // storage full or blocked: the draft is only a convenience
  }
}
function recentVersions() {
  try {
    const a = JSON.parse(lsGet(LS_VERSIONS) || '[]');
    return Array.isArray(a) ? a.filter(validVersion).slice(0, 4) : [];
  } catch {
    return [];
  }
}
/** @param {string} v */
function rememberVersion(v) {
  lsSet(
    LS_VERSIONS,
    JSON.stringify([v, ...recentVersions().filter((x) => x !== v)].slice(0, 4))
  );
}

/** @param {number} sec */
function retryText(sec) {
  const m = sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 60;
  return tp('rpt_retry_in', { n: m });
}
/** @param {string} key */
function errText(key) {
  const k = 'rpt_e_' + key;
  const s = tp(k);
  return s === k ? tp('rpt_e_other') : s;
}

/** @returns {Promise<string[]>} project keys the server knows */
async function loadProjects() {
  /** @type {string[]} */
  let keys = [];
  try {
    const r = await fetch('/api/workspaces');
    const j = await r.json();
    keys = (j.workspaces || [])
      .map((/** @type {any} */ w) => projectKey(w.path))
      .filter((/** @type {string} */ k) =>
        /^[a-z0-9][a-z0-9_-]{0,39}$/.test(k)
      );
  } catch {
    // offline: the last project still lets a report be queued
  }
  keys = [...new Set(keys)];
  const last = lsGet(LS_PROJECT) || '';
  if (last && !keys.includes(last)) keys.unshift(last);
  return keys;
}

/**
 * Open the report sheet. Returns { close }.
 *
 * @param {{ host: HTMLElement, queue?: ReturnType<typeof createQueue>, onClose?: () => void }} o
 */
export function openReportSheet(o) {
  const queue = o.queue || createQueue();
  /** @type {any} */
  let draft = {};
  try {
    draft = JSON.parse(lsGet(LS_DRAFT) || '{}') || {};
  } catch {
    draft = {};
  }
  const st = {
    project: String(draft.project || lsGet(LS_PROJECT) || ''),
    version: String(draft.version || recentVersions()[0] || ''),
    text: String(draft.text || ''),
    projects: /** @type {string[]} */ ([]),
    /** @type {HTMLCanvasElement | null} */
    img: null,
    /** @type {{ c: string, p: number[][] }[]} */
    strokes: [],
    pen: PENS[0][0],
    busy: false,
    /** @type {'' | 'ok' | 'err'} */
    tone: '',
    msg: '',
    /** id of the bead just created; shown as a link */
    createdId: ''
  };
  const box = document.createElement('div');

  const save = () =>
    lsSet(
      LS_DRAFT,
      JSON.stringify({
        text: st.text,
        version: st.version,
        project: st.project
      })
    );

  /** @param {Blob | undefined} f */
  async function setImage(f) {
    if (!f) return;
    try {
      st.img = await loadShrunk(f);
      st.strokes = [];
      st.msg = '';
      st.tone = '';
    } catch {
      st.msg = tp('rpt_e_bad_image');
      st.tone = 'err';
    }
    paint();
  }

  async function send() {
    if (st.busy) return;
    const text = st.text.trim();
    const version = st.version.trim();
    if (!validVersion(version) || (!text && !st.img) || !st.project) {
      st.msg = validVersion(version)
        ? tp('rpt_need')
        : tp('rpt_e_version_required');
      st.tone = 'err';
      paint();
      return;
    }
    st.busy = true;
    st.msg = '';
    st.createdId = '';
    st.tone = '';
    paint();
    try {
      let image = null;
      if (st.img) {
        const c = document.createElement('canvas');
        c.width = st.img.width;
        c.height = st.img.height;
        paintStrokes(c, st.img, st.strokes);
        image = await encodeCanvas(c);
      }
      const d = { project: st.project, text, version, image };
      const r = await submitReport(d);
      const done = () => {
        rememberVersion(version);
        lsSet(LS_PROJECT, st.project);
        lsSet(LS_DRAFT, '{}');
        st.text = '';
        st.img = null;
        st.strokes = [];
        st.tone = 'ok';
      };
      if (r.ok) {
        done();
        st.msg = tp('rpt_sent');
        st.createdId = r.id;
      } else if (r.offline) {
        await queue.add(d);
        done();
        st.msg = tp('rpt_queued');
      } else {
        st.tone = 'err';
        st.msg = errText(String(r.error));
        if (r.status === 429) st.msg += ' ' + retryText(r.retryAfter || 0);
      }
    } catch {
      st.tone = 'err';
      st.msg = tp('rpt_e_other');
    }
    st.busy = false;
    paint();
  }

  const body = () =>
    html`<form
      class="u3-pn u3-pn-report"
      novalidate
      data-panel="report"
      @submit=${(/** @type {Event} */ e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label class="u3-pn__field">
        <span>${tp('rpt_project')}</span>
        <select
          name="project"
          .value=${st.project}
          @change=${(/** @type {any} */ e) => {
            st.project = e.target.value;
            save();
          }}
        >
          ${st.projects.length
            ? st.projects.map(
                (k) =>
                  html`<option value=${k} ?selected=${k === st.project}>
                    ${k}
                  </option>`
              )
            : html`<option value="">${tp('rpt_no_projects')}</option>`}
        </select>
      </label>
      <label class="u3-pn__field">
        <span>${tp('rpt_version')}</span>
        <input
          name="version"
          type="text"
          dir="ltr"
          maxlength="40"
          required
          autocomplete="off"
          autocapitalize="off"
          placeholder=${tp('rpt_version_ph')}
          .value=${st.version}
          @input=${(/** @type {any} */ e) => {
            st.version = e.target.value;
            save();
          }}
        />
      </label>
      ${recentVersions().length
        ? html`<div
            class="u3-pn__chips"
            role="group"
            aria-label=${tp('rpt_version_recent')}
          >
            ${recentVersions().map(
              (v) =>
                html`<button
                  type="button"
                  class="u3-chip u3-pn__vchip"
                  data-v=${v}
                  @click=${() => {
                    st.version = v;
                    save();
                    paint();
                  }}
                >
                  ${v}
                </button>`
            )}
          </div>`
        : ''}
      <div class="u3-pn__media">
        ${st.img
          ? html`<div class="u3-pn__shot">
              <canvas
                class="u3-pn__preview"
                role="img"
                aria-label=${tp('rpt_canvas')}
                width=${st.img.width}
                height=${st.img.height}
                ${ref((c) => {
                  if (c && st.img) {
                    paintStrokes(
                      /** @type {HTMLCanvasElement} */ (c),
                      st.img,
                      st.strokes
                    );
                  }
                })}
              ></canvas>
              <div class="u3-pn__shotbar">
                <button
                  type="button"
                  class="u3-btn u3-btn--ghost"
                  data-act="shot-edit"
                  @click=${() => {
                    if (!st.img) return;
                    openEditor({
                      host: o.host,
                      base: st.img,
                      strokes: st.strokes,
                      pen: st.pen,
                      onDone: (strokes, pen) => {
                        st.strokes = strokes;
                        st.pen = pen;
                        paint();
                      }
                    });
                  }}
                >
                  ${tp('rpt_edit')}
                </button>
                <button
                  type="button"
                  class="u3-pn__lnk"
                  data-act="shot-remove"
                  @click=${() => {
                    st.img = null;
                    st.strokes = [];
                    paint();
                  }}
                >
                  ${tp('rpt_remove')}
                </button>
              </div>
            </div>`
          : html`<label class="u3-pn__drop">
                <input
                  type="file"
                  accept="image/*"
                  aria-label=${tp('rpt_shot_add')}
                  @change=${(/** @type {any} */ e) =>
                    void setImage(e.target.files?.[0])}
                />
                <b>${tp('rpt_shot_add')}</b>
                <small>${tp('rpt_shot_hint')}</small>
              </label>
              <label class="u3-pn__drop">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label=${tp('rpt_shot_cam')}
                  @change=${(/** @type {any} */ e) =>
                    void setImage(e.target.files?.[0])}
                />
                <b>${tp('rpt_shot_cam')}</b>
              </label>`}
      </div>
      <label class="u3-pn__field">
        <span>${tp('rpt_text')}</span>
        <textarea
          name="text"
          rows="4"
          maxlength="2000"
          dir="auto"
          placeholder=${tp('rpt_text_ph')}
          .value=${st.text}
          @input=${(/** @type {any} */ e) => {
            st.text = e.target.value;
            save();
          }}
        ></textarea>
      </label>
      <p class="u3-pn__note">${tp('rpt_note')}</p>
      <p
        class="u3-pn__msg ${st.tone ? 'is-' + st.tone : ''}"
        role="status"
        aria-live="polite"
      >
        ${st.msg}${st.createdId
          ? html` <a
              class="u3-mono"
              data-act="open-created"
              href=${'#/issues?issue=' + encodeURIComponent(st.createdId)}
              @click=${() => sheet.close()}
              >${st.createdId}</a
            >`
          : ''}
      </p>
      <button
        type="submit"
        class="u3-btn u3-btn--primary u3-btn--block"
        data-act="send"
        ?disabled=${st.busy}
      >
        ${st.busy ? tp('rpt_sending') : tp('rpt_send')}
      </button>
    </form>`;
  const paint = () => render(body(), box);

  const sheet = openSheet(o.host, {
    title: tp('rpt_title'),
    closeLabel: tp('rpt_close'),
    body: box,
    onClose: () => {
      document.removeEventListener('paste', onPaste);
      o.onClose?.();
    }
  });
  /** @param {ClipboardEvent} e */
  const onPaste = (e) => {
    const f = Array.from(e.clipboardData?.files || []).find((x) =>
      x.type.startsWith('image/')
    );
    if (f) void setImage(f);
  };
  document.addEventListener('paste', onPaste);
  paint();
  void loadProjects().then((keys) => {
    st.projects = keys;
    if (!st.project || !keys.includes(st.project)) st.project = keys[0] || '';
    paint();
  });
  return sheet;
}

/**
 * Report entry: retries queued reports (page open, back online) and opens the
 * sheet from `openReport()` or the `#/report` hash like legacy.
 *
 * @param {{ host: HTMLElement }} o
 * @returns {{ open: () => void, close: () => void }}
 */
export function createReportEntry(o) {
  const queue = createQueue();
  /** @type {{ close: () => void } | null} */
  let sheet = null;
  let viaHash = false;
  async function retry() {
    try {
      await flushQueue(queue, (d) => submitReport(d));
    } catch {
      // queue unavailable: nothing to retry
    }
  }
  function open() {
    if (sheet) return;
    sheet = openReportSheet({
      host: o.host,
      queue,
      onClose: () => {
        sheet = null;
        viaHash = false;
        if (ROUTE_RE.test(location.hash)) location.hash = '#/';
      }
    });
  }
  const close = () => sheet?.close();
  window.addEventListener('hashchange', () => {
    if (ROUTE_RE.test(location.hash)) {
      viaHash = !sheet;
      open();
    } else if (viaHash) {
      close();
    }
  });
  window.addEventListener('online', () => void retry());
  if (ROUTE_RE.test(location.hash)) {
    viaHash = true;
    open();
  }
  void retry();
  return { open, close };
}
