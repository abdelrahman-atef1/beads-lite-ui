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

/**
 * Cheap change key of an issue snapshot: another bead, an update, or a new
 * comment changes it; a re-render that changed nothing does not.
 *
 * @param {any} issue
 * @returns {string}
 */
function issueStamp(issue) {
  if (!issue) return '';
  const n = Array.isArray(issue.comments) ? issue.comments.length : '';
  return [
    issue.id,
    issue.updated_at,
    issue.status,
    issue.comment_count,
    n
  ].join('|');
}

/** slot name -> [view, exported mount function] */
const SLOTS = {
  bell: ['notifications', 'mountBell'],
  report: ['report', 'mountReport'],
  outputs: ['outputs', 'mountOutputs'],
  'outputs-project': ['outputs', 'mountProjectOutputs'],
  card: ['card', 'mountCard'],
  dcard: ['card', 'mountDecisionComment']
};

/**
 * Fill every `[data-slot]` element under `root` that has not been filled yet
 * (header: bell, report; bead detail: card, outputs). Detail renders call this
 * after they put a slot element in the page. An unknown slot name is ignored.
 *
 * Slot contract: `mount(el, issue)`. Header slots get no issue. Detail slots
 * are mounted again on the same element when the issue changes (another
 * bead, an update or a new comment), so mount must update `el` in place.
 *
 * @param {ParentNode} [root]
 * @param {unknown} [issue]
 * @returns {Promise<void>}
 */
export async function mountSlots(root = document, issue = undefined) {
  const els = /** @type {HTMLElement[]} */ (
    Array.from(root.querySelectorAll('[data-slot]'))
  );
  await Promise.all(
    els.map(async (el) => {
      const spec = /** @type {Record<string, string[]>} */ (SLOTS)[
        el.dataset.slot || ''
      ];
      if (!spec) {
        return;
      }
      const slot = /** @type {any} */ (el);
      // No issue (header slots): mount once. With an issue (detail slots):
      // mount again when the issue's stamp changes.
      const stamp = issueStamp(issue);
      if (issue === undefined ? el.dataset.mounted : slot._stamp === stamp) {
        return;
      }
      slot._stamp = stamp;
      el.dataset.mounted = '1';
      try {
        const mod = await loadView(spec[0]);
        mod[spec[1]](el, issue);
      } catch {
        delete el.dataset.mounted;
      }
    })
  );
}
