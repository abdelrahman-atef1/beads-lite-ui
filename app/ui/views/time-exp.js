/**
 * Experiment view (beads-lite-1bo5.6.66.7, screens 13 and 15): the experiments of the flow
 * loop, each with its arms (before and during), n, the time median AND the quality counters
 * of both arms, the target, and the verdict the script computed. Time is never shown alone.
 * There is no adopt or roll-back button and no "new experiment": a verdict is the script's
 * (flow-exp.mjs), a person changes the flow by opening a bead. Wide screens show a list and
 * the open experiment side by side; the phone shows the list above the open experiment.
 */
import { html, nothing } from 'lit-html';
import { chip } from '../components/chip.js';
import { roleChip } from '../components/role-chip.js';
import { verdictKey } from '../data/flow-digest.js';
import { t3 } from '../i18n.js';
import { dur, nf, tr } from './time-section.js';

/** @type {Record<string, string>} */
const TONE = {
  adopt: 'green',
  rollback: 'red',
  extend: 'blue',
  confounded: 'amber',
  few: 'neutral',
  inconclusive: 'neutral'
};
/** @type {Record<string, string>} */
const GUARD_KEY = {
  qaFail: 'u3_tm_q_fail',
  reopen: 'u3_tm_q_reopen',
  ownerReject: 'u3_tm_q_owner',
  rework: 'u3_tm_q_rework',
  escaped: 'u3_ex_g_escaped'
};

/** @param {any} e */
export function verdictPill(e) {
  const k = verdictKey(e);
  return html`<span class="u3-ex__pill u3-ex__pill--${k}" data-verdict=${k}
    >${chip({
      label: t3('u3_ex_v_' + k),
      tone: TONE[k],
      title: e.verdict
    })}</span
  >`;
}

/** @param {number | null} v */
const pct = (v) => (v === null || v === undefined ? null : Math.round(v * 100));

/**
 * Median of the experiment's metric. A time metric shows as a duration; tokens as a count.
 *
 * @param {string} metric
 * @param {number | null} v
 */
export function fmtMetric(metric, v) {
  if (v === null || v === undefined) return t3('u3_tm_unknown');
  if (metric === 'tokens') {
    return v >= 1e6
      ? (v / 1e6).toFixed(1) + 'M'
      : v >= 1e3
        ? Math.round(v / 1e3) + 'k'
        : String(Math.round(v));
  }
  return dur(v);
}

/**
 * One arm: n, the median of the metric and, beside them, the rate of each quality counter.
 *
 * @param {{ cls: string, title: string, n: number | null, median: number | null, e: any, rate: 'base_rate' | 'treat_rate' }} a
 */
function arm(a) {
  return html`<section class="u3-ex__arm u3-ex__arm--${a.cls}">
    <h4 class="u3-ex__arm-h">${a.title}</h4>
    <p class="u3-ex__arm-n">
      <b class="u3-tm__num">${a.n === null ? '-' : nf(a.n)}</b>
      <span>${t3('u3_ex_n')}</span>
    </p>
    <p class="u3-ex__arm-m">
      <b class="u3-tm__num">${fmtMetric(a.e.metric, a.median)}</b>
      <span>${t3('u3_ex_m_' + a.e.metric)}</span>
    </p>
    <ul class="u3-ex__arm-q">
      ${a.e.guardrails.map(
        (/** @type {any} */ g) =>
          html`<li
            class="u3-tm__q u3-tm__q--${g.known && g[a.rate] ? 'bad' : 'ok'}"
          >
            <b class="u3-tm__num"
              >${g.known && pct(g[a.rate]) !== null
                ? pct(g[a.rate]) + '%'
                : '-'}</b
            >${t3(GUARD_KEY[g.name] || 'u3_ex_g_other')}
          </li>`
      )}
    </ul>
  </section>`;
}

/**
 * The detail of one experiment.
 *
 * @param {any} e
 */
