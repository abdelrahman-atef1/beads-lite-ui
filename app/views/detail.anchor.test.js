import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

const comments = [
  {
    id: 'aaaaaaaa-1',
    author: 'a',
    text: 'old one',
    created_at: '2025-01-01T00:00:00Z'
  },
  {
    id: 'bbbbbbbb-2',
    author: 'b',
    text: 'mid\nsecond line here',
    created_at: '2025-01-02T00:00:00Z'
  },
  {
    id: 'cccccccc-3',
    author: 'c',
    text: 'newest',
    created_at: '2025-01-03T00:00:00Z'
  }
];

async function open(hash) {
  window.location.hash = hash;
  document.body.innerHTML =
    '<section class="panel"><div id="mount"></div></section>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issue = {
    id: 'UI-7',
    title: 't',
    description: 'line one\n\n- alpha item\n- beta item',
    design: 'the design',
    dependencies: [],
    dependents: [],
    comments
  };
  const stores = {
    snapshotFor: (/** @type {string} */ id) =>
      id === 'detail:UI-7' ? [issue] : [],
    subscribe: () => () => {}
  };
  const view = createDetailView(mount, async () => ({}), undefined, stores);
  await view.load('UI-7');
  return { mount, view };
}

describe('detail deep-link anchors', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  afterEach(() => {
    scroll.mockClear();
    window.location.hash = '';
  });

  test('comments are newest first and carry a permalink', async () => {
    const { mount } = await open('#/issues?issue=UI-7');
    const items = [...mount.querySelectorAll('.comment-item')];
    expect(items.map((i) => i.getAttribute('data-anchor'))).toEqual([
      'c-cccccccc',
      'c-bbbbbbbb',
      'c-aaaaaaaa'
    ]);
    expect(items[0].querySelector('a.comment-link')?.getAttribute('href')).toBe(
      '#/issues?issue=UI-7&at=c-cccccccc'
    );
    expect(mount.querySelector('.anchor-hit')).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  test('at=<comment> scrolls to and highlights it', async () => {
    const { mount } = await open('#/issues?issue=UI-7&at=c-bbbbbbbb');
    const hit = mount.querySelectorAll('.anchor-hit');
    expect(hit.length).toBe(1);
    expect(hit[0].getAttribute('data-anchor')).toBe('c-bbbbbbbb');
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  test('at=c-last and at=design', async () => {
    let r = await open('#/issues?issue=UI-7&at=c-last');
    expect(
      r.mount.querySelector('.anchor-hit')?.getAttribute('data-anchor')
    ).toBe('c-cccccccc');
    r = await open('#/issues?issue=UI-7&at=design');
    expect(
      r.mount.querySelector('.anchor-hit')?.getAttribute('data-anchor')
    ).toBe('design');
  });

  test('line anchor highlights the matching rendered line', async () => {
    const { mount } = await open('#/issues?issue=UI-7&at=description.L4');
    const hit = mount.querySelector('.anchor-hit');
    expect(hit?.tagName).toBe('LI');
    expect(hit?.textContent).toContain('beta');
    const c = await open('#/issues?issue=UI-7&at=c-bbbbbbbb.L2');
    expect(c.mount.querySelector('.anchor-hit')?.textContent).toContain(
      'second line here'
    );
  });

  test('unknown comment does nothing and does not break', async () => {
    const { mount } = await open('#/issues?issue=UI-7&at=c-ffffff');
    expect(mount.querySelector('.anchor-hit')).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });
});
