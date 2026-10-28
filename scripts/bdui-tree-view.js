import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';

/**
 * Tree view (company-8ce8.3): Epic > Story > Task, built client-side from the
 * `tab:tree` store (all open issues, linked by `parent`). Epics start open so
 * their stories show; a story's tasks show only when the story is opened.
 * Open issues whose parent is missing are grouped under "No parent".
 *
 * @param {HTMLElement} mount_element
 * @param {any} _data
 * @param {(id: string) => void} goto_issue
 * @param {any} [_subscriptions]
 * @param {{ snapshotFor?: (id: string) => any[], subscribe?: (fn: (client_id?: string) => void) => () => void }} [issue_stores]
 */
export function createEpicsView(
  mount_element,
  _data,
  goto_issue,
  _subscriptions = undefined,
  issue_stores = undefined
) {
  const STORE = 'tab:tree';
  const ORPHANS = '__orphans__';
  /** @type {Set<string>} */
  const open = new Set();
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, any[]>} */
  let kids = new Map();
  /** @type {any[]} */
  let roots = [];
  /** @type {any[]} */
  let orphans = [];
  /** @type {Map<string, number>} */
  let counts = new Map();

  if (issue_stores && typeof issue_stores.subscribe === 'function') {
    issue_stores.subscribe((client_id) => {
      if (client_id && client_id !== STORE) {
        return;
      }
      rebuild();
      doRender();
    });
  }

  /** @param {any} a @param {any} b */
  const cmp = (a, b) =>
    Number(a.priority ?? 2) - Number(b.priority ?? 2) ||
    Number(a.created_at || 0) - Number(b.created_at || 0);

  /** @param {any} it */
  function parentOf(it) {
    if (it.parent) {
      return String(it.parent);
    }
    const deps = Array.isArray(it.dependencies) ? it.dependencies : [];
    const d = deps.find((x) => x && x.type === 'parent-child');
    return d ? String(d.depends_on_id) : '';
  }

  function rebuild() {
    const all = (issue_stores?.snapshotFor?.(STORE) || []).filter(
      (it) => it && it.status !== 'closed' && it.status !== 'tombstone'
    );
    const ids = new Set(all.map((it) => String(it.id)));
    kids = new Map();
    roots = [];
    orphans = [];
    for (const it of all) {
      const p = parentOf(it);
      if (p && ids.has(p)) {
        if (!kids.has(p)) {
          kids.set(p, []);
        }
        /** @type {any[]} */ (kids.get(p)).push(it);
      } else if (it.issue_type === 'epic') {
        roots.push(it);
      } else {
        orphans.push(it);
      }
    }
    for (const arr of kids.values()) {
      arr.sort(cmp);
    }
    roots.sort(cmp);
    orphans.sort(cmp);
    counts = new Map();
    /** @param {any} it @returns {number} */
    const count = (it) => {
      const id = String(it.id);
      if (counts.has(id)) {
        return /** @type {number} */ (counts.get(id));
      }
      counts.set(id, 0);
      let n = 0;
      for (const c of kids.get(id) || []) {
        n += 1 + count(c);
      }
      counts.set(id, n);
      return n;
    };
    for (const r of roots) {
      count(r);
    }
    for (const o of orphans) {
      count(o);
    }
    // Epics start open (stories visible); everything else starts closed.
    for (const r of roots) {
      const id = String(r.id);
      if (!seen.has(id)) {
        seen.add(id);
        open.add(id);
      }
    }
  }

  /** @param {string} id */
  function toggle(id) {
    if (open.has(id)) {
      open.delete(id);
    } else {
      open.add(id);
    }
    doRender();
  }

  /** @param {any} it @param {number} depth */
  function node(it, depth) {
    const id = String(it.id);
    const children = kids.get(id) || [];
    const is_open = open.has(id);
    const n = counts.get(id) || 0;
    const type = String(it.issue_type || 'task');
    // Under an epic, stories show; plain tasks wait in one collapsed group.
    const split = type === 'epic';
    const shown = split
      ? children.filter((c) => c.issue_type === 'story')
      : children;
    const loose = split ? children.filter((c) => c.issue_type !== 'story') : [];
    return html`
      <div class="tree-node tree-d${Math.min(depth, 3)}" data-id=${id}>
        <div
          class="tree-row ${children.length ? 'tree-row--has' : ''}"
          @click=${() => (children.length ? toggle(id) : goto_issue(id))}
        >
          <span class="tree-caret" aria-hidden="true"
            >${children.length ? (is_open ? '▾' : '▸') : ''}</span
          >
          <span class="type-badge type-badge--${type}">${type}</span>
          <a
            class="mono tree-id"
            href="#/epics?issue=${encodeURIComponent(id)}"
            @click=${(/** @type {Event} */ ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              goto_issue(id);
            }}
            >${id}</a
          >
          <span class="text-truncate tree-title"
            >${it.title || '(no title)'}</span
          >
          <span class="muted tree-meta"
            >${it.assignee ? it.assignee + ' · ' : ''}P${it.priority ?? 2}${n
              ? ` · ${n} open`
              : ''}</span
          >
        </div>
        ${is_open && children.length
          ? html`<div class="tree-kids">
              ${repeat(
                shown,
                (c) => String(c.id),
                (c) => node(c, depth + 1)
              )}
              ${loose.length ? looseNode(id, loose, depth + 1) : null}
            </div>`
          : null}
      </div>
    `;
  }

  /** @param {string} epic_id @param {any[]} list @param {number} depth */
  function looseNode(epic_id, list, depth) {
    const key = 'loose:' + epic_id;
    const is_open = open.has(key);
    return html`<div class="tree-node tree-d${Math.min(depth, 3)}">
      <div class="tree-row tree-row--has" @click=${() => toggle(key)}>
        <span class="tree-caret" aria-hidden="true"
          >${is_open ? '▾' : '▸'}</span
        >
        <span class="tree-title muted">Tasks without a story</span>
        <span class="muted tree-meta">${list.length} open</span>
      </div>
      ${is_open
        ? html`<div class="tree-kids">
            ${repeat(
              list,
              (c) => String(c.id),
              (c) => node(c, depth + 1)
            )}
          </div>`
        : null}
    </div>`;
  }

  function template() {
    if (!roots.length && !orphans.length) {
      return html`<div class="panel__header muted">No open issues.</div>`;
    }
    const orph_open = open.has(ORPHANS);
    return html`
      ${repeat(
        roots,
        (r) => String(r.id),
        (r) => node(r, 0)
      )}
      ${orphans.length
        ? html`<div class="tree-node tree-d0">
            <div class="tree-row tree-row--has" @click=${() => toggle(ORPHANS)}>
              <span class="tree-caret" aria-hidden="true"
                >${orph_open ? '▾' : '▸'}</span
              >
              <span class="tree-title">No parent</span>
              <span class="muted tree-meta">${orphans.length} open</span>
            </div>
            ${orph_open
              ? html`<div class="tree-kids">
                  ${repeat(
                    orphans,
                    (c) => String(c.id),
                    (c) => node(c, 1)
                  )}
                </div>`
              : null}
          </div>`
        : null}
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  return {
    async load() {
      rebuild();
      doRender();
    }
  };
}
