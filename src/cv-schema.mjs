export const PROFILE_FIELDS = [
  ['displayName', 'الاسم المعتمد للنشر', 180],
  ['englishName', 'الاسم بالإنجليزية', 180],
  ['generalSpecialization', 'التخصص العام', 200],
  ['specialization', 'التخصص الدقيق', 200],
  ['biography', 'النبذة العلمية', 4000],
  ['researchInterests', 'الاهتمامات البحثية (موضوع في كل سطر)', 2000],
  ['teachingStatement', 'الخبرة في تطوير التدريس والإرشاد الأكاديمي', 3000],
  ['website', 'الصفحة الجامعية أو الشخصية', 800, 'url'],
  ['orcid', 'رابط ORCID', 800, 'url'],
  ['scholar', 'رابط Google Scholar', 800, 'url'],
  ['scopus', 'رابط Scopus', 800, 'url'],
  ['photo', 'رابط صورة شخصية (اختياري)', 800, 'url']
];

const f = (key, label, max = 400) => [key, label, max];
export const PROFILE_SECTIONS = [
  { key: 'education', title: 'المؤهلات العلمية', required: ['degree', 'institution'], fields: [f('degree', 'الدرجة العلمية'), f('specialization', 'التخصص'), f('institution', 'الجامعة'), f('country', 'البلد'), f('year', 'سنة الحصول عليها', 80), f('thesisTitle', 'عنوان الرسالة', 1000)] },
  { key: 'appointments', title: 'المسار الوظيفي والترقيات', required: ['role', 'institution'], fields: [f('role', 'الوظيفة أو الرتبة'), f('institution', 'الجهة'), f('start', 'من', 80), f('end', 'إلى (أو حتى الآن)', 80)] },
  { key: 'administration', title: 'المناصب الإدارية', required: ['role', 'institution'], fields: [f('role', 'المنصب'), f('institution', 'الجهة'), f('start', 'من', 80), f('end', 'إلى', 80)] },
  { key: 'publications', title: 'إنتاج علمي إضافي وبياناته الببليوغرافية', required: ['title', 'kind', 'status'], fields: [f('kind', 'النوع: بحث / كتاب / فصل / تحقيق'), f('status', 'الحالة: منشور / مقبول للنشر'), f('title', 'العنوان', 1200), f('authors', 'المؤلفون بترتيب النشر', 1000), f('venue', 'المجلة أو الناشر'), f('year', 'السنة كما في المصدر', 80), f('volume', 'المجلد', 80), f('issue', 'العدد', 80), f('pages', 'الصفحات', 100), f('doi', 'DOI', 300), f('url', 'رابط الوصول', 800)] },
  { key: 'teaching', title: 'خبرات تدريسية إضافية', required: ['course'], fields: [f('course', 'المقرر أو مجال التدريس'), f('degree', 'المرحلة'), f('program', 'البرنامج'), f('years', 'فترة التدريس', 180), f('contribution', 'تطوير المقرر أو مساهمة تدريسية', 1200)] },
  { key: 'service', title: 'اللجان والعضويات والتحكيم والخدمة الأكاديمية', required: ['role', 'organization'], fields: [f('role', 'الدور أو العضوية'), f('organization', 'الجهة أو الجمعية'), f('start', 'من', 80), f('end', 'إلى', 80), f('description', 'تفاصيل المساهمة', 1200)] },
  { key: 'grants', title: 'المنح والمشروعات البحثية', required: ['title'], fields: [f('title', 'اسم المشروع', 1000), f('role', 'الدور'), f('funder', 'الجهة الممولة'), f('start', 'من', 80), f('end', 'إلى', 80), f('description', 'المخرجات أو تفاصيل المشروع', 1200)] },
  { key: 'awards', title: 'الجوائز والتكريم', required: ['title'], fields: [f('title', 'الجائزة أو التكريم'), f('organization', 'الجهة المانحة'), f('year', 'السنة', 80), f('description', 'تفاصيل', 1200)] },
  { key: 'training', title: 'الدورات والشهادات المهنية', required: ['title'], fields: [f('title', 'الدورة أو الشهادة'), f('organization', 'الجهة'), f('year', 'السنة', 80), f('hours', 'عدد الساعات', 80)] },
  { key: 'licenses', title: 'الإجازات العلمية', required: ['title'], fields: [f('title', 'الإجازة'), f('issuer', 'الجهة أو المجيز'), f('year', 'السنة', 80), f('details', 'تفاصيل الإجازة', 1200)] },
  { key: 'languages', title: 'اللغات', required: ['name', 'level'], fields: [f('name', 'اللغة'), f('level', 'مستوى الإتقان')] }
];

export function safeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function normalizeProfile(raw = {}, { strict = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('بيانات السيرة غير صالحة.');
  const result = { version: 1 };
  const text = (value, label, max, isUrl = false) => {
    const valueText = String(value ?? '').trim();
    if (valueText.length > max) throw new Error(`${label}: الحد الأعلى ${max} حرف.`);
    if (isUrl && valueText && !safeUrl(valueText)) throw new Error(`${label}: أدخل رابطًا كاملًا يبدأ بـ https:// أو http://.`);
    return valueText;
  };
  PROFILE_FIELDS.forEach(([key, label, max, type]) => { result[key] = text(raw[key], label, max, type === 'url'); });
  PROFILE_SECTIONS.forEach(section => {
    const entries = raw[section.key] || [];
    if (!Array.isArray(entries) || entries.length > 100) throw new Error(`${section.title}: الحد الأعلى ١٠٠ سجل.`);
    result[section.key] = entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${section.title}: السجل ${index + 1} غير صالح.`);
      const row = {};
      [...section.fields, f('source', 'المصدر أو مرجع الإثبات', 1200)].forEach(([key, label, max]) => {
        row[key] = text(entry[key], label, max, key === 'url');
      });
      const hasData = Object.values(row).some(Boolean);
      if (strict && hasData && section.required.some(key => !row[key])) {
        const missing = section.required.filter(key => !row[key]).map(key => section.fields.find(field => field[0] === key)[1]);
        throw new Error(`${section.title}، السجل ${index + 1}: أكمل ${missing.join('، ')}.`);
      }
      return row;
    }).filter(row => Object.values(row).some(Boolean));
  });
  result.notes = text(raw.notes, 'ملاحظات المصادر (داخلية)', 4000);
  result.updatedAt = text(raw.updatedAt, 'تاريخ التحديث', 80);
  return result;
}

export function profileChecklist(profile) {
  return [
    ['النبذة العلمية', !!profile.biography],
    ['التخصص الدقيق', !!profile.specialization],
    ['المؤهلات العلمية', !!profile.education?.length],
    ['المسار الوظيفي', !!profile.appointments?.length],
    ['الاهتمامات البحثية', !!profile.researchInterests],
    ['الروابط العلمية', !!(profile.website || profile.orcid || profile.scholar || profile.scopus)]
  ];
}
