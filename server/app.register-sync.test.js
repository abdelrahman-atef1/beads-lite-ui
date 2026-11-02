import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const sync = vi.fn();
vi.mock('./features/notifier.js', async (orig) => ({
  .../** @type {any} */ (await orig()),
  syncNotifier: () => sync()
}));

const { createApp } = await import('./app.js');
const { getConfig } = await import('./config.js');

/** @type {import('node:http').Server} */
let srv;
let port = 0;
beforeAll(async () => {
  srv = createServer(createApp(getConfig()));
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  port = /** @type {any} */ (srv.address()).port;
});
afterAll(() => srv.close());

/** @param {unknown} body */
const post = (body) =>
  fetch(`http://127.0.0.1:${port}/api/register-workspace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

describe('register-workspace', () => {
  test('a project registered after start wakes the notifier (company-1bo5.6.14)', async () => {
    const res = await post({ path: 'C:/p/late', database: 'C:/p/late/.beads' });
    expect(res.status).toBe(200);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('a rejected registration does not', async () => {
    sync.mockClear();
    const res = await post({ path: 5 });
    expect(res.status).toBe(400);
    expect(sync).not.toHaveBeenCalled();
  });
});
