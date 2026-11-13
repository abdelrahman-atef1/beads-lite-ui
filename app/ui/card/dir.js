/**
 * Text direction of a card (ported from .61, beads-lite-1bo5.6.61; the legacy
 * file lives on another branch, so v3 carries its own copy).
 *
 * One card, one language (card_lang, or detected from the question). The card
 * block takes that language's direction; every text value is its own
 * dir="auto" element and its label a separate block, so Arabic text with
 * Claude or an id inside it never joins one LTR run with an English label.
 */

/** @param {unknown} lang @returns {'ar'|'en'} */
export function cardLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/** @param {unknown} lang @returns {'rtl'|'ltr'} */
export function cardDir(lang) {
  return cardLang(lang) === 'ar' ? 'rtl' : 'ltr';
}

/** @param {string} q @returns {'ar'|'en'} */
export function detectLang(q) {
  return /[\u0600-\u06FF]/.test(q || '') ? 'ar' : 'en';
}
