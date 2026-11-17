/**
 * @import { MessageType } from './protocol.js'
 */
import { boardClient } from './board-client.js';
import { createListSelectors } from './data/list-selectors.js';
import { createDataLayer } from './data/providers.js';
import { createSubscriptionIssueStores } from './data/subscription-issue-stores.js';
import { createSubscriptionStore } from './data/subscriptions-store.js';
import { matchWorkspace } from './issue-workspace.js';
import { createHashRouter } from './router.js';
import { createStore } from './state.js';
import { registerServiceWorker } from './sw-register.js';
import { bootV3 } from './ui/boot.js';
import { createConnectionNotice } from './utils/connection-notice.js';
import { applyLang } from './utils/i18n.js';
import { setKnownIdFilter } from './utils/linkify-ids.js';
import { debug } from './utils/logging.js';
import { showToast } from './utils/toast.js';
import { createWsClient } from './ws.js';

/**
 * Bootstrap the board: the data layer, then the v3 shell (ui/boot.js).
 *
 * @param {HTMLElement} root_element - Passed to bootV3 (the shell replaces it).
 * @returns {{ ready: Promise<void> }}
 */
export function bootstrap(root_element) {
  const log = debug('main');
  log('bootstrap start');
  const client = createWsClient();
  boardClient(client); // slots (outputs panel) share this socket's project
  /**
   * @param {string} type
   * @param {unknown} payload
   */
  const transport = (type, payload) =>
    // Reject on failure: callers (detail saves, answers, drag) show the
    // server's reason. Swallowing it here hid every failed save.
    client.send(/** @type {MessageType} */ (type), payload);
  const store = createStore({
    filters: { status: [], search: '', type: '' },
    view: 'decisions',
    board: { closed_filter: 'today' }
  });
  const router = createHashRouter(store);
  router.start();
  // Subscriptions: wire client events and expose subscribe/unsubscribe helpers
  const subscriptions = createSubscriptionStore(transport);
  // Per-subscription stores (source of truth)
  const sub_issue_stores = createSubscriptionIssueStores();
  // Route per-subscription push envelopes to the owning store
  client.on('snapshot', (payload) => {
    const p = /** @type {any} */ (payload);
    const id = p && typeof p.id === 'string' ? p.id : '';
    const store = id ? sub_issue_stores.getStore(id) : null;
    if (store && p && p.type === 'snapshot') {
      try {
        store.applyPush(p);
      } catch {
        // ignore
      }
      // "All projects" lists name the projects the server could not read.
      if (Array.isArray(p.skipped)) {
        window.dispatchEvent(
          new CustomEvent('u3:skipped', {
            detail: { id, skipped: p.skipped }
          })
        );
      }
    }
  });
  client.on('upsert', (payload) => {
    const p = /** @type {any} */ (payload);
    const id = p && typeof p.id === 'string' ? p.id : '';
    const store = id ? sub_issue_stores.getStore(id) : null;
    if (store && p && p.type === 'upsert') {
      try {
        store.applyPush(p);
      } catch {
        // ignore
      }
    }
  });
  client.on('delete', (payload) => {
    const p = /** @type {any} */ (payload);
    const id = p && typeof p.id === 'string' ? p.id : '';
    const store = id ? sub_issue_stores.getStore(id) : null;
    if (store && p && p.type === 'delete') {
      try {
        store.applyPush(p);
      } catch {
        // ignore
      }
    }
  });
  // Derived list selectors: render from per-subscription snapshots
  const listSelectors = createListSelectors(sub_issue_stores);

  /**
   * Handle workspace change request from the picker.
   *
   * @param {string} workspace_path
   */
  async function handleWorkspaceChange(workspace_path) {
    log('requesting workspace switch to %s', workspace_path);
    try {
      const result = await client.send('set-workspace', {
        path: workspace_path
      });
      log('workspace switch result: %o', result);
      if (result && result.workspace) {
        // Update state with new workspace
        store.setState({
          workspace: {
            current: {
              path: result.workspace.root_dir,
              database: result.workspace.db_path
            }
          }
        });
        // Persist preference
        window.localStorage.setItem('beads-ui.workspace', workspace_path);
        if (result.changed) {
          showToast(
            'Switched to ' + getProjectName(workspace_path),
            'success',
            2000
          );
        }
      }
    } catch (err) {
      log('workspace switch failed: %o', err);
      showToast('Failed to switch workspace', 'error', 3000);
      throw err;
    }
  }

  /**
   * Extract project name from path.
   *
   * @param {string} path
   * @returns {string}
   */
  function getProjectName(path) {
    if (!path) return 'Unknown';
    const parts = path.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : 'Unknown';
  }

  /**
   * Load available workspaces from server and update state.
   */
  async function loadWorkspaces() {
    try {
      const result = await client.send('list-workspaces', {});
      log('workspaces loaded: %o', result);
      if (result && Array.isArray(result.workspaces)) {
        const available = result.workspaces.map((/** @type {any} */ ws) => ({
          path: ws.path,
          database: ws.database,
          pid: ws.pid,
          version: ws.version,
          prefix: ws.prefix,
          // Optional per-project counts (contracts/board-data.md)
          counts: ws.counts
        }));
        const current = result.current
          ? {
              path: result.current.root_dir,
              database: result.current.db_path
            }
          : null;
        store.setState({ workspace: { current, available } });
        setKnownIdFilter((id) => !!matchWorkspace(id, available));

        // Check if we have a saved preference that differs from current
        const savedWorkspace =
          window.localStorage.getItem('beads-ui.workspace');
        if (savedWorkspace && current && savedWorkspace !== current.path) {
          // Check if saved workspace is in available list
          const savedExists = available.some(
            (/** @type {{ path: string }} */ ws) => ws.path === savedWorkspace
          );
          if (savedExists) {
            log('restoring saved workspace preference: %s', savedWorkspace);
            await handleWorkspaceChange(savedWorkspace);
          }
        }
      }
    } catch (err) {
      log('failed to load workspaces: %o', err);
    }
  }

  // Handle workspace-changed events from server (e.g., if another client changes workspace)
  client.on('workspace-changed', (payload) => {
    log('workspace-changed event: %o', payload);
    if (payload && payload.root_dir) {
      store.setState({
        workspace: {
          current: {
            path: payload.root_dir,
            database: payload.db_path
          }
        }
      });
      // Reload workspaces to get fresh list
      void loadWorkspaces();
    }
  });

  // Toasts for WebSocket drops: only after it was open once and stayed down a
  // few seconds (never at load, never for a blink or a silent token retry)
  if (typeof client.onConnection === 'function') {
    client.onConnection(
      createConnectionNotice((msg, kind, ms) => showToast(msg, kind, ms))
    );
  }
  // Handle workspace-changed events from server (e.g., if another client changes workspace)
  client.on('workspace-changed', (payload) => {
    log('workspace-changed event: %o', payload);
    if (payload && payload.root_dir) {
      store.setState({
        workspace: {
          current: {
            path: payload.root_dir,
            database: payload.db_path
          }
        }
      });
      // Reload workspaces to get fresh list
      void loadWorkspaces();
    }
  });

  // Load workspaces after WebSocket is connected
  void loadWorkspaces();

  const ready = bootV3(root_element, {
    store,
    client,
    send: transport,
    router,
    data: createDataLayer(transport),
    subscriptions,
    sub_issue_stores,
    listSelectors
  });
  return { ready };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Initialize theme from saved preference or OS preference
    try {
      const saved = window.localStorage.getItem('beads-ui.theme');
      const prefersDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial =
        saved === 'dark' || saved === 'light'
          ? saved
          : prefersDark
            ? 'dark'
            : 'light';
      document.documentElement.setAttribute('data-theme', initial);
    } catch {
      // ignore theme init errors
    }

    // Language / direction (en LTR, ar RTL), see utils/i18n.js
    applyLang();
    bootstrap(document.body);
    registerServiceWorker();
  });
}
