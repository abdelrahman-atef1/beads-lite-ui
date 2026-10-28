/* report strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    rpt_open: { en: 'Report a bug', ar: 'أبلغ عن خطأ' },
    rpt_title: { en: 'Report a bug or note', ar: 'أبلغ عن خطأ أو اترك ملاحظة' },
    rpt_close: { en: 'Close', ar: 'إغلاق' },
    rpt_project: { en: 'Project', ar: 'المشروع' },
    rpt_version: {
      en: 'Version / build (required)',
      ar: 'رقم النسخة (إجباري)'
    },
    rpt_version_ph: {
      en: 'e.g. 1.4.2 or build 31',
      ar: 'مثال: 1.4.2 أو بناء 31'
    },
    rpt_version_recent: { en: 'Recent versions', ar: 'نسخ سابقة' },
    rpt_shot_add: { en: 'Add a screenshot', ar: 'أضف لقطة شاشة' },
    rpt_shot_cam: { en: 'Take a photo', ar: 'صوّر بالكاميرا' },
    rpt_retry_in: {
      en: 'Try again in about {n} min.',
      ar: 'حاول بعد حوالي {n} دقيقة.'
    },
    rpt_shot_hint: {
      en: 'Choose from the gallery or take a photo, or paste (Ctrl+V). Optional.',
      ar: 'اختر من المعرض أو صوّر، أو الصق (Ctrl+V). اختياري.'
    },
    rpt_draw_hint: {
      en: 'Draw with your finger to mark the problem.',
      ar: 'ارسم بإصبعك لتحديد المشكلة.'
    },
    rpt_canvas: {
      en: 'Screenshot',
      ar: 'لقطة الشاشة'
    },
    rpt_edit: { en: 'Edit image', ar: 'تعديل الصورة' },
    rpt_done: { en: 'Done', ar: 'تم' },
    rpt_cancel: { en: 'Cancel', ar: 'إلغاء' },
    rpt_clear: { en: 'Clear', ar: 'مسح' },
    rpt_red: { en: 'Red pen', ar: 'قلم أحمر' },
    rpt_yellow: { en: 'Yellow pen', ar: 'قلم أصفر' },
    rpt_blue: { en: 'Blue pen', ar: 'قلم أزرق' },
    rpt_undo: { en: 'Undo', ar: 'تراجع' },
    rpt_remove: { en: 'Remove', ar: 'حذف' },
    rpt_text: { en: 'What happened?', ar: 'ماذا حدث؟' },
    rpt_text_ph: {
      en: 'Write in Arabic or English',
      ar: 'اكتب بالعربية أو الإنجليزية'
    },
    rpt_note: {
      en: 'The image is shrunk on your phone before sending (about 100 KB). Offline? It is kept and sent later.',
      ar: 'تُصغَّر الصورة على هاتفك قبل الإرسال (حوالي 100 كيلوبايت). بلا إنترنت؟ تُحفظ وتُرسل لاحقاً.'
    },
    rpt_send: { en: 'Send as a bead', ar: 'أرسل كمهمة' },
    rpt_sending: { en: 'Sending…', ar: 'جارٍ الإرسال…' },
    rpt_need: {
      en: 'Add the version and some text or a screenshot.',
      ar: 'أضف رقم النسخة ونصاً أو لقطة شاشة.'
    },
    rpt_sent: { en: 'Sent. Created bead', ar: 'تم الإرسال. أُنشئت المهمة' },
    rpt_queued: {
      en: 'No connection. Saved on this phone, it will be sent when you are back online.',
      ar: 'لا يوجد اتصال. حُفظ البلاغ على هاتفك وسيُرسل عند عودة الإنترنت.'
    },
    rpt_pending: { en: 'Waiting to send', ar: 'بانتظار الإرسال' },
    rpt_e_forbidden: {
      en: 'The board refused this request. Reload the page and try again.',
      ar: 'رفضت اللوحة الطلب. أعد تحميل الصفحة وحاول مجدداً.'
    },
    rpt_e_bad_type: {
      en: 'The request was not understood. Reload the page.',
      ar: 'لم يُفهم الطلب. أعد تحميل الصفحة.'
    },
    rpt_e_too_large: {
      en: 'The screenshot is too large. Remove it or pick a smaller one.',
      ar: 'لقطة الشاشة كبيرة جداً. احذفها أو اختر أصغر.'
    },
    rpt_e_rate_limited: {
      en: 'Too many reports this hour. Your draft is kept.',
      ar: 'بلاغات كثيرة في هذه الساعة. المسودة محفوظة.'
    },
    rpt_e_version_required: {
      en: 'The version is required.',
      ar: 'رقم النسخة إجباري.'
    },
    rpt_e_bad_version: {
      en: 'The version has characters that are not allowed (letters, digits, . _ - + only).',
      ar: 'رقم النسخة فيه رموز غير مسموحة (حروف وأرقام و . _ - + فقط).'
    },
    rpt_e_bad_text: {
      en: 'The text is empty or too long (2000 characters at most).',
      ar: 'النص فارغ أو طويل جداً (٢٠٠٠ حرف كحد أقصى).'
    },
    rpt_e_secret_refused: {
      en: 'The text looks like it contains a password or key. Remove it and send again.',
      ar: 'يبدو أن النص يحوي كلمة سر أو مفتاحاً. احذفه وأرسل مجدداً.'
    },
    rpt_e_unknown_project: {
      en: 'The board does not know this project. Pick another.',
      ar: 'اللوحة لا تعرف هذا المشروع. اختر مشروعاً آخر.'
    },
    rpt_e_bad_image: {
      en: 'This image type is not supported. Use PNG, JPEG or WebP.',
      ar: 'نوع الصورة غير مدعوم. استخدم PNG أو JPEG أو WebP.'
    },
    rpt_e_not_filed: {
      en: 'The board could not create the bead. Your draft is kept, try again.',
      ar: 'تعذّر إنشاء المهمة. المسودة محفوظة، حاول مجدداً.'
    },
    rpt_e_bad_request: {
      en: 'The report was not accepted. Check the fields.',
      ar: 'لم يُقبل البلاغ. راجع الحقول.'
    },
    rpt_e_other: {
      en: 'Could not send. Your draft is kept, try again.',
      ar: 'تعذّر الإرسال. المسودة محفوظة، حاول مجدداً.'
    },
    rpt_no_projects: {
      en: 'No projects found.',
      ar: 'لا توجد مشاريع.'
    }
  });
