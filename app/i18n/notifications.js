/* notifications strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    nt_title: { en: 'Notifications', ar: 'الإشعارات' },
    nt_bell: { en: 'Notifications', ar: 'الإشعارات' },
    nt_unread: { en: '{n} unread', ar: '{n} غير مقروء' },
    nt_close: { en: 'Close', ar: 'إغلاق' },
    nt_mark_all: { en: 'Mark all read', ar: 'تعليم الكل كمقروء' },
    nt_decision: {
      en: 'Decision needed: {title}',
      ar: 'قرار مطلوب: {title}'
    },
    nt_answer: {
      en: 'Answer to your question: {title}',
      ar: 'رد على سؤالك: {title}'
    },
    nt_desk: {
      en: 'A decision waits at the PC ({project})',
      ar: 'قرار ينتظرك على الكمبيوتر ({project})'
    },
    nt_desk_answer: {
      en: 'An answer waits at the PC ({project})',
      ar: 'رد ينتظرك على الكمبيوتر ({project})'
    },
    nt_release: {
      en: 'Release shipped: {project} - {title}',
      ar: 'تم نشر إصدار: {project} - {title}'
    },
    nt_release_n: {
      en: '{n} releases shipped in {project}',
      ar: 'تم نشر {n} إصدارات في {project}'
    },
    nt_release_desk: {
      en: 'A release shipped in {project}',
      ar: 'تم نشر إصدار في {project}'
    },
    nt_empty: {
      en: 'Nothing needs you. We will tell you when something does.',
      ar: 'لا شيء يحتاجك الآن. سنخبرك عند الحاجة.'
    },
    nt_error: {
      en: 'Could not load notifications. Showing the last known list.',
      ar: 'تعذر تحميل الإشعارات. نعرض آخر قائمة معروفة.'
    },
    nt_switch_err: {
      en: 'Could not save the switch. Try again.',
      ar: 'تعذر حفظ المفتاح. حاول مرة أخرى.'
    },
    nt_projects: {
      en: 'Notify me for decisions in',
      ar: 'أخطرني بالقرارات في'
    },
    nt_note: {
      en: 'A muted project stays fully visible in Decisions. Only the alert stops.',
      ar: 'المشروع المكتوم يبقى ظاهراً في القرارات. يتوقف التنبيه فقط.'
    },
    nt_digest: {
      en: '{n} decisions waiting in {project}',
      ar: '{n} قرارات تنتظرك في {project}'
    },
    nt_degraded: {
      en: 'Alerts for {project} paused (watcher stopped)',
      ar: 'توقفت تنبيهات {project} (توقفت المراقبة)'
    },
    nt_mute: { en: 'Mute all for 1 hour', ar: 'كتم الكل لمدة ساعة' },
    nt_unmute: { en: 'Unmute', ar: 'إلغاء الكتم' },
    nt_now: { en: 'now', ar: 'الآن' },
    nt_min: { en: '{n}m', ar: '{n}د' },
    nt_hour: { en: '{n}h', ar: '{n}س' },
    nt_day: { en: '{n}d', ar: '{n}ي' },
    nt_push_on: {
      en: 'Turn on for this phone',
      ar: 'تفعيل التنبيهات على هذا الهاتف'
    },
    nt_push_off: {
      en: 'Turn off for this phone',
      ar: 'إيقاف التنبيهات على هذا الهاتف'
    },
    nt_push_denied: {
      en: 'Notifications are blocked for this site. Allow them in the browser settings.',
      ar: 'التنبيهات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح.'
    },
    nt_push_unsupported: {
      en: 'This browser cannot receive alerts. Install the board from the browser menu first.',
      ar: 'هذا المتصفح لا يستقبل التنبيهات. ثبّت اللوحة من قائمة المتصفح أولاً.'
    },
    nt_phones: {
      en: 'Phones that get alerts (last alert or added):',
      ar: 'الهواتف التي تصلها التنبيهات (آخر تنبيه أو تاريخ الإضافة):'
    },
    nt_phone_remove: { en: 'Remove', ar: 'إزالة' },
    nt_phone_unnamed: { en: 'Phone', ar: 'هاتف' },
    nt_push_err: {
      en: 'Could not change the phone alerts. Try again.',
      ar: 'تعذر تغيير تنبيهات الهاتف. حاول مرة أخرى.'
    }
  });
