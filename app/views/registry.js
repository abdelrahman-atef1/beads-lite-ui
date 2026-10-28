/**
 * View registry: route name -> lazy dynamic import, so a view's code loads
 * only when its route (or header/detail slot) is first opened. The bundler
 * turns each import() into a separate chunk once splitting is on (server
 * build config is owned by the perf task); until then it is inlined and the
 * behaviour is identical.
 */

/** @type {Record<string, () => Promise<any>>} */
export const VIEWS = {
  issues: () => import('./list.js'),
  epics: () => import('./epics.js'),
  board: () => import('./board.js'),
  decisions: () => import('./decisions.js'),
  report: () => import('./report.js'),
  notifications: () => import('./notifications.js'),
  outputs: () => import('./outputs-panel.js'),
  card: () => import('./card-panel.js')
};

/** @type {Map<string, Promise<any>>} */
const cache = new Map();

/**
 * Load a view module once; later calls return the same promise.
 *
 * @param {string} name
 * @returns {Promise<any>}
 */
export function loadView(name) {
  const loader = VIEWS[name];
  if (!loader) {
    return Promise.reject(new Error('Unknown view: ' + name));
  }
  let p = cache.get(name);
  if (!p) {
    p = loader();
    cache.set(name, p);
  }
  return p;
}

/**
 * Wrap a view factory so the view is created (and its module fetched) on the
 * first `load()`; later `load()` calls go straight to the instance.
 *
 * @template T
 * @param {string} name
 * @param {(mod: any) => { load: () => Promise<T> | T }} build
 */
export function lazyView(name, build) {
  /** @type {{ load: () => any } | null} */
  let instance = null;
  /** @type {Promise<{ load: () => any }> | null} */
  let pending = null;
  return {
    async load() {
      if (!instance) {
        pending ??= loadView(name).then((mod) => (instance = build(mod)));
        await pending;
      }
      return /** @type {{ load: () => any }} */ (instance).load();
    }
  };
}

/** slot name -> [view, exported mount function] */
const SLOTS = {
  bell: ['notifications', 'mountBell'],
  report: ['report', 'mountReport'],
  outputs: ['outputs', 'mountOutputs'],
  card: ['card', 'mountCard']
};

/**
 * Fill every `[data-slot]` element under `root` that has not been filled yet
 * (header: bell, report; bead detail: card, outputs). Detail renders call this
 * after they put a slot element in the page. An unknown slot name is ignored.
 *
 * @param {ParentNode} [root]
 * @returns {Promise<void>}
 */
export async function mountSlots(root = document) {
  const els = /** @type {HTMLElement[]} */ (
    Array.from(root.querySelectorAll('[data-slot]'))
  );
  await Promise.all(
    els.map(async (el) => {
      const spec = /** @type {Record<string, string[]>} */ (SLOTS)[
        el.dataset.slot || ''
      ];
      if (!spec || el.dataset.mounted) {
        return;
      }
      el.dataset.mounted = '1';
      try {
        const mod = await loadView(spec[0]);
        mod[spec[1]](el);
      } catch {
        delete el.dataset.mounted;
      }
    })
  );
}
