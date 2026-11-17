/**
 * Stats home (#/), beads-lite-1bo5.6.68.4. Seven questions, each a block that answers one
 * thing the owner can act on (spec beads-lite-1bo5.6.68.1, design .68.2):
 *   who/what is stuck, is work finishing, where the time goes, where quality breaks,
 *   tokens per finished task, tokens per project, did the machine make us wait.
 * Numbers come from one server call (data/stats.js), fetched when the screen opens and when
 * the period changes; never polled. Unknown is shown as unknown, never 0; a group under 8
 * closed beads says "too few"; tokens are counts and a list-price equivalent, never money spent.
 * Strings are local to this file (Arabic first, English second), digits Western in both.
 */
import { html, nothing, render } from 'lit-html';
import { getLang } from '../../utils/i18n.js';
import { relIfToday } from '../card/common.js';
import { personLabel } from '../data/people.js';
import { projectLabel } from '../data/project-icons.js';
import { PERIODS, loadStats } from '../data/stats.js';
import { fmtDur } from '../data/time-math.js';
import { t3 } from '../i18n.js';
import { filterMenu } from '../tasks/filter-menu.js';
import { mountAsk } from './ask.js';

/** The Project chip's choice, remembered per device. */
const PROJECT_KEY = 'u3.stats.project';
const loadProject = () => {
  try {
    return window.localStorage.getItem(PROJECT_KEY) || '';
  } catch {
    return '';
  }
};
const saveProject = (/** @type {string} */ v) => {
  try {
    if (v) window.localStorage.setItem(PROJECT_KEY, v);
    else window.localStorage.removeItem(PROJECT_KEY);
  } catch {
    // not remembered
  }
};

const DAY = 86_400_000;
const STALE_MS = 36 * 3_600_000;

