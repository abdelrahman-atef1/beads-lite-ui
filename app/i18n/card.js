/* Decision card panel strings (en/ar), company-1bo5.6.9. Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    dc_badge: { en: 'Decision', ar: 'قرار' },
    dc_nonblocking: { en: 'not blocking', ar: 'لا يوقف العمل' },
    dc_answered: { en: 'Answered', ar: 'تمت الإجابة' },
    cd_title: { en: 'Decision waiting', ar: 'قرار ينتظرك' },
    cd_asked_title: {
      en: 'Your question is with the asker',
      ar: 'سؤالك عند صاحب الطلب'
    },
    cd_done_title: { en: 'Decision recorded', ar: 'تم تسجيل القرار' },
    cd_effect: { en: 'What changes', ar: 'ماذا يتغير' },
    cd_show: { en: 'The thing', ar: 'الشيء نفسه' },
    cd_blocks: { en: 'Frozen until you answer', ar: 'متوقف حتى ترد' },
    cd_pick: { en: 'Choose', ar: 'اختر' },
    cd_confirm: { en: 'Confirm', ar: 'تأكيد' },
    cd_back: { en: 'Back', ar: 'رجوع' },
    cd_rec: { en: 'recommended', ar: 'مُوصى' },
    cd_type_ph: { en: 'Type your answer', ar: 'اكتب ردك' },
    cd_send: { en: 'Send answer', ar: 'أرسل الرد' },
    cd_ask: { en: 'Ask a question first', ar: 'اسأل قبل أن تقرر' },
    cd_ask_send: { en: 'Send question', ar: 'أرسل السؤال' },
    cd_ask_cancel: { en: 'Cancel', ar: 'إلغاء' },
    cd_ask_q_ph: { en: 'Your question (max 500)', ar: 'سؤالك (حتى 500 حرف)' },
    cd_ask_quote_ph: {
      en: 'The part you mean (select it, or type)',
      ar: 'الجزء المقصود (حدده أو اكتبه)'
    },
    cd_scope: { en: 'About', ar: 'بخصوص' },
    cd_scope_question: { en: 'The whole question', ar: 'السؤال كله' },
    cd_scope_part: { en: 'A part of it', ar: 'جزء منه' },
    cd_scope_option: { en: 'Option', ar: 'الخيار' },
    cd_round: { en: 'Question {n} of {max}', ar: 'السؤال {n} من {max}' },
    cd_rounds_used: {
      en: 'You used all {max} questions; please decide.',
      ar: 'استخدمت كل الأسئلة ({max})، قرر من فضلك.'
    },
    cd_thread: { en: 'Questions and answers', ar: 'الأسئلة والإجابات' },
    cd_you: { en: 'You', ar: 'أنت' },
    cd_asker: { en: 'Asker', ar: 'صاحب الطلب' },
    cd_waiting_expl: {
      en: 'Waiting for the explanation. The card comes back to you here.',
      ar: 'بانتظار الشرح. ستعود البطاقة هنا.'
    },
    cd_busy: { en: 'Saving...', ar: 'جارٍ الحفظ...' },
    cd_recorded: { en: 'Answer recorded', ar: 'تم تسجيل الرد' },
    cd_question_sent: { en: 'Question sent', ar: 'تم إرسال السؤال' },
    cd_via_phone: { en: 'from the phone', ar: 'من الموبايل' },
    cd_via_pc: { en: 'from the PC', ar: 'من الكمبيوتر' },
    cd_wake_delivered: {
      en: 'Delivered: a session picked it up',
      ar: 'وصلت: جلسة استلمتها'
    },
    cd_wake_queued: {
      en: 'Queued: the responsible chat will get it shortly',
      ar: 'في الانتظار: الشات المسؤول سيستلمها بعد قليل'
    },
    cd_wake_nolisten: {
      en: 'Queued: responsible chat not listening. Nothing is lost; it is delivered when a chat opens.',
      ar: 'في الانتظار: الشات المسؤول غير مستمع. لا شيء ضائع، تصل عند فتح شات.'
    },
    cd_wake_none: { en: 'No wake sent', ar: 'لم يُرسل تنبيه' },
    cd_wake_failed: {
      en: 'Recorded, but the wake could not be queued',
      ar: 'تم التسجيل لكن تعذر إرسال التنبيه'
    },
    cd_err_changed: {
      en: 'The card changed. It is reloaded; read it again.',
      ar: 'تغيرت البطاقة. أُعيد تحميلها، اقرأها مرة أخرى.'
    },
    cd_err_already: {
      en: 'Already handled (another tab or phone).',
      ar: 'تمت معالجتها بالفعل (تبويب أو موبايل آخر).'
    },
    cd_err_secret: {
      en: 'Not sent: the text looks like a secret, code or long number.',
      ar: 'لم يُرسل: النص يشبه سرا أو كودا أو رقما طويلا.'
    },
    cd_err_empty: { en: 'Write something first.', ar: 'اكتب شيئا أولا.' },
    cd_err_long: { en: 'Too long.', ar: 'النص طويل جدا.' },
    cd_err_cap: {
      en: 'No questions left; please decide.',
      ar: 'لا أسئلة متبقية، قرر من فضلك.'
    },
    cd_err_pending: {
      en: 'Saved partly; it finishes by itself. Reload in a moment.',
      ar: 'حُفظ جزئيا وسيكتمل تلقائيا. أعد التحميل بعد لحظة.'
    },
    cd_err_generic: {
      en: 'Could not save. Try again.',
      ar: 'تعذر الحفظ. حاول مرة أخرى.'
    },
    cd_load_failed: {
      en: 'The card could not be loaded.',
      ar: 'تعذر تحميل البطاقة.'
    }
  });
