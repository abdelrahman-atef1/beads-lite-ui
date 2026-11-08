/* releases strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    rl_title: { en: 'Releases', ar: 'الإصدارات' },
    rl_count: {
      en: '{n} releases · all projects',
      ar: '{n} إصدارًا · كل المشاريع'
    },
    rl_all_projects: { en: 'All projects', ar: 'كل المشاريع' },
    rl_all_kinds: { en: 'All', ar: 'الكل' },
    rl_kind_deploy: { en: 'Deploy', ar: 'نشر' },
    rl_kind_build: { en: 'Build', ar: 'بناء' },
    rl_filter: { en: 'Filter', ar: 'تصفية' },
    rl_tasks_n: { en: '{n} tasks', ar: '{n} مهام' },
    rl_tasks_1: { en: '1 task', ar: 'مهمة واحدة' },
    rl_no_tasks: { en: 'No linked tasks', ar: 'لا مهام مرتبطة' },
    rl_by: { en: 'recorded by {who}', ar: 'سجّله {who}' },
    rl_older: { en: 'Show older', ar: 'عرض الأقدم' },
    rl_loading: {
      en: 'Reading from the projects...',
      ar: 'جارٍ القراءة من المشاريع...'
    },
    rl_empty_title: { en: 'No releases yet', ar: 'لا توجد إصدارات بعد' },
    rl_empty_body: {
      en: 'Releases appear here by themselves when an agent records a deploy or a build on a task. Nothing is needed from you.',
      ar: 'تظهر الإصدارات هنا تلقائيًا عندما يسجّل الوكيل نشرًا أو بناءً على المهمة. لا شيء يلزمك الآن.'
    },
    rl_empty_note: {
      en: 'Old deploys written as free text are not guessed, so the list stays empty until the first record.',
      ar: 'لا نخمّن النشرات القديمة المكتوبة كنص حر، فتبقى القائمة فارغة حتى أول تسجيل.'
    },
    rl_filter_empty_title: {
      en: 'No releases match the filter',
      ar: 'لا إصدارات تطابق التصفية'
    },
    rl_filter_empty_body: {
      en: 'Try "All projects" or "All".',
      ar: 'جرّب «كل المشاريع» أو «الكل».'
    },
    rl_filter_clear: { en: 'Clear the filter', ar: 'مسح التصفية' },
    rl_error_title: {
      en: 'Could not load the releases',
      ar: 'تعذّر تحميل الإصدارات'
    },
    rl_error_body: {
      en: 'We could not read any project. Your data is safe; only the reading failed.',
      ar: 'لم نتمكن من قراءة أي مشروع. بياناتك سليمة؛ المشكلة في القراءة فقط.'
    },
    rl_retry: { en: 'Try again', ar: 'إعادة المحاولة' },
    rl_skipped: {
      en: 'Could not read: {names}. It was skipped; the other releases are fine.',
      ar: 'تعذّرت قراءة: {names}. تم تخطيه؛ باقي الإصدارات سليمة.'
    },
    rl_degraded: {
      en: 'The record checker was not found, so no release can be shown.',
      ar: 'أداة فحص السجلات غير موجودة، فلا يمكن عرض أي إصدار.'
    },
    rl_back: { en: 'All releases', ar: 'كل الإصدارات' },
    rl_close: { en: 'Close', ar: 'إغلاق' },
    rl_detail: { en: 'Release details', ar: 'تفاصيل الإصدار' },
    rl_date: { en: 'Published', ar: 'تاريخ النشر' },
    rl_commit: { en: 'Commit', ar: 'الإصدار (commit)' },
    rl_link: { en: 'Link', ar: 'الرابط' },
    rl_by_on: { en: 'Recorded by', ar: 'سجّله' },
    rl_tasks_done: {
      en: 'Tasks done in it ({n})',
      ar: 'المهام المنجزة فيه ({n})'
    },
    rl_closed_on: { en: 'closed {d}', ar: 'مغلقة {d}' },
    rl_open: { en: 'open', ar: 'مفتوحة' },
    rl_source: {
      en: 'Source: the carrying task and its closed children, and tasks named in commits since the previous release.',
      ar: 'المصدر: المهمة الحاملة وأبناؤها المغلقة، والمهام المذكورة في commits منذ الإصدار السابق.'
    },
    rl_git_failed: {
      en: 'Git could not be read, so only the first part is shown.',
      ar: 'تعذّر قراءة git فيظهر الجزء الأول فقط.'
    },
    rl_detail_error: {
      en: 'Could not load this release.',
      ar: 'تعذّر تحميل هذا الإصدار.'
    },
    rl_more_tasks: { en: '{n} more not shown', ar: '{n} أخرى غير معروضة' }
  });
