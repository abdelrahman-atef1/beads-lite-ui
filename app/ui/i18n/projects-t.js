import { getLang } from '../../utils/i18n.js';
import { strings } from './projects.js';

/** @param {string} key */
export function tp(key) {
  const e = strings[key];
  return e ? e[getLang()] || e.en : key;
}
