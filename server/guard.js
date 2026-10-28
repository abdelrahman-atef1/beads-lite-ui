/**
 * Board socket hardening (ADR 0001 D8): Host allowlist, Origin check and a
 * random per-launch token. Browsers do not apply same-origin to WebSockets,
 * so without this any web page open in the owner's browser could mutate beads.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN = randomBytes(24).toString('hex');
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
// The tailnet name is a name, not a secret. BDUI_ALLOWED_HOSTS adds more
// (comma-separated hostnames, no port).
const DEFAULT_EXTRA_HOSTS = ['abdelrahman.tail8a4e50.ts.net'];

/** @returns {string} */
export function getBoardToken() {
  return TOKEN;
}

/** @returns {Set<string>} */
function allowedHosts() {
  const extra = (process.env.BDUI_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...LOOPBACK, ...DEFAULT_EXTRA_HOSTS, ...extra]);
}

/**
 * @param {string | undefined} host_header  Host header value (name[:port]).
 * @returns {boolean}
 */
export function isAllowedHost(host_header) {
  if (!host_header || typeof host_header !== 'string') {
    return false;
  }
  const m = /^(\[[0-9a-f:]+\]|[^:/\s]+)(?::\d{1,5})?$/i.exec(host_header);
  return !!m && allowedHosts().has(m[1].toLowerCase());
}

/**
 * The Origin must be http(s), its host:port must equal the Host header, and
 * that Host must be one of ours (stops DNS rebinding).
 *
 * @param {string | undefined} origin
 * @param {string | undefined} host_header
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, host_header) {
  if (!origin || !isAllowedHost(host_header)) {
    return false;
  }
  try {
    const u = new URL(origin);
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      u.host.toLowerCase() === String(host_header).toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * @param {unknown} candidate
 * @returns {boolean}
 */
export function isValidToken(candidate) {
  if (typeof candidate !== 'string' || candidate.length !== TOKEN.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(TOKEN));
}

/**
 * Check a WebSocket upgrade request.
 *
 * @param {{ headers: Record<string, string | string[] | undefined>, url?: string }} req
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkUpgrade(req) {
  const host = /** @type {string | undefined} */ (req.headers.host);
  const origin = /** @type {string | undefined} */ (req.headers.origin);
  if (!isAllowedHost(host)) {
    return { ok: false, reason: 'host' };
  }
  if (!isAllowedOrigin(origin, host)) {
    return { ok: false, reason: 'origin' };
  }
  const t = new URL(req.url || '/', 'http://x').searchParams.get('t');
  if (!isValidToken(t)) {
    return { ok: false, reason: 'token' };
  }
  return { ok: true };
}

/** Message types that change data or the active workspace. */
export const MUTATING_TYPES = new Set([
  'update-assignee',
  'update-status',
  'update-priority',
  'update-type',
  'edit-text',
  'create-issue',
  'dep-add',
  'dep-remove',
  'label-add',
  'label-remove',
  'add-comment',
  'delete-issue',
  'set-workspace'
]);
