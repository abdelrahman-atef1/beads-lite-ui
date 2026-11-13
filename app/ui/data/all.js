/**
 * One shared, lazy "all open issues" list for the v3 top search and the
 * projects counts. Nothing is subscribed until someone asks (zero idle cost);
 * it uses its own client id and the same server list key as legacy, so the
 * server shares one bd call. Safe to call many times.
 */
const ID = 'u3:all';
const SPEC = { type: 'all-issues' };

/**
 * @param {any} base - the boot context ({ subscriptions, sub_issue_stores })
 * @returns {{ items: () => any[], loaded: () => boolean, on: (fn: () => void) => () => void }}
 */
export function allIssues(base) {
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
