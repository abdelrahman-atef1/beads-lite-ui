/* ask-Claude strings (en/ar). Merged in utils/i18n.js. */
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ ({
    ask_open: { en: 'Ask Claude', ar: 'اسأل Claude' },
    ask_title: {
      en: 'Ask Claude about this task',
      ar: 'اسأل Claude عن المهمة'
    },
    ask_close: { en: 'Close', ar: 'إغلاق' },
    ask_ph: { en: 'Your question about this task', ar: 'سؤالك عن المهمة' },
    ask_send: { en: 'Send', ar: 'إرسال' },
    ask_note: {
      en: 'One question, no earlier context.',
      ar: 'سؤال واحد، من غير سياق سابق.'
    },
    ask_empty: { en: 'Write your question first', ar: 'اكتب سؤالك الأول' },
    ask_wait: {
      en: 'Claude is reading the task and thinking… {n} s of {max}',
      ar: 'Claude بيقرأ المهمة ويفكر… {n} ث من {max}'
    },
    ask_progress: {
      en: '{n} of {max} seconds',
      ar: '{n} من {max} ثانية'
    },
    ask_cancel: { en: 'Cancel', ar: 'إلغاء' },
    ask_new: { en: 'New question', ar: 'سؤال جديد' },
    ask_copy: { en: 'Copy answer', ar: 'نسخ الإجابة' },
    ask_copied: { en: 'Copied', ar: 'تم النسخ' },
    ask_retry: { en: 'Try again', ar: 'حاول تاني' },
    ask_label: {
      en: 'AI answer from the task text. It can be wrong. Not saved.',
      ar: 'إجابة من الذكاء الاصطناعي من نص المهمة، ممكن تكون غلط. مش بتتحفظ.'
    },
    ask_truncated: { en: 'The answer was cut short.', ar: 'الإجابة اتقطعت.' },
    ask_e_timeout: {
      en: 'Claude did not answer in time. Your question is kept.',
      ar: 'Claude لم يرد في الوقت المحدد. سؤالك محفوظ.'
    },
    ask_e_busy: {
      en: 'Another question is running now. Waiting for it…',
      ar: 'في سؤال تاني شغال دلوقتي… هستنى.'
    },
    ask_e_rate: {
      en: 'Too many questions. Try again in {n} s.',
      ar: 'أسئلة كتير. حاول بعد {n} ث.'
    },
    ask_e_signed_out: {
      en: 'Claude is not signed in on the PC yet. Ask later; the board works.',
      ar: 'Claude لسه مش مسجّل دخول على الكمبيوتر. اسأل بعدين، اللوحة شغالة.'
    },
    ask_e_offline_claude: {
      en: 'The PC has no internet to reach Claude. Try later.',
      ar: 'الكمبيوتر مش متصل بالإنترنت للوصول لـ Claude. جرّب بعدين.'
    },
    ask_e_missing: {
      en: 'Claude is not set up on the PC.',
      ar: 'Claude مش متظبط على الكمبيوتر.'
    },
    ask_e_disabled: {
      en: 'Ask Claude is turned off.',
      ar: 'خاصية اسأل Claude مقفولة.'
    },
    ask_e_failed: {
      en: 'Claude failed to answer. Your question is kept.',
      ar: 'Claude فشل في الرد. سؤالك محفوظ.'
    },
    ask_e_forbidden: {
      en: 'Not allowed. Reload the page and try again.',
      ar: 'مش مسموح. أعد تحميل الصفحة وحاول تاني.'
    },
    ask_e_notfound: {
      en: 'This task was not found.',
      ar: 'المهمة دي مش موجودة.'
    },
    ask_e_bad: {
      en: 'The question was not accepted (empty or too long).',
      ar: 'السؤال مش مقبول (فاضي أو طويل).'
    },
    ask_e_offline: {
      en: 'The board cannot reach the PC. Your question is kept.',
      ar: 'اللوحة مش واصلة للكمبيوتر. سؤالك محفوظ.'
    }
  });