/** @type {Record<string, [string, string]>} key -> [ar, en] */
const S = {
  title: ['الإحصائيات', 'Stats'],
  days: ['{n} يوم', '{n} days'],
  d7: ['{n} أيام', '{n} days'],
  period: ['الفترة', 'Period'],
  sum: ['ملخص الأسبوع', 'This week'],
  sum_done: ['خلصنا {n} مهمة الأسبوع ده', 'We finished {n} tasks this week'],
  sum_owner: [
    '، والانتظار الأكبر عندك إنت: {k} قرار مستنيين ردك.',
    ', and the biggest wait is you: {k} decisions need your answer.'
  ],
  sum_none: ['.', '.'],
  stale: ['الأرقام قديمة: آخر حساب {t}', 'Numbers are old: last built {t}'],
  q3: ['إيه اللي واقف دلوقتي؟', 'What is stuck now?'],
  q3s: ['الأقدم أول · محدّث دلوقتي', 'Oldest first · live'],
  st_owner_decision: ['مستنية ردك', 'need your answer'],
  st_waiting_for_test: ['مستنية اختبار', 'waiting for test'],
  st_waiting_for_merge: ['مستنية دمج', 'waiting for merge'],
  st_blocked: ['واقفة', 'blocked'],
  all: ['اعرض الكل', 'Show all'],
  none_stuck: ['مفيش حاجة واقفة', 'Nothing is stuck'],
  q1: ['هل الشغل بيخلص؟', 'Is work getting finished?'],
  q1tip: [
    'الإغلاقات اللي شغلها أقل من دقيقة مش محسوبة',
    'Closes with under 1 min of work are not counted'
  ],
  q1s: [
    'مهام خلصت كل أسبوع · آخر 8 أسابيع',
    'Tasks finished per week · last 8 weeks'
  ],
  this_week: ['الأسبوع ده', 'This week'],
  median: ['الوسيط', 'median'],
  above: ['فوق الوسيط', 'Above median'],
  below: ['تحت الوسيط', 'Below median'],
  at: ['زي الوسيط', 'About the median'],
  built: ['آخر حساب: {t}', 'Last built: {t}'],
  q2: ['الوقت بيضيع فين؟', 'Where does the time go?'],
  q2s: [
    'نصيب كل مرحلة من وقت المهمة · آخر {n} يوم',
    'Share of each stage of a task’s time · last {n} days'
  ],
  b_active: ['شغل فعلي', 'work'],
  b_test: ['انتظار اختبار', 'waiting for test'],
  b_owner: ['انتظار ردك', 'waiting for you'],
  b_merge: ['دمج', 'merge'],
  b_blocked: ['واقف', 'blocked'],
  b_queue: ['طابور', 'queue'],
  biggest: ['أكبر انتظار: {w}', 'Biggest wait: {w}'],
  q4: ['الجودة بتقع فين؟', 'Where does quality break?'],
  q4s: [
    'شغل رجع للتصليح بعد الاختبار · آخر {n} يوم',
    'Work sent back after testing · last {n} days'
  ],
  few: ['عدد قليل', 'too few'],
  unknown: ['مش معروف', 'unknown'],
  noowner: ['بدون مسؤول', 'No owner'],
  noowner_n: ['{n} مهمة محدش اتعيّن عليها', '{n} tasks nobody was assigned'],
  q5: ['التوكنز لكل مهمة', 'Tokens per task'],
  q5s: [
    'كام توكن بتاكل المهمة · حسب الشخص',
    'How many tokens a task uses · by role'
  ],
  q6: ['التوكنز لكل مشروع', 'Tokens per project'],
  q6s: [
    'فين راح توكنز آخر {n} يوم · حسب المشروع',
    'Where the last {n} days of tokens went · by project'
  ],
  tk_known: ['معروف {k} من {n}', 'known {k} of {n}'],
  tk_cache: ['كاش {p}%', 'cache {p}%'],
  tk_eq: ['ما يعادل سعر القائمة: ${c}', 'list-price equivalent: ${c}'],
  tk_unatt: [
    '{p}% من الطلبات متنسبة لمهمة',
    '{p}% of requests matched to a task'
  ],
  tk_empty: ['التوكنز لسه مش متسجلة', 'Tokens are not recorded yet'],
  tk_empty_d: [
    'الملف اللي بيحسبها ماشتغلش ولا مرة، فمش هنكتب صفر. هتظهر هنا لما يتفعّل حسابها اليومي.',
    'The file that counts them has not run, so no zero is shown. They appear once the daily count is on.'
  ],
  none_yet: ['مفيش بيانات لسه', 'No data yet'],
  tk_closed: ['{n} مهمة خلصت', '{n} tasks closed'],
  q7: ['الجهاز خلّانا نستنى؟', 'Did the machine make us wait?'],
  q7s: [
    'انتظار الأعمال التقيلة · آخر {n} يوم',
    'Heavy-job waits · last {n} days'
  ],
  m_wait: ['وسيط الانتظار', 'median wait'],
  m_held: ['وسيط وقت الشغل', 'median run time'],
  m_none: ['مفيش أعمال تقيلة في الفترة دي', 'No heavy jobs in this period'],
  wake: ['سرعة الاستجابة', 'Wake speed'],
  wake_none: [
    'مش متسجلة لسه: النظام مابيسجّلش وقت الاستيقاظ لأي دور.',
    'Not recorded yet: the system does not log wake time for any role.'
  ],
  load_err: ['مقدرناش نحمّل الأرقام', 'Could not load the numbers'],
  load_err_d: ['جرّب تاني بعد شوية.', 'Try again in a moment.'],
  empty: ['مفيش أرقام لسه', 'No numbers yet'],
  empty_d: [
    'ملف التدفق (rollup) مش موجود. هيتكوّن لما يشتغل الحساب.',
    'The flow file (rollup) is missing. It is created when the nightly count runs.'
  ],
  unknown_role: ['غير معروف', 'unknown']
};

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
function tr(key, vars = {}) {
  const e = S[key];
  let s = e ? e[getLang() === 'ar' ? 0 : 1] : key;
  for (const [k, v] of Object.entries(vars))
    s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Name and job title from the shared people table (app/ui/data/people.js); "main" is the only extra. */
/** @param {string | null} r */
function roleName(r) {
  if (r === 'main') return { name: 'main', title: 'Main session' };
  const p = r ? personLabel(r) : null;
  return p?.known
    ? { name: p.name, title: p.title }
    : { name: r || tr('unknown_role'), title: '' };
}

const nf = new Intl.NumberFormat('en-GB');
/** @param {number} n */
const kfmt = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3
      ? Math.round(n / 1e3) + 'k'
      : String(n);
/** @param {number} ms */
function age(ms) {
  const d = Math.floor(ms / DAY);
  return d >= 1
    ? tr('days', { n: d })
    : fmtDur(ms, getLang() === 'ar' ? 'ar' : 'en') ||
        '<1' + (getLang() === 'ar' ? 'د' : 'm');
}
/** @param {string | null} iso */
const when = (iso) =>
  iso
    ? relIfToday(Date.parse(iso), getLang(), () =>
        iso.slice(0, 16).replace('T', ' ')
      )
    : tr('unknown');

/** @param {string} id */
const href = (id) => '#/issues?issue=' + encodeURIComponent(id);

const TONE = /** @type {Record<string, string>} */ ({
  owner_decision: 'amber',
  waiting_for_test: 'blue',
  waiting_for_merge: 'teal',
  blocked: 'red'
});
const BUCKET_COLOR = /** @type {Record<string, string>} */ ({
  active: 'var(--u3-teal)',
  test: 'var(--u3-blue)',
  owner: 'var(--u3-amber)',
  merge: 'var(--u3-purple)',
  blocked: 'var(--u3-red)',
  queue: 'var(--u3-text-3)'
});

/**
 * @param {string} title
 * @param {string} sub
 * @param {any} body
 * @param {string} key
 */
const block = (key, title, sub, body) =>
  html`<section class="u3-sh__card" data-block=${key}>
    <h2 class="u3-sh__h">${title}</h2>
    <p class="u3-sh__sub">${sub}</p>
    ${body}
  </section>`;

/** @param {string} title - @param {string} desc */
const emptyBox = (title, desc) =>
  html`<div class="u3-sh__empty" role="status">
    <strong>${title}</strong>
    <span>${desc}</span>
  </div>`;

/** @param {any} d */
function stuckBlock(d) {
  const c = d.counts;
  const chips = [
    'owner_decision',
    'waiting_for_test',
    'waiting_for_merge',
    'blocked'
  ].map(
    (k) =>
      html`<span class="u3-chip u3-chip--${TONE[k]}" data-status=${k}
        >${nf.format(c[k] || 0)} ${tr('st_' + k)}</span
      >`
  );
  const rows = d.stuck.length
    ? d.stuck.map((/** @type {any} */ s) => {
        const r = roleName(s.role);
        return html`<a class="u3-sh__row" href=${href(s.id)}>
          <span class="u3-sh__rowmain">
            <strong dir="auto">${s.title || s.id}</strong>
            <span class="u3-sh__muted" dir="auto"
              >${r.name}${r.title ? ' - ' + r.title : ''}</span
            >
          </span>
          <span class="u3-chip u3-chip--${TONE[s.status] || 'neutral'}"
            >${age(s.ageMs)}</span
          >
        </a>`;
      })
    : html`<p class="u3-sh__muted">${tr('none_stuck')}</p>`;
  return block(
    'stuck',
    tr('q3'),
    tr('q3s'),
    html`<div class="u3-sh__chips">${chips}</div>
      <div class="u3-sh__rows">${rows}</div>
      <a class="u3-btn u3-btn--ghost u3-sh__all" href="#/issues"
        >${tr('all')}</a
      >`
  );
}

/** @param {any} d */
function weeksBlock(d) {
  const max = Math.max(1, ...d.weeks);
  const cur = d.weeks[7];
  const key =
    d.weekAvg === null ||
    d.weeks.slice(0, 7).every((/** @type {number} */ x) => x === 0)
      ? null
      : cur > d.weekAvg * 1.1
        ? 'above'
        : cur < d.weekAvg * 0.9
          ? 'below'
          : 'at';
  return block(
    'weeks',
    tr('q1'),
    tr('q1s') + ' · n=' + nf.format(d.weekTotal),
    html`<div class="u3-sh__big" title=${tr('q1tip')}>
        <span class="u3-sh__num" dir="ltr">${nf.format(cur)}</span>
        <span class="u3-sh__muted"
          >${tr('this_week')}${d.weekAvg !== null
            ? html` · ${tr('median')}
                <span dir="ltr">${nf.format(d.weekAvg)}</span>`
            : nothing}</span
        >
        ${key
          ? html`<span
              class="u3-chip u3-chip--${key === 'above'
                ? 'teal'
                : key === 'below'
                  ? 'amber'
                  : 'neutral'}"
              >${tr(key)}</span
            >`
          : nothing}
      </div>
      <div
        class="u3-sh__bars"
        role="img"
        aria-label=${d.weeks.join(', ')}
        dir="ltr"
      >
        ${d.weeks.map(
          (/** @type {number} */ w, /** @type {number} */ i) =>
            html`<i
              class=${i === 7 ? 'is-now' : ''}
              style=${'height:' +
              Math.max(4, Math.round((w / max) * 100)) +
              '%'}
              title=${nf.format(w)}
            ></i>`
        )}
      </div>
      <p class="u3-sh__muted">${tr('built', { t: when(d.built_at) })}</p>`
  );
}

