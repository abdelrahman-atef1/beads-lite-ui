/**
 * Every person on the v3 board as "name - full job title" (beads-lite-1bo5.6.59.28).
 * Arabic names: the Roles table in ~/company/knowledge/glossary.md (people.test.js
 * checks them). English titles: the role header of ~/company/agents/<role>.md.
 * Arabic titles: written for the board; cos is the owner's own wording.
 * Unknown actors (other projects' roles, humans) show as they are.
 */
import { getLang } from '../../utils/i18n.js';

/** @type {Record<string, { name: string, ar: string, en: string }>} */
export const PEOPLE = {
  cos: { name: 'مارد وشوشني', ar: 'مدير المكتب', en: 'Chief of Staff' },
  cto: { name: 'شلبي', ar: 'المدير التقني', en: 'Chief Technology Officer' },
  pm: { name: 'سالي', ar: 'مديرة المنتج', en: 'Product Lead' },
  qa: { name: 'عفني', ar: 'مهندس الجودة', en: 'QA Engineer' },
  sec: {
    name: 'أستاذ أبو عنكبوت',
    ar: 'مهندس الأمان',
    en: 'Security Engineer'
  },
  sre: {
    name: 'روز',
    ar: 'مهندسة البنية التحتية وتكلفة التشغيل',
    en: 'Infrastructure & Unit-Cost Engineer'
  },
  sup: { name: 'منفي', ar: 'الدعم والمجتمع', en: 'Support & Community' },
  swe: { name: 'أندل', ar: 'مهندس البرمجيات', en: 'Software Engineer' },
  ux: { name: 'بو', ar: 'مصمم المنتج', en: 'Product Designer (UX)' },
  legal: {
    name: 'المستشار القانوني',
    ar: 'المستشار القانوني',
    en: 'Legal Counsel'
  },
  growth: { name: 'شكري', ar: 'النمو والتسويق', en: 'Growth & Marketing' },
  partnerships: {
    name: 'فتح الباب',
    ar: 'الشراكات وأبحاث التمويل',
    en: 'Partnerships & Funding Research'
  },
  community: { name: 'قسمتي', ar: 'مدير المجتمع', en: 'Community Manager' },
  analytics: { name: 'مزلقان', ar: 'تحليل البيانات', en: 'Analytics' }
};

const FSI = '⁨';
const PDI = '⁩';

/** Direction of the UI language; names and titles are isolated inside it. */
export function uiDir() {
  return getLang() === 'ar' ? 'rtl' : 'ltr';
}

/**
 * @param {string} role
 * @returns {{ name: string, title: string, full: string, known: boolean }}
 *   name = the person; title = job title in the UI language; full = "name - title"
 *   (just the name when title repeats it, or the raw id when unknown)
 */
export function personLabel(role) {
  const id = String(role || '').trim();
  const key = id.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PEOPLE, key)) {
    return { name: id, title: '', full: id, known: false };
  }
  const p = PEOPLE[key];
  const title = getLang() === 'ar' ? p.ar : p.en;
  return {
    name: p.name,
    title,
    full:
      title === p.name
        ? p.name
        : `${FSI}${p.name}${PDI} - ${FSI}${title}${PDI}`,
    known: true
  };
}
