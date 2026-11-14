/**
 * v3 bell + notifications sheet + push opt-in (beads-lite-1bo5.6.59.16).
 * Same server calls as legacy app/views/notifications.js (notify-list,
 * notify-mark-read, notify-set, notify-mute, notify-event push) and the same
 * push client (push-key / push-subscribe / push-list / push-remove). One fetch
 * on mount and on reconnect, then pushed events; no timer, no polling.
 * The pure helpers (normalizeItem, itemText, ago) are the legacy ones, so the
 * words and the item rules cannot drift.
 */
import { html, render } from 'lit-html';
import {
  T_PUSH_LIST,
  T_PUSH_REMOVE,
  disablePush,
  enablePush,
  pushStatus
} from '../../push-client.js';
import {
  T_EVENT,
  T_LIST,
  T_MUTE,
  T_READ,
  T_SET,
  ago,
  itemText,
  normalizeItem
} from '../../views/notifications.js';
import { openSheet } from '../components/index.js';
import { tp } from '../panels/i18n.js';
import { pIcon } from '../panels/icons.js';

const MUTE_MS = 3600000;
const KIND_ICON = { answer: '↩', release: '▲', digest: '≡', degraded: '!' };

/**
 * @param {HTMLElement} el - container the bell button is drawn into
 * @param {{ client: any, pushEnv?: any, host?: HTMLElement }} opts
 * @returns {{ refresh: () => Promise<void>, unread: () => number, open: () => void, close: () => void }}
 */
