/**
 * Outputs of a bead (detail slot `outputs`) and of the project (header slot
 * `outputs-project`); ADR 0007 section 3, SEC O1-O4 (beads-lite-1bo5.6.18).
 *
 * Contract (server/features/outputs.js):
 *   outputs-get     {id, more?, rollup?} -> Result
 *   outputs-project {more?}              -> Result
 * Result = { project, root, beads, items, has_more, degraded }
 * Item = { src: commit|record|mention|attachment, kind, label, bead, at, by,
 *          href, ref_type, sha?, landed?, branch?, remote?, att?, path? }
 *
 * Everything is a text node. A link is created only when its URL passes
 * safeHref again here (https, or http for loopback / tailnet; no userinfo),
 * with rel="noopener noreferrer". Images only from the strict /att/ shape.
 * Fetched when a detail renders (fire and forget); never polled.
 */
import { getLang, t } from '../utils/i18n.js';
import { createWsClient } from '../ws.js';

export const T_GET = 'outputs-get';
export const T_PROJECT = 'outputs-project';
const KINDS = [
  'commit',
  'deploy',
  'artifact',
  'build',
  'doc',
  'pr',
  'link',
  'file',
  'image'
];
const ATT_RE =
  /^[a-z0-9][a-z0-9_-]{0,39}\/\d{4}-\d{2}\/[0-9a-f]{16}\.(?:png|jpg|webp)$/;
const BEAD_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * O2: the URL, or null when it may not become a link.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function safeHref(raw) {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  /** @type {URL} */
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'https:') return u.href;
  if (u.protocol === 'http:') {
    const local =
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '[::1]' ||
      /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(host);
    return local ? u.href : null;
  }
  return null;
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
function tr(key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/**
 * @param {string} tag
 * @param {Record<string, string | boolean | null | undefined>} [attrs]
 * @param {Array<Node | string>} [kids]
 */
function h(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) e.append(c);
  return e;
}

/**
 * @param {string} href - already passed safeHref
 * @param {string} text
 */
function link(href, text) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [text]);
}

/** @param {number} at */
function day(at) {
  return at > 0 ? new Date(at).toISOString().slice(0, 10) : '';
}

/** @param {string} kind */
function kindName(kind) {
  return KINDS.includes(kind) ? tr('ou_' + kind) : kind;
}

/**
 * @typedef {{ src: string, kind: string, label: string, bead: string, at: number,
 *   by: string, href: string | null, sha?: string | null, landed?: boolean,
 *   branch?: string, remote?: string | null, att?: string, path?: string | null }} Item
 */

/**
 * @param {Item} it
 * @param {string} root - bead the panel belongs to
 */
export function rowOf(it, root) {
  const label = h('div', { class: 'ou-label' });
  const meta = h('div', { class: 'ou-meta' });
  const parts = [kindName(it.kind)];
  if (it.src === 'mention') parts.push(tr('ou_mentioned'));
  const badge = h('span', { class: 'ou-badge', 'aria-hidden': 'true' }, [
    (it.kind || '?').charAt(0).toUpperCase()
  ]);

  const att = it.src === 'attachment' && it.att && ATT_RE.test(it.att);
  if (att) {
    const src = '/att/' + it.att;
    label.append(
      h('a', { href: src, target: '_blank', rel: 'noopener noreferrer' }, [
        h('img', {
          class: 'ou-img',
          src,
          loading: 'lazy',
          alt: it.label || tr('ou_image')
        })
      ])
    );
  } else {
    const href = safeHref(it.href);
    if (href) label.append(link(href, it.label));
    else label.append(it.label);
  }

  if (it.src === 'commit') {
    const sha = String(it.sha || '');
    const remote = safeHref(it.remote);
    parts.push(it.landed ? tr('ou_landed') : tr('ou_not_landed'));
    if (it.branch) parts.push(it.branch);
    if (remote && /^[0-9a-f]{7,40}$/.test(sha)) {
      meta.append(link(remote, sha), ' · ');
    } else if (sha) {
      parts.unshift(sha);
    }
  }
  if (it.src === 'record' && it.path) parts.push(it.path);
  if (it.bead && it.bead !== root && BEAD_RE.test(it.bead)) {
    parts.push('#' + it.bead);
  }
  if (it.by) parts.push(it.by);
  const d = day(it.at);
  if (d) parts.push(d);
  meta.append(parts.join(' · '));
  return h('li', { class: 'ou-row', 'data-src': it.src }, [
    badge,
    h('div', { class: 'ou-main' }, [label, meta])
  ]);
}

