/**
 * Extension seam. Feature files (decisions-feed, report, notifier, push,
 * outputs) export `register({ registerHandler, registerRoute })`; this module
 * collects what they register. server/ws.js dispatches unknown message types
 * to handlers; server/app.js mounts routes. Adding a feature = edit its own
 * file (and one line in FEATURE_MESSAGE_TYPES), never ws.js/app.js/protocol.js.
 */
import * as decisionsFeed from './decisions-feed.js';
import * as report from './report.js';
import * as notifier from './notifier.js';
import * as push from './push.js';
import * as outputs from './outputs.js';
import { allowPhoneFeatureType } from '../phone.js';

/**
 * Handler gets the request and a context; returns the reply payload (or
 * throws `{ code, message }`). ctx: { ws, root_dir, broadcast }.
 *
 * @typedef {(req: { id: string, type: string, payload?: unknown }, ctx: { ws: unknown, root_dir: string | undefined, broadcast: (type: string, payload?: unknown) => void }) => unknown | Promise<unknown>} FeatureHandler
 * @typedef {(app: import('express').Express, config: { app_dir: string, root_dir: string }) => void} RouteMounter
 */

/** @type {Map<string, FeatureHandler>} */
const handlers = new Map();
/** @type {Set<string>} */
const mutating = new Set();
/** @type {RouteMounter[]} */
const routes = [];

/**
 * @param {string} type
 * @param {FeatureHandler} fn
 * @param {{ mutating?: boolean, phone?: boolean }} [opts] mutating = needs the
 *   board token; phone = the phone door may send it (default: refused there)
 */
export function registerHandler(type, fn, opts = {}) {
  handlers.set(type, fn);
  if (opts.mutating) {
    mutating.add(type);
  }
  if (opts.phone) {
    allowPhoneFeatureType(type);
  }
}

/** @param {RouteMounter} mount */
export function registerRoute(mount) {
  routes.push(mount);
}

/** @param {string} type */
export function getHandler(type) {
  return handlers.get(type);
}

/** @param {string} type */
export function isFeatureMutating(type) {
  return mutating.has(type);
}

/**
 * @param {import('express').Express} app
 * @param {{ app_dir: string, root_dir: string }} config
 */
export function mountFeatureRoutes(app, config) {
  for (const mount of routes) {
    mount(app, config);
  }
}

for (const f of [decisionsFeed, report, notifier, push, outputs]) {
  f.register({ registerHandler, registerRoute });
}