/** @param {any} d */
function splitBlock(d) {
  const sp = d.split;
  const sub = tr('q2s', { n: d.days }) + ' · n=' + nf.format(sp.n);
  if (!sp.shares) {
    return block('split', tr('q2'), sub, emptyBox(tr('none_yet'), ''));
  }
  const keys = ['active', 'test', 'owner', 'merge', 'blocked', 'queue'];
  const pct = (/** @type {string} */ k) => Math.round(sp.shares[k] * 100);
  return block(
    'split',
    tr('q2'),
    sub,
    html`<div class="u3-sh__stack" dir="ltr" role="img">
        ${keys
          .filter((k) => sp.shares[k] > 0)
          .map(
            (k) =>
              html`<i
                style=${`flex:${sp.shares[k]};background:${BUCKET_COLOR[k]}`}
                title=${tr('b_' + k) + ' ' + pct(k) + '%'}
              ></i>`
          )}
      </div>
      <ul class="u3-sh__legend">
        ${keys.map(
          (k) =>
            html`<li>
              <i style=${'background:' + BUCKET_COLOR[k]}></i>${tr('b_' + k)}
              <span dir="ltr">${pct(k)}%</span>
            </li>`
        )}
      </ul>
      ${sp.biggest
        ? html`<span class="u3-chip u3-chip--blue"
            >${tr('biggest', { w: tr('b_' + sp.biggest) })}</span
          >`
        : nothing}`
  );
}

