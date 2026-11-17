/** Strings of the tasks screen. Keys start with u3_. */
/** @type {Record<string, { en: string, ar: string }>} */
export const strings = {
  u3_tk_search: { en: 'Search tasks', ar: 'دوّر في المهام' },
  u3_tk_filters: { en: 'Filters', ar: 'الفلاتر' },
  u3_tk_all: { en: 'All', ar: 'الكل' },
  u3_tk_mine: { en: 'Mine', ar: 'مهامي' },
  u3_tk_p01: { en: 'Urgent', ar: 'عاجل' },
  u3_tk_decision: { en: 'Decisions', ar: 'قرارات' },
  u3_tk_blocked: { en: 'Blocked', ar: 'معطّلة' },
  u3_tk_type: { en: 'Type', ar: 'النوع' },
  u3_tk_label: { en: 'Label', ar: 'الليبل' },
  u3_tk_assignee: { en: 'Assignee', ar: 'المسؤول' },
  u3_tk_prio: { en: 'Priority', ar: 'الأولوية' },
  u3_tk_project: { en: 'Project', ar: 'المشروع' },
  u3_tk_unassigned: { en: 'Unassigned', ar: 'بدون مسؤول' },
  u3_tk_status: { en: 'Status', ar: 'الحالة' },
  u3_tk_epic: { en: 'Epic', ar: 'الإيبك' },
  u3_tk_clear_all: { en: 'Clear all', ar: 'امسح الكل' },
  u3_tk_clear_one: { en: 'Clear', ar: 'امسح' },
  u3_tk_find: { en: 'Find', ar: 'دوّر' },
  u3_tk_done: { en: 'Done', ar: 'تمام' },
  u3_tk_remove: { en: 'Remove filter', ar: 'شيل الفلتر' },
  u3_tk_no_match: {
    en: 'No tasks match these filters',
    ar: 'مفيش مهام بتطابق الفلاتر دي'
  },
  u3_tk_no_match_btn: { en: 'Clear all filters', ar: 'امسح كل الفلاتر' },
  u3_tk_any: { en: 'Any', ar: 'أي' },
  u3_tk_skipped: {
    en: 'Not shown (could not be read):',
    ar: 'لم تظهر (تعذرت القراءة):'
  },
  u3_tk_none: { en: 'No tasks', ar: 'لا توجد مهام' },
  u3_tk_loading: { en: 'Loading', ar: 'جارٍ التحميل' },
  u3_tk_closed: { en: 'Closed', ar: 'مغلقة' },
  u3_tk_hide: { en: 'Hide', ar: 'إخفاء' },
  u3_tk_more: { en: 'Show more', ar: 'اعرض أكتر' },
  u3_tk_stalled: { en: 'Stalled', ar: 'واقفة' },
  u3_tk_waits: { en: 'Waiting on {id}', ar: 'مستني {id}' },
  u3_tk_blocked_tag: { en: 'Blocked', ar: 'معطّلة' },
  u3_tk_total: { en: 'Total', ar: 'المجموع' },
  u3_tk_clear: { en: 'Clear filters', ar: 'امسح الفلاتر' },
  u3_tk_col_owner: { en: 'Owner decision', ar: 'بانتظار قرارك' },
  u3_tk_col_progress: { en: 'In progress', ar: 'قيد التنفيذ' },
  u3_tk_col_test: { en: 'Waiting for test', ar: 'بانتظار الاختبار' },
  u3_tk_col_merge: { en: 'Waiting for merge', ar: 'بانتظار الدمج' },
  u3_tk_col_ready: { en: 'Ready', ar: 'جاهزة' },
  u3_tk_col_blocked: { en: 'Blocked', ar: 'معطّلة' },
  u3_tk_group: { en: 'Group by', ar: 'تجميع حسب' },
  u3_tk_group_none: { en: 'None', ar: 'بدون' },
  u3_tk_group_project: { en: 'Project', ar: 'المشروع' },
  u3_tk_group_assignee: { en: 'Assignee', ar: 'المسؤول' },
  u3_tk_group_epic: { en: 'Epic', ar: 'الإيبك' },
  u3_tk_lane_unassigned: { en: 'Unassigned', ar: 'بدون مسؤول' },
  u3_tk_lane_noepic: { en: 'No epic', ar: 'بدون إيبك' },
  u3_tk_lane_others: { en: 'Others', ar: 'أخرى' },
  u3_tk_col_deferred: { en: 'Deferred', ar: 'مؤجلة' },
  u3_tk_unknown_status: {
    en: 'Unknown status "{s}" on {id}: fix it in bd, the board only knows 8 statuses',
    ar: 'حالة غير معروفة "{s}" في {id}: صحّحها في bd، اللوحة تعرف ٨ حالات فقط'
  },
  u3_bk_lane_all: { en: 'Select lane', ar: 'حدّد الحارة' },
  u3_bk_select: { en: 'Select', ar: 'تحديد' },
  u3_bk_selected: { en: 'selected', ar: 'محدّدة' },
  u3_bk_all_n: { en: 'Select all shown ({n})', ar: 'حدّد كل اللي ظاهر ({n})' },
  u3_bk_all_in: {
    en: 'Select all in {scope} ({n})',
    ar: 'حدّد الكل في {scope} ({n})'
  },
  u3_bk_all_first: {
    en: 'Select first {max} of {n}',
    ar: 'حدّد أول {max} من {n}'
  },
  u3_bk_cap: {
    en: '{n} shown. One action takes {max} at most, so select all picks the first {max}.',
    ar: 'ظاهر {n}. الإجراء الواحد بياخد {max} بس، فالتحديد بياخد أول {max}.'
  },
  u3_bk_keep: { en: 'Keep first {max}', ar: 'سيب أول {max} بس' },
  u3_bk_cancel: { en: 'Cancel', ar: 'إلغاء' },
  u3_bk_close: { en: 'Close', ar: 'اقفل' },
  u3_bk_move: { en: 'Move', ar: 'غيّر الحالة' },
  u3_bk_defer: { en: 'Defer', ar: 'أجّل' },
  u3_bk_label: { en: 'Label', ar: 'وسم' },
  u3_bk_assign: { en: 'Assign', ar: 'عيّن' },
  u3_bk_label_mode: { en: 'What to do', ar: 'عايز تعمل إيه' },
  u3_bk_label_add: { en: 'Add a label', ar: 'ضيف وسم' },
  u3_bk_label_rm: { en: 'Remove a label', ar: 'شيل وسم' },
  u3_bk_label_name: { en: 'Label (one word)', ar: 'الوسم (كلمة واحدة)' },
  u3_bk_assign_to: { en: 'Assign to', ar: 'عيّن لـ' },
  u3_bk_unassign: { en: 'Nobody (clear)', ar: 'محدش (امسح)' },
  u3_bk_c_label_add: {
    en: 'Add label {label} to {n} tasks',
    ar: 'هتضيف الوسم {label} على {n} مهمة'
  },
  u3_bk_c_label_rm: {
    en: 'Remove label {label} from {n} tasks',
    ar: 'هتشيل الوسم {label} من {n} مهمة'
  },
  u3_bk_c_assign: {
    en: 'Assign {n} tasks to {role}',
    ar: 'هتعيّن {n} مهمة لـ {role}'
  },
  u3_bk_c_unassign: {
    en: 'Clear the assignee of {n} tasks',
    ar: 'هتمسح المكلّف من {n} مهمة'
  },
  u3_bk_a_label: { en: 'Label {n} tasks', ar: 'وسم {n} مهمة' },
  u3_bk_a_assign: { en: 'Assign {n} tasks', ar: 'عيّن {n} مهمة' },
  u3_bk_hidden: {
    en: '{n} selected are hidden by the filter',
    ar: '{n} محدّدة مخفية بالفلتر'
  },
  u3_bk_too_many: {
    en: '{n} selected. The limit is {max} per action, so nothing was changed. Unselect some.',
    ar: 'محدّد {n}. الحد {max} في المرة، فمفيش حاجة اتغيّرت. شيل التحديد عن البعض.'
  },
  u3_bk_failed: {
    en: 'Could not apply. Nothing was changed.',
    ar: 'معرفتش أنفّذ. مفيش حاجة اتغيّرت.'
  },
  u3_bk_reason: { en: 'Reason (one line)', ar: 'السبب (سطر واحد)' },
  u3_bk_move_to: { en: 'Move to', ar: 'انقل لحالة' },
  u3_bk_until: { en: 'Defer until', ar: 'أجّل لحد' },
  u3_bk_until_reopen: { en: 'Until I reopen', ar: 'لحد ما أفتحها تاني' },
  u3_bk_take_over: {
    en: 'Also take over live work',
    ar: 'وكمان خد الشغل الشغّال'
  },
  u3_bk_c_close: {
    en: 'Close {n} tasks as: {reason}',
    ar: 'هتقفل {n} مهمة بسبب: {reason}'
  },
  u3_bk_c_move: {
    en: 'Move {n} tasks to: {to}',
    ar: 'هتنقل {n} مهمة إلى: {to}'
  },
  u3_bk_c_defer: {
    en: 'Defer {n} tasks until: {until}',
    ar: 'هتأجّل {n} مهمة لحد: {until}'
  },
  u3_bk_a_close: { en: 'Close {n} tasks', ar: 'اقفل {n} مهمة' },
  u3_bk_a_move: { en: 'Move {n} tasks', ar: 'انقل {n} مهمة' },
  u3_bk_a_defer: { en: 'Defer {n} tasks', ar: 'أجّل {n} مهمة' },
  u3_bk_result: { en: 'Result', ar: 'النتيجة' },
  u3_bk_ok: { en: 'OK', ar: 'تمام' },
  u3_bk_done: { en: 'Done {n}', ar: 'اتنفّذ {n}' },
  u3_bk_refused: { en: 'Refused {n}', ar: 'اترفض {n}' },
  u3_bk_preview: {
    en: 'Preview only: the server side is not connected yet, nothing was saved.',
    ar: 'معاينة بس: الجزء بتاع السيرفر لسه مش متوصّل، ومفيش حاجة اتحفظت.'
  },
  u3_bk_undo: { en: 'Undo', ar: 'تراجع' },
  u3_bk_undone: { en: 'Undone for {n} tasks', ar: 'اتراجع عن {n} مهمة' },
  u3_bk_r_decision: {
    en: 'Waiting for your decision: answer it on its card',
    ar: 'بانتظار قرارك: جاوب عليه من كارته'
  },
  u3_bk_r_other_project: {
    en: 'Another project: open that project first',
    ar: 'مشروع تاني: افتح المشروع ده الأول'
  },
  u3_bk_r_already_closed: { en: 'Already closed', ar: 'مقفولة أصلاً' },
  u3_bk_r_children: { en: 'Has open sub-tasks', ar: 'فيها مهام فرعية مفتوحة' },
  u3_bk_r_blockers: {
    en: 'Waiting on other tasks',
    ar: 'معطّلة بانتظار مهام تانية'
  },
  u3_bk_r_live: {
    en: 'An agent is working on it (tick take over to include it)',
    ar: 'فيه وكيل شغّال عليها (علّم خد الشغل الشغّال عشان تدخل)'
  },
  u3_bk_r_same: { en: 'Already in that status', ar: 'أصلاً في الحالة دي' },
  u3_bk_r_missing: { en: 'Not found', ar: 'مش موجودة' },
  u3_bk_r_failed: { en: 'Could not be changed', ar: 'ماقدرناش نغيّرها' }
};
