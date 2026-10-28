/**
 * Tiny UI-language switch (en/ar). Only the new shell strings are translated;
 * issue text is shown as stored. The choice is kept in localStorage and
 * mirrored on <html lang dir>; views re-render on the `bdui-lang` event.
 */
import { strings as board } from '../i18n/board.js';
import { strings as decisions } from '../i18n/decisions.js';
import { strings as detail } from '../i18n/detail.js';
import { strings as list } from '../i18n/list.js';
import { strings as notifications } from '../i18n/notifications.js';
import { strings as outputs } from '../i18n/outputs.js';
import { strings as report } from '../i18n/report.js';

const KEY = 'beads-ui.lang';

/** @type {Record<string, { en: string, ar: string }>} */
const SHELL = {
  board: { en: 'Board', ar: 'اللوحة' },
  decisions: { en: 'Decisions', ar: 'قراراتي' },
  issues: { en: 'List', ar: 'القائمة' },
  theme: { en: 'Theme', ar: 'المظهر' },
  search_ph: { en: 'Search title or id', ar: 'ابحث بالعنوان أو الرقم' },
  search_btn: { en: 'Search', ar: 'بحث' },
  chip_all: { en: 'All', ar: 'الكل' },
  chip_mine: { en: 'Mine', ar: 'مسندة لي' },
  chip_p01: { en: 'P0-P1', ar: 'P0-P1' },
  chip_type: { en: 'Type', ar: 'نوع' },
  chip_label: { en: 'Label', ar: 'وسم' },
  chip_assignee: { en: 'Assignee', ar: 'المسؤول' },
  chip_prio: { en: 'Priority', ar: 'الأولوية' },
  claimed: { en: 'claimed', ar: 'منذ الاستلام' },
  stalled_tag: { en: 'stalled', ar: 'متوقفة' },
  blocked_by: { en: 'blocked by', ar: 'معطّلة بسبب' },
  unblocks_n: { en: 'unblocks', ar: 'تفك' },
  top_unblocker: { en: 'Unblocks the most', ar: 'الأكثر فكا للعطل' },
  stalled_n: { en: 'stalled', ar: 'متوقفة' },
  any: { en: 'Any', ar: 'أي' },
  no_match: { en: 'No match', ar: 'لا نتائج' },
  workspace: { en: 'Workspace', ar: 'المشروع' },
  beads_n: { en: 'beads', ar: 'مهمة' },
  epics: { en: 'Epics', ar: 'الملاحم' },
  waiting_title: { en: 'Waiting on you', ar: 'بانتظار قرارك' },
  waiting_sub: {
    en: 'Oldest first. Answering returns the bead to its owner role.',
    ar: 'الأقدم أولاً. الرد يعيد المهمة لصاحبها.'
  },
  empty_title: { en: 'Nothing waiting on you', ar: 'لا شيء بانتظار قرارك' },
  empty_sub: {
    en: 'New decisions appear here and in the tab badge.',
    ar: 'القرارات الجديدة تظهر هنا وعلى شارة التبويب.'
  },
  loading: { en: 'Loading', ar: 'جارٍ التحميل' },
  issues_n: { en: 'issues', ar: 'مهمة' },
  show_recent: { en: 'show recent', ar: 'عرض الأحدث' },
  show_more: { en: 'Show 50 more', ar: 'عرض 50 أخرى' },
  hide: { en: 'Hide', ar: 'إخفاء' },
  open_bead: { en: 'Open full bead', ar: 'افتح المهمة كاملة' },
  effect: { en: 'What changes for you', ar: 'يتغير عندك' },
  today: { en: 'Today', ar: 'الموجود دلوقتي' },
  frozen: { en: 'Frozen', ar: 'واقف' },
  pc_only: {
    en: 'PC only: answer in the chat session at your PC. No buttons here.',
    ar: 'على الكمبيوتر فقط: رد في جلسة الدردشة. لا أزرار هنا.'
  },
  confirm: { en: 'Confirm', ar: 'تأكيد' },
  back: { en: 'Back', ar: 'رجوع' },
  recommended: { en: 'recommended', ar: 'مُوصى' },
  answered: { en: 'Answer recorded', ar: 'تم تسجيل الرد' },
  answer_failed: { en: 'Could not record the answer', ar: 'تعذّر تسجيل الرد' },
  no_card: {
    en: 'No decision card on this bead. Open it to read and answer.',
    ar: 'لا توجد بطاقة قرار. افتح المهمة لقراءتها والرد.'
  },
  type_reply: { en: 'Type your reply', ar: 'اكتب ردك' },
  send: { en: 'Send', ar: 'إرسال' },
  asked: { en: 'asked', ar: 'منذ' },
  blocked_tag: { en: 'blocked', ar: 'معطّل' },
  lang_btn: { en: 'عربي', ar: 'EN' },
  projects: { en: 'Projects', ar: 'المشاريع' },
  app_name: { en: 'Beads', ar: 'بيدز' },
  language: { en: 'Language', ar: 'اللغة' },
  new_issue: { en: 'New issue', ar: 'مهمة جديدة' },
  close: { en: 'Close', ar: 'إغلاق' }
};

/**
 * Shell strings plus one file per feature (app/i18n/*.js), so parallel tasks
 * never edit the same file. Later files win on a duplicate key.
 *
 * @type {Record<string, { en: string, ar: string }>}
 */
const STRINGS = {
  ...SHELL,
  ...decisions,
  ...board,
  ...list,
  ...detail,
  ...notifications,
  ...report,
  ...outputs
};

/** @returns {'en'|'ar'} */
export function getLang() {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'ar' || v === 'en') {
      return v;
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

/**
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  const e = STRINGS[key];
  if (!e) {
    return key;
  }
  return e[getLang()] || e.en;
}

/** Apply the stored language to <html>. */
export function applyLang() {
  const lang = getLang();
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
}

/** Flip the language, persist, apply and notify views. */
export function toggleLang() {
  const next = getLang() === 'ar' ? 'en' : 'ar';
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // ignore storage errors
  }
  applyLang();
  window.dispatchEvent(new Event('bdui-lang'));
}
