import { render } from 'lit-html';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { errorKey, projectKey } from '../ask/client.js';
import { renderAskHead } from '../ask/head-slot.js';
import { mountAsk } from './ask.js';

/**
 * @param {any} body
 * @param {number} [status]
 */
const reply = (body, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const STATUS_OK = { ok: true, enabled: true, busy: false, signed_in: true };
const TIMERS = ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'];

/** @param {(url: string, init?: any) => any} fn */
function setup(fn) {
  document.body.innerHTML =
    '<meta name="board-token" content="TOK"><div class="u3" id="h" data-id="demo-1"></div>';
  const host = /** @type {any} */ (document.getElementById('h'));
  host.u3ctx = {
    store: {
      getState: () => ({
        workspace: { current: { path: 'E:/Projects/Demo/' } }
      })
    }
  };
  const f = vi.fn(async (/** @type {string} */ u, /** @type {any} */ i) =>
    fn(u, i)
  );
  mountAsk(host, { fetch: /** @type {any} */ (f) });
  const q = (/** @type {string} */ s) =>
    /** @type {any} */ (host.querySelector(s));
  return { host, f, q };
}

/**
 * @param {(s: string) => any} q
 * @param {string} text
 */
function ask(q, text) {
  q('textarea').value = text;
  q('textarea').dispatchEvent(new Event('input'));
  q('form').dispatchEvent(new Event('submit', { cancelable: true }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('beads-ui.lang', 'en');
});
afterEach(() => vi.useRealTimers());

describe('ask head and sheet', () => {
  test('closed until tapped; status is fetched on open, not before', async () => {
    const { f, q } = setup(() => reply(STATUS_OK));
    expect(q('.u3-ask__sheet')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    q('.u3-ask__head').click();
    await tick();
    expect(f.mock.calls[0][0]).toBe('/api/ask/status');
    expect(q('.u3-ask__sheet')).not.toBeNull();
    expect(q('.u3-ask__banner')).toBeNull();
  });

  test('signed out shows at once on open (QA low 2) and blocks input', async () => {
    const { f, q } = setup(() => reply({ ...STATUS_OK, signed_in: false }));
    q('.u3-ask__head').click();
    await tick();
    expect(q('.u3-ask__banner').dataset.state).toBe('blocked');
    expect(q('textarea').disabled).toBe(true);
    expect(q('button[type=submit]').disabled).toBe(true);
    expect(f.mock.calls.some((c) => c[0] === '/api/ask')).toBe(false);
  });

  test('unavailable: enabled false from status', async () => {
    const { q } = setup(() => reply({ ...STATUS_OK, enabled: false }));
    q('.u3-ask__head').click();
    await tick();
    expect(q('.u3-ask__banner').textContent).toMatch(/turned off/);
    expect(q('textarea').disabled).toBe(true);
  });

  test('status failing does not block asking', async () => {
    const { q } = setup(() => {
      throw new Error('net');
    });
    q('.u3-ask__head').click();
    await tick();
    expect(q('.u3-ask__banner')).toBeNull();
    expect(q('textarea').disabled).toBe(false);
  });

  test('send posts project/id/question with the token; answer is markdown, never HTML', async () => {
    const { f, q } = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({
            ok: true,
            answer:
              'Run **tests** <img src=x onerror=alert(1)>\n\n```\nnpm test\n```',
            truncated: false
          })
    );
    q('.u3-ask__head').click();
    await tick();
    ask(q, 'what is left?');
    await tick();
    await tick();
    const post = /** @type {any} */ (
      f.mock.calls.find((c) => c[0] === '/api/ask')
    );
    expect(post[1].headers['x-board-token']).toBe('TOK');
    expect(JSON.parse(post[1].body)).toEqual({
      project: 'demo',
      id: 'demo-1',
      question: 'what is left?'
    });
    const a = q('.u3-ask__answer');
    expect(a.querySelector('strong').textContent).toBe('tests');
    expect(a.querySelector('img')).toBeNull();
    expect(a.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(a.querySelector('pre').getAttribute('dir')).toBe('ltr');
  });

  test('follow-ups: thread stays, history is sent, new chat clears it', async () => {
    let n = 0;
    const { f, q, host } = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({ ok: true, answer: 'A' + ++n, truncated: false })
    );
    q('.u3-ask__head').click();
    await tick();
    ask(q, 'one');
    await tick();
    await tick();
    expect(q('textarea').value).toBe('');
    ask(q, 'two');
    await tick();
    await tick();
    const bodies = f.mock.calls
      .filter((c) => c[0] === '/api/ask')
      .map((c) => JSON.parse(c[1].body));
    expect(bodies[0].history).toBeUndefined();
    expect(bodies[1].history).toEqual([
      { role: 'user', text: 'one' },
      { role: 'assistant', text: 'A1' }
    ]);
    expect(host.querySelectorAll('.u3-ask__answer').length).toBe(2);
    expect(q('form')).not.toBeNull();
    q('[data-act=new-chat]').click();
    expect(host.querySelectorAll('.u3-ask__answer').length).toBe(0);
    ask(q, 'three');
    await tick();
    await tick();
    const last = JSON.parse(f.mock.calls.at(-1)[1].body);
    expect(last.history).toBeUndefined();
  });

  test('follow-ups: only the newest 6 entries are sent; 8 questions fill the chat', async () => {
    const { f, q } = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({ ok: true, answer: 'ok', truncated: false })
    );
    q('.u3-ask__head').click();
    await tick();
    for (let i = 1; i <= 8; i++) {
      ask(q, 'q' + i);
      await tick();
      await tick();
    }
    const posts = f.mock.calls.filter((c) => c[0] === '/api/ask');
    expect(posts.length).toBe(8);
    expect(JSON.parse(posts[7][1].body).history.length).toBe(6);
    expect(JSON.parse(posts[7][1].body).history[0].text).toBe('q5');
    expect(q('form')).toBeNull();
    expect(q('[data-act=new-chat]')).not.toBeNull();
  });

  test('stats scope: posts scope and days, no project or id, own texts', async () => {
    const { f, q, host } = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({ ok: true, answer: 'ok', truncated: false })
    );
    host.dataset.scope = 'stats';
    host.dataset.days = '30';
    q('.u3-ask__head').click();
    await tick();
    expect(q('.u3-ask__ctx').textContent).toContain('30');
    expect(q('textarea').placeholder).toMatch(/numbers/);
    ask(q, 'what is slow?');
    await tick();
    await tick();
    const post = /** @type {any} */ (
      f.mock.calls.find((c) => c[0] === '/api/ask')
    );
    expect(JSON.parse(post[1].body)).toEqual({
      scope: 'stats',
      days: 30,
      question: 'what is slow?'
    });
  });

  test('every server error code has its own text', async () => {
    const codes = [
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
    ];
    const seen = new Set();
    for (const code of codes) {
      vi.useFakeTimers({ toFake: /** @type {any} */ (TIMERS) });
      const { host, q } = setup((u) =>
        u === '/api/ask/status'
          ? reply(STATUS_OK)
          : reply(
              { ok: false, error: code, retry_after_s: 7 },
              code === 'busy' ? 429 : 503
            )
      );
      q('.u3-ask__head').click();
      await vi.advanceTimersByTimeAsync(1);
      ask(q, 'q');
      await vi.advanceTimersByTimeAsync(1);
      const txt = q('.u3-ask__banner')?.textContent.trim();
      expect(txt, code).toBeTruthy();
      seen.add(txt);
      host.u3ask.destroy();
      vi.useRealTimers();
    }
    expect(seen.size).toBe(codes.length);
    expect([...seen].some((s) => String(s).includes('7 s'))).toBe(true);
  });

  test('sending shows seconds and cancel aborts the request', async () => {
    vi.useFakeTimers({ toFake: /** @type {any} */ (TIMERS) });
    /** @type {AbortSignal | undefined} */
    let sig;
    const { q } = setup((u, i) => {
      if (u === '/api/ask/status') return reply(STATUS_OK);
      sig = i.signal;
      return new Promise(() => {});
    });
    q('.u3-ask__head').click();
    await vi.advanceTimersByTimeAsync(1);
    ask(q, 'q');
    await vi.advanceTimersByTimeAsync(3000);
    expect(q('.u3-ask__wait').textContent).toMatch(/3 s of 90/);
    q('.u3-ask__waitrow button').click();
    expect(sig?.aborted).toBe(true);
    expect(q('.u3-ask__waitrow')).toBeNull();
    expect(q('textarea').value).toBe('q');
  });

  test('closing keeps nothing: question, answer and request are dropped', async () => {
    const { q } = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({ ok: true, answer: 'A', truncated: false })
    );
    q('.u3-ask__head').click();
    await tick();
    ask(q, 'secret q');
    await tick();
    await tick();
    expect(q('.u3-ask__answer')).not.toBeNull();
    q('.u3-ask__x').click();
    expect(q('.u3-ask__sheet')).toBeNull();
    q('.u3-ask__head').click();
    await tick();
    expect(q('textarea').value).toBe('');
    expect(q('.u3-ask__answer')).toBeNull();
    const kept = JSON.stringify({
      ...window.localStorage,
      ...window.sessionStorage
    });
    expect(kept).not.toContain('secret');
  });

  test('Escape closes with focus outside the panel, answer shown or input off', async () => {
    const esc = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    // answer shown
    let t = setup((u) =>
      u === '/api/ask/status'
        ? reply(STATUS_OK)
        : reply({ ok: true, answer: 'A', truncated: false })
    );
    t.q('.u3-ask__head').click();
    await tick();
    ask(t.q, 'q');
    await tick();
    await tick();
    expect(t.q('.u3-ask__answer')).not.toBeNull();
    document.body.focus();
    esc();
    expect(t.q('.u3-ask__sheet')).toBeNull();
    // signed out: textarea disabled
    t = setup(() => reply({ ...STATUS_OK, signed_in: false }));
    t.q('.u3-ask__head').click();
    await tick();
    expect(t.q('textarea').disabled).toBe(true);
    esc();
    expect(t.q('.u3-ask__sheet')).toBeNull();
    // closed: the listener is gone and nothing throws
    esc();
  });

  test('another task id drops the open question', async () => {
    const { host, q } = setup(() => reply(STATUS_OK));
    q('.u3-ask__head').click();
    await tick();
    q('textarea').value = 'x';
    q('textarea').dispatchEvent(new Event('input'));
    host.dataset.id = 'demo-2';
    await tick();
    await tick();
    expect(q('textarea').value).toBe('');
    expect(q('.u3-ask__ctx').textContent).toBe('demo-2');
  });
});

describe('seam: task routes only', () => {
  test('head renders on a task route and not on desk, tasks, releases', () => {
    /** @type {Array<[string, boolean]>} */
    const cases = [
      ['task', true],
      ['desk', false],
      ['tasks', false],
      ['releases', false]
    ];
    for (const [name, want] of cases) {
      const d = document.createElement('div');
      render(renderAskHead({ name, id: name === 'task' ? 'x-1' : '' }, {}), d);
      expect(!!d.querySelector('.u3-ask'), name).toBe(want);
    }
    const d = document.createElement('div');
    render(renderAskHead({ name: 'task', id: 'x-1' }, {}), d);
    expect(d.querySelector('.u3-ask__head')).not.toBeNull();
  });
});

describe('client helpers', () => {
  test('projectKey and errorKey', () => {
    expect(projectKey('E:\\Projects\\Rayeh\\')).toBe('rayeh');
    expect(projectKey('')).toBe('');
    expect(errorKey('nope')).toBe('u3_ask_e_failed');
  });
});
