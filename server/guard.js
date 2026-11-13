/**
 * Board socket hardening (ADR 0001 D8): Host allowlist, Origin check and a
 * random per-launch token. Browsers do not apply same-origin to WebSockets,
 * so without this any web page open in the owner's browser could mutate beads.
 *
 * Two doors (ADR 0001 section 2): 'pc' (127.0.0.1:3000) and 'phone'
 * (127.0.0.1:3001, reached only through `tailscale serve`). The port decides
 * which rules apply. The phone door has its own token, its own Host/Origin
 * rules (the tailnet name, https only) and requires the owner's Tailscale
 * identity header.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @typedef {'pc' | 'phone'} Door */

// One token per door (SEC B2): a token read through one door opens nothing on
// the other.
const TOKENS = {
  pc: randomBytes(24).toString('hex'),
  phone: randomBytes(24).toString('hex')
};
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
// The tailnet name is a name, not a secret. BDUI_ALLOWED_HOSTS adds more
// (comma-separated hostnames, no port).
const DEFAULT_EXTRA_HOSTS = ['abdelrahman.tail8a4e50.ts.net'];

/**
 * @param {Door} [door]
 * @returns {string}
 */
export function getBoardToken(door = 'pc') {
  return TOKENS[door];
}

/** @returns {string[]} */
function envHosts() {
  return (process.env.BDUI_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** @returns {Set<string>} */
function allowedHosts() {
  return new Set([...LOOPBACK, ...DEFAULT_EXTRA_HOSTS, ...envHosts()]);
}

/**
 * Hosts the phone door answers to: the tailnet name only, never loopback
 * (a rebound page or a local process using 127.0.0.1:3001 is not the phone).
 *
 * @returns {Set<string>}
 */
function phoneHosts() {
  return new Set([...DEFAULT_EXTRA_HOSTS, ...envHosts()]);
}

const HOST_RE = /^(\[[0-9a-f:]+\]|[^:/\s]+)(?::\d{1,5})?$/i;

/**
 * @param {string | undefined} host_header  Host header value (name[:port]).
 * @param {Door} [door]
 * @returns {boolean}
 */
export function isAllowedHost(host_header, door = 'pc') {
  if (!host_header || typeof host_header !== 'string') {
    return false;
  }
  const m = HOST_RE.exec(host_header);
  if (!m) {
    return false;
  }
  const set = door === 'phone' ? phoneHosts() : allowedHosts();
  return set.has(m[1].toLowerCase());
}

/**
 * The Origin must be http(s) (https only on the phone door), its host:port
 * must equal the Host header, and that Host must be one of ours (stops DNS
 * rebinding).
 *
 * @param {string | undefined} origin
 * @param {string | undefined} host_header
 * @param {Door} [door]
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, host_header, door = 'pc') {
  if (!origin || !isAllowedHost(host_header, door)) {
    return false;
  }
  try {
    const u = new URL(origin);
    const proto_ok =
      door === 'phone'
        ? u.protocol === 'https:'
        : u.protocol === 'http:' || u.protocol === 'https:';
    return (
      proto_ok && u.host.toLowerCase() === String(host_header).toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * @param {unknown} candidate
 * @param {Door} [door]
 * @returns {boolean}
 */
export function isValidToken(candidate, door = 'pc') {
  const token = TOKENS[door];
  if (typeof candidate !== 'string' || candidate.length !== token.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
}

/**
 * The owner's Tailscale login (a name, not a secret) from the local board
 * config: BDUI_OWNER_LOGIN, else owner_login in ~/.bdui/phone.json
 * (BDUI_PHONE_CONFIG overrides the path). Empty = none configured.
 *
 * @returns {string}
 */
export function ownerLogin() {
  const env = (process.env.BDUI_OWNER_LOGIN || '').trim();
  if (env) {
    return env.toLowerCase();
  }
  try {
    const file =
      process.env.BDUI_PHONE_CONFIG ||
      path.join(os.homedir(), '.bdui', 'phone.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof cfg?.owner_login === 'string'
      ? cfg.owner_login.trim().toLowerCase()
      : '';
  } catch {
    return '';
  }
}

/**
 * Phone door identity: `Tailscale-User-Login` must equal the owner's login.
 * No login configured, no header (Funnel sends none), a repeated header, or
 * another login: refused. Tailscale serve strips client-sent copies (N8).
 *
 * @param {Record<string, string | string[] | undefined>} headers
 * @returns {boolean}
 */
export function isOwnerIdentity(headers) {
  const owner = ownerLogin();
  const got = headers['tailscale-user-login'];
  if (!owner || typeof got !== 'string') {
    return false;
  }
  const a = Buffer.from(got.trim().toLowerCase());
  const b = Buffer.from(owner);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Check a WebSocket upgrade request.
 *
 * @param {{ headers: Record<string, string | string[] | undefined>, url?: string }} req
 * @param {Door} [door]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkUpgrade(req, door = 'pc') {
  const host = /** @type {string | undefined} */ (req.headers.host);
  const origin = /** @type {string | undefined} */ (req.headers.origin);
  if (door === 'phone' && !isOwnerIdentity(req.headers)) {
    return { ok: false, reason: 'identity' };
  }
  if (!isAllowedHost(host, door)) {
    return { ok: false, reason: 'host' };
  }
  if (!isAllowedOrigin(origin, host, door)) {
    return { ok: false, reason: 'origin' };
  }
  const t = new URL(req.url || '/', 'http://x').searchParams.get('t');
  if (!isValidToken(t, door)) {
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

/**
 * One check for every board POST that is not a websocket (SEC B1, ask-Claude
 * beads-lite-1bo5.6.56; shared by /api/report and /api/ask). The global
 * middleware lets a request with no Origin through (curl, the CLI); a POST that
 * can spend money or write must be a real page of this door:
 *  - Origin present and equal to this door (a cross-site form cannot be),
 *  - X-Board-Token valid for this door,
 *  - Content-Type as expected (415), Content-Length <= max (413), and present
 *    when `require_length` (411),
 *  - Sec-Fetch-Site, when the browser sends it, is same-origin.
 *
 * @param {{ headers: Record<string, string | string[] | undefined> }} req
 * @param {Door} door
 * @param {{ content_type: string, max_body: number, require_length?: boolean }} opts
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function checkBoardPost(req, door, opts) {
  const h = req.headers;
  const host = typeof h.host === 'string' ? h.host : undefined;
  const origin = typeof h.origin === 'string' ? h.origin : undefined;
  if (!origin || !isAllowedOrigin(origin, host, door)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const site = h['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const tok = h['x-board-token'];
  if (typeof tok !== 'string' || !isValidToken(tok, door)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const ct = String(h['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (ct !== opts.content_type) {
    return { ok: false, status: 415, error: 'bad_type' };
  }
  const raw = h['content-length'];
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw)) {
    if (opts.require_length) {
      return { ok: false, status: 411, error: 'length_required' };
    }
  } else if (Number(raw) > opts.max_body) {
    return { ok: false, status: 413, error: 'too_large' };
  }
  return { ok: true };
}
