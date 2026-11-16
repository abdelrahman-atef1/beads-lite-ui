// @vitest-environment jsdom
import { render } from 'lit-html';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { STATUSES } from '../protocol.js';
import {
  priorityIconName,
  priorityVal,
  statusIconName,
  statusVal,
  typeIconName,
  typeVal
} from './components/vicon.js';
import {
  PROJECT_ICONS,
  projectIcon,
  projectLabel
} from './data/project-icons.js';
import { ICON_IDS, icon, iconTone } from './icons.js';

const HERE = join(process.cwd(), 'app', 'ui');
const APP = join(HERE, '..');

/** @param {any} tpl */
function draw(tpl) {
  const el = document.createElement('div');
  render(tpl, el);
  return el;
}

describe('icon set C', () => {
  test('every icon draws an inline svg with a tone, no fetch', () => {
    expect(ICON_IDS.length).toBeGreaterThanOrEqual(75);
    for (const id of ICON_IDS) {
      const el = draw(icon(id, { size: 16, tile: true }));
      expect(
        el.querySelector('svg path, svg circle, svg rect'),
        id
      ).toBeTruthy();
      expect(iconTone(id)).toMatch(/^(blue|amber|teal|red|green|purple|grey)$/);
      expect(el.querySelector('img, use[href]'), id).toBeNull();
    }
  });

  test('old chip and panel names resolve to the same library', () => {
    for (const n of [
      'select',
      'mine',
      'caret',
      'bell',
      'outputs',
      'report',
      'bug'
    ]) {
      const el = draw(icon(n));
      expect(
        el.querySelector('[data-icon]')?.getAttribute('data-icon')
      ).not.toBe('more');
    }
  });

  test('no emoji and no stock icon set left in the v3 source', () => {
    const bad = /[\u{1F300}-\u{1FAFF}☀-➿]/u;
    /** @param {string} d @returns {string[]} */
    const walk = (d) =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory()
          ? walk(p)
          : p.endsWith('.js') && !p.endsWith('.test.js')
            ? [p]
            : [];
      });
    for (const f of walk(HERE)) {
      expect(bad.test(readFileSync(f, 'utf8')), f).toBe(false);
    }
  });
});

describe('status, priority and type: a distinct icon per value (13.9)', () => {
  test('statuses', () => {
    const names = STATUSES.map(statusIconName);
    expect(new Set(names).size).toBe(STATUSES.length);
    for (const s of STATUSES) {
      const el = draw(statusVal(s));
      expect(el.querySelector('.u3-ic svg')).toBeTruthy();
      expect(
        el.querySelector('.u3-val__t')?.textContent?.length
      ).toBeGreaterThan(0);
    }
  });
  test('priorities 0-4', () => {
    const names = [0, 1, 2, 3, 4].map(priorityIconName);
    expect(new Set(names).size).toBe(5);
    const el = draw(priorityVal(0));
    expect(el.querySelector('[data-icon="p_urgent"]')).toBeTruthy();
    expect(el.textContent).toMatch(/Critical|حرجة/);
  });
  test('types, unknown falls back, icon-only keeps the text for readers', () => {
    const names = ['bug', 'feature', 'task', 'epic', 'story', 'chore'].map(
      typeIconName
    );
    expect(new Set(names).size).toBe(6);
    expect(typeIconName('weird')).toBe('f_type');
    const el = draw(typeVal('bug', { iconOnly: true }));
    expect(el.querySelector('.u3-val--icon .u3-val__t')?.textContent).toBe(
      'bug'
    );
  });
});

describe('project icons (13.6)', () => {
  test('every registered file exists and stays small', () => {
    for (const [k, f] of Object.entries(PROJECT_ICONS)) {
      const p = join(APP, 'icons', 'projects', f);
      expect(existsSync(p), k).toBe(true);
      expect(statSync(p).size, k).toBeLessThanOrEqual(8192);
    }
  });
  test('registered project shows its image, unknown shows the dot', () => {
    const a = draw(projectLabel('rayeh'));
    expect(a.querySelector('img.u3-proj__img')?.getAttribute('src')).toContain(
      'projects/rayeh.png'
    );
    expect(a.textContent).toContain('rayeh');
    const b = draw(projectLabel('company'));
    expect(b.querySelector('img')).toBeNull();
    expect(b.querySelector('.u3-dot')).toBeTruthy();
    expect(b.textContent).toContain('company');
  });
  test('a broken image falls back to the dot', () => {
    const el = draw(projectIcon('fatura'));
    el.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.u3-dot')).toBeTruthy();
  });
});