/** @param {any} d */
function qualityBlock(d) {
  const rows = d.quality.map((/** @type {any} */ q) => {
    const r = roleName(q.role);
    const pct = q.rate === null ? null : Math.round(q.rate * 100);
    return html`<div class="u3-sh__row u3-sh__row--q">
      <span class="u3-sh__rowmain"
        ><strong>${r.name}</strong
        ><span class="u3-sh__muted" dir="auto">${r.title}</span></span
      >
      ${q.enough
        ? html`<span class="u3-sh__meter" dir="ltr"
              ><i style=${'width:' + Math.min(100, pct || 0) + '%'}></i></span
            ><span
              class="u3-chip u3-chip--${(pct || 0) >= 25 ? 'red' : 'green'}"
              dir="ltr"
              >n=${q.closed} · ${pct}%</span
            >`
        : html`<span class="u3-chip u3-chip--neutral" dir="ltr"
            >n=${q.closed} · ${tr('few')}</span
          >`}
    </div>`;
  });
  return block(
    'quality',
    tr('q4'),
    tr('q4s', { n: d.days }),
    html`${rows.length ? rows : emptyBox(tr('none_yet'), '')}
      <div class="u3-sh__row u3-sh__row--q">
        <span class="u3-sh__rowmain"
          ><strong>${tr('noowner')}</strong
          ><span class="u3-sh__muted"
            >${tr('noowner_n', { n: nf.format(d.unassigned) })}</span
          ></span
        >
        <span class="u3-chip u3-chip--neutral">${tr('unknown')}</span>
      </div>`
  );
}

