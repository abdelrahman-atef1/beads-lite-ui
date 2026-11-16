/**
 * Task page (v3, beads-lite-1bo5.6.59.6): header, details, description /
 * design / notes / acceptance, relations, comments (anchors, steps, decision
 * card) and the composer. Same data and write path as the legacy detail view
 * (issue-detail subscription, get-comments, add-comment); anchors reuse
 * utils/anchor.js. Slots left for: ask head (8), time (12), composer extras
 * (13), edit controls (7).
 */
import { html, nothing, render } from 'lit-html';
import {
  commentAnchor,
  findCommentIndex,
  findLineElement,
  parseAnchor
} from '../../utils/anchor.js';
import { bindAttClicks, setImgContext } from '../../utils/att-images.js';
import { parseDecisionComment } from '../../utils/decision-comment.js';
import { renderFolded } from '../../utils/fold.js';
import { getLang } from '../../utils/i18n.js';
import { linkifyText } from '../../utils/linkify-ids.js';
import { renderMarkdown } from '../../utils/markdown.js';
import { priorityName } from '../../utils/priority.js';
import { splitReactions } from '../../utils/reactions.js';
import { statusLabel } from '../../utils/status.js';
import { renderAskHead } from '../ask/head-slot.js';
import { renderStepsComment } from '../card/steps.js';
import { button, chip } from '../components/index.js';
import { t3 } from '../i18n.js';
import { personChip } from '../people/person-chip.js';
import { renderComposerExtras } from '../task/composer-ext.js';
import { renderTimeSlot } from '../task/time-slot.js';
import { renderCard } from './card.js';
import {
  afterCommentPosted,
  loadChips,
  renderMentionChips
} from './mention.js';
import { openNewTask } from './new-task.js';
import { createTaskEdit } from './task-edit.js';

const COMMENT_MAX = 20000;

/** @param {string | number | undefined} v */
export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  // Western digits in both languages.
  return d.toLocaleDateString(
    getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' }
  );
}

/** @param {string} s */
const flat = (s) => html`<span class="u3-ts__flat">${linkifyText(s)}</span>`;
/** @param {string} id */
const projectOf = (id) => String(id).replace(/-[^-]*$/, '');
/** @param {string} id */
const href = (id) => `#/issues?issue=${encodeURIComponent(id)}`;

const TONE = /** @type {Record<string, string>} */ ({
  in_progress: 'blue',
  blocked: 'red',
  owner_decision: 'amber',
  waiting_for_test: 'teal',
  waiting_for_merge: 'green'
});

/**
 * @param {HTMLElement} el
 * @param {any} ctx
 */
const QUEUED_MS = 4000;

