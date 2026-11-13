import { html, render } from 'lit-html';
import {
  button,
  card,
  chip,
  listRow,
  openSheet,
  roleChip,
  tabBar
} from '../components/index.js';

/**
 * Test page for the primitives (#/ui-kit). Every variant on one screen so a
 * headless run can screenshot it at 390 and 1440, dark and light.
 *
 * @param {HTMLElement} el
 */
export function mount(el) {
  const sheet = () =>
    openSheet(el, {
      title: 'Sheet',
      closeLabel: 'Close',
      body: html`<p dir="auto">نص داخل الورقة السفلية - sheet body</p>`
    });
  render(
    html`<section class="u3-kit" data-view="kit">
      <h2>Buttons</h2>
      <div class="u3-kit__row">
        ${button({ label: 'نعم (مقترح)' })}
        ${button({ label: 'مش دلوقتي', variant: 'ghost' })}
        ${button({ label: 'افتح الخطوات', variant: 'steps' })}
        ${button({ label: 'Delete', variant: 'danger' })}
        ${button({ label: 'Disabled', disabled: true })}
        ${button({ label: 'افتح الورقة', variant: 'ghost', onClick: sheet })}
      </div>
      <h2>Chips</h2>
      <div class="u3-kit__row">
        ${chip({ label: 'beads-lite' })}
        ${chip({ label: 'fatura', tone: 'amber' })}
        ${chip({ label: '1 خطوات', tone: 'teal' })}
        ${chip({ label: '12 شغالة', tone: 'blue' })}
        ${chip({ label: 'blocked', tone: 'red' })}
        ${chip({ label: 'ready', tone: 'green' })}
        ${chip({ label: 'beads-lite-1bo5.6.59.2', mono: true })}
      </div>
      <h2>Roles</h2>
      <div class="u3-kit__row">
        ${['cto', 'swe', 'sre', 'sec', 'pm', 'ux', 'qa', 'x'].map((r) =>
          roleChip({ role: r })
        )}
      </div>
      <h2>Cards</h2>
      <div class="u3-kit__cards">
        ${card({
          accent: 'amber',
          head: chip({ label: 'fatura', tone: 'amber' }),
          body: html`<p dir="auto">
            تنشئ حساب Cloudflare المجاني وننشر نسخة فاتورة الويب؟
          </p>`,
          foot: button({ label: 'افتح المهمة', variant: 'ghost' })
        })}
        ${card({
          accent: 'teal',
          body: html`<p dir="auto">خطوات مطلوبة منك</p>`,
          foot: button({ label: 'افتح الخطوات', variant: 'steps', block: true })
        })}
        ${card({
          accent: 'none',
          body: html`<p dir="auto">Plain task card</p>`
        })}
      </div>
      <h2>List rows</h2>
      <div class="u3-kit__list">
        ${listRow({
          title: 'اللوحة بترجع لوحدها',
          dot: 'green',
          meta: roleChip({ role: 'sre' }),
          end: '9:25 م'
        })}
        ${listRow({
          title: 'Claude Files design',
          dot: 'purple',
          meta: roleChip({ role: 'cto' }),
          end: '9:30 م'
        })}
      </div>
      <h2>Tab bar</h2>
      <div class="u3-kit__tabs">
        ${tabBar({
          active: 'desk',
          items: [
            { name: 'desk', label: 'المكتب', hash: '#/ui-kit' },
            { name: 'tasks', label: 'المهام', hash: '#/ui-kit' },
            { name: 'releases', label: 'الإصدارات', hash: '#/ui-kit' },
            { name: 'more', label: 'المزيد', hash: '#/ui-kit' }
          ]
        })}
      </div>
    </section>`,
    el
  );
  return { unmount: () => render(html``, el) };
}
