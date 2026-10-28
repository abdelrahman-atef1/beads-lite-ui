/**
 * Report-a-bug button + sheet (header slot `report`, route #/report),
 * company-1bo5.6.30. Phone first: screenshot (gallery/camera/paste), finger
 * drawing, text, project, version (mandatory), send, offline keep-and-retry.
 * The image is shrunk in the browser; the server never sees a big upload.
 *
 * Wire format (server/features/report.js): [u32 BE metaLen][meta JSON][image].
 */
import { getLang, t } from '../utils/i18n.js';

export const MAX_SIDE = 1280;
export const TARGET_BYTES = 300 * 1024;
export const QUALITIES = [0.7, 0.55, 0.4, 0.3];
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9 ._+()#:/-]{0,39}$/;
const LS_VERSIONS = 'bdui.report.versions';
const LS_PROJECT = 'bdui.report.project';
const LS_DRAFT = 'bdui.report.draft';
const ROUTE_RE = new RegExp('^#/?report(?![a-z])');
const PENS = [
  ['#e5322d', 'rpt_red'],
  ['#f5c400', 'rpt_yellow'],
  ['#1e88e5', 'rpt_blue']
];

/**
 * Size after shrinking so the longest side is at most `max`.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} [max]
 */
export function downscaleSize(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return {
    w: Math.max(1, Math.round(w * s)),
    h: Math.max(1, Math.round(h * s))
  };
}

/**
 * Build the request body.
 *
 * @param {{ project: string, text: string, version: string }} meta
 * @param {Uint8Array | null} image
 */
export function buildFrame(meta, image) {
  const m = new TextEncoder().encode(JSON.stringify(meta));
  const img = image || new Uint8Array(0);
  const out = new Uint8Array(4 + m.length + img.length);
  new DataView(out.buffer).setUint32(0, m.length, false);
  out.set(m, 4);
  out.set(img, 4 + m.length);
  return out;
}

/** @param {string} v */
export function validVersion(v) {
  return VERSION_RE.test(String(v || '').trim());
}

/** @param {string} p - workspace path -> project key the server uses */
export function projectKey(p) {
  return (
    String(p || '')
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || ''
  ).toLowerCase();
}

/** @returns {string} */
function boardToken() {
  const m = document.querySelector('meta[name="board-token"]');
  return m ? m.getAttribute('content') || '' : '';
}

/**
 * Send one draft. Never throws: resolves to ok with an id, offline, or an
 * error code with the HTTP status.
 *
 * @param {{ project: string, text: string, version: string, image?: Blob | null }} d
 * @param {{ fetch?: typeof fetch, token?: string }} [o]
 */
export async function submitReport(d, o = {}) {
  const f = o.fetch || globalThis.fetch.bind(globalThis);
  let img = null;
  if (d.image) {
    img = new Uint8Array(await blobBytes(d.image));
  }
  const body = buildFrame(
    { project: d.project, text: d.text, version: d.version },
    img
  );
  let res;
  try {
    res = await f('/api/report', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-bdui-report',
        'x-bdui-report': '1',
        'x-board-token': o.token ?? boardToken()
      },
      body
    });
  } catch {
    return { ok: false, offline: true };
  }
  /** @type {any} */
  let j = null;
  try {
    j = await res.json();
  } catch {
    // not json (proxy error page)
  }
  if (res.ok && j && j.ok && j.id) {
    return { ok: true, id: String(j.id) };
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return { ok: false, offline: true };
  }
  return {
    ok: false,
    status: res.status,
    error: (j && j.error) || 'other',
    retryAfter: Number(res.headers?.get?.('Retry-After')) || 0
  };
}

