/**
 * Strings only the v3 panels need (task .59.16). Everything else reuses the
 * legacy keys (nt_*, ou_*, rpt_*) through t3, so the words stay the same.
 */
import { getLang } from '../../utils/i18n.js';
import { t3 } from '../i18n.js';

/** @type {Record<string, { en: string, ar: string }>} */
const OWN = {
  pn_outputs: { en: 'Outputs', ar: 'المخرجات' },
  pn_report: { en: 'Report a bug', ar: 'بلّغ عن مشكلة' },
  pn_push_title: { en: 'Alerts on this phone', ar: 'تنبيهات على الموبايل ده' },
  pn_push_on_note: {
    en: 'This phone gets an alert when a decision is waiting.',
    ar: 'الموبايل ده هيوصله تنبيه لما قرار يستناك.'
  },
  pn_push_off_note: {
    en: 'Turn on to get an alert when a decision is waiting.',
    ar: 'شغّلها عشان يوصلك تنبيه لما قرار يستناك.'
  },
  pn_push_busy: { en: 'Working…', ar: 'جارٍ التنفيذ…' },
  pn_attached: { en: 'Screenshot attached', ar: 'تم إرفاق لقطة الشاشة' },
  pn_shot_remove: { en: 'Remove screenshot', ar: 'شيل لقطة الشاشة' },
  pn_loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },
  pn_unread: { en: 'unread', ar: 'غير مقروء' }
};

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function tp(key, vars = {}) {
  const own = OWN[key];
  let s = own ? (getLang() === 'ar' ? own.ar : own.en) : t3(key);
  for (const [k, v] of Object.entries(vars))
    s = s.split(`{${k}}`).join(String(v));
  return s;
}
