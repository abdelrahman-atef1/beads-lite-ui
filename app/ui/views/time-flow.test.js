import { render } from 'lit-html';
import { afterEach, describe, expect, test } from 'vitest';
import { fixtureDigest } from '../data/flow-digest-fixture.js';
import { loadDigest, verdictKey } from '../data/flow-digest.js';
import { digestCard, withLinks } from './time-digest.js';
import { expDetail, expSection } from './time-exp.js';
import { mount } from './time-screen.js';

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (/** @type {Element} */ el) =>
  (el.textContent || '').replace(/\s+/g, ' ');
const fx = fixtureDigest(NOW);
/** @param {string} slug */
const byslug = (slug) => fx.exps.find((e) => e.slug === slug);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('verdict pill', () => {
  test('the script verdict stands; confounded and too-few are named apart', () => {
    expect(verdictKey(byslug('sre-weekly-batch'))).toBe('adopt');
    expect(verdictKey(byslug('swe-bug-template'))).toBe('rollback');
    expect(verdictKey(byslug('sre-short-briefs'))).toBe('extend');
    expect(verdictKey(byslug('qa-checklist'))).toBe('few');
    expect(verdictKey(byslug('cto-model-swap'))).toBe('confounded');
    expect(verdictKey(byslug('cto-old-run'))).toBe('inconclusive');
  });
  test('every verdict renders its own words', () => {
    /** @type {Record<string, string>} */
    const want = {
      'sre-weekly-batch': 'ADOPT',
      'swe-bug-template': 'ROLL BACK',
      'sre-short-briefs': 'EXTEND',
      'qa-checklist': 'too few to tell',
      'cto-model-swap': 'confounded',
      'cto-old-run': 'inconclusive'
    };
    for (const [slug, label] of Object.entries(want)) {
      const el = document.createElement('div');
      render(expDetail(byslug(slug)), el);
      expect(el.querySelector('.u3-ex__pill')?.textContent?.trim()).toBe(label);
    }
  });
});

describe('experiment detail', () => {
  test('arms show n, the time median AND the quality counters of both arms', () => {
    const el = document.createElement('div');
    render(expDetail(byslug('sre-weekly-batch')), el);
    const arms = el.querySelectorAll('.u3-ex__arm');
    expect(arms.length).toBe(2);
    const before = text(arms[0]);
    const during = text(arms[1]);
    expect(before).toContain('113');
    expect(before).toContain('1h 2m');
    expect(during).toContain('27');
    expect(during).toContain('10m');
    // four quality counters in each arm, next to the time
    for (const arm of Array.from(arms)) {
      expect(arm.querySelectorAll('.u3-ex__arm-q li').length).toBe(4);
    }
    expect(el.querySelectorAll('.u3-ex__g').length).toBe(4);
  });
  test('a roll back shows which guardrail got worse', () => {
    const el = document.createElement('div');
    render(expDetail(byslug('swe-bug-template')), el);
    expect(text(el.querySelector('[data-guard=qaFail]') || el)).toContain(
      '1% → 11%'
    );
    expect(text(el.querySelector('[data-guard=qaFail]') || el)).toContain(
      'worse'
    );
    expect(text(el)).toContain('guardrail worse than baseline');
  });
  test('too few to tell: unknown time is "unknown", not 0 or a verdict', () => {
    const el = document.createElement('div');
    render(expDetail(byslug('qa-checklist')), el);
    expect(text(el.querySelector('.u3-ex__arm--during') || el)).toContain(
      'not recorded'
    );
    expect(text(el)).toContain('too few to tell');
    expect(text(el)).toContain('not enough data');
  });
  test('confounded names what else changed', () => {
    const el = document.createElement('div');
    render(expDetail(byslug('cto-model-swap')), el);
    expect(text(el.querySelector('.u3-ex__conf') || el)).toContain('model');
  });
  test('computed by script; no adopt, roll back or new-experiment button, no input', () => {
    const el = document.createElement('div');
    render(
      expSection(fx.exps, '', () => {}),
      el
    );
    expect(text(el)).toContain('Computed by script');
    expect(el.querySelector('input, textarea, select')).toBeNull();
    // the only buttons are the list items
    const labels = Array.from(el.querySelectorAll('button')).map((b) =>
      text(b)
    );
    expect(labels.length).toBe(fx.exps.length);
    for (const l of labels) expect(l).not.toMatch(/adopt now|new experiment/i);
  });
  test('list: the picked experiment is shown, the first by default', () => {
    const el = document.createElement('div');
    /** @type {string[]} */
    const picked = [];
    const draw = (/** @type {string} */ open) =>
      render(
        expSection(fx.exps, open, (s) => picked.push(s)),
        el
      );
    draw('');
    expect(el.querySelector('.u3-ex__detail')?.getAttribute('data-slug')).toBe(
      fx.exps[0].slug
    );
    draw('swe-bug-template');
    expect(el.querySelector('.u3-ex__detail')?.getAttribute('data-slug')).toBe(
      'swe-bug-template'
    );
    /** @type {HTMLElement} */ (
      el.querySelector('[data-slug=cto-old-run].u3-ex__item')
    ).click();
    expect(picked).toEqual(['cto-old-run']);
  });
  test('no experiments: an empty line', () => {
    const el = document.createElement('div');
    render(
      expSection([], '', () => {}),
      el
    );
    expect(text(el)).toContain('No experiments yet');
  });
});

