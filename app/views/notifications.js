/**
 * Bell + notification panel (header slot `bell`), company-1bo5.6.29.
 * Items, unread count and the per-project switches come from the server
 * notifier (ADR 0007 N1-N5) over the board socket: one fetch on open and on
 * reconnect, then pushed `notify-event`s. No timer, no polling. Text is built
 * with textContent only; desk beads arrive without a title and show a pointer.
 *
 * Contract (server/features/notifier.js, bead company-1bo5.6.14):
 *   notify-list {}                 -> Snap
 *   notify-mark-read {ids}|{all}   -> Snap     notify-set {project,on} -> Snap
 *   notify-mute {until: ISO|null}  -> Snap     notify-event (push) {event, unread}
 * Snap = { events: Ev[], unread, projects: [{key,name,on}], mute_until }
 * Ev = { id, kind: decision|answer|digest|degraded, project, bead|null,
 *        title|null, desk, count, at, read }. The server owns read state.
 */
import { t } from '../utils/i18n.js';
import { createWsClient } from '../ws.js';

export const T_LIST = 'notify-list';
export const T_READ = 'notify-mark-read';
export const T_MUTE = 'notify-mute';
export const T_SET = 'notify-set';
export const T_EVENT = 'notify-event';
const MUTE_MS = 3600000;
const BELL_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11.5h9l-1-1.5V7a3.5 3.5 0 0 0-7 0v3zM6.5 13.5h3"/></svg>';

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
 * Short relative time ("now", "20m", "3h", "2d").
 *
 * @param {number} at ms epoch
 * @param {number} [now]
 */
export function ago(at, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - at) / 60000));
  if (m < 1) return tr('nt_now');
  if (m < 60) return tr('nt_min', { n: m });
  if (m < 1440) return tr('nt_hour', { n: Math.floor(m / 60) });
  return tr('nt_day', { n: Math.floor(m / 1440) });
}

/**
 * @typedef {{ key: string, kind: 'decision'|'answer'|'digest'|'degraded',
 *   project: string, bead: string, title: string, desk: boolean, count: number,
 *   at: number, read: boolean }} Item
 */

/**
 * Normalise a server event; drops anything without an id.
 *
 * @param {any} raw
 * @returns {Item | null}
 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.id ?? '');
  if (!key) return null;
  const kind = ['answer', 'digest', 'degraded'].includes(raw.kind)
    ? raw.kind
    : 'decision';
  const at = typeof raw.at === 'number' ? raw.at : Date.parse(raw.at) || 0;
  const title = typeof raw.title === 'string' ? raw.title : '';
  return {
    key,
    kind,
    project: String(raw.project ?? ''),
    bead: raw.bead ? String(raw.bead) : '',
    title,
    desk:
      raw.desk === true || (!title && kind !== 'digest' && kind !== 'degraded'),
    count: Number(raw.count) || 0,
    at,
    read: raw.read === true
  };
}

/**
 * Headline of one item (desk = pointer only).
 *
 * @param {Item} it
 */
export function itemText(it) {
  if (it.kind === 'digest') {
    return tr('nt_digest', { n: it.count, project: it.project });
  }
  if (it.kind === 'degraded') return tr('nt_degraded', { project: it.project });
  const answer = it.kind === 'answer';
  if (it.desk) {
    return tr(answer ? 'nt_desk_answer' : 'nt_desk', { project: it.project });
  }
  return tr(answer ? 'nt_answer' : 'nt_decision', { title: it.title });
}

/**
 * @param {HTMLElement} el
 * @param {{ client?: any }} [opts] test seam: a fake ws client
 */
