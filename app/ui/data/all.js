/**
 * One shared, lazy "all open issues" list for the v3 top search and the
 * projects counts. Nothing is subscribed until someone asks (zero idle cost);
 * it uses its own client id and the same server list key as legacy, so the
 * server shares one bd call. Safe to call many times.
 */
const DEFAULT_ID = 'u3:all';
const DEFAULT_SPEC = { type: 'all-issues' };
/** Every registered project (Desk), not only the connection's one (beads-lite-1bo5.13.32). */
export const ALL_PROJECTS_ID = 'u3:all-projects';
const ALL_SPEC = { type: 'all-issues', params: { scope: 'all' } };

/**
 * @param {any} base - the boot context ({ subscriptions, sub_issue_stores })
 * @param {{ allProjects?: boolean }} [opts] allProjects: the list spans every project
 * @returns {{ items: () => any[], loaded: () => boolean, on: (fn: () => void) => () => void }}
 */
export function allIssues(base, opts = {}) {
  const ID = opts.allProjects ? ALL_PROJECTS_ID : DEFAULT_ID;
  const SPEC = opts.allProjects ? ALL_SPEC : DEFAULT_SPEC;
  const stores = base && base.sub_issue_stores;
  const subs = base && base.subscriptions;
  /** Start the subscription once. */
  function ensure() {
    if (!stores || !subs) return;
    if (!stores.getStore(ID)) {
      try {
        stores.register(ID, SPEC);
        void subs.subscribeList(ID, SPEC).catch(() => {
          try {
            stores.unregister(ID);
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore: search just shows nothing
      }
    }
  }
  return {
    items() {
      ensure();
      return stores ? stores.snapshotFor(ID) : [];
    },
    loaded() {
      return stores ? stores.isLoaded(ID) : false;
    },
    on(fn) {
      ensure();
      return stores ? stores.subscribeFor(ID, fn) : () => {};
    }
  };
}
