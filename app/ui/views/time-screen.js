/**
 * Role Time screen, #/time (beads-lite-1bo5.6.59.12). Per role, for a period:
 * closed count, median and p90 active time, median waiting time, and beside them
 * the quality counters and the fail rate. A plain-text verdict compares the
 * period with the one before ("faster but worse"). Roles are listed A to Z:
 * nothing is sorted or ranked by time, and there is no timer or hours field.
 * Data: one flow-rollup call when the screen opens or the period changes
 * (data/time.js), never polled. A missing rollup shows an empty state.
 */
import { html, nothing, render } from 'lit-html';
import { chip } from '../components/chip.js';
import { roleChip } from '../components/role-chip.js';
import { loadDigest } from '../data/flow-digest.js';
import { compareKey, roleReport } from '../data/time-math.js';
import { PERIODS, loadRollup } from '../data/time.js';
import { t3 } from '../i18n.js';
import { digestCard } from './time-digest.js';
import { expSection } from './time-exp.js';
import { dur, footer, nf, qualityChips, tr } from './time-section.js';

const DAY = 86_400_000;

/**
 * Card of one role. The time numbers and the quality numbers are in the same card.
 *
 * @param {any} r - role stats of the period
 * @param {any} prev - same role, period before (or undefined)
 * @param {number} days
 */
export function roleCard(r, prev, days) {
  const key = compareKey(prev, r);
  const bad =
    key === 'faster_worse' || key === 'slower_worse' || key === 'worse_same';
  return html`<article class="u3-tmr" data-role=${r.role}>
    <header class="u3-tmr__head">
      ${roleChip({ role: r.role })}
      <span class="u3-tmr__n">${tr('u3_tm_closed', { n: nf(r.closed) })}</span>
    </header>
    <dl class="u3-tmr__nums">
      <div>
        <dt>${t3('u3_tm_med_active')}</dt>
        <dd class="u3-tm__num">
          ${r.active_median_ms === null
            ? t3('u3_tm_unknown')
            : dur(r.active_median_ms)}
        </dd>
      </div>
      <div>
        <dt>${t3('u3_tm_p90')}</dt>
        <dd class="u3-tm__num">
          ${r.active_p90_ms === null
            ? t3('u3_tm_unknown')
            : dur(r.active_p90_ms)}
        </dd>
      </div>
      <div>
        <dt>${t3('u3_tm_med_wait')}</dt>
        <dd class="u3-tm__num">
          ${r.waiting_median_ms === null
            ? t3('u3_tm_unknown')
            : dur(r.waiting_median_ms)}
        </dd>
      </div>
    </dl>
    <div class="u3-tmr__q">
      ${qualityChips(r)}
      <span class="u3-tm__q u3-tm__q--${r.fail_rate ? 'bad' : 'ok'}"
        ><b
          >${r.fail_rate === null
            ? '-'
            : Math.round(r.fail_rate * 100) + '%'}</b
        >${t3('u3_tm_fail_rate')}</span
      >
    </div>
    ${r.unknown
      ? html`<p class="u3-tm__more">
          ${tr('u3_tm_unk_n', { n: nf(r.unknown) })}
        </p>`
      : nothing}
    <p class="u3-tmr__verdict u3-tmr__verdict--${key}${bad ? ' is-bad' : ''}">
      ${key === 'few'
        ? html`${chip({ label: t3('u3_tm_v_few'), tone: 'neutral' })}`
        : html`<small>${tr('u3_tm_vs', { n: days })}</small>
            <b>${t3('u3_tm_v_' + key)}</b>`}
    </p>
  </article>`;
}

/**
 * @param {HTMLElement} el
 * @param {{ client?: any, send?: any }} ctx
 */
export function mount(el, ctx) {
  let days = 30;
  /** @type {'loading'|'ready'} */
  let status = 'loading';
  /** @type {any} */
  let data = { present: false, rows: [], built_at: null };
  let seq = 0;
  let dead = false;
  /**
   * Weekly digest and experiments: one read when the screen opens, never polled.
   * @type {any}
   */
  let flow = null;
  let openExp = '';
  const send = (/** @type {string} */ t, /** @type {any} */ p) =>
    ctx.send ? ctx.send(t, p) : ctx.client.send(t, p);

  const draw = () => {
    if (!dead) render(template(), el);
  };

  async function fetchRows() {
    const mine = ++seq;
    status = 'loading';
    draw();
    // two windows (this period and the one before) in one read
    const res = await loadRollup({ send }, { days: days * 2 });
    if (mine !== seq) return;
    data = res;
    status = 'ready';
    draw();
  }

  /** @param {number} n */
  const pick = (n) => {
    if (n === days) return;
    days = n;
    fetchRows();
  };

  function body() {
    if (status === 'loading')
      return html`<p class="u3-tm__unk">${t3('u3_tm_loading')}</p>`;
    if (!data.present)
      return html`<p class="u3-tm__unk">${t3('u3_tm_empty')}</p>`;
    const now = Date.now();
    const rows = data.rows;
    const cur = roleReport(rows, { from: now - days * DAY, to: now + 1 });
    const prev = roleReport(rows, {
      from: now - 2 * days * DAY,
      to: now - days * DAY
    });
    const running = rows.filter((/** @type {any} */ r) => r.running).length;
    return html`${running
      ? html`<p class="u3-tm__more">
          ${tr('u3_tm_running_n', { n: nf(running) })}
        </p>`
      : nothing}
    ${cur.length
      ? html`<div class="u3-tmr__grid">
          ${cur.map((r) =>
            roleCard(
              r,
              prev.find((p) => p.role === r.role),
              days
            )
          )}
        </div>`
      : html`<p class="u3-tm__unk">${t3('u3_tm_no_closed')}</p>`}
    ${footer(data)}`;
  }

  const template = () =>
    html`<section class="u3-tms" data-view="time">
      <header class="u3-tms__head">
        <h2 class="u3-tms__title">${t3('u3_tm_title')}</h2>
        <p class="u3-tms__sub">${t3('u3_tm_sub')}</p>
        <div
          class="u3-tms__periods"
          role="group"
          aria-label=${t3('u3_tm_period')}
        >
          ${PERIODS.map(
            (n) =>
              html`<button
                type="button"
                class="u3-tms__p${n === days ? ' is-on' : ''}"
                aria-pressed=${n === days ? 'true' : 'false'}
                @click=${() => pick(n)}
              >
                ${tr('u3_tm_days', { n })}
              </button>`
          )}
        </div>
      </header>
      ${digestCard(flow ? flow.digest : null, { fixture: flow?.fixture })}
      ${body()} ${expSection(flow ? flow.exps : [], openExp, pickExp)}
    </section>`;

  /** @param {string} slug */
  const pickExp = (slug) => {
    openExp = slug;
    draw();
  };

  void loadDigest({ send }).then((r) => {
    flow = r;
    draw();
  });
  fetchRows();
  return {
    unmount() {
      dead = true;
      seq++;
      render(html``, el);
    }
  };
}