/**
 * The shared body: chips, optional rollup switch, list, show more.
 *
 * @param {any} data - Result
 * @param {{ root: string, kind: string, onKind: (k: string) => void,
 *   rollup?: boolean | null, onRollup?: (on: boolean) => void,
 *   onMore: () => void, more_label?: string }} ui
 */
export function bodyOf(data, ui) {
  const items = /** @type {Item[]} */ (
    Array.isArray(data?.items) ? data.items : []
  );
  const present = KINDS.filter((k) => items.some((i) => i.kind === k));
  const chips = h('div', { class: 'ou-chips', role: 'group' });
  const mk = (/** @type {string} */ k) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'ou-chip',
        'data-kind': k,
        'aria-pressed': String(ui.kind === k)
      },
      [k === 'all' ? tr('ou_all') : kindName(k)]
    );
    b.addEventListener('click', () => ui.onKind(k));
    return b;
  };
  if (present.length > 1 || ui.kind !== 'all') {
    chips.append(mk('all'), ...present.map(mk));
  }
  if (typeof ui.rollup === 'boolean') {
    const cb = h('input', { type: 'checkbox', class: 'ou-roll-cb' });
    /** @type {HTMLInputElement} */ (cb).checked = ui.rollup;
    cb.addEventListener('change', () =>
      ui.onRollup?.(/** @type {HTMLInputElement} */ (cb).checked)
    );
    chips.append(h('label', { class: 'ou-roll' }, [cb, tr('ou_rollup')]));
  }
  const shown = items.filter((i) => ui.kind === 'all' || i.kind === ui.kind);
  const list = h('ul', { class: 'ou-list' });
  for (const it of shown) list.append(rowOf(it, ui.root));
  const box = h('div', { class: 'ou-body' }, [chips]);
  if (data?.degraded) {
    box.append(h('p', { class: 'ou-note' }, [tr('ou_degraded')]));
  }
  box.append(
    shown.length ? list : h('p', { class: 'ou-note' }, [tr('ou_empty')])
  );
  if (data?.has_more) {
    const more = h('button', { type: 'button', class: 'ou-more' }, [
      tr('ou_more')
    ]);
    more.addEventListener('click', () => ui.onMore());
    box.append(more);
  }
  return box;
}

/**
 * Detail slot: `mount(el, issue)`, called again on the same element when the
 * issue changes. Hidden (empty) when the bead and its children produced nothing.
 *
 * @param {HTMLElement} el
 * @param {any} issue
 * @param {{ client?: any }} [opts]
 */
