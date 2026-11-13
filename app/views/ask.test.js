import { beforeEach, describe, expect, test, vi } from 'vitest';
import { setAskProject } from '../utils/ask-context.js';
import { errorKey, mountAsk, splitAnswer, submitAsk } from './ask.js';

const issue = { id: 'demo-1', title: 'A task' };

/** @param {any} body @param {number} [status] */
const reply = (body, status = 200, headers = {}) => ({
  ok: status < 300,
  status,
  headers: {
    get: (/** @type {string} */ k) => /** @type {any} */ (headers)[k] ?? null
  },
  json: async () => body
});

/** @param {any} f */
function setup(f) {
  document.body.innerHTML =
    '<meta name="board-token" content="TOK"><div id="s"></div>';
  const el = /** @type {HTMLElement} */ (document.getElementById('s'));
  mountAsk(el, issue, { fetch: f });
  const q = (/** @type {string} */ s) =>
    /** @type {any} */ (el.querySelector(s));
  return { el, q };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setAskProject('E:/Projects/Demo/');
});

describe('ask view', () => {
  test('head exists with a label; box is closed until tapped', () => {
    const { q } = setup(vi.fn());
    expect(q('.ask-head').getAttribute('aria-label')).toBeTruthy();
    expect(q('.ask-box').hidden).toBe(true);
    q('.ask-head').click();
    expect(q('.ask-box').hidden).toBe(false);
    expect(q('.ask-ctx').textContent).toContain('demo-1');
  });

  test('no request before Send; empty send is blocked with a hint', async () => {
    const f = vi.fn();
    const { q } = setup(f);
    q('.ask-head').click();
    q('.ask-send').click();
    expect(f).not.toHaveBeenCalled();
    expect(q('.ask-hint').textContent).not.toBe('');
    expect(q('.ask-ta').classList.contains('ask-bad')).toBe(true);
  });

  test('sends project key, id and question with the token; shows answer as text (B9)', async () => {
    const f = vi.fn(async () =>
      reply({
        ok: true,
        answer: '<img src=x onerror=alert(1)>\n\nsecond',
        truncated: false
      })
    );
    const { q, el } = setup(f);
    q('.ask-head').click();
    q('.ask-ta').value = 'what?';
    q('.ask-send').click();
    await tick();
    await tick();
    const [url, init] = /** @type {any} */ (f.mock.calls[0]);
    expect(url).toBe('/api/ask');
    expect(init.headers['x-board-token']).toBe('TOK');
    expect(JSON.parse(init.body)).toEqual({
      project: 'demo',
      id: 'demo-1',
      question: 'what?'
    });
    expect(el.querySelector('.ask-answer img')).toBeNull();
    expect(q('.ask-answer').textContent).toContain(
      '<img src=x onerror=alert(1)>'
    );
    expect(q('.ask-answer').children.length).toBe(2);
    expect(q('.ask-new, .ask-primary').textContent).toBeTruthy();
  });

  test('error keeps the question and shows its own text; Retry is shown', async () => {
    const f = vi.fn(async () =>
      reply({ ok: false, error: 'claude_signed_out' }, 503)
    );
    const { q } = setup(f);
    q('.ask-head').click();
    q('.ask-ta').value = 'keep me';
    q('.ask-send').click();
    await tick();
    await tick();
    expect(q('.ask-banner').hidden).toBe(false);
    expect(q('.ask-banner').textContent.length).toBeGreaterThan(10);
    expect(q('.ask-ta').value).toBe('keep me');
    expect(q('.ask-retry').hidden).toBe(false);
  });

  test('network failure is the offline banner', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const { q } = setup(f);
    q('.ask-head').click();
    q('.ask-ta').value = 'x';
    q('.ask-send').click();
    await tick();
    await tick();
    expect(q('.ask-banner').hidden).toBe(false);
  });

  test('closing while waiting aborts the request', async () => {
    /** @type {AbortSignal | undefined} */
    let sig;
    const f = vi.fn(
      (/** @type {string} */ _u, /** @type {any} */ init) =>
        new Promise((_ok, bad) => {
          sig = init.signal;
          init.signal.addEventListener('abort', () =>
            bad(Object.assign(new Error('a'), { name: 'AbortError' }))
          );
        })
    );
    const { q } = setup(f);
    q('.ask-head').click();
    q('.ask-ta').value = 'x';
    q('.ask-send').click();
    await tick();
    expect(q('.ask-waitrow').hidden).toBe(false);
    q('.ask-x').click();
    expect(sig?.aborted).toBe(true);
  });

  test('Escape closes; draft is kept per task', async () => {
    const { q } = setup(vi.fn());
    q('.ask-head').click();
    q('.ask-ta').value = 'draft text';
    q('.ask-ta').dispatchEvent(new Event('input'));
    q('.ask-box').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(q('.ask-box').hidden).toBe(true);
    expect(window.sessionStorage.getItem('bdui.ask.draft.demo-1')).toBe(
      'draft text'
    );
  });

  test('busy: input locked, status re-check frees it', async () => {
    vi.useFakeTimers();
    try {
      let busy = true;
      const f = vi.fn(async (/** @type {string} */ u) =>
        u === '/api/ask/status'
          ? reply({ ok: true, busy })
          : reply({ ok: false, error: 'busy', retry_after_s: 5 }, 429)
      );
      const { q } = setup(f);
      q('.ask-head').click();
      q('.ask-ta').value = 'x';
      q('.ask-send').click();
      await vi.advanceTimersByTimeAsync(10);
      expect(q('.ask-send').disabled).toBe(true);
      busy = false;
      await vi.advanceTimersByTimeAsync(5100);
      expect(q('.ask-send').disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('helpers', () => {
  test('splitAnswer separates fenced code', () => {
    expect(splitAnswer('hi\n```bash\nbd show x\n```\nbye')).toEqual([
      { code: false, text: 'hi' },
      { code: true, text: 'bd show x' },
      { code: false, text: 'bye' }
    ]);
  });
  test('every server code maps to a string key', () => {
    for (const c of [
      'timeout',
      'busy',
      'rate_limited',
      'claude_signed_out',
      'claude_offline',
      'claude_missing',
      'disabled',
      'claude_failed',
      'forbidden',
      'not_found',
      'bad_request'
    ])
      expect(errorKey(c)).toMatch(/^ask_e_/);
  });
  test('submitAsk never throws on bad json', async () => {
    const r = await submitAsk(
      { project: 'p', id: 'i', question: 'q' },
      {
        fetch: /** @type {any} */ (
          async () => ({
            ok: false,
            status: 503,
            json: async () => {
              throw new Error('x');
            }
          })
        )
      }
    );
    expect(r.ok).toBe(false);
  });
});

test('project key is the folder name, from a Windows path', async () => {
  const { getAskProject } = await import('../utils/ask-context.js');
  setAskProject(
    ['E:', 'Projects', 'Beads-Lite', ''].join(String.fromCharCode(92))
  );
  expect(getAskProject()).toBe('beads-lite');
});

test('Escape is cancelled so the modal task dialog behind it stays open', () => {
  const { q } = setup(vi.fn());
  q('.ask-head').click();
  const ev = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  });
  q('.ask-ta').dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(q('.ask-head'));
});
