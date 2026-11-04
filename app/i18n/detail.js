/* detail strings (en/ar). Key = the English text; merged in utils/i18n.js. */
/** @param {string} en @param {string} ar */
const s = (en, ar) => [en, { en, ar }];
export const strings =
  /** @type {Record<string, { en: string, ar: string }>} */ (
    Object.fromEntries([
      s('Properties', 'الخصائص'),
      s('Dates', 'التواريخ'),
      s('Labels', 'الوسوم'),
      s('Comments', 'التعليقات'),
      s('Design', 'التصميم'),
      s('Acceptance Criteria', 'معايير القبول'),
      s('Notes', 'ملاحظات'),
      s('Dependencies', 'الاعتماديات'),
      s('Dependents', 'المعتمدون'),
      s('Type', 'النوع'),
      s('Status', 'الحالة'),
      s('Priority', 'الأولوية'),
      s('Assignee', 'المسند إليه'),
      s('Created', 'أُنشئت'),
      s('Started', 'بدأت'),
      s('Updated', 'حُدّثت'),
      s('Closed', 'أُغلقت'),
      s('Deferred until', 'مؤجلة حتى'),
      s('Close Reason', 'سبب الإغلاق'),
      s('Unassigned', 'غير مسندة'),
      s('Loading comments…', 'جارٍ تحميل التعليقات…'),
      s('No comments yet', 'لا تعليقات بعد'),
      s('Add design…', 'أضف التصميم…'),
      s('Add notes…', 'أضف ملاحظات…'),
      s('Add acceptance criteria…', 'أضف معايير القبول…'),
      s('Add Comment', 'أضف تعليقاً'),
      s(
        'Add a comment... (Ctrl+Enter to submit)',
        'اكتب تعليقاً… (Ctrl+Enter للإرسال)'
      ),
      s('Issue ID', 'معرّف المهمة'),
      s('Label', 'وسم'),
      s('Loading issue', 'جارٍ تحميل المهمة')
    ])
  );
