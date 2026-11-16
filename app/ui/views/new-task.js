/**
 * New-task dialog (v3, beads-lite-1bo5.6.59.7). Company rule: every bead has a
 * parent, so parent is required, with type, assignee and priority. Same call
 * as the legacy dialog (create-issue); the server echoes the new id and applies
 * parent and assignee. Against a server that does not, the id is found by
 * title like legacy, the assignee is set with update-assignee, and a parent
 * that could not be set is reported as text (never silently dropped).
 */
import { html, render } from 'lit-html';
import { typeLabel } from '../../utils/issue-type.js';
import { priorityName } from '../../utils/priority.js';
import { button } from '../components/index.js';
import { openSheet } from '../components/sheet.js';
import { personLabel } from '../data/people.js';
import { registeredProjects } from '../data/registered.js';
import { t3 } from '../i18n.js';
import { projectOf } from '../tasks/lanes.js';
import { loadSaved } from '../tasks/saved-filters.js';

export const NEW_TYPES = ['task', 'bug', 'feature', 'epic', 'chore'];
const ROLES = ['cos', 'cto', 'pm', 'swe', 'qa', 'sre', 'sec', 'legal', 'ux'];
/** The project last used for a new task (device copy). */
const LAST_KEY = 'bdui.newtask.project';
const WS_KEY = 'beads-ui.workspace';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;

/** @param {string} id */
const numeric = (id) => {
  const m = /-(\d+)$/.exec(String(id || ''));
  return m ? Number(m[1]) : -1;
};

/**
 * @param {any} ctx
 * @returns {any[]}
 */
function allIssues(ctx) {
  try {
    return ctx.listSelectors?.selectIssuesFor('tab:all') || [];
  } catch {
    return [];
  }
}

/**
 * @param {HTMLElement} host - element to mount the sheet in (inside .u3)
 * @param {any} ctx
 * @param {{ parent?: string, onCreated?: (id: string) => void }} [opts]
 */
