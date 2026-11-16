/**
 * Desk (v3 home, beads-lite-1bo5.6.59.5): decisions, then steps for the
 * owner, then today's moves. Data, no new subscriptions:
 *   - decisions feed: list-decisions-all once on open, pushed `decisions-all`
 *     afterwards, refetch on reconnect (same as legacy views/decisions.js);
 *     kind 'steps' items go to the steps section, the rest are decisions.
 *   - today's moves: the shared all-issues list (data/all.js),
 *     issues touched since local midnight.
 * Cards are drawn by views/card.js (task 4); this file never writes a record.
 * The sections render into their own hosts so a busy moves list never
 * repaints (and reloads) the decision cards.
 */
import { html, nothing, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { getLang } from '../../utils/i18n.js';
import { relIfToday } from '../card/common.js';
import { chip } from '../components/chip.js';
import { listRow } from '../components/list-row.js';
import { allIssues } from '../data/all.js';
import { projectLabel } from '../data/project-icons.js';
import { t3 } from '../i18n.js';
import { personChip } from '../people/person-chip.js';
import { renderCard } from './card.js';

export const MOVES_MAX = 12;

/**
 * Split the feed into decisions and steps.
 *
 * @param {any[]} items
 */
export function splitFeed(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    decisions: list.filter((i) => i && i.kind !== 'steps'),
    steps: list.filter((i) => i && i.kind === 'steps')
  };
}

/**
 * Issues touched today (local day), newest first.
 *
 * @param {any[]} issues
 * @param {number} [now]
 */
export function todayMoves(issues, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const from = d.getTime();
  return (Array.isArray(issues) ? issues : [])
    .filter((i) => i && Number(i.updated_at) >= from)
    .sort((a, b) => Number(b.updated_at) - Number(a.updated_at));
}

/** @param {string} id bead id -> project part */
export const projectOf = (id) => String(id).replace(/-[^-.]+(\.\d+)*$/, '');

/** @param {any} it */
function dotOf(it) {
  switch (it.status) {
    case 'closed':
      return 'green';
    case 'blocked':
      return 'red';
    case 'owner_decision':
      return 'amber';
    case 'in_progress':
      return 'blue';
    default:
      return 'purple';
  }
}

/**
 * @param {HTMLElement} el
 * @param {any} ctx
 */
