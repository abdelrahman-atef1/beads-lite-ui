// @ts-nocheck -- fixture-heavy view test
import { beforeEach, expect, test, vi } from 'vitest';
import { createDecisionsView } from './decisions.js';

const OK = 'company/2026-11/0123456789abcdef.png';
const meta = (att) => ({
  card_class: 'tap',
  card_q: 'Approve?',
  card_effect: 'e',
  card_show: 'the thing',
  card_lang: 'en',
  card_back: 'swe',
  card_opts: JSON.stringify([{ l: 'Yes', rec: true }, { l: 'No' }]),
  ...(att ? { card_att: att } : {})
});
const snap = (att) => ({
  items: [
    {
      id: 'a-1',
      title: 'a-1',
      priority: 2,
      updated_at: 1,
      project: { key: 'a', name: 'A' },
      sha: 's',
      metadata: meta(att)
    }
  ],
  projects: [{ key: 'a', name: 'A', count: 1 }],
  rules_ok: true
});

async function mount(snapshot) {
  document.body.innerHTML = '<div id="m"></div>';
  const m = document.getElementById('m');
  const feed = {
    send: vi.fn(async (t) => (t === 'list-decisions-all' ? snapshot : {})),
    on: () => () => {}
  };
  const view = createDecisionsView(m, () => {}, undefined, undefined, feed);
  await view.load();
  return m;
}

beforeEach(() => window.localStorage.clear());

test('legacy Decisions: thumbnails under the thing; non-/att/ items not drawn', async () => {
  const att = JSON.stringify([
    { a: OK, n: 'one' },
    { a: 'https://evil.example/x.png' }
  ]);
  const m = await mount(snap(att));
  const imgs = [...m.querySelectorAll('.att-strip img')];
  expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/att/' + OK]);
  expect(m.querySelector('a.att-strip__thumb').getAttribute('href')).toBe(
    '/att/' + OK
  );
});

test('legacy Decisions: no card_att, no strip', async () => {
  const m = await mount(snap(''));
  expect(m.querySelector('.att-strip')).toBeNull();
});
