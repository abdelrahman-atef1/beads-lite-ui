import { issueHashFor } from './utils/issue-url.js';
import { debug } from './utils/logging.js';

/**
 * Hash-based router for tabs (issues/epics/board) and deep-linked issue ids.
 */

/**
 * Parse an application hash and extract the selected issue id.
 * Supports canonical form "#/(issues|epics|board)?issue=<id>" and legacy
 * "#/issue/<id>" which we will rewrite to the canonical form.
 *
 * @param {string} hash
 * @returns {string | null}
 */
export function parseHash(hash) {
  const h = String(hash || '');
  // Extract the fragment sans leading '#'
  const frag = h.startsWith('#') ? h.slice(1) : h;
  const qIndex = frag.indexOf('?');
  const query = qIndex >= 0 ? frag.slice(qIndex + 1) : '';
  if (query) {
    const params = new URLSearchParams(query);
    const id = params.get('issue');
    if (id) {
      return decodeURIComponent(id);
    }
  }
  // Legacy pattern: #/issue/<id>
  const m = /^\/issue\/([^\s?#]+)/.exec(frag);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Parse the current view from hash.
 *
 * @param {string} hash
 * @returns {'issues'|'epics'|'board'|'decisions'}
 */
export function parseView(hash) {
  const h = String(hash || '');
  if (/^#\/epics(\b|\/|$)/.test(h)) {
    return 'epics';
  }
  if (/^#\/decisions(\b|\/|$)/.test(h)) {
    return 'decisions';
  }
  if (/^#\/board(\b|\/|$)/.test(h)) {
    return 'board';
  }
  // Default to issues (also covers #/issues and unknown/empty)
  return 'issues';
}

/**
 * Home is Decisions: no hash at all, or just # or #/. Note that parseView keeps
 * mapping an empty hash to the list, which the detail view relies on.
 *
 * @param {string} hash
 */
export function isHomeHash(hash) {
  const h = String(hash || '');
  return h === '' || h === '#' || h === '#/';
}

/**
 * @param {{ getState: () => any, setState: (patch: any) => void }} store
 */
export function createHashRouter(store) {
  const log = debug('router');
  // In-app history depth: every entry the app creates is stamped with an index
  // so "close" can step back (to the previous bead or the list it came from)
  // instead of pushing a new entry that Back would reopen.
  let cur_i = -1;
  function stampEntry() {
    try {
      const st = window.history.state;
      if (st && typeof st.bl_i === 'number') {
        cur_i = st.bl_i;
      } else {
        cur_i += 1;
        window.history.replaceState({ ...(st || {}), bl_i: cur_i }, '');
      }
    } catch {
      // ignore
    }
  }
  /** @type {(ev?: HashChangeEvent) => any} */
  const onHashChange = () => {
    stampEntry();
    const hash = window.location.hash || '';
    // Rewrite legacy #/issue/<id> to canonical #/issues?issue=<id>
    const legacyMatch = /^#\/issue\/([^\s?#]+)/.exec(hash);
    if (legacyMatch && legacyMatch[1]) {
      const id = decodeURIComponent(legacyMatch[1]);
      // Update state immediately for consumers expecting sync selection
      store.setState({ selected_id: id, view: 'issues' });
      const next = `#/issues?issue=${encodeURIComponent(id)}`;
      if (window.location.hash !== next) {
        window.location.hash = next;
        return; // will trigger handler again
      }
    }
    const id = parseHash(hash);
    const view = isHomeHash(hash) ? 'decisions' : parseView(hash);
    log('hash change → view=%s id=%s', view, id);
    store.setState({ selected_id: id, view });
  };

  return {
    start() {
      window.addEventListener('hashchange', onHashChange);
      onHashChange();
    },
    stop() {
      window.removeEventListener('hashchange', onHashChange);
    },
    /** True when the previous history entry was created by this app. */
    canGoBack() {
      const st = window.history.state;
      return !!st && typeof st.bl_i === 'number' && st.bl_i > 0;
    },
    /** Step back to the previous entry (previous bead, else its list). */
    back() {
      window.history.back();
    },
    /**
     * @param {string} id
     */
    gotoIssue(id) {
      // Keep current view in hash and append issue param via helper
      const s = store.getState ? store.getState() : { view: 'issues' };
      const view = s.view || 'issues';
      const next = issueHashFor(view, id);
      log('goto issue %s (view=%s)', id, view);
      if (window.location.hash !== next) {
        window.location.hash = next;
      } else {
        // Force state update even if hash is the same
        store.setState({ selected_id: id, view });
      }
    },
    /**
     * Navigate to a top-level view.
     *
     * @param {'issues'|'epics'|'board'|'decisions'} view
     */
    /**
     * @param {'issues'|'epics'|'board'|'decisions'} view
     */
    gotoView(view) {
      const s = store.getState ? store.getState() : { selected_id: null };
      const id = s.selected_id;
      const next = id ? issueHashFor(view, id) : `#/${view}`;
      log('goto view %s (id=%s)', view, id || '');
      if (window.location.hash !== next) {
        window.location.hash = next;
      } else {
        store.setState({ view, selected_id: null });
      }
    }
  };
}
