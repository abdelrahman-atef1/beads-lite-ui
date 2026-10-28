import { afterEach, describe, expect, test } from 'vitest';
import { createHashRouter } from '../router.js';
import { createStore } from '../state.js';
import { linkifyHtml, setKnownIdFilter } from './linkify-ids.js';

afterEach(() => setKnownIdFilter(null));

describe('linkifyHtml', () => {
  test('links ids of any project prefix', () => {
    const out = linkifyHtml(
      '<p>see company-1bo5.6.28 and abduu-tasks-g3w, rayeh-12</p>'
    );
    expect(out).toContain('href="#/issues?issue=company-1bo5.6.28"');
    expect(out).toContain('href="#/issues?issue=abduu-tasks-g3w"');
    expect(out).toContain('href="#/issues?issue=rayeh-12"');
  });
  test('ignores plain words and existing links/code', () => {
    const out = linkifyHtml(
      '<p>end-to-end utf-8</p><a href="x">cod-12</a><code>cod-13</code>'
    );
    expect(out).not.toContain('bead-link');
  });
  test('known-prefix filter limits links', () => {
    setKnownIdFilter((id) => id.startsWith('cod-'));
    const out = linkifyHtml('cod-12 other-34');
    expect(out).toContain('issue=cod-12');
    expect(out).not.toContain('issue=other-34');
  });
});

describe('router history depth', () => {
  test('canGoBack after in-app navigation, not on first entry', () => {
    const store = createStore();
    window.location.hash = '#/issues';
    const router = createHashRouter(store);
    router.start();
    expect(router.canGoBack()).toBe(false);
    window.location.hash = '#/issues?issue=a-1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(router.canGoBack()).toBe(true);
    router.stop();
  });
});