export function openNewTask(host, ctx, opts = {}) {
  const send = (/** @type {string} */ t, /** @type {any} */ p) =>
    ctx.send ? ctx.send(t, p) : ctx.client.send(t, p);
  const issues = allIssues(ctx);
  const parentsAll = issues.filter(
    (i) =>
      ['epic', 'feature', 'story'].includes(String(i.issue_type || '')) &&
      i.status !== 'closed'
  );
  const parentsOf = () =>
    f.project
      ? parentsAll.filter((i) => projectOf(i.id) === f.project)
      : parentsAll;
  const people = new Set(ROLES);
  for (const i of issues) if (i.assignee) people.add(String(i.assignee));
  /** @type {Record<string, string>} */
  const f = {
    title: '',
    parent: opts.parent || '',
    type: 'task',
    assignee: '',
    priority: '2',
    labels: '',
    description: ''
  };
  const projects = registeredProjects(ctx.store);
  const projectKeys = projects.map((w) => w.key);
  /** The project the task is made in: the parent's, else the one project in the Tasks filter, else the last used. */
  function defaultProject() {
    if (!projectKeys.length) return '';
    if (projectKeys.length === 1) return projectKeys[0];
    const fromParent = opts.parent ? projectOf(opts.parent) : '';
    if (projectKeys.includes(fromParent)) return fromParent;
    const picked = loadSaved().project;
    if (picked.length === 1 && projectKeys.includes(picked[0]))
      return picked[0];
    try {
      const last = window.localStorage.getItem(LAST_KEY) || '';
      if (projectKeys.includes(last)) return last;
    } catch {
      // no storage: no memory
    }
    return '';
  }
  f.project = defaultProject();
  /** The connection moved to another project: reload on close so every list is right again. */
  let switched = false;
  let busy = false;
  let error = '';
  let created = '';
  const body = document.createElement('div');
  /** @type {{ close: () => void } | null} */
  let sheet = null;

  /** @param {string} key */
  const on = (key) => (/** @type {Event} */ e) => {
    f[key] = /** @type {HTMLInputElement} */ (e.target).value;
    if (error && !created && !busy) {
      error = '';
      paint();
    }
  };

  /** @param {string} key */
  function fail(key) {
    error = t3(key);
    paint();
  }

  /** @param {string} title */
  async function findByTitle(title) {
    try {
      const list = /** @type {any} */ (
        await send('list-issues', { filters: { status: 'open', limit: 50 } })
      );
      let best = '';
      for (const it of Array.isArray(list) ? list : []) {
        if (String(it.title || '') === title && numeric(it.id) > numeric(best))
          best = String(it.id);
      }
      return best;
    } catch {
      return '';
    }
  }

  async function submit() {
    if (busy) return;
    const title = f.title.trim();
    const parent = f.parent.trim();
    const assignee = f.assignee.trim();
    const prio = Number(f.priority);
    if (projectKeys.length && !f.project) return fail('u3_nt_project_req');
    if (!title) return fail('u3_nt_title_req');
    if (!parent) return fail('u3_nt_parent_req');
    if (!ID_RE.test(parent)) return fail('u3_nt_parent_bad');
    if (f.project && projectOf(parent) !== f.project)
      return fail('u3_nt_parent_other');
    // only a project whose tasks are loaded can say a parent does not exist
    if (
      (f.project
        ? issues.some((i) => projectOf(i.id) === f.project)
        : issues.length > 0) &&
      !issues.some((i) => i.id === parent)
    )
      return fail('u3_nt_parent_unknown');
    if (!NEW_TYPES.includes(f.type)) return fail('u3_nt_type_req');
    if (!assignee) return fail('u3_nt_assignee_req');
    if (!(prio >= 0 && prio <= 4)) return fail('u3_nt_prio_req');
    const labels = f.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    busy = true;
    error = '';
    paint();
    /** @type {any} */
    const payload = { title, type: f.type, priority: prio, parent, assignee };
    if (f.description) payload.description = f.description;
    try {
      // the server writes to the project this connection is on: move it there
      const target = projects.find((w) => w.key === f.project);
      const current = ctx.store?.getState?.().workspace?.current?.path || '';
      if (target && target.path !== current) {
        try {
          const r = /** @type {any} */ (
            await send('set-workspace', { path: target.path })
          );
          if (!r || !r.workspace) throw new Error('no workspace');
          window.localStorage.setItem(WS_KEY, target.path);
          switched = true;
        } catch {
          busy = false;
          return fail('u3_nt_project_switch');
        }
      }
      /** @type {any} */
      const reply = await send('create-issue', payload);
      let id = String(reply?.id || '');
      if (!id) id = await findByTitle(title);
      if (!id) {
        error = t3('u3_nt_created_noid');
        busy = false;
        paint();
        return;
      }
      let note = '';
      if (reply?.assignee !== assignee) {
        try {
          await send('update-assignee', { id, assignee });
        } catch {
          note += ' ' + t3('u3_nt_assignee_not_set');
        }
      }
      if (reply?.parent !== parent) note += ' ' + t3('u3_nt_parent_not_set');
      for (const label of labels) {
        try {
          await send('label-add', { id, label });
        } catch {
          note += ' ' + t3('u3_nt_label_not_set') + ' ' + label;
        }
      }
      if (note) {
        created = id;
        error = t3('u3_nt_created') + ' ' + id + '.' + note;
        busy = false;
        paint();
        return;
      }
      if (f.project) {
        try {
          window.localStorage.setItem(LAST_KEY, f.project);
        } catch {
          // no storage: no memory
        }
      }
      opts.onCreated?.(id);
      sheet?.close();
      window.location.hash = `#/issues?issue=${encodeURIComponent(id)}`;
    } catch (e) {
      busy = false;
      const r = String(/** @type {any} */ (e)?.message || '').trim();
      error = r ? `${t3('u3_nt_failed')}: ${r}` : t3('u3_nt_failed');
      paint();
    }
  }

  /** @param {string} id - @param {string} key - @param {any} inner */
  const field = (id, key, inner) =>
    html`<div class="u3-nt__f">
      <label class="u3-ed__lbl" for=${id}>${t3(key)}</label>${inner}
    </div>`;

  function paint() {
    render(
      html`<form
        class="u3-nt"
        novalidate
        @submit=${(/** @type {Event} */ e) => {
          e.preventDefault();
          void submit();
        }}
      >
        ${projectKeys.length
          ? field(
              'u3-nt-project',
              'u3_nt_project',
              html`<select
                id="u3-nt-project"
                class="u3-ed__in"
                data-testid="nt-project"
                @change=${(/** @type {Event} */ e) => {
                  f.project = /** @type {HTMLSelectElement} */ (e.target).value;
                  error = '';
                  paint();
                }}
              >
                ${f.project
                  ? ''
                  : html`<option value="" selected>
                      ${t3('u3_nt_project_ph')}
                    </option>`}
                ${projectKeys.map(
                  (k) =>
                    html`<option value=${k} ?selected=${k === f.project}>
                      ${k}
                    </option>`
                )}
              </select>`
            )
          : ''}
        ${field(
          'u3-nt-title',
          'u3_nt_title',
          html`<input
            id="u3-nt-title"
            class="u3-ed__in"
            dir="auto"
            maxlength="500"
            .value=${f.title}
            @input=${on('title')}
          />`
        )}
        ${field(
          'u3-nt-parent',
          'u3_nt_parent',
          html`<input
              id="u3-nt-parent"
              class="u3-ed__in"
              dir="ltr"
              list="u3-nt-parents"
              maxlength="100"
              autocomplete="off"
              placeholder=${t3('u3_nt_parent_ph')}
              .value=${f.parent}
              @input=${on('parent')}
            /><datalist id="u3-nt-parents">
              ${parentsOf().map(
                (i) =>
                  html`<option value=${i.id}>${String(i.title || '')}</option>`
              )}
            </datalist>`
        )}
        <div class="u3-nt__two">
          ${field(
            'u3-nt-type',
            'u3_ts_type',
            html`<select
              id="u3-nt-type"
              class="u3-ed__in"
              @change=${on('type')}
            >
              ${NEW_TYPES.map(
                (x) =>
                  html`<option value=${x} ?selected=${x === f.type}>
                    ${typeLabel(x)}
                  </option>`
              )}
            </select>`
          )}
          ${field(
            'u3-nt-prio',
            'u3_ts_priority',
            html`<select
              id="u3-nt-prio"
              class="u3-ed__in"
              @change=${on('priority')}
            >
              ${[0, 1, 2, 3, 4].map(
                (n) =>
                  html`<option
                    value=${String(n)}
                    ?selected=${String(n) === f.priority}
                  >
                    ${priorityName(n)}
                  </option>`
              )}
            </select>`
          )}
        </div>
        ${field(
          'u3-nt-asg',
          'u3_ts_assignee',
          html`<input
              id="u3-nt-asg"
              class="u3-ed__in"
              dir="ltr"
              list="u3-nt-people"
              maxlength="100"
              autocomplete="off"
              .value=${f.assignee}
              @input=${on('assignee')}
            /><datalist id="u3-nt-people">
              ${[...people]
                .sort()
                .map(
                  (r) =>
                    html`<option
                      value=${r}
                      label=${personLabel(r).full}
                    ></option>`
                )}
            </datalist>`
        )}
        ${field(
          'u3-nt-labels',
          'u3_ts_labels',
          html`<input
            id="u3-nt-labels"
            class="u3-ed__in"
            dir="auto"
            maxlength="300"
            placeholder=${t3('u3_nt_labels_ph')}
            .value=${f.labels}
            @input=${on('labels')}
          />`
        )}
        ${field(
          'u3-nt-desc',
          'u3_ts_description',
          html`<textarea
            id="u3-nt-desc"
            class="u3-ed__in u3-ed__ta"
            dir="auto"
            rows="5"
            maxlength="100000"
            .value=${f.description}
            @input=${on('description')}
          ></textarea>`
        )}
        ${error
          ? html`<p role="alert" class="u3-ed__err" dir="auto">
              ${error}
              ${created
                ? html`<a
                    class="u3-mono"
                    href=${`#/issues?issue=${encodeURIComponent(created)}`}
                    @click=${() => sheet?.close()}
                    >${created}</a
                  >`
                : ''}
            </p>`
          : ''}
        <div class="u3-nt__act">
          ${button({
            label: busy ? t3('u3_nt_creating') : t3('u3_nt_create'),
            type: 'submit',
            disabled: busy || (projectKeys.length > 0 && !f.project)
          })}
        </div>
      </form>`,
      body
    );
  }

  paint();
  sheet = openSheet(host, {
    title: t3('u3_nt_head'),
    body,
    closeLabel: t3('u3_ed_close'),
    onClose: () => {
      render(html``, body);
      if (switched) window.location.reload();
    }
  });
  body.querySelector('input')?.focus();
  return sheet;
}