/** @param {Blob} b - @returns {Promise<ArrayBuffer>} */
function blobBytes(b) {
  if (typeof b.arrayBuffer === 'function') return b.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(/** @type {ArrayBuffer} */ (r.result));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

/**
 * Pending-report queue in IndexedDB (survives reload and a closed tab). Falls
 * back to memory where IndexedDB is missing (tests, private mode).
 *
 * @param {{ idb?: IDBFactory | null }} [o]
 */
export function createQueue(o = {}) {
  const idb = o.idb === undefined ? globalThis.indexedDB : o.idb;
  /** @type {Map<number, any>} */
  const mem = new Map();
  let seq = 0;
  /** @type {Promise<IDBDatabase> | null} */
  let dbp = null;
  const open = () => {
    dbp ??= new Promise((resolve, reject) => {
      const rq = /** @type {IDBFactory} */ (idb).open('bdui-report', 1);
      rq.onupgradeneeded = () =>
        rq.result.createObjectStore('q', {
          keyPath: 'id',
          autoIncrement: true
        });
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbp;
  };
  /**
   * @template T
   * @param {'readonly'|'readwrite'} mode
   * @param {(s: IDBObjectStore) => IDBRequest<T>} fn
   * @returns {Promise<T>}
   */
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const rq = fn(db.transaction('q', mode).objectStore('q'));
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  };
  return {
    /** @param {any} d */
    async add(d) {
      if (!idb) {
        mem.set(++seq, { ...d, id: seq });
        return seq;
      }
      return Number(
        await run('readwrite', (s) => s.add({ ...d, at: Date.now() }))
      );
    },
    async all() {
      if (!idb) return [...mem.values()];
      return await run('readonly', (s) => s.getAll());
    },
    /** @param {number} id */
    async del(id) {
      if (!idb) {
        mem.delete(id);
        return;
      }
      await run('readwrite', (s) => s.delete(id));
    }
  };
}

/**
 * Try every queued report once, oldest first. Stops at the first offline
 * result. A refusal that retrying cannot fix drops the item (reported back).
 *
 * @param {ReturnType<typeof createQueue>} q
 * @param {(d: any) => Promise<any>} send
 * @returns {Promise<{ sent: string[], dropped: string[], left: number }>}
 */
export async function flushQueue(q, send) {
  const items = (await q.all()).sort((a, b) => a.id - b.id);
  /** @type {string[]} */
  const sent = [];
  /** @type {string[]} */
  const dropped = [];
  let left = items.length;
  for (const it of items) {
    const r = await send(it);
    if (r.ok) {
      await q.del(it.id);
      sent.push(r.id);
      left--;
    } else if (r.offline || r.status === 429 || r.status >= 500) {
      break;
    } else {
      await q.del(it.id);
      dropped.push(r.error);
      left--;
    }
  }
  return { sent, dropped, left };
}

/**
 * Shrink an image file to a JPEG blob (<= MAX_SIDE, stepping quality down
 * until it is under TARGET_BYTES). Returns the base canvas the user draws on.
 *
 * @param {Blob} file
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function loadShrunk(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('bad_image'));
      i.src = url;
    });
    const { w, h } = downscaleSize(
      im.naturalWidth || im.width,
      im.naturalHeight || im.height
    );
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.fillStyle = '#fff';
    x.fillRect(0, 0, w, h);
    x.drawImage(im, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {HTMLCanvasElement} c - @returns {Promise<Blob>} */
export async function encodeCanvas(c) {
  /** @type {Blob | null} */
  let b = null;
  for (const q of QUALITIES) {
    b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (b && b.size <= TARGET_BYTES) break;
  }
  if (!b) throw new Error('bad_image');
  return b;
}

/** @param {string} k */
function lsGet(k) {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
/** @param {string} k - @param {string} v */
function lsSet(k, v) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // ignore
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

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {(Node|string)[]} [kids]
 * @returns {any}
 */
function h(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) e.append(c);
  return e;
}

const queue = createQueue();
/** @type {HTMLElement | null} */
let sheet = null;
/** @type {{ img: HTMLCanvasElement | null, strokes: any[], cur: any, pen: string, busy: boolean }} */
const st = { img: null, strokes: [], cur: null, pen: PENS[0][0], busy: false };

/** @param {HTMLElement} el */
export function mountReport(el) {
  const b = h('button', {
    type: 'button',
    class: 'hbtn rpt-open',
    'aria-label': t('rpt_open')
  });
  const paint = () => {
    b.textContent = '';
    b.append(
      h('span', { class: 'rpt-open__plus', 'aria-hidden': 'true' }, ['+'])
    );
    b.append(h('span', { class: 'rpt-open__txt' }, [t('rpt_open')]));
    b.setAttribute('aria-label', t('rpt_open'));
  };
  paint();
  b.addEventListener('click', () => openReport());
  el.replaceChildren(b);
  window.addEventListener('bdui-lang', () => {
    paint();
    if (sheet) {
      const was = sheet.querySelector('[name=text]');
      const draft = snapshot();
      sheet.remove();
      sheet = null;
      if (was) openReport(draft);
    }
  });
  let viaHash = false;
  const hash = () => {
    if (ROUTE_RE.test(location.hash)) {
      viaHash = !sheet;
      openReport();
    } else if (viaHash) {
      viaHash = false;
      closeReport(true);
    }
  };
  window.addEventListener('hashchange', hash);
  window.addEventListener('online', () => void retry());
  document.addEventListener('paste', (e) => {
    if (!sheet) return;
    const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find(
      (x) => x.type.startsWith('image/')
    );
    if (f) void setImage(f);
  });
  hash();
  void retry();
}

/** Current form values, for re-render and for the saved draft. */
function snapshot() {
  const v = (/** @type {string} */ n) =>
    /** @type {HTMLInputElement | null} */ (sheet?.querySelector(`[name=${n}]`))
      ?.value || '';
  return { text: v('text'), version: v('version'), project: v('project') };
}

/** @param {{ text?: string, version?: string, project?: string }} [d] */
export function openReport(d) {
  if (sheet) return;
  const draft =
    d ||
    (() => {
      try {
        return JSON.parse(lsGet(LS_DRAFT) || '{}');
      } catch {
        return {};
      }
    })();
  const lang = getLang();
  const root = h('div', {
    class: 'rpt',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('rpt_title'),
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    lang
  });
  const proj = h('select', { name: 'project', id: 'rpt-project' });
  const ver = h('input', {
    name: 'version',
    id: 'rpt-version',
    type: 'text',
    maxlength: 40,
    required: true,
    autocomplete: 'off',
    autocapitalize: 'off',
    placeholder: t('rpt_version_ph'),
    value: draft.version || recentVersions()[0] || ''
  });
  const chips = h(
    'div',
    {
      class: 'rpt-chips',
      role: 'group',
      'aria-label': t('rpt_version_recent')
    },
    recentVersions().map((v) =>
      h('button', { type: 'button', class: 'rpt-chip', 'data-v': v }, [v])
    )
  );
  const text = h('textarea', {
    name: 'text',
    id: 'rpt-text',
    rows: 4,
    maxlength: 2000,
    placeholder: t('rpt_text_ph')
  });
  text.value = draft.text || '';
  const media = h('div', { class: 'rpt-media' });
  const msg = h('p', {
    class: 'rpt-msg',
    role: 'status',
    'aria-live': 'polite'
  });
  const send = h('button', { type: 'button', class: 'rpt-send' }, [
    t('rpt_send')
  ]);
  const field = (
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {Node[]} */ kids
  ) =>
    h('div', { class: 'rpt-field' }, [
      h('label', { for: id }, [label]),
      ...kids
    ]);

  root.append(
    h('header', { class: 'rpt-head' }, [
      h('h2', {}, [t('rpt_title')]),
      h(
        'button',
        { type: 'button', class: 'rpt-x', 'aria-label': t('rpt_close') },
        ['×']
      )
    ]),
    h('div', { class: 'rpt-body' }, [
      field('rpt-project', t('rpt_project'), [proj]),
      field('rpt-version', t('rpt_version'), [ver, chips]),
      media,
      field('rpt-text', t('rpt_text'), [text]),
      h('small', { class: 'rpt-note' }, [t('rpt_note')]),
      msg
    ]),
    h('footer', { class: 'rpt-foot' }, [send])
  );
  sheet = root;
  document.body.append(root);
  document.documentElement.classList.add('rpt-lock');
  renderMedia(media);
  void fillProjects(proj, draft.project);
  // Keep the draft while typing: a reload or a closed tab loses nothing.
  root.addEventListener('input', () =>
    lsSet(LS_DRAFT, JSON.stringify(snapshot()))
  );
  root.addEventListener('click', (/** @type {Event} */ e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.classList.contains('rpt-x')) closeReport();
    else if (b.dataset.v) {
      ver.value = b.dataset.v;
      lsSet(LS_DRAFT, JSON.stringify(snapshot()));
    }
  });
  root.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') closeReport();
  });
  send.addEventListener('click', () => void doSend(send, msg));
  /** @type {HTMLElement} */ (ver.value ? text : ver).focus({
    preventScroll: true
  });
}

