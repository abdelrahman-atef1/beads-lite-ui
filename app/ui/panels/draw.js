/**
 * Finger-drawing editor for the report screenshot (beads-lite-1bo5.6.59.16).
 * Same behaviour as the legacy editor in app/views/report.js (red, yellow,
 * blue pens; undo; clear; Done commits, Cancel or Escape drops; strokes are
 * painted into the image before it is encoded), but state is passed in, not
 * module-global: the legacy one keeps private module state and is not
 * exported, and legacy files may not be edited until cutover.
 */
import { getLang } from '../../utils/i18n.js';
import { tp } from './i18n.js';

export const PENS = [
  ['#e5322d', 'rpt_red'],
  ['#f5c400', 'rpt_yellow'],
  ['#1e88e5', 'rpt_blue']
];

/** @typedef {{ c: string, p: number[][] }} Stroke */

/**
 * Paint the base image and the strokes onto a canvas.
 *
 * @param {HTMLCanvasElement} c
 * @param {HTMLCanvasElement} base
 * @param {Stroke[]} strokes
 */
export function paintStrokes(c, base, strokes) {
  const x = /** @type {CanvasRenderingContext2D | null} */ (c.getContext('2d'));
  if (!x) return;
  x.drawImage(base, 0, 0);
  x.lineCap = x.lineJoin = 'round';
  x.lineWidth = Math.max(4, c.width / 140);
  for (const s of strokes) {
    x.strokeStyle = s.c;
    x.beginPath();
    s.p.forEach((q, n) => (n ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])));
    if (s.p.length === 1) x.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
    x.stroke();
  }
}

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @param {Array<Node | string>} [kids]
 */
function h(tag, attrs, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/**
 * Open the full-screen editor on a copy of the strokes.
 *
 * @param {{ host: HTMLElement, base: HTMLCanvasElement, strokes: Stroke[], pen: string,
 *   onDone: (strokes: Stroke[], pen: string) => void }} o
 * @returns {{ close: () => void } | null}
 */
export function openEditor(o) {
  if (o.host.querySelector('.u3-draw')) return null;
  let work = o.strokes.map((s) => ({ c: s.c, p: s.p.slice() }));
  let pen = o.pen;
  /** @type {Stroke | null} */
  let cur = null;
  const canvas = /** @type {HTMLCanvasElement} */ (
    h('canvas', { class: 'u3-draw__canvas', 'aria-label': tp('rpt_edit') })
  );
  canvas.width = o.base.width;
  canvas.height = o.base.height;
  const repaint = () =>
    paintStrokes(canvas, o.base, cur ? [...work, cur] : work);
  const scr = h('div', {
    class: 'u3-draw',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': tp('rpt_edit'),
    dir: getLang() === 'ar' ? 'rtl' : 'ltr'
  });
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    scr.remove();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  const penBtns = PENS.map(([c, k]) =>
    h('button', {
      type: 'button',
      class: 'u3-draw__pen',
      'data-pen': c,
      'aria-pressed': String(c === pen),
      'aria-label': tp(k),
      style: `--c:${c}`
    })
  );
  const btn = (/** @type {string} */ act, /** @type {string} */ label) =>
    h(
      'button',
      { type: 'button', class: 'u3-btn u3-btn--ghost', 'data-act': act },
      [label]
    );
  const tools = h('div', { class: 'u3-draw__tools' }, [
    ...penBtns,
    h('span', { class: 'u3-draw__sp' }),
    btn('undo', tp('rpt_undo')),
    btn('clear', tp('rpt_clear'))
  ]);
  tools.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.dataset.pen) {
      pen = b.dataset.pen;
      for (const x of penBtns) x.setAttribute('aria-pressed', String(x === b));
    } else if (b.dataset.act === 'undo') work.pop();
    else if (b.dataset.act === 'clear') work = [];
    repaint();
  });
  const done = btn('done', tp('rpt_done'));
  done.className = 'u3-btn u3-btn--primary';
  const cancel = btn('cancel', tp('rpt_cancel'));
  cancel.addEventListener('click', close);
  done.addEventListener('click', () => {
    close();
    o.onDone(work, pen);
  });
  /** @param {PointerEvent} e */
  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height
    ];
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    cur = { c: pen, p: [pt(e)] };
    repaint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    cur.p.push(pt(e));
    repaint();
  });
  const end = () => {
    if (!cur) return;
    work.push(cur);
    cur = null;
    repaint();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  scr.append(
    h('div', { class: 'u3-draw__bar' }, [
      cancel,
      h('b', {}, [tp('rpt_edit')]),
      done
    ]),
    h('div', { class: 'u3-draw__stage' }, [canvas]),
    h('small', { class: 'u3-pn__note' }, [tp('rpt_draw_hint')]),
    tools
  );
  document.addEventListener('keydown', onKey, true);
  o.host.append(scr);
  repaint();
  done.focus();
  return { close };
}
