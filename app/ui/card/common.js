/** Shared bits of the card views: client, label lookup, ids, ages. */
import { boardClient } from '../../board-client.js';
import { strings } from '../i18n/card.js';

/** @type {any} */
let fake = null;
// Test seam: use a fake client ({ send }).
/** @param {any} c */
export function setCardClient(c) {
  fake = c;
}
/** @param {any} [ctx] */
export function clientOf(ctx) {
  return ctx?.client || fake || boardClient();
}

/**
 * Label in the CARD's language (not the board's), so a label and the text
 * beside it share one script.
 *
 * @param {string} key
 * @param {string} lang
 * @param {Record<string, number>} [vars]
 */
export function tc(key, lang, vars) {
  const e = /** @type {any} */ (strings)[key];
  const s = e ? e[lang === 'en' ? 'en' : 'ar'] || e.en : key;
  return vars
    ? s.replace(
        /\{(\w+)\}/g,
        (/** @type {string} */ _m, /** @type {string} */ k) =>
          String(vars[k] ?? '')
      )
    : s;
}

/** @param {string} id */
export function taskHref(id) {
  return `#/issues?issue=${encodeURIComponent(id)}`;
}

// Same link the desk's open-steps button uses.
/** @param {string} id @param {string} at */
export function stepsHref(id, at) {
  return `${taskHref(id)}&at=${encodeURIComponent(at)}`;
}

/** @param {number} ms epoch @param {string} lang @param {number} [now] */
export function ageText(ms, lang, now = Date.now()) {
  if (!ms) return '';
  const m = Math.max(1, Math.round((now - ms) / 60000));
  if (m < 60) return tc('u3_age_m', lang, { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return tc('u3_age_h', lang, { n: h });
  return tc('u3_age_d', lang, { n: Math.round(h / 24) });
}
