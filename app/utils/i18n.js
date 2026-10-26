/**
 * Tiny UI-language switch (en/ar). Only the new shell strings are translated;
 * issue text is shown as stored. The choice is kept in localStorage and
 * mirrored on <html lang dir>; views re-render on the `bdui-lang` event.
 */

const KEY = 'beads-ui.lang';

/** @type {Record<string, { en: string, ar: string }>} */
const STRINGS = {
  board: { en: 'Board', ar: 'اللوحة' },
  decisions: { en: 'Decisions', ar: 'قراراتي' },
  issues: { en: 'List', ar: 'القائمة' },
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
  lang_btn: { en: 'عربي', ar: 'EN' }
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
