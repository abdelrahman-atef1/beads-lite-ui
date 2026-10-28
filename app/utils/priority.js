import { getLang } from './i18n.js';

export const priority_levels = ['Critical', 'High', 'Medium', 'Low', 'Backlog'];

const LEVELS_AR = ['حرجة', 'عالية', 'متوسطة', 'منخفضة', 'مؤجلة'];

/**
 * Priority name in the current UI language (index clamped to 0..4).
 *
 * @param {number | null | undefined} priority
 * @returns {string}
 */
export function priorityName(priority) {
  const i = clampPriority(priority);
  return getLang() === 'ar' ? LEVELS_AR[i] : priority_levels[i];
}

/**
 * @param {number | null | undefined} priority
 * @returns {number}
 */
export function clampPriority(priority) {
  const p =
    typeof priority === 'number' && !Number.isNaN(priority) ? priority : 2;
  return Math.max(0, Math.min(4, Math.round(p)));
}