/** @param {any} d */
function tokenFoot(d) {
  const t = d.tokens;
  return html`<p class="u3-sh__muted">
    ${tr('tk_known', {
      k: nf.format(t.known),
      n: nf.format(t.of)
    })}${t.cacheHit !== null
      ? ' · ' + tr('tk_cache', { p: Math.round(t.cacheHit * 100) })
      : ''}${t.attributed !== null
      ? ' · ' + tr('tk_unatt', { p: Math.round(t.attributed * 100) })
      : ''}
  </p>`;
}

/** @param {any} d */
function rolesTokensBlock(d) {
  const t = d.tokens;
  const sub = tr('q5s') + (t.present ? ' · n=' + nf.format(t.known) : '');
  if (!t.present) {
    return block(
      'tokens-role',
      tr('q5'),
      sub,
      emptyBox(tr('tk_empty'), tr('tk_empty_d'))
    );
  }
  if (!t.roles.length) {
    return block(
      'tokens-role',
      tr('q5'),
      sub,
      html`${emptyBox(tr('none_yet'), '')}${tokenFoot(d)}`
    );
  }
  const max = Math.max(1, ...t.roles.map((/** @type {any} */ r) => r.avg));
  return block(
    'tokens-role',
    tr('q5'),
    sub,
    html`${t.roles.map((/** @type {any} */ r) => {
        const n = roleName(r.role);
        return html`<div class="u3-sh__row u3-sh__row--q">
          <span class="u3-sh__rowmain"
            ><strong>${n.name}</strong
            ><span class="u3-sh__muted" dir="auto">${n.title}</span></span
          >
          <span class="u3-sh__meter u3-sh__meter--blue" dir="ltr"
            ><i style=${'width:' + Math.round((r.avg / max) * 100) + '%'}></i
          ></span>
          <span
            class="u3-chip u3-chip--${r.enough ? 'blue' : 'neutral'}"
            dir="ltr"
            >${kfmt(r.avg)}${r.enough ? '' : ' · ' + tr('few')}</span
          >
        </div>`;
      })}
      ${tokenFoot(d)}
      <p class="u3-sh__muted">${tr('tk_eq', { c: nf.format(t.equivCost) })}</p>`
  );
}

/** @param {any} d */
function projectsTokensBlock(d) {
  const t = d.tokens;
  const sub = tr('q6s', { n: t.present ? t.scanDays : 30 });
  if (!t.present || !t.projects.length) {
    return block(
      'tokens-project',
      tr('q6'),
      sub,
      emptyBox(tr('tk_empty'), tr('tk_empty_d'))
    );
  }
  const max = Math.max(
    1,
    ...t.projects.map((/** @type {any} */ p) => p.tokens)
  );
  return block(
    'tokens-project',
    tr('q6'),
    sub,
    html`${t.projects.map(
        (/** @type {any} */ p) =>
          html`<div class="u3-sh__row u3-sh__row--q">
            <span class="u3-sh__rowmain"
              ><strong dir="auto">${projectLabel(p.project)}</strong
              ><span class="u3-sh__muted"
                >${tr('tk_closed', { n: nf.format(p.closed) })}</span
              ></span
            >
            <span class="u3-sh__meter u3-sh__meter--blue" dir="ltr"
              ><i
                style=${'width:' + Math.round((p.tokens / max) * 100) + '%'}
              ></i
            ></span>
            <span class="u3-chip u3-chip--blue" dir="ltr"
              >${kfmt(p.tokens)}</span
            >
          </div>`
      )}
      ${t.partial
        ? html`<p class="u3-sh__muted">${tr('tk_empty')} (partial)</p>`
        : nothing}
      <p class="u3-sh__muted">
        ${tr('tk_eq', {
          c: nf.format(
            t.projects.reduce(
              (/** @type {number} */ s, /** @type {any} */ p) => s + p.cost,
              0
            )
          )
        })}
      </p>`
  );
}

