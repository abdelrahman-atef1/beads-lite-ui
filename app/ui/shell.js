/* eslint-disable no-unused-vars -- _ctx reserved for the shell contract */
import { html, render } from 'lit-html';
import { getLang, toggleLang } from '../utils/i18n.js';
import { openSheet, tabBar } from './components/index.js';
import { t3 } from './i18n.js';
import { icon } from './icons.js';
import { NAV, navFor } from './routes.js';

const THEME_KEY = 'beads-ui.theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event('bdui-theme'));
}

/**
 * The v3 shell: sidebar (PC) / bottom tabs (phone) around ONE main column.
 * The main column is its own grid track, so it can never sit under the
 * sidebar at any width. Views mount into shell.viewEl.
 *
 * @param {HTMLElement} root
 * @param {any} _ctx
 * @returns {{ viewEl: HTMLElement, setRoute: (r: any) => void, refresh: () => void }}
 */
export function createShell(root, _ctx) {
  /** @type {any} */
  let route = { name: 'desk' };

  const prefs = () => html`
    <button
      class="u3-btn u3-btn--ghost"
      type="button"
      data-act="lang"
      aria-label=${t3('u3_lang_label')}
      @click=${() => toggleLang()}
    >
      ${t3('u3_lang')}
    </button>
    <button
      class="u3-btn u3-btn--ghost"
      type="button"
      data-act="theme"
      aria-label=${t3('u3_theme')}
      @click=${() => toggleTheme()}
    >
      ${t3('u3_theme')}
    </button>
  `;

  const closeSheet = () =>
    root.querySelector('.u3-sheet__scrim')?.dispatchEvent(new Event('click'));

  const more = () =>
    openSheet(root, {
      title: t3('u3_more'),
      closeLabel: t3('u3_close'),
      body: html`<nav class="u3-more">
        <a class="u3-more__link" href="#/projects" @click=${closeSheet}
          >${icon('projects')} ${t3('u3_projects')}</a
        >
        <a class="u3-more__link" href="#/settings" @click=${closeSheet}
          >${icon('settings')} ${t3('u3_settings')}</a
        >
        <div class="u3-more__prefs">${prefs()}</div>
      </nav>`
    });

  function draw() {
    const active = navFor(route);
    const key = route.name === 'task' ? 'tasks' : route.name;
    const title = t3('u3_' + (key === 'ui-kit' ? 'settings' : key));
    render(
      html`<aside class="u3-side">
          <div class="u3-side__brand">${t3('u3_brand')}</div>
          <nav class="u3-side__nav" aria-label=${t3('u3_nav')}>
            ${NAV.map(
              (n) =>
                html`<a
                  class="u3-nav"
                  href=${n.hash}
                  aria-current=${n.name === active ? 'page' : 'false'}
                  >${icon(n.name)}<span>${t3('u3_' + n.name)}</span></a
                >`
            )}
          </nav>
          <div class="u3-side__foot">${prefs()}</div>
        </aside>
        <div class="u3-col">
          <header class="u3-top">
            <h1 class="u3-top__title">${title}</h1>
            <span class="u3-top__slot" data-slot="search"></span>
            <span class="u3-top__slot" data-slot="bell"></span>
          </header>
          <main class="u3-main" id="u3-main">
            <div class="u3-main__in" id="u3-view"></div>
          </main>
        </div>
        <div class="u3-tabbar">
          ${tabBar({
            active:
              active === 'projects' || active === 'settings' ? 'more' : active,
            label: t3('u3_nav'),
            items: [
              { name: 'desk', label: t3('u3_desk'), hash: '#/' },
              { name: 'tasks', label: t3('u3_tasks'), hash: '#/issues' },
              {
                name: 'releases',
                label: t3('u3_releases'),
                hash: '#/releases'
              },
              { name: 'more', label: t3('u3_more'), onClick: more }
            ]
          })}
        </div>`,
      root
    );
    root.setAttribute('dir', getLang() === 'ar' ? 'rtl' : 'ltr');
  }
  draw();
  window.addEventListener('bdui-lang', draw);
  const viewEl = /** @type {HTMLElement} */ (root.querySelector('#u3-view'));
  return {
    viewEl,
    setRoute(r) {
      route = r;
      draw();
    },
    refresh: draw
  };
}
