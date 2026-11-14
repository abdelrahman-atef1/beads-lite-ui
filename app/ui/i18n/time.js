/** Strings of the Time section and the Time screen (beads-lite-1bo5.6.59.12). Keys start with u3_. */
/** @type {Record<string, { en: string, ar: string }>} */
export const strings = {
  u3_time: { en: 'Time and quality', ar: 'الوقت والجودة' },
  u3_tm_total: { en: 'Total', ar: 'إجمالي' },
  u3_tm_loading: { en: 'Loading time…', ar: 'جارٍ تحميل الوقت…' },
  u3_tm_empty: {
    en: 'No time data yet. It appears after the flow rollup runs; the board works without it.',
    ar: 'مفيش بيانات وقت لسه. بتظهر بعد ما تتشغل حسبة الوقت؛ اللوحة بتشتغل من غيرها.'
  },
  u3_tm_unknown: { en: 'unknown', ar: 'غير معروف' },
  u3_tm_unknown_note: {
    en: 'This task has no status history, so its time is unknown (not zero).',
    ar: 'المهمة دي مالهاش سجل حالات، فوقتها غير معروف (مش صفر).'
  },
  u3_tm_running: { en: 'running', ar: 'شغّال دلوقتي' },
  u3_tm_stages: { en: 'Time by stage', ar: 'توزيع الوقت حسب المرحلة' },
  u3_tm_roles: { en: 'Time by role', ar: 'الوقت حسب الدور' },
  u3_tm_intervals: { en: 'Intervals', ar: 'الفترات' },
  u3_tm_more: { en: '{n} more intervals', ar: '{n} فترات إضافية' },
  u3_tm_active: { en: 'Active work', ar: 'شغل فعلي' },
  u3_tm_test: { en: 'Waiting for test', ar: 'مستني اختبار' },
  u3_tm_owner: { en: 'Waiting for your decision', ar: 'مستني قرارك' },
  u3_tm_merge: { en: 'Waiting to merge', ar: 'مستني الدمج' },
  u3_tm_blocked: { en: 'Blocked or deferred', ar: 'متوقف أو مؤجل' },
  u3_tm_queue: { en: 'Queued, not started', ar: 'في الطابور' },
  u3_tm_wall: {
    en: 'wall {wall} = active {active} + waiting {waiting}',
    ar: 'الإجمالي {wall} = فعلي {active} + انتظار {waiting}'
  },
  u3_tm_tokens: { en: 'Claude tokens', ar: 'توكنز Claude' },
  u3_tm_tok_in: { en: 'input {n}', ar: 'دخل {n}' },
  u3_tm_tok_out: { en: 'output {n}', ar: 'خرج {n}' },
  u3_tm_tok_cache: { en: 'cache {n}', ar: 'كاش {n}' },
  u3_tm_tok_unknown: {
    en: 'Tokens: unknown. Not tied to this task, not zero.',
    ar: 'التوكنز: غير معروفة. مش مربوطة بالمهمة، مش صفر.'
  },
  u3_tm_conf_high: { en: 'high confidence', ar: 'ثقة عالية' },
  u3_tm_conf_mixed: { en: 'mixed confidence', ar: 'ثقة متوسطة' },
  u3_tm_conf_medium: { en: 'medium confidence', ar: 'ثقة متوسطة' },
  u3_tm_conf_unknown: { en: 'unknown', ar: 'غير معروف' },
  u3_tm_quality: { en: 'Quality counters', ar: 'مؤشرات الجودة' },
  u3_tm_q_fail: { en: 'QA fails', ar: 'فشل اختبار' },
  u3_tm_q_reopen: { en: 'Reopened', ar: 'اتفتحت تاني' },
  u3_tm_q_owner: { en: 'Rejected by you', ar: 'رفض منك' },
  u3_tm_q_rework: { en: 'Rework rounds', ar: 'جولات تعديل' },
  u3_tm_note: {
    en: 'Time counts as better only when quality holds.',
    ar: 'الوقت بيتحسب أحسن بس لو الجودة ثابتة.'
  },
  u3_tm_asof: { en: 'Rollup built {t}', ar: 'الحسبة اتبنت {t}' },
  u3_tm_fixture: { en: 'Sample data (timefx)', ar: 'بيانات تجريبية (timefx)' },
  // role screen
  u3_tm_title: {
    en: 'Time and quality by role',
    ar: 'الوقت والجودة حسب الدور'
  },
  u3_tm_sub: {
    en: 'Closed tasks in the period. Roles are listed A to Z, never ranked by time.',
    ar: 'المهام المقفولة في الفترة. الأدوار مرتبة أبجديًا، مش بالوقت.'
  },
  u3_tm_period: { en: 'Period', ar: 'الفترة' },
  u3_tm_days: { en: 'Last {n} days', ar: 'آخر {n} يوم' },
  u3_tm_closed: { en: 'closed {n}', ar: 'اتقفلت {n}' },
  u3_tm_med_active: { en: 'Active median', ar: 'وسيط الشغل الفعلي' },
  u3_tm_p90: { en: 'p90', ar: 'p90' },
  u3_tm_med_wait: { en: 'Waiting median', ar: 'وسيط الانتظار' },
  u3_tm_fail_rate: { en: 'Fail rate', ar: 'نسبة الفشل' },
  u3_tm_unk_n: {
    en: '{n} without history, left out of the times',
    ar: '{n} بدون سجل، مستبعدة من الأوقات'
  },
  u3_tm_running_n: {
    en: '{n} running now',
    ar: '{n} مهام شغّالة دلوقتي'
  },
  u3_tm_no_closed: {
    en: 'No tasks closed in this period.',
    ar: 'مفيش مهام اتقفلت في الفترة دي.'
  },
  u3_tm_v_few: { en: 'too few to tell', ar: 'عينة صغيرة، مينفعش نحكم' },
  u3_tm_v_faster_worse: { en: 'faster but worse', ar: 'أسرع لكن أسوأ' },
  u3_tm_v_slower_worse: { en: 'slower and worse', ar: 'أبطأ وأسوأ' },
  u3_tm_v_faster_held: { en: 'faster, quality held', ar: 'أسرع والجودة ثابتة' },
  u3_tm_v_slower_better: { en: 'slower but better', ar: 'أبطأ لكن أحسن' },
  u3_tm_v_worse_same: {
    en: 'quality worse, speed about the same',
    ar: 'الجودة أسوأ والسرعة تقريبًا زي ما هي'
  },
  u3_tm_v_same: {
    en: 'about the same as the period before',
    ar: 'تقريبًا زي الفترة اللي قبلها'
  },
  u3_tm_vs: {
    en: 'Against the {n} days before:',
    ar: 'مقارنة بالـ {n} يوم اللي قبل:'
  },
  // experiment view and weekly digest (beads-lite-1bo5.6.66.7)
  u3_ex_title: { en: 'Improvement experiments', ar: 'تجارب التحسين' },
  u3_ex_sub: {
    en: 'Each verdict is computed by a script from closed tasks. Time is shown with its quality counters.',
    ar: 'كل حكم بيحسبه سكريبت من المهام المقفولة. الوقت معروض جنب مؤشرات الجودة.'
  },
  u3_ex_none: { en: 'No experiments yet.', ar: 'مفيش تجارب لسه.' },
  u3_ex_v_adopt: { en: 'ADOPT', ar: 'اعتماد' },
  u3_ex_v_extend: { en: 'EXTEND', ar: 'تمديد' },
  u3_ex_v_rollback: { en: 'ROLL BACK', ar: 'تراجع' },
  u3_ex_v_confounded: { en: 'confounded', ar: 'متداخل' },
  u3_ex_v_few: { en: 'too few to tell', ar: 'عينة صغيرة، مينفعش نحكم' },
  u3_ex_v_inconclusive: { en: 'inconclusive', ar: 'غير حاسم' },
  u3_ex_running: { en: 'running', ar: 'شغّالة' },
  u3_ex_ended: { en: 'ended', ar: 'خلصت' },
  u3_ex_change: { en: 'Change:', ar: 'التغيير:' },
  u3_ex_before: { en: 'Before', ar: 'قبل' },
  u3_ex_during: { en: 'During', ar: 'أثناء التجربة' },
  u3_ex_n: { en: 'tasks', ar: 'مهمة' },
  u3_ex_m_active: { en: 'active median', ar: 'وسيط الشغل الفعلي' },
  u3_ex_m_waiting: { en: 'waiting median', ar: 'وسيط الانتظار' },
  u3_ex_m_wall: { en: 'wall median', ar: 'وسيط الإجمالي' },
  u3_ex_m_tokens: { en: 'tokens median', ar: 'وسيط التوكنز' },
  u3_ex_target: {
    en: 'Target: {m} down {p}% or more',
    ar: 'الهدف: {m} ينزل {p}% أو أكتر'
  },
  u3_ex_measured: { en: 'Measured: {p}%', ar: 'المقاس: {p}%' },
  u3_ex_no_change: {
    en: 'Measured: not enough data',
    ar: 'المقاس: مفيش بيانات كفاية'
  },
  u3_ex_interval: {
    en: '80% range: {lo} to {hi}',
    ar: 'مدى 80%: من {lo} إلى {hi}'
  },
  u3_ex_unk: {
    en: '{n} tasks without a known {m}, left out',
    ar: '{n} مهام من غير {m} معروف، مستبعدة'
  },
  u3_ex_control: {
    en: 'Other roles: {n} tasks, {p}% change',
    ar: 'الأدوار التانية: {n} مهمة، تغيّر {p}%'
  },
  u3_ex_market: { en: 'the market moved too', ar: 'باقي الأدوار اتحسنت كمان' },
  u3_ex_confounded: {
    en: 'Something else changed during the run: {what}. Read the verdict with care.',
    ar: 'حاجة تانية اتغيرت أثناء التجربة: {what}. اقرأ الحكم بحذر.'
  },
  u3_ex_guards: {
    en: 'Quality guardrails (before to during)',
    ar: 'حراس الجودة (قبل إلى أثناء)'
  },
  u3_ex_held: { en: 'held', ar: 'ثابتة' },
  u3_ex_worse: { en: 'worse', ar: 'أسوأ' },
  u3_ex_g_escaped: { en: 'Escaped to users', ar: 'وصلت للمستخدم' },
  u3_ex_g_other: { en: 'Other', ar: 'أخرى' },
  u3_ex_by_script: {
    en: 'Computed by script (flow-exp). There is no button to adopt: a person changes the flow by opening a task.',
    ar: 'محسوب بسكريبت (flow-exp). مفيش زرار اعتماد: التغيير بيتم بفتح مهمة.'
  },
  u3_wd_title: { en: 'Weekly flow digest', ar: 'ملخص الأسبوع' },
  u3_wd_none: {
    en: 'No weekly digest yet. It appears after the weekly flow review runs.',
    ar: 'مفيش ملخص أسبوعي لسه. بيظهر بعد ما المراجعة الأسبوعية تتشغل.'
  },
  u3_wd_by_script: {
    en: 'Written by the weekly script; shown as written.',
    ar: 'مكتوب بالسكريبت الأسبوعي؛ معروض زي ما هو.'
  },
  u3_wd_at: { en: 'built {t}', ar: 'اتبنى {t}' }
};