/** @param {boolean} [fromHash] */
export function closeReport(fromHash) {
  if (!sheet) return;
  sheet.remove();
  sheet = null;
  document.documentElement.classList.remove('rpt-lock');
  st.img = null;
  st.strokes = [];
  st.cur = null;
  if (!fromHash && /^#\/?report\b/.test(location.hash)) {
    location.hash = '#/';
  }
}

/** @param {HTMLSelectElement} sel - @param {string} [want] */
async function fillProjects(sel, want) {
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
    // offline: use the last project so a report can still be queued
  }
  keys = [...new Set(keys)];
  const last = want || lsGet(LS_PROJECT) || '';
  if (last && !keys.includes(last)) keys.unshift(last);
  if (!keys.length) {
    sel.append(h('option', { value: '' }, [t('rpt_no_projects')]));
    return;
  }
  for (const k of keys) {
    sel.append(h('option', { value: k, selected: k === last }, [k]));
  }
  if (last) sel.value = last;
}

/** @param {HTMLElement} media */
function renderMedia(media) {
  media.replaceChildren();
  if (!st.img) {
    const pick = (/** @type {HTMLInputElement} */ inp) => {
      inp.addEventListener('change', () => {
        const f = inp.files?.[0];
        if (f) void setImage(f);
      });
      return inp;
    };
    const file = pick(
      h('input', {
        type: 'file',
        accept: 'image/*',
        class: 'rpt-file',
        'aria-label': t('rpt_shot_add')
      })
    );
    const cam = pick(
      h('input', {
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        class: 'rpt-file',
        'aria-label': t('rpt_shot_cam')
      })
    );
    media.append(
      h('label', { class: 'rpt-drop' }, [
        file,
        h('b', {}, [t('rpt_shot_add')]),
        h('small', {}, [t('rpt_shot_hint')])
      ]),
      h('label', { class: 'rpt-drop rpt-cam' }, [
        cam,
        h('b', {}, [t('rpt_shot_cam')])
      ])
    );
    return;
  }
  const canvas = h('canvas', {
    class: 'rpt-canvas',
    'aria-label': t('rpt_canvas')
  });
  canvas.width = st.img.width;
  canvas.height = st.img.height;
  const tools = h('div', { class: 'rpt-tools' }, [
    ...PENS.map(([c, k]) =>
      h('button', {
        type: 'button',
        class: 'rpt-pen',
        'data-pen': c,
        'aria-pressed': String(c === st.pen),
        'aria-label': t(k),
        style: `--c:${c}`
      })
    ),
    h('span', { class: 'rpt-sp' }),
    h('button', { type: 'button', class: 'rpt-btn', 'data-act': 'undo' }, [
      t('rpt_undo')
    ]),
    h('button', { type: 'button', class: 'rpt-btn', 'data-act': 'drop' }, [
      t('rpt_remove')
    ])
  ]);
  tools.addEventListener('click', (/** @type {Event} */ e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.dataset.pen) st.pen = b.dataset.pen;
    else if (b.dataset.act === 'undo') st.strokes.pop();
    else if (b.dataset.act === 'drop') {
      st.img = null;
      st.strokes = [];
    }
    renderMedia(media);
  });
  media.append(
    tools,
    canvas,
    h('small', { class: 'rpt-note' }, [t('rpt_draw_hint')])
  );
  wireDraw(/** @type {HTMLCanvasElement} */ (canvas));
  paintCanvas(/** @type {HTMLCanvasElement} */ (canvas));
}

