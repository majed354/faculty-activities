// Names come from the previous committee project. They describe experience
// areas; they do not assert membership or approval of a proposed formation.
export const COMMITTEE_NAMES = [
  'لجنة الجودة والاعتماد لبرامج البكالوريوس', 'لجنة الجودة والاعتماد لبرامج الدراسات العليا',
  'لجنة تطوير المناهج والبرامج الأكاديمية', 'لجنة الدراسات العليا والبحث العلمي',
  'لجنة فحص الخطط العلمية', 'لجنة الإرشاد الأكاديمي', 'لجنة الاختبارات والنتائج',
  'لجنة الأنشطة والشؤون الطلابية', 'لجنة العلاقات العامة والإعلام',
  'لجنة الجداول', 'لجنة المناهج والخطط الدراسية', 'لجنة الإعلام والمتابعة',
  'لجنة الضبط والتحقيق', 'اللجنة الاستشارية للبرنامج الأكاديمي'
];

export const EXPERIENCE_GROUPS = [
  { name: 'الجودة والاعتماد', options: ['الجودة والاعتماد الأكاديمي', 'الاعتماد البرامجي', 'الاعتماد المؤسسي', 'إعداد الدراسة الذاتية', 'قياس نواتج التعلم', 'مؤشرات الأداء والمقارنة المرجعية', 'المراجعة الداخلية وخطط التحسين'] },
  { name: 'المناهج والتدريس', options: ['تطوير المناهج والبرامج الأكاديمية', 'توصيف المقررات والخطط الدراسية', 'مصادر التعلم', 'التعلم الإلكتروني', 'تطوير أداء أعضاء هيئة التدريس'] },
  { name: 'الدراسات العليا والبحث', options: ['الدراسات العليا والبحث العلمي', 'فحص الخطط العلمية', 'الإشراف العلمي', 'التحكيم العلمي', 'إدارة المشروعات البحثية'] },
  { name: 'شؤون الطلاب', options: ['الإرشاد الأكاديمي', 'الأنشطة والشؤون الطلابية', 'متابعة الخريجين', 'دعم الطلبة المتعثرين والموهوبين', 'الشكاوى والتظلمات الطلابية'] },
  { name: 'التخطيط والإدارة', options: ['الجداول والتخطيط التدريسي', 'الاختبارات والنتائج', 'التخطيط الاستراتيجي والتشغيلي', 'إدارة المخاطر', 'قيادة اللجان وفرق العمل', 'العلاقات العامة والإعلام', 'الضبط والتحقيق'] },
  { name: 'المجتمع والاستشارات', options: ['الاستشارات الأكاديمية', 'الشراكات المجتمعية', 'خدمة المجتمع والتطوع'] }
];
export const EXPERIENCE_AREAS = EXPERIENCE_GROUPS.flatMap(group => group.options);

export const SKILL_GROUPS = [
  { name: 'بحثية وعلمية', options: ['مناهج البحث العلمي', 'تحقيق المخطوطات', 'تحليل النصوص الشرعية', 'الكتابة والنشر العلمي', 'التحكيم العلمي', 'إدارة المراجع العلمية', 'تحليل البيانات الإحصائية'] },
  { name: 'تدريسية', options: ['التعلم النشط', 'تطوير المقررات', 'تصميم نواتج التعلم', 'بناء أدوات التقويم', 'الإرشاد الأكاديمي', 'التدريس الإلكتروني', 'العرض والإلقاء'] },
  { name: 'رقمية', options: ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'أنظمة إدارة التعلم', 'قواعد البيانات العلمية', 'أدوات الذكاء الاصطناعي', 'تصميم المحتوى التعليمي'] },
  { name: 'إدارية ومهنية', options: ['التخطيط التشغيلي', 'إدارة المشروعات', 'إدارة فرق العمل', 'إعداد التقارير', 'قياس مؤشرات الأداء', 'إدارة الجودة', 'التواصل المهني'] }
];

export const CERTIFICATE_DOMAINS = [
  'الجودة والاعتماد الأكاديمي', 'التدريس والتقويم', 'التعلم الإلكتروني',
  'البحث العلمي', 'تحليل البيانات', 'المهارات الرقمية', 'إدارة المشروعات',
  'القيادة والإدارة', 'التدريب', 'اللغات', 'الدراسات الشرعية والقرآنية'
];

export const CERTIFICATE_CHOICES = [
  { title: 'إدارة المشروعات الاحترافية (PMP)', domain: 'إدارة المشروعات', kind: 'شهادة مهنية', reference: 'https://www.pmi.org/certifications/project-management-pmp' },
  { title: 'مساعد معتمد في إدارة المشروعات (CAPM)', domain: 'إدارة المشروعات', kind: 'شهادة مهنية', reference: 'https://www.pmi.org/certifications/certified-associate-capm' },
  { title: 'Microsoft Office Specialist (MOS)', domain: 'المهارات الرقمية', kind: 'شهادة مهنية', reference: 'https://learn.microsoft.com/en-us/credentials/certifications/microsoft-office-specialist-expert-m365-apps/' },
  { title: 'اختبار اللغة الإنجليزية IELTS', domain: 'اللغات', kind: 'اختبار كفاءة', reference: 'https://ielts.org/' },
  { title: 'اختبار اللغة الإنجليزية TOEFL', domain: 'اللغات', kind: 'اختبار كفاءة', reference: 'https://www.ets.org/toefl.html' }
];