/** @param {any} d */
function machineBlock(d) {
  const m = d.machine;
  const lang = getLang() === 'ar' ? 'ar' : 'en';
  const sec = (/** @type {number | null} */ s) =>
    s === null ? tr('unknown') : fmtDur(s * 1000, lang) || '<1';
  return block(
    'machine',
    tr('q7'),
    tr('q7s', { n: d.days }) + ' · n=' + nf.format(m.n),
    html`${m.n
      ? html`<div class="u3-sh__duo">
          <div>
            <span class="u3-sh__num" dir="ltr">${sec(m.waitMedS)}</span>
            <span class="u3-sh__muted">${tr('m_wait')}</span>
          </div>
          <div>
            <span class="u3-sh__num" dir="ltr">${sec(m.heldMedS)}</span>
            <span class="u3-sh__muted">${tr('m_held')}</span>
          </div>
        </div>`
      : html`<p class="u3-sh__muted">${tr('m_none')}</p>`}
    ${m.wakeMedMs === null
      ? emptyBox(tr('wake') + ': ' + tr('unknown'), tr('wake_none'))
      : html`<p class="u3-sh__muted">
          ${tr('wake')}: <span dir="ltr">${fmtDur(m.wakeMedMs, lang)}</span>
        </p>`}`
  );
}

/**
 * @param {any} d
 * @returns {string}
 */
export function summaryLine(d) {
  const n = d.weeks[7];
  const k = d.counts.owner_decision || 0;
  return (
    tr('sum_done', { n: nf.format(n) }) +
    (k > 0 ? tr('sum_owner', { k: nf.format(k) }) : tr('sum_none'))
  );
}

/**
 * @param {{ days: number, d: any, loading: boolean, project: string, menu: import('../tasks/filter-menu.js').Open | null, setMenu: (o: import('../tasks/filter-menu.js').Open | null) => void, setProject: (v: string) => void, pick: (n: number) => void }} s
 */
function view(s) {
  const d = s.d;
  // one Project chip; off while loading, and when there is only one project
  const keys = d && d.present && Array.isArray(d.projects) ? d.projects : [];
  const chipEl =
    d && d.present && (keys.length > 1 || s.project)
      ? filterMenu({
          name: 'project',
          icon: 'project',
          title: t3('u3_tk_project'),
          any: t3('u3_tk_all'),
          options: [
            ...new Set([...keys, ...(s.project ? [s.project] : [])])
          ].map((v) => ({ value: v, label: v, icon: 'project', project: v })),
          selected: s.project ? [s.project] : [],
          open: s.menu,
          setOpen: s.setMenu,
          pick: s.setProject
        })
      : nothing;
  const pills = html`<div
    class="u3-sh__periods"
    role="group"
    aria-label=${tr('period')}
  >
    ${PERIODS.map(
      (n) =>
        html`<button
          type="button"
          class="u3-tms__p${n === s.days ? ' is-on' : ''}"
          aria-pressed=${n === s.days ? 'true' : 'false'}
          @click=${() => s.pick(n)}
        >
          ${tr(n === 7 ? 'd7' : 'days', { n })}
        </button>`
    )}
  </div>`;
  if (!d) {
    return html`<div class="u3-sh" data-screen="stats">
      ${pills}
      <div class="u3-skel" aria-busy="true"><i></i><i></i><i></i></div>
    </div>`;
  }
  if (d.error) {
    return html`<div class="u3-sh" data-screen="stats" data-error>
      ${pills}${emptyBox(tr('load_err'), tr('load_err_d'))}
    </div>`;
  }
  if (!d.present) {
    return html`<div class="u3-sh" data-screen="stats">
      ${emptyBox(tr('empty'), tr('empty_d'))}
    </div>`;
  }
  const built = d.built_at ? Date.parse(d.built_at) : NaN;
  const stale = Number.isFinite(built) && d.now - built > STALE_MS;
  return html`<div
    class="u3-sh"
    data-screen="stats"
    aria-busy=${s.loading ? 'true' : 'false'}
  >
    <div class="u3-sh__bar">${pills}${chipEl}</div>
    <section class="u3-sh__sum" data-block="summary">
      <span class="u3-chip u3-chip--amber">${tr('sum')}</span>
      <p>${summaryLine(d)}</p>
      ${stale
        ? html`<span class="u3-chip u3-chip--amber" data-stale
            >${tr('stale', { t: when(d.built_at) })}</span
          >`
        : nothing}
    </section>
    <div class="u3-sh__grid">
      <div class="u3-sh__col">
        ${stuckBlock(d)}${splitBlock(d)}${qualityBlock(d)}
      </div>
      <div class="u3-sh__col">
        ${weeksBlock(d)}${rolesTokensBlock(d)}${s.project
          ? nothing
          : projectsTokensBlock(d)}${machineBlock(d)}
      </div>
    </div>
  </div>`;
}

