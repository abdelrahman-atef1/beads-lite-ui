/**
 * v3 string table: one file per screen (app/ui/i18n/*.js) so parallel tasks
 * never edit the same file. Language is shared with legacy (utils/i18n.js).
 */
import { getLang, t as legacyT } from '../utils/i18n.js';
import { strings as ask } from './i18n/ask.js';
import { strings as card } from './i18n/card.js';
import { strings as desk } from './i18n/desk.js';
import { strings as releases } from './i18n/releases.js';
import { strings as shell } from './i18n/shell.js';
import { strings as task } from './i18n/task.js';
import { strings as tasks } from './i18n/tasks.js';
import { strings as time } from './i18n/time.js';

/** @type {Record<string, { en: string, ar: string }>} */
const STRINGS = {
  ...shell,
  ...desk,
  ...card,
  ...task,
  ...tasks,
  ...releases,
  ...ask,
  ...time
};

/** @param {string} key */
export function t3(key) {
  const e = STRINGS[key];
  if (!e) return legacyT(key);
  return e[getLang()] || e.en;
}