export function mountBell(el, opts) {
  const client = opts.client;
  /** @type {any[]} */
  let items = [];
  /** @type {{ key: string, name: string, on: boolean }[]} */
  let projects = [];
  let unreadN = 0;
  let muteUntil = '';
  let failed = false;
  let switchErr = '';
  /** @type {'unsupported'|'denied'|'off'|'on'|'error'|'busy'} */
  let pushState = 'unsupported';
  /** @type {{ id: string, label: string, created: string, last_ok: string|null }[]} */
  let pushList = [];
  /** @type {{ close: () => void } | null} */
  let sheet = null;
  /** @type {HTMLElement | null} */
  let box = null;

  const host = () =>
    opts.host ||
    /** @type {HTMLElement} */ (el.closest('.u3') || document.body);

  /** @param {any} r - server snapshot */
  function apply(r) {
    items = (Array.isArray(r?.events) ? r.events : [])
      .map(normalizeItem)
      .filter(Boolean)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b.at - a.at);
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

  /** @param {string[] | null} ids - null = all */
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
      switchErr = tp('nt_switch_err');
    }
    paint();
  }

  /** @param {any} it */
  function openItem(it) {
    markRead([it.key]);
    if (it.kind === 'release') {
      close();
      location.hash = '#/releases';
      return;
    }
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
      switchErr = tp('nt_switch_err');
    }
    paint();
  }

  async function loadPushList() {
    try {
      const r = await client.send(T_PUSH_LIST, {});
      pushList = Array.isArray(r?.subscriptions) ? r.subscriptions : [];
    } catch {
      pushList = [];
    }
    paint();
  }

  async function loadPush() {
    pushState = await pushStatus(opts.pushEnv, client);
    paint();
    void loadPushList();
  }

  /** @param {string} id */
  async function removePhone(id) {
    try {
      await client.send(T_PUSH_REMOVE, { id });
    } catch {
      switchErr = tp('nt_push_err');
    }
    await loadPushList();
  }

  async function flipPush() {
    const was = pushState;
    pushState = 'busy';
    paint();
    pushState =
      was === 'on'
        ? await disablePush(client, opts.pushEnv)
        : await enablePush(client, opts.pushEnv);
    paint();
    void loadPushList();
  }

  function pushBlock() {
    const on = pushState === 'on';
    return html`<section class="u3-pn__sec u3-pn__push" data-push=${pushState}>
      <h3>${tp('pn_push_title')}</h3>
      ${pushState === 'unsupported'
        ? html`<p class="u3-pn__note">${tp('nt_push_unsupported')}</p>`
        : pushState === 'denied'
          ? html`<p class="u3-pn__note">${tp('nt_push_denied')}</p>`
          : html`<p class="u3-pn__note">
                ${on ? tp('pn_push_on_note') : tp('pn_push_off_note')}
              </p>
              <button
                type="button"
                class="u3-btn ${on ? 'u3-btn--ghost' : 'u3-btn--primary'}"
                data-act="push"
                ?disabled=${pushState === 'busy'}
                @click=${() => void flipPush()}
              >
                ${pushState === 'busy'
                  ? tp('pn_push_busy')
                  : on
                    ? tp('nt_push_off')
                    : tp('nt_push_on')}
              </button>
              ${pushState === 'error'
                ? html`<p class="u3-pn__note u3-pn__err" role="alert">
                    ${tp('nt_push_err')}
                  </p>`
                : ''}`}
      ${pushList.length
        ? html`<p class="u3-pn__note">${tp('nt_phones')}</p>
            <ul class="u3-pn__phones">
              ${pushList.map(
                (p) =>
                  html`<li>
                    <span dir="auto"
                      >${`${p.label || tp('nt_phone_unnamed')} ${(p.last_ok || p.created || '').slice(0, 10)}`.trim()}</span
                    >
                    <button
                      type="button"
                      class="u3-pn__lnk"
                      data-id=${p.id}
                      @click=${() => void removePhone(p.id)}
                    >
                      ${tp('nt_phone_remove')}
                    </button>
                  </li>`
              )}
            </ul>`
        : ''}
    </section>`;
  }

  function panelBody() {
    return html`<div class="u3-pn" data-panel="bell">
      <div class="u3-pn__bar">
        <button
          type="button"
          class="u3-pn__lnk"
          data-act="mark-all"
          ?disabled=${unreadN === 0}
          @click=${() => markRead(null)}
        >
          ${tp('nt_mark_all')}
        </button>
      </div>
      ${failed
        ? html`<p class="u3-pn__note" role="status">${tp('nt_error')}</p>`
        : ''}
      ${items.length
        ? html`<ul class="u3-pn__list">
            ${items.map(
              (it) =>
                html`<li>
                  <button
                    type="button"
                    class="u3-pn__item ${it.read ? '' : 'is-unread'}"
                    data-key=${it.key}
                    @click=${() => openItem(it)}
                  >
                    <span
                      class="u3-pn__ic u3-pn__ic--${it.kind}"
                      aria-hidden="true"
                      >${/** @type {any} */ (KIND_ICON)[it.kind] || '?'}</span
                    >
                    <span class="u3-pn__txt">
                      <b dir="auto">${itemText(it)}</b>
                      <small>
                        <bdi>${it.project}</bdi>${it.bead
                          ? html` · <bdi class="u3-mono">${it.bead}</bdi>`
                          : ''}
                        · ${ago(it.at)}
                      </small>
                    </span>
                    ${it.read ? '' : html`<i class="u3-pn__udot"></i>`}
                  </button>
                </li>`
            )}
          </ul>`
        : html`<p class="u3-pn__empty">${tp('nt_empty')}</p>`}
      ${pushBlock()}
      <section class="u3-pn__sec">
        <h3>${tp('nt_projects')}</h3>
        ${projects.map(
          (p) =>
            html`<label class="u3-pn__sw">
              <span>${p.name || p.key}</span>
              <input
                type="checkbox"
                class="u3-pn__tg"
                data-project=${p.key}
                .checked=${p.on}
                @change=${(/** @type {any} */ e) =>
                  void toggle(p.key, e.target.checked)}
              />
            </label>`
        )}
        ${switchErr
          ? html`<p class="u3-pn__note u3-pn__err" role="alert">
              ${switchErr}
            </p>`
          : ''}
        <button
          type="button"
          class="u3-pn__lnk"
          data-act="mute"
          @click=${() => void toggleMute()}
        >
          ${muteUntil ? tp('nt_unmute') : tp('nt_mute')}
        </button>
        <p class="u3-pn__note">${tp('nt_note')}</p>
      </section>
    </div>`;
  }

  const btn = document.createElement('span');
  btn.className = 'u3-pn-bell';
  el.append(btn);

  function paintBell() {
    render(
      html`<button
        type="button"
        class="u3-iconbtn u3-pn-btn"
        data-act="bell"
        aria-haspopup="dialog"
        aria-label=${tp('nt_bell') +
        (unreadN ? ` (${tp('nt_unread', { n: unreadN })})` : '')}
        @click=${() => (sheet ? close() : open())}
      >
        ${pIcon('bell')}${unreadN
          ? html`<i class="u3-pn-dot" data-unread=${unreadN}></i>`
          : ''}
      </button>`,
      btn
    );
  }

  function paint() {
    paintBell();
    if (box) render(panelBody(), box);
  }

  function open() {
    if (sheet) return;
    box = document.createElement('div');
    sheet = openSheet(host(), {
      title: tp('nt_title'),
      closeLabel: tp('nt_close'),
      body: box,
      onClose: () => {
        sheet = null;
        box = null;
      }
    });
    paint();
    void refresh();
    void loadPush();
  }

  function close() {
    sheet?.close();
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
  client.onConnection?.((/** @type {string} */ s) => {
    if (s === 'open') void refresh();
  });
  paint();
  void refresh();
  return { refresh, unread: () => unreadN, open, close };
}
