/* decisions strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    dec_all: { en: 'All projects', ar: 'كل المشاريع' },
    dec_n_projects: { en: '{n} projects', ar: '{n} مشاريع' },
    dec_filter: { en: 'Projects', ar: 'المشاريع' },
    dec_filter_reset: { en: 'Show all projects', ar: 'عرض كل المشاريع' },
    dec_sub_all: {
      en: 'All projects. Highest priority first, then oldest.',
      ar: 'كل المشاريع. الأعلى أولوية أولاً ثم الأقدم.'
    },
    dec_none_here: {
      en: 'Nothing waiting in the selected projects.',
      ar: 'لا شيء بانتظارك في المشاريع المختارة.'
    },
    dec_feed_error: {
      en: 'Could not load decisions from all projects. Showing this project only.',
      ar: 'تعذّر تحميل القرارات من كل المشاريع. المعروض هذا المشروع فقط.'
    },
    dec_rules_missing: {
      en: 'The card rules file was not found, so no decision can be shown or answered here.',
      ar: 'ملف قواعد البطاقات غير موجود، فلا يمكن عرض أي قرار أو الرد عليه هنا.'
    },
    dec_keys_hint: {
      en: 'Keys 1-9 pick an option',
      ar: 'المفاتيح 1-9 تختار خياراً'
    }
  });