export const LANGUAGES = ['العربية', 'الإنجليزية', 'الفرنسية', 'الأردية', 'الإندونيسية', 'الماليزية', 'التركية', 'الفارسية'];
const COMMON_INTERESTS = ['الدراسات القرآنية', 'الدراسات الشرعية', 'مناهج البحث', 'تحقيق التراث'];
const DEPARTMENT_INTERESTS = {
  القراءات: ['علم القراءات', 'التجويد', 'رسم المصحف وضبطه', 'توجيه القراءات', 'التفسير وعلوم القرآن', 'تاريخ القراءات'],
  الشريعة: ['الفقه', 'أصول الفقه', 'القواعد الفقهية', 'مقاصد الشريعة', 'الفقه المقارن', 'النوازل الفقهية'],
  الأنظمة: ['القانون الإداري', 'القانون المدني', 'القانون التجاري', 'القانون الجنائي', 'الأنظمة السعودية', 'الدراسات القانونية المقارنة'],
  'الثقافة الإسلامية': ['الثقافة الإسلامية', 'العقيدة', 'الفكر الإسلامي', 'الحوار والتواصل الحضاري', 'الأخلاق والقيم', 'الدعوة الإسلامية']
};
export const researchChoices = department => [...new Set([...(DEPARTMENT_INTERESTS[department] || []), ...COMMON_INTERESTS])];

export const FIELD_CHOICES = {
  'education.degree': ['دكتوراه', 'ماجستير', 'بكالوريوس', 'دبلوم عالٍ', 'دبلوم'],
  'appointments.role': ['أستاذ', 'أستاذ مشارك', 'أستاذ مساعد', 'محاضر', 'معيد', 'متعاون'],
  'administration.role': ['عميد', 'وكيل كلية', 'رئيس قسم', 'منسق برنامج', 'مدير وحدة'],
  'committees.name': COMMITTEE_NAMES,
  'committees.role': ['رئيس', 'نائب رئيس', 'عضو', 'أمين', 'منسق'],
  'expertise.domain': EXPERIENCE_AREAS,
  'skills.level': ['أساسي', 'متوسط', 'متقدم'],
  'certifications.title': CERTIFICATE_CHOICES.map(row => row.title),
  'certifications.domain': CERTIFICATE_DOMAINS,
  'certifications.kind': ['شهادة مهنية', 'شهادة اجتياز', 'شهادة حضور', 'دبلوم', 'اختبار كفاءة'],
  'publications.kind': ['بحث', 'كتاب', 'فصل في كتاب', 'تحقيق'],
  'publications.status': ['منشور', 'مقبول للنشر', 'قيد العمل'],
  'teaching.degree': ['بكالوريوس', 'ماجستير', 'دكتوراه', 'دبلوم'],
  'service.role': ['تحكيم علمي', 'عضوية جمعية علمية', 'استشارة علمية', 'إرشاد أكاديمي'],
  'grants.role': ['باحث رئيسي', 'باحث مشارك', 'منسق مشروع'],
  'languages.name': LANGUAGES,
  'languages.level': ['لغة أم', 'مبتدئ', 'متوسط', 'متقدم', 'إجادة تامة']
};

export const searchKey = value => String(value || '').normalize('NFKC')
  .replace(/[\u064b-\u065f\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// Keep all existing details when an already selected item is clicked again.
export function chooseEntry(entries, identity, value, selected, additions = {}) {
  const exists = entries.some(row => row[identity] === value);
  if (!selected) return entries.filter(row => row[identity] !== value);
  return exists ? entries : [...entries, { [identity]: value, ...additions }];
}

export function chooseInterest(text, value, selected) {
  const values = String(text || '').split('\n').map(row => row.trim()).filter(Boolean);
  return (selected ? [...new Set([...values, value])] : values.filter(row => row !== value)).join('\n');
}

export function draftBiography(profile, member, university = '') {
  const pieces = [
    [profile.displayName || member.name, member.rank, university, member.department && `قسم ${member.department}`].filter(Boolean).join('، ')
  ];
  const education = profile.education?.filter(row => row.degree && row.institution) || [];
  if (education.length) pieces.push(`المؤهلات العلمية: ${education.map(row => [row.degree, row.specialization, `من ${row.institution}`].filter(Boolean).join(' ')).join('؛ ')}`);
  const expertise = profile.expertise?.filter(row => row.domain) || [];
  if (expertise.length) pieces.push(`تشمل مجالات الخبرة: ${expertise.map(row => row.domain + (row.years ? ` (${row.years} سنة)` : '')).join('، ')}`);
  if (profile.researchInterests) pieces.push(`الاهتمامات البحثية: ${profile.researchInterests.split('\n').filter(Boolean).join('، ')}`);
  return pieces.filter(Boolean).join('. ') + '.';
}
