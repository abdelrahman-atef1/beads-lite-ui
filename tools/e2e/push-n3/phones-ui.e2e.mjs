// W6 on the PHONE door: the real bell view (app/views/notifications.js) in jsdom, with a client that fails
// push-list exactly the way the phone socket does (the real refusal shape is asserted in board.e2e W6k).
// Also: PC door shows the list; a refused Remove shows an honest error and the list stays. Company-1bo5.6.16.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { recorder } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const R = recorder('phones-ui');
const dom = new JSDOM('<!doctype html><html lang="en"><body><span id="slot"></span></body></html>', { pretendToBeVisual: true, url: 'http://127.0.0.1:3000/' });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'CustomEvent', 'Event']) Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
const { mountBell } = await import(pathToFileURL(path.join(ROOT, 'app/views/notifications.js')).href);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function run({ door, removeFails = false }) {
  document.body.innerHTML = '<span id="slot"></span>';
  let list = [{ id: 'aaaa', label: 'Android Chrome', created: '2026-11-01T10:00:00Z', last_ok: null }, { id: 'bbbb', label: '', created: '2026-11-02T10:00:00Z', last_ok: '2026-11-02T11:00:00Z' }];
  const calls = [];
  const client = {
    on: () => () => undefined,
    onConnection: () => () => undefined,
    send: async (t, p) => {
      calls.push(t);
      if (t === 'push-key') return { key: 'AQAB' };
      if (t === 'push-list') { if (door === 'phone') throw Object.assign(new Error('unknown or phone-forbidden type'), { code: 'bad_request' }); return { subscriptions: list }; }
      if (t === 'push-remove') { if (removeFails) throw new Error('boom'); list = list.filter((x) => x.id !== p.id); return { ok: true }; }
      return { events: [], unread: 0, projects: [], mute_until: null };
    }
  };
  const env = { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null, subscribe: async () => null } }) }, Notification: { permission: 'default', requestPermission: async () => 'granted' }, PushManager: {} };
  mountBell(document.getElementById('slot'), { client, pushEnv: env });
  await tick(); document.querySelector('button')?.click(); await tick(50); await tick(50);
  return { calls, rows: () => [...document.querySelectorAll('.nt-phone')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()), rm: () => [...document.querySelectorAll('.nt-phone-rm')], text: () => document.body.textContent };
}

{
  const ui = await run({ door: 'phone' });
  R.check('W6w', 'If the list call is refused (e.g. a door that forbids it) -> no Phones list, no Remove button, no error text, the Turn on row still shows', ui.calls.includes('push-list') && ui.rows().length === 0 && ui.rm().length === 0 && !/Remove|Phones/.test(ui.text()) && /Turn on for this phone/.test(ui.text()), JSON.stringify({ calls: ui.calls, rows: ui.rows() }));
}
{
  const ui = await run({ door: 'pc' });
  const rows = ui.rows();
  R.check('W6x', 'PC door: two phones listed (label or "Phone" fallback + a date), each with Remove', rows.length === 2 && /Android Chrome 2026-11-01/.test(rows[0]) && /^Phone 2026-11-02/.test(rows[1]) && ui.rm().length === 2, JSON.stringify(rows));
  ui.rm()[0].click(); await tick(50); await tick(50);
  R.check('W6y', 'PC door: Remove asks the board for push-remove with that id only, then the list shows the other phone', ui.calls.filter((c) => c === 'push-remove').length === 1 && ui.rows().length === 1 && /^Phone/.test(ui.rows()[0]), JSON.stringify({ calls: ui.calls, rows: ui.rows() }));
}
{
  const ui = await run({ door: 'pc', removeFails: true });
  ui.rm()[0].click(); await tick(50); await tick(50);
  R.check('W6z', 'PC door: a failed Remove keeps both rows listed and says so (no silent success)', ui.rows().length === 2 && /Could not change the phone alerts. Try again./.test(ui.text()), JSON.stringify({ rows: ui.rows(), text: ui.text().slice(0, 300) }));
}
R.save();
