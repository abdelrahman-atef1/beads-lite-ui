/**
 * Time section of the task page (beads-lite-1bo5.6.59.12). Mounted through the
 * seam task/time-slot.js as <u3-time-slot>. Numbers come from the flow rollup
 * (adapter data/time.js), derived from bead events: there is no timer, no log
 * button, no hours field. Time is never shown alone: the quality counters sit in
 * the same header row as the total. Unknown is "unknown", never 0.
 * The element fetches once per task id when it connects, and counts a running
 * interval up to the moment it draws. Nothing runs while nobody looks.
 */
import { html, nothing, render } from 'lit-html';
import { getLang } from '../../utils/i18n.js';
import { statusLabel } from '../../utils/status.js';
import { relIfToday } from '../card/common.js';
import { chip } from '../components/chip.js';
import { BUCKETS, fmtDur, summarize } from '../data/time-math.js';
import { loadRollup } from '../data/time.js';
import { t3 } from '../i18n.js';
import { personChip } from '../people/person-chip.js';

const MAX_INTERVALS = 12;
/** @type {Record<string, string>} */
const STAGE_TONE = {
  active: 'blue',
  test: 'purple',
  owner: 'amber',
  merge: 'teal',
  blocked: 'red',
  queue: 'grey'
};

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function tr(key, vars = {}) {
  let s = t3(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

const lang = () => (getLang() === 'ar' ? 'ar' : 'en');
/** @param {number | null} ms */
export const dur = (ms) => fmtDur(ms, lang());
/** @param {number} n */
export const nf = (n) =>
  new Intl.NumberFormat(lang() === 'ar' ? 'ar-u-nu-latn' : 'en-GB').format(n);
/** @param {number} n - tokens */
const tok = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3
      ? Math.round(n / 1e3) + 'k'
      : String(n);

/**
 * The four counters of one bead as chips. 0 is calm, above 0 is amber.
 *
 * @param {{ qaFail?: number, reopen?: number, ownerReject?: number, rework?: number }} q
 */
export function qualityChips(q) {
  const c = (/** @type {string} */ key, /** @type {number | undefined} */ n) =>
    html`<span class="u3-tm__q u3-tm__q--${n ? 'bad' : 'ok'}"
      ><b>${nf(n || 0)}</b>${t3(key)}</span
    >`;
  return html`<span class="u3-tm__qs"
    >${c('u3_tm_q_fail', q.qaFail)} ${c('u3_tm_q_reopen', q.reopen)}
    ${c('u3_tm_q_owner', q.ownerReject)} ${c('u3_tm_q_rework', q.rework)}</span
  >`;
}

const unknownNote = (/** @type {string} */ key) =>
  html`<p class="u3-tm__unk">${t3(key)}</p>`;

/** @param {any} tokens */
function tokensBlock(tokens) {
  if (!tokens || tokens.confidence === 'unknown') {
    return html`<p class="u3-tm__unk u3-tm__tokunk u3-muted">
      ${t3('u3_tm_tok_unknown')}
    </p>`;
  }
  const known = ['high', 'mixed', 'medium'].includes(tokens.confidence);
  return html`<p class="u3-tm__tok">
    <span
      >${tr('u3_tm_tok_in', { n: tok(tokens.input || 0) })} ·
      ${tr('u3_tm_tok_out', { n: tok(tokens.output || 0) })} ·
      ${tr('u3_tm_tok_cache', { n: tok(tokens.cache || 0) })}</span
    >
    ${chip({
      label: t3('u3_tm_conf_' + (known ? tokens.confidence : 'unknown')),
      tone: tokens.confidence === 'high' ? 'green' : 'amber'
    })}
  </p>`;
}

/**
 * Body of the section for one rollup row (null = no row for this task).
 *
 * @param {any} row
 * @param {{ now: number }} o
 */
export function timeBody(row, o) {
  if (!row) return unknownNote('u3_tm_unknown_note');
  const s = summarize(row, o.now);
  const head = html`<div class="u3-tm__head">
    <span class="u3-tm__total"
      ><small>${t3('u3_tm_total')}</small> ${s.known
        ? html`<b class="u3-tm__num">${dur(s.wall)}</b>`
        : chip({ label: t3('u3_tm_unknown') })}
      ${s.running && s.known
        ? chip({ label: t3('u3_tm_running'), tone: 'blue' })
        : nothing}</span
    >
    ${qualityChips(row.quality || {})}
  </div>`;
  if (!s.known) {
    return html`${head}${unknownNote('u3_tm_unknown_note')}
    ${tokensBlock(row.tokens)}`;
  }
  const wall = s.wall || 1;
  const stages = BUCKETS.map((k) => ({ k, ms: s.buckets[k] }));
  const roles = Object.entries(s.roles).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const shown = s.intervals.slice(0, MAX_INTERVALS);
  return html`${head}
    <p class="u3-tm__wall">
      ${tr('u3_tm_wall', {
        wall: dur(s.wall),
        active: dur(s.active),
        waiting: dur(s.waiting)
      })}
    </p>
    <h4 class="u3-tm__h">${t3('u3_tm_stages')}</h4>
    <div class="u3-tm__bar" role="img" aria-label=${t3('u3_tm_stages')}>
      ${stages.map((x) =>
        x.ms
          ? html`<i
              class="u3-tm__seg u3-tm__seg--${STAGE_TONE[x.k]}"
              style="flex:${x.ms / wall}"
            ></i>`
          : nothing
      )}
    </div>
    <ul class="u3-tm__list">
      ${stages.map(
        (x) =>
          html`<li>
            <span class="u3-tm__dot u3-tm__seg--${STAGE_TONE[x.k]}"></span>
            <span class="u3-tm__lbl">${t3('u3_tm_' + x.k)}</span>
            ${x.ms === null
              ? html`<span class="u3-tm__unk-s">${t3('u3_tm_unknown')}</span>`
              : html`<b class="u3-tm__num">${dur(x.ms)}</b>`}
          </li>`
      )}
    </ul>
    <h4 class="u3-tm__h">${t3('u3_tm_roles')}</h4>
    <ul class="u3-tm__list">
      ${roles.map(
        ([r, ms]) =>
          html`<li>
            ${personChip({ role: r })}
            <span class="u3-tm__meter"
              ><i
                style="inline-size:${Math.max(
                  2,
                  Math.round((ms / wall) * 100)
                )}%"
              ></i
            ></span>
            <b class="u3-tm__num">${dur(ms)}</b>
          </li>`
      )}
    </ul>
    <h4 class="u3-tm__h">${t3('u3_tm_intervals')}</h4>
    <ol class="u3-tm__ivs">
      ${shown.map(
        (/** @type {any} */ i) =>
          html`<li>
            ${chip({
              label: statusLabel(i.status),
              tone:
                STAGE_TONE[i.bucket] === 'grey'
                  ? 'neutral'
                  : STAGE_TONE[i.bucket] || 'neutral'
            })}
            ${personChip({ role: i.role })}
            <b class="u3-tm__num">${dur(i.ms)}</b>
            ${i.running
              ? chip({ label: t3('u3_tm_running'), tone: 'blue' })
              : nothing}
          </li>`
      )}
    </ol>
    ${s.intervals.length > shown.length
      ? html`<p class="u3-tm__more">
          ${tr('u3_tm_more', { n: s.intervals.length - shown.length })}
        </p>`
      : nothing}
    <h4 class="u3-tm__h">${t3('u3_tm_tokens')}</h4>
    ${tokensBlock(row.tokens)}`;
}