/** @param {HTMLCanvasElement} c */
function paintCanvas(c, base = st.img) {
  if (!base) return;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  x.drawImage(base, 0, 0);
  x.lineCap = x.lineJoin = 'round';
  x.lineWidth = Math.max(4, c.width / 140);
  for (const s of [...st.strokes, ...(st.cur ? [st.cur] : [])]) {
    x.strokeStyle = s.c;
    x.beginPath();
    s.p.forEach((/** @type {number[]} */ q, /** @type {number} */ n) =>
      n ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])
    );
    if (s.p.length === 1) x.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
    x.stroke();
  }
}

/** @param {HTMLCanvasElement} c */
function wireDraw(c) {
  /** @param {PointerEvent} e */
  const pt = (e) => {
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height
    ];
  };
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture?.(e.pointerId);
    st.cur = { c: st.pen, p: [pt(e)] };
    paintCanvas(c);
  });
  c.addEventListener('pointermove', (e) => {
    if (!st.cur) return;
    st.cur.p.push(pt(e));
    paintCanvas(c);
  });
  const end = () => {
    if (!st.cur) return;
    st.strokes.push(st.cur);
    st.cur = null;
    paintCanvas(c);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

/** @param {Blob} f */
async function setImage(f) {
  if (!sheet) return;
  const msg = /** @type {HTMLElement} */ (sheet.querySelector('.rpt-msg'));
  try {
    st.img = await loadShrunk(f);
    st.strokes = [];
    msg.textContent = '';
    const media = /** @type {HTMLElement | null} */ (
      sheet?.querySelector('.rpt-media')
    );
    if (media) renderMedia(media);
  } catch {
    msg.textContent = t('rpt_e_bad_image');
  }
}

/** @param {string} key */
/** @param {number} sec - when to retry; the server window is one hour. */
const retryText = (sec) => {
  const m = sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 60;
  return t('rpt_retry_in').replace('{n}', String(m));
};
const errText = (key) => {
  const k = 'rpt_e_' + key;
  const s = t(k);
  return s === k ? t('rpt_e_other') : s;
};

/** @param {HTMLElement} send - @param {HTMLElement} msg */
async function doSend(send, msg) {
  if (st.busy || !sheet) return;
  const d = snapshot();
  const text = d.text.trim();
  const version = d.version.trim();
  if (!validVersion(version) || (!text && !st.img) || !d.project) {
    msg.textContent = validVersion(version)
      ? t('rpt_need')
      : t('rpt_e_version_required');
    msg.className = 'rpt-msg rpt-err';
    /** @type {HTMLElement | null} */ (
      sheet.querySelector(
        validVersion(version) ? '[name=text]' : '[name=version]'
      )
    )?.focus();
    return;
  }
  st.busy = true;
  send.setAttribute('disabled', '');
  send.textContent = t('rpt_sending');
  msg.className = 'rpt-msg';
  msg.textContent = '';
  try {
    /** @type {Blob | null} */
    let image = null;
    if (st.img) {
      const c = document.createElement('canvas');
      c.width = st.img.width;
      c.height = st.img.height;
      paintCanvas(c);
      image = await encodeCanvas(c);
    }
    const draft = { project: d.project, text, version, image };
    const r = await submitReport(draft);
    if (r.ok) {
      rememberVersion(version);
      lsSet(LS_PROJECT, d.project);
      lsSet(LS_DRAFT, '{}');
      resetForm();
      msg.className = 'rpt-msg rpt-ok';
      msg.textContent = `${t('rpt_sent')} ${r.id}`;
    } else if (r.offline) {
      await queue.add(draft);
      rememberVersion(version);
      lsSet(LS_PROJECT, d.project);
      lsSet(LS_DRAFT, '{}');
      resetForm();
      msg.className = 'rpt-msg rpt-ok';
      msg.textContent = t('rpt_queued');
    } else {
      msg.className = 'rpt-msg rpt-err';
      msg.textContent = errText(String(r.error));
      if (r.status === 429) msg.textContent += ' ' + retryText(r.retryAfter);
    }
  } catch {
    msg.className = 'rpt-msg rpt-err';
    msg.textContent = t('rpt_e_other');
  } finally {
    st.busy = false;
    send.removeAttribute('disabled');
    send.textContent = t('rpt_send');
  }
}

function resetForm() {
  if (!sheet) return;
  /** @type {HTMLTextAreaElement} */ (
    sheet.querySelector('[name=text]')
  ).value = '';
  st.img = null;
  st.strokes = [];
  const media = /** @type {HTMLElement | null} */ (
    sheet.querySelector('.rpt-media')
  );
  if (media) renderMedia(media);
}

/** Retry queued reports (page open, back online). */
async function retry() {
  try {
    const r = await flushQueue(queue, (d) => submitReport(d));
    const m = sheet?.querySelector('.rpt-msg');
    if (m && r.sent.length) {
      m.className = 'rpt-msg rpt-ok';
      m.textContent = `${t('rpt_sent')} ${r.sent.join(', ')}`;
    } else if (m && r.dropped.length) {
      m.className = 'rpt-msg rpt-err';
      m.textContent = errText(r.dropped[0]);
    }
  } catch {
    // queue unavailable: nothing to retry
  }
}
