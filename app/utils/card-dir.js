/**
 * Text direction of a decision card (beads-lite-1bo5.6.61).
 *
 * The card has one language (card_lang, or detected from the question). The
 * card block takes that language's direction; every text value sits in its own
 * dir="auto" element, and its label is a separate block, so Arabic text with
 * Claude or an id inside it is never part of one LTR run with an English label.
 */

/**
 * @param {unknown} lang
 * @returns {'ar'|'en'}
 */
export function cardLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/**
 * @param {unknown} lang
 * @returns {'rtl'|'ltr'}
 */
export function cardDir(lang) {
  return cardLang(lang) === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Card language from its question text when card_lang is missing.
 *
 * @param {string} q
 * @returns {'ar'|'en'}
 */
export function detectLang(q) {
  return /[\u0600-\u06FF]/.test(q || '') ? 'ar' : 'en';
}