export function mount(el, ctx) {
  const stores = ctx.sub_issue_stores;
  const subs = ctx.subscriptions;
  const send = (/** @type {string} */ t, /** @type {any} */ p) =>
    ctx.send ? ctx.send(t, p) : ctx.client.send(t, p);
  let alive = true;
  let route = ctx.route;
  let id = '';
  /** @type {any} */
  let issue = null;
  let loaded = false;
  let sub_failed = false;
  /** @type {any[] | null} */
  let comments = null;
  let comments_error = false;
  let text = '';
  let pending = false;
  let post_error = false;
  let queued = false;
  // Flat page (beads-lite-1bo5.13.2): one tab at a time, the add-comment box
  // is one line until tapped, the ⋯ menu and the time detail are closed.
  let tab = 'comments';
  let composing = false;
  let menu_open = false;
  let time_open = false;
  let anchor_done = '';
  /** @type {null | (() => void)} */
  let unsub_store = null;
  /** @type {null | (() => Promise<void>)} */
  let unsub_sub = null;
  let seq = 0;
  const edit = createTaskEdit({
    send,
    ctx,
    get: () => issue,
    patch: (p) => {
      issue = { ...issue, ...p };
    },
    redraw: () => draw()
  });

  function readIssue() {
    const cid = `detail:${id}`;
    const snap = stores.snapshotFor ? stores.snapshotFor(cid) : [];
    const found = (snap || []).find((/** @type {any} */ i) => i.id === id);
    if (found) issue = found;
    loaded = Boolean(stores.isLoaded && stores.isLoaded(cid));
  }

  async function loadComments() {
    const my = ++seq;
    comments_error = false;
    try {
      const list = await send('get-comments', { id });
      if (!alive || my !== seq) return;
      comments = Array.isArray(list) ? list : [];
    } catch {
      if (!alive || my !== seq) return;
      comments_error = true;
    }
    draw();
    // @mention chips (beads-lite-1bo5.6.59.13): drawn once they arrive
    void loadChips(ctx, id).then(() => {
      if (alive && my === seq) draw();
    });
  }

  /** @param {string} next */
  function open(next) {
    teardown();
    edit.reset();
    id = next;
    issue = null;
    sub_failed = false;
    comments = null;
    text = '';
    tab = 'comments';
    composing = false;
    closeMenu();
    time_open = false;
    anchor_done = '';
    setImgContext({ bead: id });
    const cid = `detail:${id}`;
    const spec = { type: 'issue-detail', params: { id } };
    try {
      stores.register(cid, spec);
    } catch {
      // already registered
    }
    if (stores.subscribeFor) {
      unsub_store = stores.subscribeFor([cid], () => {
        readIssue();
        draw();
      });
    }
    void subs
      .subscribeList(cid, spec)
      .then((/** @type {() => Promise<void>} */ u) => {
        if (alive && id === next) unsub_sub = u;
        else void u().catch(() => {});
      })
      .catch(() => {
        // Unknown id: the server refuses the subscription; say so, not loading.
        if (alive && id === next) {
          sub_failed = true;
          draw();
        }
      });
    readIssue();
    void loadComments();
    draw();
  }

  function teardown() {
    if (unsub_store) unsub_store();
    unsub_store = null;
    if (unsub_sub) void unsub_sub().catch(() => {});
    unsub_sub = null;
  }

  async function post() {
    const body = text.trim();
    if (!body || pending || body.length > COMMENT_MAX) return;
    pending = true;
    post_error = false;
    queued = false;
    draw();
    // Offline the socket holds the request and sends it on reconnect: say so
    // instead of sitting on "Sending…" (queued, no second post needed).
    const q = setTimeout(() => {
      queued = true;
      draw();
    }, QUEUED_MS);
    try {
      const res = await send('add-comment', { id, text: body });
      if (Array.isArray(res)) {
        comments = res;
        text = '';
        composing = false;
        // mentions are scanned in the background; the box closes at once
        void afterCommentPosted(ctx, id, body).catch(() => {});
      }
    } catch {
      post_error = true;
    }
    clearTimeout(q);
    queued = false;
    pending = false;
    draw();
  }

  /** Close the ⋯ menu; the outside-click listener lives only while open. */
  function closeMenu() {
    menu_open = false;
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKey, true);
  }
  /** @param {Event} e */
  function onDocClick(e) {
    if (!(e.target instanceof Node) || !el.querySelector('.u3-ts__more')) {
      return;
    }
    if (!el.querySelector('.u3-ts__more')?.contains(e.target)) {
      closeMenu();
      draw();
    }
  }
  /** @param {KeyboardEvent} e */
  function onDocKey(e) {
    if (e.key === 'Escape') {
      closeMenu();
      draw();
    }
  }
  function toggleMenu() {
    if (menu_open) closeMenu();
    else {
      menu_open = true;
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onDocKey, true);
    }
    draw();
  }
  function addSubtask() {
    closeMenu();
    draw();
    openNewTask(el.closest('.u3') || el, ctx, { parent: issue.id });
  }
  function toggleEdit() {
    closeMenu();
    if (!edit.isEditing()) tab = 'description';
    edit.toggle();
  }
  function openComposer() {
    tab = 'comments';
    composing = true;
    draw();
    const ta = /** @type {HTMLTextAreaElement | null} */ (
      el.querySelector('#u3-ts-in')
    );
    if (ta) {
      ta.focus();
      ta.scrollIntoView({ block: 'center' });
    }
  }
  /** @param {string} target - which tab holds this anchor */
  function tabOf(target) {
    if (['description', 'design', 'notes', 'acceptance'].includes(target)) {
      return 'description';
    }
    if (target.startsWith('rel-')) return 'subtasks';
    return 'comments';
  }

  /** @param {string} label - @param {any} value */
  const row = (label, value) =>
    html`<div class="u3-ts__row">
      <span class="u3-ts__k">${label}</span>
      <span class="u3-ts__v">${value}</span>
    </div>`;

  /** @param {string} key - @param {string} anchor @param {string} body */
  const field = (key, anchor, body) =>
    String(body || '').trim()
      ? html`<section class="u3-ts__sec" data-anchor=${anchor}>
          <h3 class="u3-ts__h">${t3(key)}</h3>
          <div class="u3-ts__md" dir="auto">
            ${renderFolded(body, renderMarkdown)}
          </div>
        </section>`
      : nothing;

  /** @param {string} key - @param {any[]} items */
  const relations = (key, items) =>
    items.length
      ? html`<section class="u3-ts__sec" data-anchor=${'rel-' + key}>
          <h3 class="u3-ts__h">
            ${t3(key)} <span class="u3-muted">${items.length}</span>
          </h3>
          <ul class="u3-ts__rel">
            ${items.map(
              (/** @type {any} */ d) =>
                html`<li>
                  <a class="u3-ts__rl" href=${href(d.id)}>
                    <span class="u3-mono u3-ts__rid">${d.id}</span>
                    <span class="u3-ts__rt" dir="auto">${d.title || ''}</span>
                    ${d.status
                      ? chip({
                          label: statusLabel(d.status),
                          tone: TONE[d.status] || 'neutral'
                        })
                      : nothing}
                  </a>
                </li>`
            )}
          </ul>
        </section>`
      : nothing;

  /** @param {any} c - @param {boolean} as_card - @param {{ emoji: string, who: string[] }[]} [reacts] */
  function commentView(c, as_card, reacts = []) {
    const body_text = String(c.text || '');
    const a = commentAnchor(c);
    const author = String(c.author || '') || t3('u3_ts_unknown');
    let body;
    if (as_card) {
      body = renderCard({ id, title: issue?.title || '' }, ctx);
    } else if (body_text.startsWith('STEPS: ')) {
      const st = renderStepsComment(c, { issueId: id, client: ctx.client });
      body =
        st === nothing ? renderFolded(body_text, renderMarkdown, flat) : st;
    } else {
      body = html`<div dir="auto">
        ${renderFolded(body_text, renderMarkdown, flat)}
      </div>`;
    }
    const is_decision = Boolean(parseDecisionComment(body_text));
    return html`<article
      class="u3-ts__c${is_decision ? ' u3-ts__c--decision' : ''}"
      data-anchor=${a}
    >
      <header class="u3-ts__ch">
        ${personChip({ role: author })}
        <span class="u3-muted u3-ts__cd">${fmtDate(c.created_at)}</span>
        <a
          class="u3-ts__cl"
          title=${t3('u3_ts_link')}
          aria-label=${t3('u3_ts_link')}
          href=${href(id) + '&at=' + a}
          >#</a
        >
      </header>
      <div class="u3-ts__cb">${body}</div>
      ${reacts.length
        ? html`<div class="u3-ts__rx" data-reactions>
            ${reacts.map(
              (r) =>
                html`<span class="u3-ts__rxc" title=${r.who.join(', ')}
                  >${r.emoji}
                  <span class="u3-muted">${r.who.join(', ')}</span></span
                >`
            )}
          </div>`
        : nothing}
      ${renderMentionChips(id, c, c === comments?.[comments.length - 1])}
    </article>`;
  }

  function commentsBlock() {
    const { real: list, byAnchor } = splitReactions(comments || []);
    let seen_decision = false;
    // Newest first, like the legacy page; the card shows once (newest ask).
    const items = [...list].reverse().map((c) => {
      const is_d = Boolean(parseDecisionComment(String(c.text || '')));
      const first = is_d && !seen_decision;
      if (is_d) seen_decision = true;
      return commentView(c, first, byAnchor.get(commentAnchor(c)) || []);
    });
    const open = composing || pending || Boolean(text.trim());
    const composer = open
      ? html`<div class="u3-ts__composer">
          <label class="u3-ts__lbl" for="u3-ts-in">${t3('u3_ts_add')}</label>
          <textarea
            id="u3-ts-in"
            class="u3-ts__in"
            dir="auto"
            rows="3"
            maxlength=${COMMENT_MAX}
            placeholder=${t3('u3_ts_ph')}
            .value=${text}
            ?disabled=${pending}
            @input=${(/** @type {Event} */ e) => {
              const was = Boolean(text.trim());
              text = /** @type {HTMLTextAreaElement} */ (e.target).value;
              if (was !== Boolean(text.trim())) draw();
            }}
            @keydown=${(/** @type {KeyboardEvent} */ e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void post();
              }
            }}
          ></textarea>
          <div class="u3-ts__act">
            ${renderComposerExtras(ctx)}
            ${button({
              label: t3('u3_ts_cancel'),
              variant: 'ghost',
              disabled: pending,
              onClick: () => {
                text = '';
                composing = false;
                post_error = false;
                draw();
              }
            })}
            ${button({
              label: pending ? t3('u3_ts_sending') : t3('u3_ts_send'),
              disabled: pending || !text.trim(),
              onClick: () => void post()
            })}
          </div>
          ${queued && pending
            ? html`<p role="status" class="u3-muted">${t3('u3_ts_queued')}</p>`
            : nothing}
          ${post_error
            ? html`<p role="alert" class="u3-ts__err">
                ${t3('u3_ts_failed')}
                ${button({
                  label: t3('u3_ts_retry'),
                  variant: 'ghost',
                  onClick: () => void post()
                })}
              </p>`
            : nothing}
        </div>`
      : html`<button
          type="button"
          class="u3-ts__quick"
          @click=${() => openComposer()}
        >
          ${t3('u3_ts_add')}
        </button>`;
    // The add-comment box sits at the TOP of the thread, above the newest
    // comment (owner, 2026-11-16).
    return html`<section class="u3-ts__sec" data-anchor="comments">
      ${composer}
      ${comments_error
        ? html`<p role="alert" class="u3-muted">
            ${t3('u3_ts_comments_failed')}
            ${button({
              label: t3('u3_ts_retry'),
              variant: 'ghost',
              onClick: () => void loadComments()
            })}
          </p>`
        : comments === null
          ? html`<p class="u3-muted">${t3('u3_ts_loading')}</p>`
          : list.length === 0
            ? html`<p class="u3-muted">${t3('u3_ts_no_comments')}</p>`
            : items}
    </section>`;
  }

  /**
   * One outer template for both pages: the ask head is its last child, so it
   * is the same DOM node when the page goes from loading to loaded (a second
   * host would drop an open panel, beads-lite-1bo5.6.59.8).
   *
   * @param {import('lit-html').TemplateResult} inner
   */
  const page = (inner) =>
    html`<section class="u3-ts" data-view="task" data-at=${route.at ?? ''}>
      ${inner}${renderAskHead(route, ctx)}
    </section>`;

  function draw() {
    if (!alive) return;
    if (!issue) {
      render(
        page(
          html`<p class="u3-muted u3-mono" dir="ltr">${id}</p>
            <p class="u3-muted">
              ${loaded || sub_failed
                ? t3('u3_ts_missing')
                : t3('u3_ts_loading')}
            </p>`
        ),
        el
      );
      return;
    }
    const i = issue;
    const deps = Array.isArray(i.dependencies) ? i.dependencies : [];
    const dependents = Array.isArray(i.dependents) ? i.dependents : [];
    const isChild = (/** @type {any} */ d) =>
      d.dependency_type === 'parent-child';
    const children = dependents.filter(isChild);
    const others = dependents.filter((/** @type {any} */ d) => !isChild(d));
    const parent = deps.find(isChild);
    const labels = Array.isArray(i.labels) ? i.labels : [];
    const acceptance = i.acceptance || i.acceptance_criteria || '';
    const editing = edit.isEditing();
    const tabs = [
      ['comments', t3('u3_ts_comments'), (comments || []).length],
      ['description', t3('u3_ts_description'), null],
      [
        'subtasks',
        t3('u3_ts_children'),
        children.length + deps.length + others.length
      ]
    ];
    const hot = Number(i.priority) <= 1;
    const facts = html`${row(t3('u3_ts_status'), statusLabel(i.status))}
    ${row(
      t3('u3_ts_assignee'),
      i.assignee ? personChip({ role: String(i.assignee) }) : t3('u3_ts_none')
    )}
    ${row(t3('u3_ts_priority'), priorityName(i.priority))}
    ${row(t3('u3_ts_project'), projectOf(i.id))}
    ${i.issue_type ? row(t3('u3_ts_type'), i.issue_type) : nothing}
    ${parent
      ? row(
          t3('u3_ts_parent'),
          html`<a class="u3-mono" href=${href(parent.id)}>${parent.id}</a>`
        )
      : nothing}
    ${row(t3('u3_ts_created'), fmtDate(i.created_at))}
    ${row(t3('u3_ts_updated'), fmtDate(i.updated_at))}
    ${labels.length
      ? row(
          t3('u3_ts_labels'),
          html`<span class="u3-ts__labels"
            >${labels.map((/** @type {string} */ l) =>
              chip({ label: l })
            )}</span
          >`
        )
      : nothing}
    ${i.close_reason ? row(t3('u3_ts_close_reason'), i.close_reason) : nothing}`;
    const panel =
      tab === 'description'
        ? html`${editing
            ? edit.description(i)
            : field('u3_ts_description', 'description', i.description)}
          ${field('u3_ts_design', 'design', i.design)}
          ${field('u3_ts_notes', 'notes', i.notes)}
          ${field('u3_ts_acceptance', 'acceptance', acceptance)}
          ${editing
            ? nothing
            : html`<section class="u3-ts__sec u3-ts__phone-facts">
                ${facts}
              </section>`}`
        : tab === 'subtasks'
          ? html`${relations('u3_ts_children', children)}
            ${relations(
              'u3_ts_deps',
              deps.filter((/** @type {any} */ d) => d !== parent)
            )}
            ${relations('u3_ts_dependents', others)}`
          : commentsBlock();
    render(
      page(
        html`<div class="u3-ts__top">
            <a
              class="u3-ts__back"
              href="#/issues"
              aria-label=${t3('u3_ts_back')}
              >&larr;</a
            >
            <span class="u3-ts__id u3-mono" dir="ltr">${i.id}</span>
            <span class="u3-ts__tools">
              <button
                type="button"
                class="u3-btn u3-btn--ghost u3-ed__toggle"
                aria-pressed=${editing ? 'true' : 'false'}
                @click=${() => toggleEdit()}
              >
                ${editing ? t3('u3_ed_done') : t3('u3_ed_edit')}
              </button>
              <span class="u3-ts__more">
                <button
                  type="button"
                  class="u3-ts__morebtn"
                  aria-haspopup="menu"
                  aria-expanded=${menu_open ? 'true' : 'false'}
                  aria-label=${t3('u3_ts_more')}
                  @click=${() => toggleMenu()}
                >
                  &#8943;
                </button>
                ${menu_open
                  ? html`<div class="u3-ts__menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        class="u3-ts__mi"
                        @click=${() => addSubtask()}
                      >
                        ${t3('u3_nt_sub')}
                      </button>
                    </div>`
                  : nothing}
              </span>
            </span>
          </div>
          ${edit.title(i)}
          <p class="u3-ts__facts">
            <span class="u3-ts__st u3-ts__st--${TONE[i.status] || 'neutral'}"
              >${statusLabel(i.status)}</span
            >
            <span class="u3-ts__pr${hot ? ' u3-ts__pr--hot' : ''}"
              >${priorityName(i.priority)}</span
            >
            <span class="u3-ts__pj">${projectOf(i.id)}</span>
          </p>
          <div class="u3-ts__time" ?data-open=${time_open}>
            ${renderTimeSlot(i, ctx)}
            <button
              type="button"
              class="u3-ts__timebtn"
              aria-expanded=${time_open ? 'true' : 'false'}
              @click=${() => {
                time_open = !time_open;
                draw();
              }}
            >
              ${t3('u3_ts_time_more')}
            </button>
          </div>
          <nav class="u3-ts__jump" role="tablist">
            ${tabs.map(
              ([k, label, n]) =>
                html`<button
                  type="button"
                  role="tab"
                  class="u3-ts__j${tab === k ? ' is-on' : ''}"
                  aria-selected=${tab === k ? 'true' : 'false'}
                  @click=${() => {
                    tab = String(k);
                    draw();
                  }}
                >
                  ${label}${n === null
                    ? nothing
                    : html` <span class="u3-muted">${n}</span>`}
                </button>`
            )}
          </nav>
          <div class="u3-ts__cols">
            <div class="u3-ts__main">${panel}</div>
            <aside class="u3-ts__side${editing ? ' is-editing' : ''}">
              <div class="u3-ts__acts">
                ${button({
                  label: t3('u3_ts_add'),
                  onClick: () => openComposer()
                })}
                ${button({
                  label: editing ? t3('u3_ed_done') : t3('u3_ed_edit'),
                  variant: 'ghost',
                  onClick: () => toggleEdit()
                })}
                ${button({
                  label: t3('u3_nt_sub'),
                  variant: 'ghost',
                  onClick: () => addSubtask()
                })}
              </div>
              ${editing ? edit.rows(i) : facts}
            </aside>
          </div>`
      ),
      el
    );
    bindAttClicks(el);
    applyAnchor();
  }

  // Deep link `&at=<anchor>`: scroll to and highlight once per (bead, anchor);
  // retried on later draws until the target exists.
  function applyAnchor() {
    const a = parseAnchor(window.location.hash || '');
    if (!a || !issue) {
      anchor_done = '';
      return;
    }
    const key = `${id}|${a.target}|${a.from}-${a.to}`;
    if (anchor_done === key) return;
    const need = tabOf(a.target);
    if (need !== tab) {
      tab = need;
      draw(); // re-enters here once the right tab is drawn
      return;
    }
    let attr = a.target;
    let source = '';
    if (a.target.startsWith('c-')) {
      if (comments === null) return;
      const idx = findCommentIndex(a.target, comments);
      if (idx < 0) {
        anchor_done = key; // loaded, no such comment: give up quietly
        return;
      }
      attr = commentAnchor(comments[idx]);
      source = String(comments[idx].text || '');
    } else if (a.target === 'acceptance') {
      source = String(issue.acceptance || issue.acceptance_criteria || '');
    } else if (['description', 'design', 'notes'].includes(a.target)) {
      source = String(issue[a.target] || '');
    } else if (a.target === 'card') {
      attr = 'comments';
    }
    const root = el.querySelector(`[data-anchor="${attr}"]`);
    if (!root) {
      if (comments !== null && loaded) anchor_done = key;
      return;
    }
    anchor_done = key;
    el.querySelectorAll('.anchor-hit').forEach((n) =>
      n.classList.remove('anchor-hit')
    );
    /** @type {Element[]} */
    const hits = [];
    if (a.from > 0) {
      for (let n = a.from; n <= a.to; n++) {
        const h = findLineElement(root, source, n);
        if (h && !hits.includes(h)) hits.push(h);
      }
    }
    const marks = hits.length ? hits : [root];
    marks.forEach((m) => {
      const d = m.closest('details.fold-sec');
      if (d) /** @type {HTMLDetailsElement} */ (d).open = true;
      m.classList.add('anchor-hit');
    });
    marks[0].scrollIntoView({ block: 'start' });
  }

  open(String(route.id || ''));
  return {
    update: (/** @type {any} */ r) => {
      route = r;
      if (String(r.id || '') !== id) open(String(r.id || ''));
      else {
        anchor_done = '';
        draw();
      }
    },
    unmount: () => {
      alive = false;
      closeMenu();
      teardown();
      render(html``, el);
    }
  };
}
