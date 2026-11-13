import { html, nothing, render } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { errorText } from '../../utils/card-text.js';
import { showToast } from '../../utils/toast.js';
import { card as frame } from '../components/card.js';
import { chip } from '../components/chip.js';
import { roleChip } from '../components/role-chip.js';
import { ageText, clientOf, tc } from './common.js';
import { cardDir, detectLang } from './dir.js';

/**
 * Steps comment contract (beads-lite-1bo5.6.59.3, convention on .58): first
 * line `STEPS: <title>`, then a `## Steps` section of numbered lines
 * `1. text`. A fenced block or an indented line under an item is a command
 * (copy block); an item that is only `code` becomes a copy block too; other
 * inline `code` stays inline.
 *
 * @typedef {{ text: string, cmds: string[] }} StepItem
 * @typedef {{ title: string, items: StepItem[] }} ParsedSteps
 */

/**
 * @param {string} text
 * @returns {ParsedSteps | null} null when the comment is not a steps comment
 */
export function parseSteps(text) {
  const lines = String(text ?? '').split('\n');
  const first = (lines[0] || '').trim();
  if (!first.startsWith('STEPS: ')) return null;
  const at = lines.findIndex((l) => l.trim() === '## Steps');
  if (at < 0) return null;
  /** @type {StepItem[]} */
  const items = [];
  let fence = false;
  /** @type {string[]} */
  let buf = [];
  for (const raw of lines.slice(at + 1)) {
    const l = raw.trimEnd();
    if (!fence && /^## /.test(l.trim())) break;
    const cur = items[items.length - 1];
    if (/^\s*```/.test(l)) {
      if (fence && cur) cur.cmds.push(buf.join('\n'));
      fence = !fence;
      buf = [];
      continue;
    }
    if (fence) {
      buf.push(l.replace(/^ {0,4}/, ''));
      continue;
    }
    const m = /^(\d{1,2})[.)]\s+(.*)$/.exec(l.trim());
    if (m && !/^\s{2,}/.test(l)) {
      const whole = /^`([^`]+)`$/.exec(m[2].trim());
      items.push(
        whole ? { text: '', cmds: [whole[1]] } : { text: m[2], cmds: [] }
      );
    } else if (cur && /^( {4}|\t)\S/.test(l)) {
      cur.cmds.push(l.trim());
    } else if (cur && l.trim() && !cur.cmds.length) {
      cur.text = `${cur.text} ${l.trim()}`.trim();
    }
  }
  return { title: first.slice('STEPS: '.length), items };
}

/**
 * Inline `code` spans of a line as LTR monospace.
 *
 * @param {string} text
 */
function inline(text) {
  const parts = text.split(/(`[^`]+`)/);
  return html`${parts.map((s) =>
    s.length > 2 && s.startsWith('`') && s.endsWith('`')
      ? html`<code class="u3-mono">${s.slice(1, -1)}</code>`
      : s
  )}`;
}

/** @param {string} cmd @param {string} lang */
function cmdBlock(cmd, lang) {
  return html`<div class="u3-st__cmd">
    <code class="u3-mono u3-st__code" dir="ltr">${cmd}</code>
    <button
      type="button"
      class="u3-st__copy"
      aria-label=${tc('u3_steps_copy', lang)}
      @click=${async (/** @type {Event} */ ev) => {
        const b = /** @type {HTMLElement} */ (ev.currentTarget);
        try {
          await navigator.clipboard.writeText(cmd);
          b.dataset.copied = '1';
          showToast(tc('u3_steps_copied', lang), 'success', 1500);
        } catch {
          // no clipboard: the text is selectable
        }
      }}
    >
      ${tc('u3_steps_copy', lang)}
    </button>
  </div>`;
}

/**
 * @typedef {object} StepsState
 * @property {Set<number>} checked
 * @property {boolean} busy
 * @property {boolean} done
 * @property {boolean} asking
 * @property {string} question
 * @property {string} error
 * @property {string} wake
 * @property {boolean} sent
 */
/** @type {WeakMap<HTMLElement, StepsState>} */
const states = new WeakMap();

/**
 * Draw a steps comment: checklist, copyable commands, "I finished" (task 3
 * steps-done) and "I have a question" (card-ask, else a plain comment).
 * The task page (task 6) puts the returned template where the comment body
 * goes. `ctx` = { issueId, client?, open?: boolean, now?: number }; open false
 * draws the list without the buttons (steps already done or superseded).
 *
 * @param {{ id?: string, text?: string, author?: string, created_at?: string | number }} comment
 * @param {{ issueId: string, client?: any, open?: boolean, now?: number, onChange?: () => void }} ctx
 */
export function renderStepsComment(comment, ctx) {
  const parsed = parseSteps(String(comment?.text ?? ''));
  if (!parsed) return nothing;
  return html`<div
    class="u3-stcomment"
    data-cid=${comment?.id ? 'c-' + String(comment.id).slice(0, 8) : ''}
    ${ref((el) => {
      if (el) paintSteps(/** @type {HTMLElement} */ (el), comment, parsed, ctx);
    })}
  ></div>`;
}

/** @param {HTMLElement} el @param {any} comment @param {ParsedSteps} parsed @param {any} ctx */
function paintSteps(el, comment, parsed, ctx) {
  let s = states.get(el);
  if (!s) {
    s = {
      checked: new Set(),
      busy: false,
      done: false,
      asking: false,
      question: '',
      error: '',
      wake: '',
      sent: false
    };
    states.set(el, s);
  }
  const st = s;
  const lang = detectLang(
    `${parsed.title} ${parsed.items.map((i) => i.text).join(' ')}`
  );
  const again = () => paintSteps(el, comment, parsed, ctx);
  const open = ctx.open !== false && !st.done;
  const ref8 = 'c-' + String(comment?.id || '').slice(0, 8);
  const ts = comment?.created_at ? Date.parse(String(comment.created_at)) : 0;

  const done = async () => {
    if (st.busy) return;
    st.busy = true;
    st.error = '';
    again();
    try {
      const res = await clientOf(ctx).send('steps-done', {
        id: ctx.issueId,
        comment: ref8
      });
      st.done = true;
      st.wake = String(res?.wake || '');
      showToast(tc('u3_steps_done_note', lang), 'success', 2500);
      ctx.onChange?.();
    } catch (err) {
      st.error = errorText(String(/** @type {any} */ (err)?.message || ''));
    }
    st.busy = false;
    again();
  };

  const ask = async () => {
    const q = st.question.trim();
    if (!q || st.busy) return;
    st.busy = true;
    st.error = '';
    again();
    try {
      const c = clientOf(ctx);
      try {
        await c.send('card-ask', {
          id: ctx.issueId,
          scope: 'question',
          question: q
        });
      } catch {
        // a steps bead without a decision card has nothing to ask on: leave a plain comment
        await c.send('add-comment', {
          id: ctx.issueId,
          text: `QUESTION (owner, steps ${ref8}): ${q}`
        });
      }
      st.sent = true;
      st.asking = false;
      st.question = '';
      showToast(tc('u3_card_sent', lang), 'success', 2000);
    } catch (err) {
      st.error = errorText(String(/** @type {any} */ (err)?.message || ''));
    }
    st.busy = false;
    again();
  };

  render(
    html`${frame({
      accent: 'teal',
      label: tc('u3_steps_badge', lang),
      head: html`<div class="u3-cd__head">
        ${chip({ label: tc('u3_steps_badge', lang), tone: 'teal' })}
        ${comment?.author
          ? roleChip({ role: String(comment.author) })
          : nothing}
        <span class="u3-cd__age">${ageText(ts, lang, ctx.now)}</span>
      </div>`,
      body: html`<div class="u3-st" dir=${cardDir(lang)} lang=${lang}>
        <p class="u3-cd__q" dir="auto">${parsed.title}</p>
        ${parsed.items.length
          ? html`<ol class="u3-st__list">
              ${parsed.items.map(
                (it, i) =>
                  html`<li class="u3-st__item">
                    <label class="u3-st__row">
                      <input
                        type="checkbox"
                        class="u3-st__box"
                        .checked=${st.checked.has(i)}
                        @change=${(/** @type {Event} */ ev) => {
                          if (
                            /** @type {HTMLInputElement} */ (ev.target).checked
                          )
                            st.checked.add(i);
                          else st.checked.delete(i);
                          again();
                        }}
                      />
                      <span class="u3-st__num" aria-hidden="true"
                        >${i + 1}</span
                      >
                      ${it.text
                        ? html`<span class="u3-st__text" dir="auto"
                            >${inline(it.text)}</span
                          >`
                        : nothing}
                    </label>
                    ${it.cmds.map((c) => cmdBlock(c, lang))}
                  </li>`
              )}
            </ol>`
          : html`<p class="u3-cd__note">${tc('u3_steps_none', lang)}</p>`}
        ${st.done
          ? html`<p class="u3-cd__note" data-steps-done>
              ${tc('u3_steps_done_note', lang)}
            </p>`
          : nothing}
        ${st.sent
          ? html`<p class="u3-cd__note">${tc('u3_card_sent', lang)}</p>`
          : nothing}
        ${st.error
          ? html`<p class="u3-cd__err" role="alert">${st.error}</p>`
          : nothing}
        ${open
          ? html`<div class="u3-st__act">
              <button
                type="button"
                class="u3-btn u3-btn--steps u3-btn--block"
                data-act="steps-done"
                ?disabled=${st.busy}
                @click=${done}
              >
                ${tc('u3_steps_done', lang)}
              </button>
              ${st.asking
                ? html`<form
                    class="u3-cd__form"
                    @submit=${(/** @type {Event} */ ev) => {
                      ev.preventDefault();
                      void ask();
                    }}
                  >
                    <textarea
                      class="u3-cd__text"
                      dir="auto"
                      rows="3"
                      maxlength="500"
                      placeholder=${tc('u3_steps_ask_ph', lang)}
                      .value=${st.question}
                      @input=${(/** @type {Event} */ ev) => {
                        st.question = /** @type {HTMLTextAreaElement} */ (
                          ev.target
                        ).value;
                      }}
                    ></textarea>
                    <div class="u3-cd__row">
                      <button
                        type="submit"
                        class="u3-btn u3-btn--primary"
                        data-act="steps-ask-send"
                        ?disabled=${st.busy}
                      >
                        ${tc('u3_steps_ask_send', lang)}
                      </button>
                      <button
                        type="button"
                        class="u3-btn u3-btn--ghost"
                        @click=${() => {
                          st.asking = false;
                          again();
                        }}
                      >
                        ${tc('u3_card_ask_cancel', lang)}
                      </button>
                    </div>
                  </form>`
                : html`<button
                    type="button"
                    class="u3-cd__ask"
                    data-act="steps-ask"
                    @click=${() => {
                      st.asking = true;
                      again();
                    }}
                  >
                    ${tc('u3_steps_question', lang)}
                  </button>`}
            </div>`
          : nothing}
      </div>`
    })}`,
    el
  );
}
