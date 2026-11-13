/**
 * Ask-Claude client calls (contract: .56 design section 3; server
 * server/features/ask.js is not changed). Never throws.
 */

export const MAX_Q = 1000;
export const WAIT_MAX_S = 90;

/** @param {string} code */
export function errorKey(code) {
  const m = /** @type {Record<string, string>} */ ({
    timeout: 'u3_ask_e_timeout',
    busy: 'u3_ask_e_busy',
    rate_limited: 'u3_ask_e_rate',
    claude_signed_out: 'u3_ask_e_signed_out',
    claude_offline: 'u3_ask_e_offline_claude',
    claude_missing: 'u3_ask_e_missing',
    disabled: 'u3_ask_e_disabled',
    claude_failed: 'u3_ask_e_failed',
    forbidden: 'u3_ask_e_forbidden',
    not_found: 'u3_ask_e_notfound',
    bad_request: 'u3_ask_e_bad',
    too_large: 'u3_ask_e_bad',
    bad_type: 'u3_ask_e_forbidden',
    length_required: 'u3_ask_e_bad'
  });
  return m[code] || 'u3_ask_e_failed';
}

/** @returns {string} */
function boardToken() {
  const m = document.querySelector('meta[name="board-token"]');
  return m ? m.getAttribute('content') || '' : '';
}

/**
 * The server's project key: last path segment of the workspace, lower case.
 *
 * @param {string} workspace_path
 */
export function projectKey(workspace_path) {
  const parts = String(workspace_path || '')
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/);
  return (parts.pop() || '').toLowerCase();
}

/**
 * @param {{ project: string, id: string, question: string }} d
 * @param {{ fetch?: typeof fetch, token?: string, signal?: AbortSignal }} [o]
 * @returns {Promise<{ ok: true, answer: string, truncated: boolean } | { ok: false, offline?: boolean, aborted?: boolean, error?: string, retryAfter?: number }>}
 */
export async function submitAsk(d, o = {}) {
  const f = o.fetch || globalThis.fetch.bind(globalThis);
  let res;
  try {
    res = await f('/api/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-board-token': o.token ?? boardToken()
      },
      body: JSON.stringify(d),
      signal: o.signal
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.name === 'AbortError')
      return { ok: false, aborted: true };
    return { ok: false, offline: true };
  }
  /** @type {any} */
  let j = null;
  try {
    j = await res.json();
  } catch {
    // not json (proxy error page)
  }
  if (res.ok && j && j.ok && typeof j.answer === 'string')
    return { ok: true, answer: j.answer, truncated: !!j.truncated };
  if (!j && (res.status === 502 || res.status === 503 || res.status === 504))
    return { ok: false, offline: true };
  return {
    ok: false,
    error: (j && j.error) || 'claude_failed',
    retryAfter: Number(j?.retry_after_s) || 0
  };
}

/**
 * GET /api/ask/status: one cheap call when the sheet opens (fixes .56 QA low
 * finding 2: the signed-out state shows before the owner types anything).
 *
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal }} [o]
 * @returns {Promise<{ known: boolean, enabled: boolean, busy: boolean, signed_in: boolean | 'unknown' }>}
 */
export async function fetchStatus(o = {}) {
  try {
    const f = o.fetch || globalThis.fetch.bind(globalThis);
    const res = await f('/api/ask/status', { signal: o.signal });
    const j = await res.json();
    if (!j || j.ok !== true) throw new Error('bad');
    return {
      known: true,
      enabled: j.enabled !== false,
      busy: j.busy === true,
      signed_in:
        j.signed_in === false ? false : j.signed_in === true ? true : 'unknown'
    };
  } catch {
    return { known: false, enabled: true, busy: false, signed_in: 'unknown' };
  }
}