export function mountBell(el, opts = {}) {
  const client = opts.client ?? createWsClient();
  /** @type {Item[]} */
  let items = [];
  /** @type {{ key: string, name: string, on: boolean }[]} */
  let projects = [];
  let unreadN = 0;
  let muteUntil = '';
  let open = false;
  let failed = false;
  let switchErr = '';
  /** @type {HTMLElement | null} */
  let panel = null;

  const isRead = (/** @type {Item} */ i) => i.read;
  const unread = () => unreadN;

  const btn = h('button', {
    type: 'button',
    class: 'hbtn nt-bell',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false'
  });
  el.classList.add('nt-slot');
  el.replaceChildren(btn);

  function paintBell() {
    const n = unread();
    btn.setAttribute(
      'aria-label',
      tr('nt_bell') + (n ? ' (' + tr('nt_unread', { n }) + ')' : '')
    );
    btn.setAttribute('aria-expanded', String(open));
    btn.innerHTML = BELL_SVG;
    if (n) {
      btn.append(h('span', { class: 'nt-dot' }, [n > 99 ? '99+' : String(n)]));
    }
  }

  /**
   * Apply a server snapshot (reply to list/mark-read/set/mute).
   *
   * @param {any} r
   */
  function apply(r) {
    items = (Array.isArray(r?.events) ? r.events : [])
      .map(normalizeItem)
      .filter(Boolean)
      .sort((/** @type {Item} */ a, /** @type {Item} */ b) => b.at - a.at);
    unreadN = Number.isFinite(r?.unread)
      ? r.unread
      : items.filter((i) => !i.read).length;
    projects = (Array.isArray(r?.projects) ? r.projects : [])
      .filter((/** @type {any} */ p) => p && typeof p.key === 'string')
      .map((/** @type {any} */ p) => ({
        key: p.key,
        name: typeof p.name === 'string' ? p.name : p.key,
        on: p.on !== false
      }));
    const m = typeof r?.mute_until === 'string' ? Date.parse(r.mute_until) : 0;
    muteUntil = m > Date.now() ? r.mute_until : '';
  }

  /** @param {string[] | null} ids null = all */
  function markRead(ids) {
    for (const i of items) if (!ids || ids.includes(i.key)) i.read = true;
    unreadN = items.filter((i) => !i.read).length;
    paint();
    Promise.resolve(client.send(T_READ, ids ? { ids } : { all: true }))
      .then((r) => {
        apply(r);
        paint();
      })
      .catch(() => undefined);
  }

  async function toggleMute() {
    try {
      apply(
        await client.send(T_MUTE, {
          until: muteUntil ? null : new Date(Date.now() + MUTE_MS).toISOString()
        })
      );
      switchErr = '';
    } catch {
      switchErr = tr('nt_switch_err');
    }
    paint();
  }

  /** @param {Item} it */
  function openItem(it) {
    markRead([it.key]);
    if (!it.bead) return;
    close();
    location.hash = '#/issues?issue=' + encodeURIComponent(it.bead);
  }

  /**
   * @param {string} key
   * @param {boolean} on
   */
  async function toggle(key, on) {
    const p = projects.find((x) => x.key === key);
    if (!p) return;
    const was = p.on;
    p.on = on;
    switchErr = '';
    paint();
    try {
      apply(await client.send(T_SET, { project: key, on }));
    } catch {
      p.on = was;
      switchErr = tr('nt_switch_err');
    }
    paint();
  }

  function buildPanel() {
    const all = h('button', { type: 'button', class: 'nt-lnk' }, [
      tr('nt_mark_all')
    ]);
    all.toggleAttribute('disabled', unread() === 0);
    all.addEventListener('click', () => markRead(null));
    const x = h(
      'button',
      { type: 'button', class: 'hbtn nt-x', 'aria-label': tr('nt_close') },
      ['×']
    );
    x.addEventListener('click', () => close());
    const head = h('header', { class: 'nt-head' }, [
      h('h3', {}, [tr('nt_title')]),
      h('span', { class: 'nt-spacer' }),
      all,
      x
    ]);

    const body = h('div', { class: 'nt-list' });
    if (failed) {
      body.append(
        h('p', { class: 'nt-note', role: 'status' }, [tr('nt_error')])
      );
    }
    if (!items.length) {
      body.append(h('p', { class: 'nt-empty' }, [tr('nt_empty')]));
    }
    for (const it of items) {
      const row = h('button', {
        type: 'button',
        class: 'nt-item' + (isRead(it) ? '' : ' nt-unread'),
        'data-key': it.key
      });
      row.append(
        h('span', { class: 'nt-ic nt-' + it.kind, 'aria-hidden': 'true' }, [
          it.kind === 'answer' ? '↩' : '?'
        ]),
        h('span', { class: 'nt-txt' }, [
          h('b', {}, [itemText(it)]),
          h('small', {}, [
            h('bdi', {}, [it.project]),
            ...(it.bead ? [' · ', h('bdi', {}, [it.bead])] : []),
            ' · ' + ago(it.at)
          ])
        ])
      );
      row.addEventListener('click', () => openItem(it));
      body.append(row);
    }

    const sw = h('div', { class: 'nt-sw' }, [h('h4', {}, [tr('nt_projects')])]);
    for (const p of projects) {
      const cb = /** @type {HTMLInputElement} */ (
        h('input', {
          type: 'checkbox',
          class: 'nt-tg',
          'data-project': p.key,
          'aria-label': p.name || p.key
        })
      );
      cb.checked = p.on;
      cb.addEventListener('change', () => void toggle(p.key, cb.checked));
      sw.append(
        h('label', { class: 'nt-row' }, [h('span', {}, [p.name || p.key]), cb])
      );
    }
    if (switchErr) {
      sw.append(h('p', { class: 'nt-note', role: 'alert' }, [switchErr]));
    }
    const mute = h('button', { type: 'button', class: 'nt-lnk nt-mute' }, [
      muteUntil ? tr('nt_unmute') : tr('nt_mute')
    ]);
    mute.addEventListener('click', () => void toggleMute());
    sw.append(mute, h('p', { class: 'nt-note' }, [tr('nt_note')]));

    return h(
      'div',
      { class: 'nt-panel', role: 'dialog', 'aria-label': tr('nt_title') },
      [head, body, sw]
    );
  }

  function paint() {
    paintBell();
    if (!open) return;
    const keep = panel?.querySelector('.nt-list')?.scrollTop ?? 0;
    panel?.remove();
    panel = buildPanel();
    document.body.append(panel);
    const list = panel.querySelector('.nt-list');
    if (list) list.scrollTop = keep;
  }

  function close() {
    open = false;
    panel?.remove();
    panel = null;
    paintBell();
    btn.focus();
  }

  async function refresh() {
    try {
      apply(await client.send(T_LIST, {}));
      failed = false;
    } catch {
      failed = true;
    }
    paint();
  }

  btn.addEventListener('click', () => {
    if (open) return close();
    open = true;
    paint();
    void refresh();
    panel?.querySelector('button')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close();
  });
  document.addEventListener('pointerdown', (e) => {
    const n = /** @type {Node} */ (e.target);
    if (open && panel && !panel.contains(n) && !btn.contains(n)) close();
  });
  window.addEventListener('bdui-lang', paint);
  client.on(T_EVENT, (/** @type {any} */ p) => {
    const it = normalizeItem(p?.event);
    if (!it) return;
    items = [it, ...items.filter((i) => i.key !== it.key)];
    unreadN = Number.isFinite(p.unread)
      ? p.unread
      : items.filter((i) => !i.read).length;
    paint();
  });
  // Reconnect = refetch (covers events missed while offline); no timer.
  client.onConnection?.((/** @type {string} */ s) => {
    if (s === 'open') void refresh();
  });
  paintBell();
  void refresh();
}
