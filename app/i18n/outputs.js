/* outputs strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    ou_title: { en: 'Outputs', ar: 'المخرجات' },
    ou_title_n: { en: 'Outputs ({n})', ar: 'المخرجات ({n})' },
    ou_project: { en: 'Project outputs', ar: 'مخرجات المشروع' },
    ou_close: { en: 'Close', ar: 'إغلاق' },
    ou_all: { en: 'All', ar: 'الكل' },
    ou_commit: { en: 'Commit', ar: 'Commit' },
    ou_deploy: { en: 'Deploy', ar: 'نشر' },
    ou_artifact: { en: 'Artifact', ar: 'Artifact' },
    ou_build: { en: 'Build', ar: 'بناء' },
    ou_doc: { en: 'Doc', ar: 'مستند' },
    ou_pr: { en: 'PR', ar: 'PR' },
    ou_link: { en: 'Link', ar: 'رابط' },
    ou_file: { en: 'File', ar: 'ملف' },
    ou_image: { en: 'Image', ar: 'صورة' },
    ou_mentioned: { en: 'mentioned', ar: 'مذكور' },
    ou_landed: { en: 'landed', ar: 'تم الدمج' },
    ou_not_landed: { en: 'not landed', ar: 'لم يُدمج' },
    ou_rollup: { en: 'Include child beads', ar: 'تضمين المهام الفرعية' },
    ou_more: { en: 'Show more beads', ar: 'عرض مهام أكثر' },
    ou_empty: {
      en: 'Nothing produced yet. Commits, deploys, links and images appear here.',
      ar: 'لم يُنتج شيء بعد. تظهر هنا الـ commits والنشر والروابط والصور.'
    },
    ou_loading: { en: 'Loading outputs…', ar: 'جارٍ تحميل المخرجات…' },
    ou_retry: { en: 'Retry', ar: 'إعادة المحاولة' },
    ou_failed: {
      en: 'Outputs could not be loaded.',
      ar: 'تعذر تحميل المخرجات.'
    },
    ou_degraded: {
      en: 'Some outputs are hidden: the checker is unavailable.',
      ar: 'بعض المخرجات مخفية: أداة التحقق غير متاحة.'
    }
  });