export function expDetail(e) {
  const x = e.exp || {};
  const target =
    x.target === null || x.target === undefined ? null : pct(x.target);
  const k = verdictKey(e);
  return html`<article
    class="u3-ex__detail"
    data-slug=${e.slug}
    data-verdict=${k}
  >
    <header class="u3-ex__dhead">
      <h3 class="u3-ex__slug" dir="ltr">${e.slug}</h3>
      ${verdictPill(e)}
    </header>
    <p class="u3-ex__meta">
      ${x.scope && x.scope.role ? roleChip({ role: x.scope.role }) : nothing}
      ${x.scope && x.scope.kind
        ? html`<span class="u3-ex__kind" dir="ltr">${x.scope.kind}</span>`
        : nothing}
      ${chip({
        label: e.final ? t3('u3_ex_ended') : t3('u3_ex_running'),
        tone: e.final ? 'neutral' : 'blue'
      })}
    </p>
    ${x.hypothesis
      ? html`<p class="u3-ex__hyp" dir="auto">${x.hypothesis}</p>`
      : nothing}
    ${x.change
      ? html`<p class="u3-ex__chg" dir="auto">
          <small>${t3('u3_ex_change')}</small> ${x.change}
        </p>`
      : nothing}
    <div class="u3-ex__arms">
      ${arm({
        cls: 'before',
        title: t3('u3_ex_before'),
        n: e.n_base,
        median: e.median_base,
        e,
        rate: 'base_rate'
      })}
      ${arm({
        cls: 'during',
        title: t3('u3_ex_during'),
        n: e.n_treat,
        median: e.median_treat,
        e,
        rate: 'treat_rate'
      })}
    </div>
    <p class="u3-ex__target">
      ${target !== null
        ? html`<span
            >${tr('u3_ex_target', {
              m: t3('u3_ex_m_' + e.metric),
              p: nf(target)
            })}</span
          >`
        : nothing}
      ${pct(e.change) !== null
        ? html`<span
            >${tr('u3_ex_measured', {
              p: (e.change < 0 ? '-' : '+') + nf(Math.abs(pct(e.change) || 0))
            })}</span
          >`
        : html`<span>${t3('u3_ex_no_change')}</span>`}
      ${e.interval80 && e.interval80.lo !== null && e.interval80.hi !== null
        ? html`<span
            >${tr('u3_ex_interval', {
              lo: fmtMetric(e.metric, e.interval80.lo),
              hi: fmtMetric(e.metric, e.interval80.hi)
            })}</span
          >`
        : nothing}
    </p>
    ${e.n_unknown
      ? html`<p class="u3-tm__more">
          ${tr('u3_ex_unk', {
            n: nf(e.n_unknown),
            m: t3('u3_ex_m_' + e.metric)
          })}
        </p>`
      : nothing}
    ${e.control
      ? html`<p class="u3-tm__more">
          ${tr('u3_ex_control', {
            n: nf(e.control.n_treat || 0),
            p: nf(Math.round((e.control.change || 0) * 100))
          })}${e.market_moved ? html` · <b>${t3('u3_ex_market')}</b>` : nothing}
        </p>`
      : nothing}
    ${e.confounded
      ? html`<p class="u3-ex__conf">
          ${tr('u3_ex_confounded', {
            what: (e.confounded_by || []).join(', ')
          })}
        </p>`
      : nothing}
    <div class="u3-ex__guards">
      <h4 class="u3-tm__h">${t3('u3_ex_guards')}</h4>
      <ul class="u3-ex__glist">
        ${e.guardrails.map(
          (/** @type {any} */ g) =>
            html`<li class="u3-ex__g" data-guard=${g.name}>
              <span class="u3-tm__lbl"
                >${t3(GUARD_KEY[g.name] || 'u3_ex_g_other')}</span
              >
              <span class="u3-tm__num u3-ex__g-n"
                >${g.known
                  ? `${pct(g.base_rate)}% → ${pct(g.treat_rate)}%`
                  : t3('u3_tm_unknown')}</span
              >
              ${g.known
                ? chip({
                    label: g.held ? t3('u3_ex_held') : t3('u3_ex_worse'),
                    tone: g.held ? 'green' : 'red'
                  })
                : chip({ label: t3('u3_tm_unknown') })}
            </li>`
        )}
      </ul>
    </div>
    ${e.reason
      ? html`<p class="u3-ex__reason" dir="auto">${e.reason}</p>`
      : nothing}
    <p class="u3-tm__note">${t3('u3_ex_by_script')}</p>
  </article>`;
}

/**
 * List and detail. `open` is the slug shown; `onPick(slug)` redraws.
 *
 * @param {any[]} exps
 * @param {string} open
 * @param {(slug: string) => void} onPick
 */
export function expSection(exps, open, onPick) {
  if (!exps.length) {
    return html`<section class="u3-ex" data-view="experiments">
      <h3 class="u3-ex__h">${t3('u3_ex_title')}</h3>
      <p class="u3-tm__unk">${t3('u3_ex_none')}</p>
    </section>`;
  }
  const cur = exps.find((e) => e.slug === open) || exps[0];
  return html`<section class="u3-ex" data-view="experiments">
    <h3 class="u3-ex__h">${t3('u3_ex_title')}</h3>
    <p class="u3-tms__sub">${t3('u3_ex_sub')}</p>
    <div class="u3-ex__split">
      <ul class="u3-ex__list" aria-label=${t3('u3_ex_title')}>
        ${exps.map(
          (e) =>
            html`<li>
              <button
                type="button"
                class="u3-ex__item${e.slug === cur.slug ? ' is-on' : ''}"
                aria-pressed=${e.slug === cur.slug ? 'true' : 'false'}
                data-slug=${e.slug}
                @click=${() => onPick(e.slug)}
              >
                <span class="u3-ex__item-s" dir="ltr">${e.slug}</span>
                ${verdictPill(e)}
              </button>
            </li>`
        )}
      </ul>
      ${expDetail(cur)}
    </div>
  </section>`;
}