export function mountOutputs(el, issue, opts = {}) {
  const id = issue && typeof issue.id === 'string' ? issue.id : '';
  if (!id || !BEAD_RE.test(id)) {
    el.replaceChildren();
    return Promise.resolve();
  }
  /** @type {any} */
  const st = /** @type {any} */ (
    /** @type {any} */ (el)._ou ??= {
      id: '',
      seq: 0,
      kind: 'all',
      rollup: true,
      pages: 0,
      open: false,
      data: null
    }
  );
  if (st.id !== id) {
    Object.assign(st, {
      id,
      kind: 'all',
      rollup: true,
      pages: 0,
      open: false,
      data: null
    });
    el.replaceChildren();
  }
  const client = opts.client ?? createWsClient();

  function paint() {
    const data = st.data;
    if (!data || !Array.isArray(data.items) || !data.items.length) {
      // nothing yet: keep a started panel, hide an empty one
      if (!data || !data.has_more) {
        el.replaceChildren();
        return;
      }
    }
    const d = h('details', { class: 'ou' });
    if (st.open) d.setAttribute('open', '');
    d.addEventListener('toggle', () => {
      st.open = /** @type {HTMLDetailsElement} */ (d).open;
    });
    d.append(
      h('summary', {}, [tr('ou_title_n', { n: data.items.length })]),
      bodyOf(data, {
        root: id,
        kind: st.kind,
        onKind: (k) => {
          st.kind = k;
          paint();
        },
        rollup: st.rollup,
        onRollup: (on) => {
          st.rollup = on;
          st.pages = 0;
          void load();
        },
        onMore: () => {
          st.pages += 1;
          void load();
        }
      })
    );
    el.replaceChildren(d);
    el.setAttribute('lang', getLang());
  }

  async function load() {
    const seq = ++st.seq;
    try {
      const r = await client.send(T_GET, {
        id,
        more: st.pages,
        rollup: st.rollup
      });
      if (seq !== st.seq || st.id !== id) return;
      st.data = r;
    } catch {
      if (seq !== st.seq) return;
      st.data = null;
    }
    paint();
  }

  window.addEventListener('bdui-lang', () => {
    if (st.id === id) paint();
  });
  return load();
}

/**
 * Header slot: a button that opens the project Outputs view (the active
 * project, newest first, filter by kind) in a popover like the bell.
 *
 * @param {HTMLElement} el
 * @param {{ client?: any }} [opts]
 */
export function mountProjectOutputs(el, opts = {}) {
  const client = opts.client ?? createWsClient();
  /** @type {any} */
  const st = { open: false, kind: 'all', pages: 0, data: null, failed: false };
  /** @type {HTMLElement | null} */
  let panel = null;
  let seq = 0;
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'hbtn ou-open',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': tr('ou_project'),
      title: tr('ou_project')
    },
    [tr('ou_title')]
  );
  el.append(btn);

  function build() {
    const close = h('button', { type: 'button', class: 'ou-more' }, [
      tr('ou_close')
    ]);
    close.addEventListener('click', shut);
    const body = st.failed
      ? h('div', { class: 'ou-body' }, [
          h('p', { class: 'ou-note', role: 'alert' }, [tr('ou_failed')])
        ])
      : st.data
        ? bodyOf(st.data, {
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
          })
        : h('div', { class: 'ou-body' }, [
            h('p', { class: 'ou-note' }, [tr('ou_loading')])
          ]);
    return h(
      'div',
      { class: 'ou-panel', role: 'dialog', 'aria-label': tr('ou_project') },
      [
        h('div', { class: 'ou-head' }, [
          h('h3', {}, [tr('ou_project')]),
          close
        ]),
        body
      ]
    );
  }

  function paint() {
    btn.setAttribute('aria-expanded', String(st.open));
    if (!st.open) return;
    const keep = panel?.scrollTop ?? 0;
    panel?.remove();
    panel = build();
    document.body.append(panel);
    panel.scrollTop = keep;
  }

  function shut() {
    st.open = false;
    panel?.remove();
    panel = null;
    paint();
    btn.focus();
  }

  async function load() {
    const my = ++seq;
    try {
      const r = await client.send(T_PROJECT, { more: st.pages });
      if (my !== seq) return;
      st.data = r;
      st.failed = false;
    } catch {
      if (my !== seq) return;
      st.failed = true;
    }
    paint();
  }

  btn.addEventListener('click', () => {
    if (st.open) return shut();
    st.open = true;
    st.pages = 0;
    paint();
    void load();
  });
  document.addEventListener('keydown', (e) => {
    if (st.open && e.key === 'Escape') shut();
  });
  document.addEventListener('pointerdown', (e) => {
    const n = /** @type {Node} */ (e.target);
    if (st.open && panel && !panel.contains(n) && !btn.contains(n)) shut();
  });
  window.addEventListener('bdui-lang', () => {
    btn.textContent = tr('ou_title');
    paint();
  });
}