export function mount(el, ctx) {
  const client = ctx.client;
  /** @type {any[] | null} */
  let feed = null;
  /** Decision beads with no usable card: listed as links, never dropped. @type {any[]} */
  let bad = [];
  let failed = false;
  let showAll = false;
  const issues = allIssues(ctx);

  el.textContent = '';
  const root = document.createElement('div');
  root.className = 'dk3';
  root.innerHTML =
    '<div class="dk3-chips"></div><div class="dk3-cols"><section class="dk3-main"></section><div class="dk3-side"><section class="dk3-steps"></section><section class="dk3-moves"></section></div></div>';
  el.appendChild(root);
  const q = (/** @type {string} */ s) =>
    /** @type {HTMLElement} */ (root.querySelector(s));
  const hosts = {
    chips: q('.dk3-chips'),
    dec: q('.dk3-main'),
    steps: q('.dk3-steps'),
    moves: q('.dk3-moves')
  };

  const head = (
    /** @type {string} */ key,
    /** @type {number} */ n,
    /** @type {string} */ tone
  ) =>
    html`<h2 class="dk3-h">
      <span>${t3(key)}</span>${n > 0
        ? chip({ label: String(n), tone })
        : nothing}
    </h2>`;

  function paintFeed() {
    const { decisions, steps } = splitFeed(feed || []);
    const total = decisions.length + bad.length;
    const waiting = feed === null && !failed;
    render(
      html`${head('u3_desk_dec', total, 'amber')}
      ${failed && feed === null
        ? html`<p class="dk3-empty" role="alert">${t3('u3_desk_failed')}</p>`
        : waiting
          ? html`<p class="dk3-empty">${t3('u3_desk_loading')}</p>`
          : total
            ? html`<div class="dk3-list">
                  ${repeat(
                    decisions,
                    (i) => i.id,
                    (i) => renderCard(i, { client })
                  )}
                </div>
                ${bad.length
                  ? html`<p class="dk3-empty">${t3('u3_desk_nocard')}</p>
                      <div class="dk3-rows">
                        ${bad.map((b) =>
                          listRow({
                            title: b.id,
                            dot: 'amber',
                            href: `#/issues?issue=${encodeURIComponent(b.id)}`,
                            meta: chip({
                              label: projectLabel(projectOf(b.id)),
                              tone: 'neutral'
                            })
                          })
                        )}
                      </div>`
                  : nothing}`
            : html`<p class="dk3-empty">${t3('u3_desk_empty_dec')}</p>`}`,
      hosts.dec
    );
    render(
      html`${head('u3_desk_steps', steps.length, 'teal')}
      ${feed === null
        ? nothing
        : steps.length
          ? html`<div class="dk3-list">
              ${repeat(
                steps,
                (i) => i.id,
                (i) => renderCard(i, { client })
              )}
            </div>`
          : html`<p class="dk3-empty">${t3('u3_desk_empty_steps')}</p>`}`,
      hosts.steps
    );
    paintChips();
  }

  function paintChips() {
    const { decisions, steps } = splitFeed(feed || []);
    const nDec = decisions.length + bad.length;
    const active = issues.items().filter((i) => i.status === 'in_progress');
    render(
      html`${chip({
        label: html`<i class="u3-dot u3-dot--amber"></i>${nDec}
          ${t3('u3_desk_chip_dec')}`,
        tone: 'amber'
      })}
      ${chip({
        label: html`<i class="u3-dot u3-dot--green"></i>${steps.length}
          ${t3('u3_desk_chip_steps')}`,
        tone: 'teal'
      })}
      ${chip({
        label: html`<i class="u3-dot"></i>${active.length}
          ${t3('u3_desk_chip_active')}`,
        tone: 'blue'
      })}`,
      hosts.chips
    );
  }

  function paintMoves() {
    const loc = getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
    const fmt = new Intl.DateTimeFormat(loc, {
      hour: '2-digit',
      minute: '2-digit'
    });
    const all = todayMoves(issues.items());
    const rows = showAll ? all : all.slice(0, MOVES_MAX);
    render(
      html`${head('u3_desk_moves', all.length, 'blue')}
      ${all.length
        ? html`<div class="dk3-rows">
              ${rows.map((it) =>
                listRow({
                  title: String(it.title || it.id),
                  dot: dotOf(it),
                  href: `#/issues?issue=${encodeURIComponent(it.id)}`,
                  meta: html`${it.assignee
                    ? personChip({ role: it.assignee, short: true })
                    : nothing}${chip({
                    label: projectLabel(projectOf(it.id)),
                    tone: 'neutral'
                  })}`,
                  end: relIfToday(Number(it.updated_at), getLang(), () =>
                    fmt.format(Number(it.updated_at))
                  )
                })
              )}
            </div>
            ${all.length > rows.length
              ? html`<button
                  type="button"
                  class="dk3-more"
                  @click=${() => {
                    showAll = true;
                    paintMoves();
                  }}
                >
                  ${t3('u3_desk_more')}
                </button>`
              : nothing}`
        : issues.loaded()
          ? html`<p class="dk3-empty">${t3('u3_desk_empty_moves')}</p>`
          : html`<p class="dk3-empty">${t3('u3_desk_loading')}</p>`}`,
      hosts.moves
    );
    paintChips();
  }

  /** @param {any} snap */
  function applyFeed(snap) {
    if (!snap || !Array.isArray(snap.items)) return;
    feed = snap.items;
    bad = Array.isArray(snap.unanswerable) ? snap.unanswerable : [];
    failed = false;
    paintFeed();
  }
  async function fetchFeed() {
    try {
      applyFeed(await client.send('list-decisions-all', {}));
    } catch {
      failed = true;
      paintFeed();
    }
  }

  paintFeed();
  paintMoves();
  void fetchFeed();
  const offs = [
    client.on?.('decisions-all', applyFeed),
    client.onConnection?.((/** @type {any} */ s) => {
      if (s === 'open' && feed !== null) void fetchFeed();
    }),
    issues.on(paintMoves)
  ];

  return {
    unmount() {
      for (const off of offs) if (typeof off === 'function') off();
      render(html``, hosts.dec);
      render(html``, hosts.steps);
      render(html``, hosts.moves);
      el.textContent = '';
    }
  };
}
