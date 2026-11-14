/**
 * Weekly digest card (beads-lite-1bo5.6.66.7, screen 14): the five lines of the newest weekly
 * flow review, exactly as the script wrote them (Title, Done since last, Next, Needs you,
 * Risks). Nothing is reworded, ranked or computed here; the one change is that a markdown
 * link to a bead on the board becomes a link. No digest yet shows an empty line.
 */
import { html, nothing } from 'lit-html';
import { t3 } from '../i18n.js';
import { tr } from './time-section.js';

const LINK =
  /\[([^\]]{1,120})\]\((https:\/\/abdelrahman\.tail8a4e50\.ts\.net\/[^\s)]{1,200})\)/g;

/**
 * Text with the board's own bead links made clickable. Anything else stays text.
 *
 * @param {string} s
 */
export function withLinks(s) {
  /** @type {any[]} */
  const out = [];
  let last = 0;
  for (const m of s.matchAll(LINK)) {
    out.push(s.slice(last, m.index));
    out.push(html`<a href=${m[2]} target="_blank" rel="noopener">${m[1]}</a>`);
    last = (m.index || 0) + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}

/**
 * @param {{ week: string, lines: string[], findings: boolean, built_at?: string | null } | null} d
 * @param {{ fixture?: boolean }} [o]
 */
export function digestCard(d, o = {}) {
  if (!d) {
    return html`<section class="u3-wd" data-view="digest">
      <h3 class="u3-wd__h">${t3('u3_wd_title')}</h3>
      <p class="u3-tm__unk">${t3('u3_wd_none')}</p>
    </section>`;
  }
  return html`<section class="u3-wd" data-view="digest" data-week=${d.week}>
    <header class="u3-wd__head">
      <h3 class="u3-wd__h">${t3('u3_wd_title')}</h3>
      <span class="u3-wd__week u3-tm__num" dir="ltr">${d.week}</span>
    </header>
    <dl class="u3-wd__lines">
      ${d.lines.map((/** @type {string} */ l) => {
        const i = l.indexOf(':');
        if (i < 0) return nothing;
        return html`<div class="u3-wd__line" data-label=${l.slice(0, i)}>
          <dt dir="ltr">${l.slice(0, i + 1)}</dt>
          <dd dir="auto">${withLinks(l.slice(i + 1).trim())}</dd>
        </div>`;
      })}
    </dl>
    <p class="u3-tm__note">
      ${t3('u3_wd_by_script')}${d.built_at
        ? html` · ${tr('u3_wd_at', { t: d.built_at.slice(0, 10) })}`
        : nothing}${o.fixture ? html` · ${t3('u3_tm_fixture')}` : nothing}
    </p>
  </section>`;
}