/** @param {{ built_at?: string | null, fixture?: boolean }} r */
export function footer(r) {
  const when = r.built_at
    ? relIfToday(Date.parse(r.built_at), lang(), () =>
        new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }).format(Date.parse(r.built_at))
      )
    : '';
  return html`<p class="u3-tm__note">
    ${t3('u3_tm_note')}${when
      ? html` · ${tr('u3_tm_asof', { t: when })}`
      : nothing}${r.fixture ? html` · ${t3('u3_tm_fixture')}` : nothing}
  </p>`;
}

export class TimeSlot extends HTMLElement {
  /** @type {any} */ _issue = null;
  /** @type {any} */ ctx = null;
  loadedFor = '';
  /** @type {any} */ state = { status: 'loading' };
  seq = 0;

  /** @param {any} v */
  set issue(v) {
    this._issue = v;
    if (this.isConnected) this.update();
  }

  get issue() {
    return this._issue;
  }

  connectedCallback() {
    this.update();
  }

  disconnectedCallback() {
    this.seq++;
    this.loadedFor = '';
  }

  /** Fetches again only when the task id changes. */
  update() {
    const id = this._issue?.id;
    if (!id) return;
    if (id !== this.loadedFor) {
      this.loadedFor = id;
      this.state = { status: 'loading' };
      const mine = ++this.seq;
      const send = (/** @type {string} */ t, /** @type {any} */ p) =>
        this.ctx?.send ? this.ctx.send(t, p) : this.ctx.client.send(t, p);
      loadRollup({ send }, { ids: [id] }).then((r) => {
        if (mine !== this.seq) return;
        this.state = {
          status: 'ready',
          r,
          row: r.rows.find((/** @type {any} */ x) => x.id === id) || null
        };
        this.draw();
      });
    }
    this.draw();
  }

  draw() {
    const st = this.state;
    render(
      html`<section
        class="u3-tm"
        aria-labelledby="u3-tm-h"
        data-status=${st.status}
      >
        <div class="u3-tm__fold">
          <h3 class="u3-tm__title" id="u3-tm-h">${t3('u3_time')}</h3>
          <div class="u3-tm__body">
            ${st.status === 'loading'
              ? html`<p class="u3-tm__unk">${t3('u3_tm_loading')}</p>`
              : !st.r.present
                ? html`<p class="u3-tm__unk">${t3('u3_tm_empty')}</p>`
                : html`${timeBody(st.row, { now: Date.now() })}${footer(st.r)}`}
          </div>
        </div>
      </section>`,
      this
    );
  }
}

if (!customElements.get('u3-time-slot')) {
  customElements.define('u3-time-slot', TimeSlot);
}
