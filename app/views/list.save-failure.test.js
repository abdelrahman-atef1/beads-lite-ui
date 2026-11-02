import { render } from 'lit-html';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WebSocketServer } from 'ws';
import { handleMessage } from '../../server/ws.js';
import { createDataLayer } from '../data/providers.js';
import { createWsClient } from '../ws.js';
import { createIssueRowRenderer } from './issue-row.js';
import { createNewIssueDialog } from './new-issue-dialog.js';

// REAL transport: the real app ws client talks over a real socket to a real
// WebSocketServer running the server's handleMessage. bd is a binary that does
// not exist, so every accepted write fails with a server-side reason
// (company-1bo5.6.40.1). The oversize cases are refused by the server itself.

globalThis.process.env.BD_BIN = 'no-such-bd-binary-for-test';

/** @type {WebSocketServer} */
let wss;
/** @type {any} */
let client;

beforeAll(async () => {
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  wss.on('connection', (sock) => {
    sock.on('message', (d) => {
      void handleMessage(/** @type {any} */ (sock), d);
    });
  });
  await new Promise((r) => wss.once('listening', r));
  const port = /** @type {any} */ (wss.address()).port;
  client = createWsClient({ url: `ws://127.0.0.1:${port}/ws` });
  await new Promise((r) => setTimeout(r, 300));
});
afterAll(() => {
  client?.close();
  wss?.close();
});

const toastText = () =>
  Array.from(document.querySelectorAll('.toast, [class*="toast"]'))
    .map((e) => e.textContent)
    .join('|');

function mountRow(onUpdate) {
  document.body.innerHTML = '<table><tbody id="t"></tbody></table>';
  const t = /** @type {HTMLElement} */ (document.getElementById('t'));
  /** @type {() => void} */
  let again = () => {};
  const row = createIssueRowRenderer({
    navigate() {},
    onUpdate,
    requestRender: () => again(),
    getSelectedId: () => null
  });
  const item = {
    id: 'UI-1',
    title: 'T',
    status: 'open',
    priority: 2,
    issue_type: 'task'
  };
  again = () => render(row(/** @type {any} */ (item)), t);
  again();
  return t;
}

describe('list/epics inline edit failure over the real transport', () => {
  test('priority change: reason toasted, select reverted', async () => {
    const data = createDataLayer((t, p) => client.send(t, p));
    const t = mountRow((id, patch) => data.updateIssue({ id, ...patch }));
    const sel = /** @type {HTMLSelectElement} */ (
      t.querySelector('select.badge--priority')
    );
    sel.value = '0';
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 800));
    expect(toastText()).toContain('Failed to save priority: ');
    expect(toastText().length).toBeGreaterThan(
      'Failed to save priority: '.length + 3
    );
    expect(
      /** @type {HTMLSelectElement} */ (
        t.querySelector('select.badge--priority')
      ).value
    ).toBe('2');
  });

  test('title edit too long: reason shown, input keeps text', async () => {
    const data = createDataLayer((t, p) => client.send(t, p));
    const t = mountRow((id, patch) => data.updateIssue({ id, ...patch }));
    /** @type {HTMLElement} */ (t.querySelector('.editable')).click();
    const input = /** @type {HTMLInputElement} */ (
      t.querySelector('input.inline-edit')
    );
    input.value = 'x'.repeat(30000);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 800));
    expect(toastText()).toContain('text too long (');
    const again = /** @type {HTMLInputElement} */ (
      t.querySelector('input.inline-edit')
    );
    expect(again).not.toBeNull();
    expect(again.value.length).toBe(30000);
  });
});

describe('server limit message', () => {
  test('description is capped at 200000 chars, not the args cap', async () => {
    await expect(
      client.send('edit-text', {
        id: 'UI-1',
        field: 'description',
        value: 'y'.repeat(210000)
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('limit 200000')
    });
    await expect(
      client.send('edit-text', {
        id: 'UI-1',
        field: 'notes',
        value: 'y'.repeat(30000)
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('limit 24000')
    });
  });
});

describe('new-issue form over the real transport', () => {
  test('shows the server reason and keeps the typed text', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const m = /** @type {HTMLElement} */ (document.getElementById('m'));
    const dlg = createNewIssueDialog(
      m,
      (t, p) => client.send(t, p),
      /** @type {any} */ ({ gotoIssue() {} }),
      /** @type {any} */ ({ getState: () => ({}), setState() {} })
    );
    dlg.open();
    const title = /** @type {HTMLInputElement} */ (
      m.ownerDocument.querySelector('#new-title')
    );
    title.value = 'z'.repeat(30000);
    const form = /** @type {HTMLFormElement} */ (
      m.ownerDocument.querySelector('form')
    );
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true })
    );
    await new Promise((r) => setTimeout(r, 800));
    const err = m.ownerDocument.body.textContent || '';
    expect(err).toContain('Failed to create issue: ');
    expect(err).toMatch(/text too long|spawn|ENOENT|bd/i);
    expect(title.value.length).toBe(30000);
  });
});