describe('weekly digest card', () => {
  test('shows the five lines as written', () => {
    const el = document.createElement('div');
    render(digestCard(fx.digest), el);
    const lines = Array.from(el.querySelectorAll('.u3-wd__line'));
    expect(lines.length).toBe(5);
    expect(lines.map((l) => l.getAttribute('data-label'))).toEqual([
      'Title',
      'Done since last',
      'Next',
      'Needs you',
      'Risks'
    ]);
    expect(text(lines[0]).trim()).toBe(
      'Title: Flow 2026-W46: at risk (n=2318 closed in 4 weeks)'
    );
    expect(text(lines[4])).toContain(
      'swe bug: waiting median 41m to 4h09 (+511%), fails 6/238'
    );
  });
  test('a board bead link becomes a link; other markdown stays text', () => {
    const el = document.createElement('div');
    render(digestCard(fx.digest), el);
    const a = el.querySelector('.u3-wd__line a');
    expect(a?.textContent).toBe('Flow review 2026-W46');
    expect(a?.getAttribute('href')).toContain('abdelrahman.tail8a4e50.ts.net');
    const t = document.createElement('div');
    render(withLinks('see [x](https://evil.example/a) now'), t);
    expect(t.querySelector('a')).toBeNull();
    expect(text(t)).toContain('[x](https://evil.example/a)');
  });
  test('no digest: an empty line, no card lines', () => {
    const el = document.createElement('div');
    render(digestCard(null), el);
    expect(text(el)).toContain('No weekly digest yet');
    expect(el.querySelectorAll('.u3-wd__line').length).toBe(0);
  });
});

describe('adapter and screen', () => {
  test('a server without the handler or an error: the empty answer', async () => {
    expect(await loadDigest(undefined)).toEqual({ digest: null, exps: [] });
    expect(
      await loadDigest({
        send: async () => {
          throw new Error('unknown_type');
        }
      })
    ).toEqual({ digest: null, exps: [] });
    expect(
      await loadDigest({ send: async () => ({ present: false, rows: [] }) })
    ).toEqual({ digest: null, exps: [] });
  });
  test('the screen draws the digest card and the experiments beside the roles', async () => {
    /** @type {string[]} */
    const asked = [];
    const el = document.createElement('div');
    const h = mount(el, {
      client: {
        send: async (/** @type {string} */ t) => {
          asked.push(t);
          return t === 'flow-digest'
            ? { digest: fx.digest, exps: fx.exps }
            : { present: true, built_at: null, rows: [] };
        }
      }
    });
    await tick();
    expect(el.querySelectorAll('.u3-wd__line').length).toBe(5);
    expect(el.querySelectorAll('.u3-ex__item').length).toBe(fx.exps.length);
    // read once when the screen opens
    expect(asked.filter((t) => t === 'flow-digest').length).toBe(1);
    h.unmount();
  });
  test('the experiment arrives late: the roles are not blocked', async () => {
    const el = document.createElement('div');
    const h = mount(el, {
      client: {
        send: async (/** @type {string} */ t) => {
          if (t === 'flow-digest') throw new Error('x');
          return { present: true, built_at: null, rows: [] };
        }
      }
    });
    await tick();
    expect(text(el)).toContain('No tasks closed in this period');
    expect(text(el)).toContain('No experiments yet');
    h.unmount();
  });
});
