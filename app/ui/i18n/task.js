/** Strings of the task screen. Keys start with u3_. Western digits only. */
/** @type {Record<string, { en: string, ar: string }>} */
export const strings = {
  u3_ts_back: { en: 'Back', ar: 'رجوع' },
  u3_ts_loading: { en: 'Loading the task…', ar: 'بنحمّل المهمة…' },
  u3_ts_missing: { en: 'Task not found', ar: 'المهمة مش موجودة' },
  u3_ts_details: { en: 'Details', ar: 'التفاصيل' },
  u3_ts_status: { en: 'Status', ar: 'الحالة' },
  u3_ts_assignee: { en: 'Assignee', ar: 'المسؤول' },
  u3_ts_priority: { en: 'Priority', ar: 'الأولوية' },
  u3_ts_type: { en: 'Type', ar: 'النوع' },
  u3_ts_parent: { en: 'Parent', ar: 'الأب' },
  u3_ts_created: { en: 'Created', ar: 'اتعملت' },
  u3_ts_updated: { en: 'Updated', ar: 'اتحدثت' },
  u3_ts_labels: { en: 'Labels', ar: 'التصنيفات' },
  u3_ts_close_reason: { en: 'Close reason', ar: 'سبب الإغلاق' },
  u3_ts_none: { en: 'None', ar: 'مفيش' },
  u3_ts_description: { en: 'Description', ar: 'الوصف' },
  u3_ts_design: { en: 'Design', ar: 'التصميم' },
  u3_ts_notes: { en: 'Notes', ar: 'ملاحظات' },
  u3_ts_acceptance: { en: 'Acceptance', ar: 'معايير القبول' },
  u3_ts_comments: { en: 'Comments', ar: 'التعليقات' },
  u3_ts_children: { en: 'Subtasks', ar: 'المهام الفرعية' },
  u3_ts_deps: { en: 'Depends on', ar: 'بتعتمد على' },
  u3_ts_dependents: { en: 'Related', ar: 'مرتبطة بيها' },
  u3_ts_no_comments: { en: 'No comments yet', ar: 'لسه مفيش تعليقات' },
  u3_ts_comments_failed: {
    en: 'Could not load comments',
    ar: 'التعليقات مجتش'
  },
  u3_ts_retry: { en: 'Retry', ar: 'جرّب تاني' },
  u3_ts_link: { en: 'Link to this comment', ar: 'رابط التعليق ده' },
  u3_ts_add: { en: 'Add a comment', ar: 'اكتب تعليق' },
  u3_ts_ph: {
    en: 'Write a comment (Ctrl+Enter to send)',
    ar: 'اكتب تعليق (Ctrl+Enter للإرسال)'
  },
  u3_ts_send: { en: 'Post comment', ar: 'ابعت التعليق' },
  u3_ts_sending: { en: 'Sending…', ar: 'بنبعت…' },
  u3_ts_queued: {
    en: 'Queued: it will be sent when you are back online',
    ar: 'في الانتظار: هتتبعت أول ما النت يرجع'
  },
  u3_ts_failed: { en: 'The comment was not posted', ar: 'التعليق ما اتبعتش' },
  u3_ts_unknown: { en: 'Unknown', ar: 'مجهول' },
  u3_ts_project: { en: 'Project', ar: 'المشروع' },
  u3_ts_more: { en: 'More actions', ar: 'إجراءات تانية' },
  u3_ts_cancel: { en: 'Cancel', ar: 'إلغاء' },
  u3_ts_time_more: { en: 'Details', ar: 'التفاصيل' },
  u3_ed_edit: { en: 'Edit', ar: 'تعديل' },
  u3_ed_done: { en: 'Done editing', ar: 'خلّصت التعديل' },
  u3_ed_title: { en: 'Title', ar: 'العنوان' },
  u3_ed_save: { en: 'Save', ar: 'حفظ' },
  u3_ed_close: { en: 'Close', ar: 'إغلاق' },
  u3_ed_add: { en: 'Add', ar: 'إضافة' },
  u3_ed_add_label: { en: 'New label', ar: 'تصنيف جديد' },
  u3_ed_label_ph: { en: 'label', ar: 'تصنيف' },
  u3_ed_rm_label: { en: 'Remove label', ar: 'شيل التصنيف' },
  u3_ed_title_req: { en: 'Title is required', ar: 'لازم يبقى فيه عنوان' },
  u3_ed_fail_title: { en: 'Could not save the title', ar: 'العنوان مااتحفظش' },
  u3_ed_fail_desc: {
    en: 'Could not save the description',
    ar: 'الوصف مااتحفظش'
  },
  u3_ed_fail_status: {
    en: 'Could not change the status',
    ar: 'الحالة مااتغيرتش'
  },
  u3_ed_fail_prio: {
    en: 'Could not change the priority',
    ar: 'الأولوية مااتغيرتش'
  },
  u3_ed_fail_assignee: {
    en: 'Could not change the assignee',
    ar: 'المسؤول مااتغيرش'
  },
  u3_ed_fail_label: {
    en: 'Could not change the labels',
    ar: 'التصنيفات مااتغيرتش'
  },
  u3_nt_new: { en: 'New task', ar: 'مهمة جديدة' },
  u3_nt_sub: { en: 'Add subtask', ar: 'مهمة فرعية' },
  u3_nt_head: { en: 'New task', ar: 'مهمة جديدة' },
  u3_nt_title: { en: 'Title', ar: 'العنوان' },
  u3_nt_parent: { en: 'Parent (epic or story)', ar: 'الأب (إيبك أو ستوري)' },
  u3_nt_parent_ph: { en: 'pick or type an id', ar: 'اختار أو اكتب رقمه' },
  u3_nt_labels_ph: { en: 'comma, separated', ar: 'بينهم فاصلة' },
  u3_nt_create: { en: 'Create task', ar: 'اعمل المهمة' },
  u3_nt_creating: { en: 'Creating…', ar: 'بنعمل المهمة…' },
  u3_nt_title_req: { en: 'Title is required', ar: 'لازم يبقى فيه عنوان' },
  u3_nt_parent_req: {
    en: 'Pick a parent: every task has one',
    ar: 'اختار الأب: كل مهمة ليها أب'
  },
  u3_nt_project: { en: 'Project', ar: 'المشروع' },
  u3_nt_project_ph: { en: 'Pick a project', ar: 'اختار المشروع' },
  u3_nt_project_req: {
    en: 'Pick a project: the task is made there',
    ar: 'اختار المشروع: المهمة بتتعمل فيه'
  },
  u3_nt_project_switch: {
    en: 'Could not reach that project',
    ar: 'مقدرتش أوصل للمشروع ده'
  },
  u3_nt_parent_other: {
    en: 'That parent is in another project',
    ar: 'الأب ده في مشروع تاني'
  },
  u3_nt_parent_bad: { en: 'That is not a task id', ar: 'ده مش رقم مهمة' },
  u3_nt_parent_unknown: {
    en: 'No task with that id',
    ar: 'مفيش مهمة بالرقم ده'
  },
  u3_nt_type_req: { en: 'Pick a type', ar: 'اختار النوع' },
  u3_nt_assignee_req: { en: 'Pick an assignee', ar: 'اختار المسؤول' },
  u3_nt_prio_req: { en: 'Pick a priority', ar: 'اختار الأولوية' },
  u3_nt_failed: { en: 'Could not create the task', ar: 'المهمة مااتعملتش' },
  u3_nt_created: { en: 'Created', ar: 'اتعملت' },
  u3_nt_created_noid: {
    en: 'Created, but its id was not found. Look for it on the Tasks screen.',
    ar: 'اتعملت بس مالقيناش رقمها. دور عليها في المهام.'
  },
  u3_nt_parent_not_set: {
    en: 'The parent was not set: set it by hand.',
    ar: 'الأب مااتحطش: حطه بإيدك.'
  },
  u3_nt_assignee_not_set: {
    en: 'The assignee was not set.',
    ar: 'المسؤول مااتحطش.'
  },
  u3_moved: {
    en: 'This bead moved. Old id:',
    ar: 'المهمة دي اتنقلت. رقمها القديم:'
  },
  u3_nt_label_not_set: { en: 'Label not added:', ar: 'التصنيف مااتضافش:' }
};
