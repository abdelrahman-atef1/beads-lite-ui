/**
 * The filter bar of a screen that is not the board (Desk, beads-lite-1bo5.13.24.1):
 * search, the Filters button with the same sheet as Tasks, an Urgent chip, a
 * Project menu and one removable chip per active dimension. The sheet, the
 * menu and the counts are the Tasks components; only the wiring lives here.
 * The caller owns the filter state (createFilterState) and the items to count.
 */
import { html, render } from 'lit-html';
import { priorityName } from '../../utils/priority.js';
import { priorityIconName, typeIconName } from '../components/vicon.js';
import { personLabel } from '../data/people.js';
import { t3 } from '../i18n.js';
import { icon } from '../icons.js';
import { dimCounts } from './filter-counts.js';
import { filterMenu } from './filter-menu.js';
import { filterSheet } from './filter-sheet.js';

/**
 * @param {{
 *   host: HTMLElement,
 *   filter: ReturnType<typeof import('../../utils/board-filter.js').createFilterState>,
 *   dims: string[],
 *   items: () => any[],
 *   ctx: import('../../utils/board-filter.js').Ctx,
 *   projects: () => string[]
 * }} p
 */
export function createFilterBar(p) {
  /** @type {import('./filter-menu.js').Open | null} */
  let open_menu = null;
  /** @type {{ left: number, top: number } | null} */
  let sheet = null;
  /** @type {Set<string>} */
  const sheet_open = new Set();
  /** @type {Record<string, string>} */
  const sheet_find = {};
  /** @type {string} */
  let focus_to = '';
  /** @type {ReturnType<typeof setTimeout> | null} */
  let q_timer = null;

  const phone = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches;
  const f = () => /** @type {Record<string, any>} */ (p.filter.get());
  const toggleValue = (/** @type {string} */ dim, /** @type {string} */ v) => {
    const cur = /** @type {string[]} */ (f()[dim]);
    p.filter.set({
      [dim]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    });
  };
  const clearDim = (/** @type {string} */ dim) => p.filter.set({ [dim]: [] });
  function clearAll() {
    open_menu = null;
    p.filter.set({
      ...Object.fromEntries(p.dims.map((d) => [d, []])),
      search: ''
    });
  }

  function sections() {
    const items = p.items();
    const cur = p.filter.get();
    /** @type {Record<string, (v: string) => { label: string, icon?: string, project?: string }>} */
    const look = {
      assignee: (v) =>
        v === '-'
          ? { label: t3('u3_tk_unassigned'), icon: 'nobody' }
          : { label: personLabel(v).full, icon: 'mine' },
      prio: (v) => ({
        label: priorityName(Number(v)),
        icon: priorityIconName(Number(v))
      }),
      type: (v) => ({ label: v, icon: typeIconName(v) }),
      label: (v) => ({ label: v, icon: 'label' }),
      project: (v) => ({ label: v, icon: 'project', project: v })
    };
    return p.dims.map((dim) => {
      const counted = dimCounts(items, cur, dim, p.ctx);
      if (dim === 'project') {
        // a registered project with nothing here stays listed, at zero
        for (const k of p.projects()) {
          if (!counted.some((o) => o.value === k)) {
            counted.push({ value: k, count: 0 });
          }
        }
        counted.sort((a, b) => a.value.localeCompare(b.value));
      }
      return {
        dim,
        title: t3('u3_tk_' + dim),
        options: counted.map((o) => ({
          ...look[dim](o.value),
          value: o.value,
          count: o.count
        }))
      };
    });
  }

  function valueLabel(/** @type {string} */ dim, /** @type {string} */ v) {
    if (dim === 'assignee') {
      return v === '-' ? t3('u3_tk_unassigned') : personLabel(v).name;
    }
    if (dim === 'prio') return priorityName(Number(v));
    return v;
  }

  function openSheet(
    /** @type {string} */ dim,
    /** @type {HTMLElement} */ btn
  ) {
    const r = btn.getBoundingClientRect();
    sheet = { left: Math.round(r.left), top: Math.round(r.bottom) };
    open_menu = null;
    if (dim) sheet_open.add(dim);
    focus_to = 'sheet';
    paint();
  }
  function closeSheet() {
    if (!sheet) return;
    sheet = null;
    focus_to = 'filters';
    paint();
  }

  /** One removable chip per active dimension: body opens it, the x clears it. */
  function activeChips() {
    const cur = f();
    const chips = p.dims
      .filter((d) => cur[d].length)
      .map((d) => {
        const vals = /** @type {string[]} */ (cur[d]);
        const text =
          t3('u3_tk_' + d) +
          ': ' +
          valueLabel(d, vals[0]) +
          (vals.length > 1 ? ` +${vals.length - 1}` : '');
        return html`<span class="u3t-ac" data-dim=${d}>
          <button
            type="button"
            class="u3t-ac__b"
            @click=${(/** @type {Event} */ e) =>
              openSheet(d, /** @type {HTMLElement} */ (e.currentTarget))}
          >
            ${text}
          </button>
          <button
            type="button"
            class="u3t-ac__x"
            data-remove=${d}
            aria-label=${t3('u3_tk_remove') + ': ' + t3('u3_tk_' + d)}
            @click=${() => clearDim(d)}
          >
            ${icon('a_close', { size: 14 })}
          </button>
        </span>`;
      });
    if (!chips.length) return '';
    return html`<div
      class="u3t-active"
      role="toolbar"
      aria-label=${t3('u3_tk_filters')}
    >
      ${chips}
      <button
        type="button"
        class="u3t-fchip u3t-fchip--clear"
        data-testid="chips-clear-all"
        @click=${clearAll}
      >
        ${t3('u3_tk_clear_all')}
      </button>
    </div>`;
  }

  function template() {
    const cur = f();
    const urgent = cur.prio.includes('0') && cur.prio.includes('1');
    const n_active = p.dims.filter((d) => cur[d].length).length;
    const options = [
      ...new Set([
        ...p.projects(),
        ...cur.project,
        ...p.items().map((i) => p.ctx.project?.(i) || '')
      ])
    ]
      .filter(Boolean)
      .sort();
    const projectMenu =
      options.length > 1 || cur.project.length
        ? filterMenu({
            name: 'project',
            icon: 'project',
            title: t3('u3_tk_project'),
            any: t3('u3_tk_all'),
            options: options.map((v) => ({
              value: v,
              label: v,
              icon: 'project',
              project: v
            })),
            selected: cur.project,
            multi: true,
            open: open_menu,
            setOpen: (o) => {
              open_menu = o;
              focus_to = o ? 'opt' : 'project';
              paint();
            },
            pick: (v) => (v ? toggleValue('project', v) : clearDim('project'))
          })
        : '';
    return html`<div class="u3t-bar">
        <input
          class="u3t-search"
          type="search"
          dir="auto"
          autocomplete="off"
          maxlength="200"
          placeholder=${t3('u3_tk_search')}
          aria-label=${t3('u3_tk_search')}
          .value=${cur.search}
          @input=${(/** @type {Event} */ ev) => {
            const v = /** @type {HTMLInputElement} */ (ev.target).value;
            if (q_timer) clearTimeout(q_timer);
            q_timer = setTimeout(() => p.filter.set({ search: v }), 120);
          }}
        />
        <button
          type="button"
          class="u3t-fbtn"
          data-testid="filters-btn"
          aria-haspopup="dialog"
          aria-expanded=${sheet ? 'true' : 'false'}
          data-on=${n_active ? '1' : '0'}
          @click=${(/** @type {Event} */ e) =>
            sheet
              ? closeSheet()
              : openSheet('', /** @type {HTMLElement} */ (e.currentTarget))}
        >
          ${icon('f_filter', { size: 16 })}<span>${t3(
            'u3_tk_filters'
          )}</span>${n_active
            ? html`<b class="u3t-fbtn__n">${n_active}</b>`
            : ''}
        </button>
        <div class="u3t-filters" role="group" aria-label=${t3('u3_tk_filters')}>
          <button
            type="button"
            class="u3t-fchip"
            data-quick="u3_tk_p01"
            aria-pressed=${urgent ? 'true' : 'false'}
            @click=${() =>
              p.filter.set({
                prio: urgent
                  ? cur.prio.filter(
                      (/** @type {string} */ x) => x !== '0' && x !== '1'
                    )
                  : [...new Set([...cur.prio, '0', '1'])]
              })}
          >
            ${icon('urgent', { size: 16 })}${t3('u3_tk_p01')}
          </button>
          ${projectMenu}
        </div>
      </div>
      ${activeChips()}
      ${sheet
        ? filterSheet({
            sections: sections(),
            selected: /** @type {any} */ (cur),
            expanded: sheet_open,
            find: sheet_find,
            anchor: sheet,
            toggle: toggleValue,
            clearDim,
            clearAll,
            toggleSection: (d) => {
              if (sheet_open.has(d)) sheet_open.delete(d);
              else sheet_open.add(d);
              paint();
            },
            setFind: (d, q) => {
              sheet_find[d] = q;
              paint();
            },
            close: closeSheet
          })
        : ''}`;
  }

  function paint() {
    render(template(), p.host);
    const pop = /** @type {HTMLElement | null} */ (
      p.host.querySelector('.u3t-pop')
    );
    if (pop && open_menu) {
      const w = pop.getBoundingClientRect().width;
      pop.style.left =
        Math.max(8, Math.min(open_menu.left, window.innerWidth - w - 8)) + 'px';
    }
    const sh = /** @type {HTMLElement | null} */ (
      p.host.querySelector('.u3t-sh')
    );
    if (sh && sheet && !phone()) {
      const w = sh.getBoundingClientRect().width;
      sh.style.left =
        Math.max(8, Math.min(sheet.left, window.innerWidth - w - 8)) + 'px';
    }
    if (!focus_to) return;
    const t = focus_to;
    focus_to = '';
    const target =
      t === 'sheet'
        ? p.host.querySelector('.u3t-sh__hb')
        : t === 'filters'
          ? p.host.querySelector('[data-testid="filters-btn"]')
          : t === 'opt'
            ? p.host.querySelector(
                '.u3t-opt[aria-selected="true"]:not([data-v=""])'
              ) || p.host.querySelector('.u3t-opt')
            : p.host.querySelector(`.u3t-menu[data-name="${t}"]`);
    /** @type {HTMLElement | null} */ (target)?.focus();
  }

  const onDoc = (/** @type {Event} */ ev) => {
    if (sheet && ev.type === 'keydown') {
      const k = /** @type {KeyboardEvent} */ (ev);
      if (k.key === 'Escape') {
        closeSheet();
        return;
      }
      if (k.key === 'Tab') {
        const box = p.host.querySelector('.u3t-sh');
        const list = /** @type {HTMLElement[]} */ (
          Array.from(box ? box.querySelectorAll('button, input') : [])
        );
        if (list.length) {
          const at = list.indexOf(
            /** @type {HTMLElement} */ (document.activeElement)
          );
          const next = k.shiftKey
            ? at <= 0
              ? list.length - 1
              : at - 1
            : at < 0 || at === list.length - 1
              ? 0
              : at + 1;
          k.preventDefault();
          list[next].focus();
        }
        return;
      }
    }
    if (!open_menu) return;
    if (
      ev.type === 'keydown'
        ? /** @type {KeyboardEvent} */ (ev).key !== 'Escape'
        : /** @type {HTMLElement} */ (ev.target).closest?.('.u3t-menu-w')
    ) {
      return;
    }
    if (ev.type === 'keydown') focus_to = open_menu.name;
    open_menu = null;
    paint();
  };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onDoc);

  return {
    paint,
    /** The chips alone, for the "nothing matches" state. */
    chips: activeChips,
    clearAll,
    destroy() {
      if (q_timer) clearTimeout(q_timer);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onDoc);
      render(html``, p.host);
    }
  };
}