/**
 * @param {HTMLElement} el
 * @param {{ client?: any }} ctx
 */
export function mount(el, ctx) {
  let days = 7;
  let project = loadProject();
  /** @type {import('../tasks/filter-menu.js').Open | null} */
  let menu = null;
  /** @type {any} */
  let d = null;
  let loading = true;
  let seq = 0;
  const draw = () => {
    render(
      view({ days, d, loading, project, menu, setMenu, setProject, pick }),
      el
    );
    const pop = /** @type {HTMLElement | null} */ (
      el.querySelector('.u3t-pop')
    );
    if (pop && menu) {
      const w = pop.getBoundingClientRect().width;
      pop.style.left =
        Math.max(8, Math.min(menu.left, window.innerWidth - w - 8)) + 'px';
    }
  };
  /** @param {import('../tasks/filter-menu.js').Open | null} o */
  function setMenu(o) {
    menu = o;
    draw();
  }
  /** @param {string} v - '' = all projects */
  function setProject(v) {
    project = v;
    menu = null;
    saveProject(v);
    void load();
  }
  /** @param {number} n */
  function pick(n) {
    days = n;
    askHost.dataset.days = String(n);
    void load();
  }
  async function load() {
    const mine = ++seq;
    loading = true;
    draw();
    const r = await loadStats(ctx.client, days, project);
    if (mine !== seq) return;
    // a failed refresh keeps the numbers already on screen
    if (!(r && r.error && d && d.present)) d = r;
    loading = false;
    draw();
  }
  // Touch has no hover, so the title tooltips (bar values, split shares) never
  // showed on a phone: a tap on any element with a title opens it as a bubble.
  /** @type {HTMLElement | null} */
  let tip = null;
  let tip_timer = 0;
  const hideTip = () => {
    clearTimeout(tip_timer);
    tip?.remove();
    tip = null;
  };
  /** @param {Event} e */
  const onTap = (e) => {
    const t = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (e.target).closest?.('[title]')
    );
    hideTip();
    const text = t?.getAttribute('title');
    if (!t || !text || !el.contains(t)) return;
    const r = t.getBoundingClientRect();
    tip = document.createElement('div');
    tip.className = 'u3-sh__tip';
    tip.setAttribute('role', 'status');
    tip.textContent = text;
    tip.style.left = Math.round(r.left + r.width / 2) + 'px';
    tip.style.top = Math.round(r.top) + 'px';
    (el.closest('.u3') || document.body).appendChild(tip);
    tip_timer = window.setTimeout(hideTip, 3000);
  };
  el.addEventListener('click', onTap);
  // a tap outside or Escape closes the project menu
  const onDoc = (/** @type {Event} */ ev) => {
    if (!menu) return;
    if (
      ev.type === 'keydown'
        ? /** @type {KeyboardEvent} */ (ev).key !== 'Escape'
        : /** @type {HTMLElement} */ (ev.target).closest?.('.u3t-menu-w')
    ) {
      return;
    }
    menu = null;
    draw();
  };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onDoc);
  window.addEventListener('bdui-lang', draw);
  // The assistant on this screen: same sheet, scope stats (beads-lite-1bo5.6.59.37.2).
  // Its host lives beside the screen (the screen's own markup is redrawn on every draw).
  const askHost = document.createElement('div');
  askHost.className = 'u3-ask';
  askHost.dataset.scope = 'stats';
  askHost.dataset.days = String(days);
  (el.closest('.u3') || document.body).appendChild(askHost);
  const ask = mountAsk(askHost);
  void load();
  return {
    unmount() {
      seq++;
      ask.destroy();
      askHost.remove();
      hideTip();
      el.removeEventListener('click', onTap);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onDoc);
      window.removeEventListener('bdui-lang', draw);
    }
  };
}
