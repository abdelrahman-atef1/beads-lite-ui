/** Strings of the ask-Claude head and sheet (task .59.8). Keys start with u3_. */
/** @type {Record<string, { en: string, ar: string }>} */
export const strings = {
  u3_ask_open: { en: 'Ask Claude', ar: 'اسأل Claude' },
  u3_ask_title: {
    en: 'Ask Claude about this task',
    ar: 'اسأل Claude عن المهمة'
  },
  u3_ask_close: { en: 'Close', ar: 'إغلاق' },
  u3_ask_ph: { en: 'Your question about this task', ar: 'سؤالك عن المهمة' },
  u3_ask_send: { en: 'Send', ar: 'إرسال' },
  u3_ask_note: {
    en: 'One question, no earlier context.',
    ar: 'سؤال واحد، من غير سياق سابق.'
  },
  u3_ask_empty: { en: 'Write your question first', ar: 'اكتب سؤالك الأول' },
  u3_ask_wait: {
    en: 'Claude is reading the task and thinking… {n} s of {max}',
    ar: 'Claude بيقرأ المهمة ويفكر… {n} ث من {max}'
  },
  u3_ask_cancel: { en: 'Cancel', ar: 'إلغاء' },
  u3_ask_new: { en: 'New question', ar: 'سؤال جديد' },
  u3_ask_copy: { en: 'Copy answer', ar: 'نسخ الإجابة' },
  u3_ask_copied: { en: 'Copied', ar: 'تم النسخ' },
  u3_ask_retry: { en: 'Try again', ar: 'حاول تاني' },
  u3_ask_label: {
    en: 'AI answer from the task text. It can be wrong. Not saved.',
    ar: 'إجابة من الذكاء الاصطناعي من نص المهمة، ممكن تكون غلط. مش بتتحفظ.'
  },
  u3_ask_truncated: { en: 'The answer was cut short.', ar: 'الإجابة اتقطعت.' },
  u3_ask_e_timeout: {
    en: 'Claude did not answer in time. Your question is kept.',
    ar: 'Claude لم يرد في الوقت المحدد. سؤالك محفوظ.'
  },
  u3_ask_e_busy: {
    en: 'Another question is running now. Waiting for it…',
    ar: 'في سؤال تاني شغال دلوقتي… هستنى.'
  },
  u3_ask_e_rate: {
    en: 'Too many questions. Try again in {n} s.',
    ar: 'أسئلة كتير. حاول بعد {n} ث.'
  },
  u3_ask_e_signed_out: {
    en: 'Claude is not signed in on the PC yet. Ask later; the board works.',
    ar: 'Claude لسه مش مسجّل دخول على الكمبيوتر. اسأل بعدين، اللوحة شغالة.'
  },
  u3_ask_e_offline_claude: {
    en: 'The PC has no internet to reach Claude. Try later.',
    ar: 'الكمبيوتر مش متصل بالإنترنت للوصول لـ Claude. جرّب بعدين.'
  },
  u3_ask_e_missing: {
    en: 'Claude is not set up on the PC.',
    ar: 'Claude مش متظبط على الكمبيوتر.'
  },
  u3_ask_e_disabled: {
    en: 'Ask Claude is turned off.',
    ar: 'خاصية اسأل Claude مقفولة.'
  },
  u3_ask_e_failed: {
    en: 'Claude failed to answer. Your question is kept.',
    ar: 'Claude فشل في الرد. سؤالك محفوظ.'
  },
  u3_ask_e_forbidden: {
    en: 'Not allowed. Reload the page and try again.',
    ar: 'مش مسموح. أعد تحميل الصفحة وحاول تاني.'
  },
  u3_ask_e_notfound: {
    en: 'This task was not found.',
    ar: 'المهمة دي مش موجودة.'
  },
  u3_ask_e_bad: {
    en: 'The question was not accepted (empty or too long).',
    ar: 'السؤال مش مقبول (فاضي أو طويل).'
  },
  u3_ask_e_offline: {
    en: 'The board cannot reach the PC. Your question is kept.',
    ar: 'اللوحة مش واصلة للكمبيوتر. سؤالك محفوظ.'
  }
};
