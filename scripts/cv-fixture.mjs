// Representative CV data for the dev preview harness.
const year = value => String(value);
export const bundle = {
  member: {
    id: '1234', name: 'د. ماجد ابراهيم باقي الجهني', rank: 'أستاذ مشارك',
    department: 'القراءات', email: 'm.baqi@tu.edu.sa', branch: 'المقر الرئيس',
    activeLabel: 'على رأس العمل', yearLabel: '١٤٤٨هـ', nationality: 'سعودي', gender: 'ذكر'
  },
  scopeYear: 'all',
  publications: [
    { title: 'اختلاف التنوع الراجع إلى معان متعددة "دراسة تحليلية"', journal: 'مجلة أبحاث', year: '1446', kind: 'بحث', status: 'منشور', publish_date: '1446-05-30', pages: '45-67', volume: '12', issue: '3' },
    { title: 'مصطلح قواعد التفسير دراسة تأصيلية', journal: 'مجلة الراسخون', year: '1445', kind: 'بحث', status: 'منشور', publish_date: '1445-10-23' },
    { title: 'أسباب الجهل المتعلقة بالعلم والتعلم دراسة موضوعية في القرآن الكريم', journal: 'مجلة الجامعة العراقية', year: '1445', kind: 'بحث', status: 'منشور', publish_date: '1445-08-21' },
    { title: 'الصرفة كوجه من وجوه إعجاز القرآن بين القائلين بها والرافضين لها', journal: 'مجلة الدراسات العربية', year: '1443', kind: 'بحث', status: 'منشور', publish_date: '1443-11-02' }
  ],
  theses: [
    ...Array.from({ length: 14 }, (_, i) => ({ role: 'مشرف رئيسي', type: 'مشروع بحثي', specialization: 'دراسات قرآنية', student_name: `الطالب ${i + 1}`, title: `تصنيف الاختلافات التفسيرية في زاد المسير — الجزء ${i + 1}`, status: 'منجزة', defense_date: `${1445 + (i % 3)}-01-13`, year: year(1445 + (i % 3)) })),
    ...Array.from({ length: 9 }, (_, i) => ({ role: 'مشرف رئيسي', type: 'مشروع بحثي', specialization: 'دراسات قرآنية', student_name: `طالب ${i + 20}`, title: `تصنيفات الاختلافات التفسيرية — القسم ${i + 1}`, status: 'منجزة', defense_date: `${1446 + (i % 2)}-06-11`, year: year(1446 + (i % 2)) })),
    ...Array.from({ length: 7 }, (_, i) => ({ role: 'مناقش', type: 'مشروع بحثي', specialization: 'دراسات قرآنية', student_name: `مناقشة ${i + 1}`, title: `تصنيفات الاختلافات التفسيرية في زاد المسير — مناقشة ${i + 1}`, status: 'منجزة', defense_date: `${1446 + (i % 2)}-06-22`, year: year(1446 + (i % 2)) }))
  ],
  researchSupport: [
    { _cvType: 'تأليف كتب', title: 'أدلة التفسير', location: 'مجموعة تكوين المتحدة للنشر', date: '1447-01-15', year: '1447' },
    { _cvType: 'تحكيم علمي', title: 'تحكيم بحث في مجلة محكمة', location: 'جامعة الطائف', date: '1446-03-10', year: '1446' },
    { _cvType: 'تحكيم علمي', title: 'تحكيم بحث ترقية', location: 'جامعة أم القرى', date: '1447-02-05', year: '1447' }
  ],
  scientificEvents: [{ title: 'ملتقى الدراسات القرآنية', category: 'مؤتمر', participation_type: 'حضور', location: 'جامعة الطائف', date: '1446-04-01', year: '1446' }],
  communityActivities: [{ title: 'جائزة التميز في التدريس', category: 'جائزة', location: 'جامعة الطائف', date: '1447-03-01', year: '1447' }],
  academicPromotions: [{ title: 'الترقية إلى أستاذ مشارك', location: 'جامعة الطائف', date: '1445-07-01', year: '1445' }],
  teachingDetails: [
    ...Array.from({ length: 12 }, (_, i) => ({ year: '1445', courseName: ['التفسير', 'علوم القرآن', 'تفسير آيات الأحكام', 'القرآن الكريم'][i % 4], courseCode: `QRN${100 + i}`, students: 20 + i })),
    ...Array.from({ length: 15 }, (_, i) => ({ year: '1446', courseName: ['التفسير التحليلي', 'مناهج المفسرين', 'أصول التفسير', 'قواعد التفسير'][i % 4], courseCode: `QRN${200 + i}`, students: 18 + i })),
    ...Array.from({ length: 12 }, (_, i) => ({ year: '1447', courseName: ['إعجاز القرآن الكريم', 'الانتصار للقرآن', 'تلاوة وحفظ'][i % 3], courseCode: `QRN${300 + i}`, students: 22 + i }))
  ],
  monitorings: [], otherActivities: [], breakdownEntries: [], points: 0,
  profile: {
    displayName: 'د. ماجد ابراهيم باقي الجهني', englishName: 'Majed Ibrahim Baqi Aljuhani',
    generalSpecialization: 'الدراسات الإسلامية', specialization: 'التفسير وعلوم القرآن',
    biography: 'عضو هيئة تدريس في قسم القراءات بكلية الشريعة بجامعة الطائف، تتركز اهتماماته البحثية في قواعد التفسير واختلاف المفسرين وإعجاز القرآن الكريم. أسهم في إعداد الدراسات الذاتية وبرامج الاعتماد الأكاديمي، وأشرف على عدد من المشروعات البحثية لطلاب الدراسات القرآنية.',
    researchInterests: 'التفسير وعلوم القرآن\nالدراسات القرآنية\nالدراسات الشرعية',
    scholar: 'https://scholar.google.com/citations?user=example',
    orcid: 'https://orcid.org/0000-0002-1825-0097',
    expertise: [
      { domain: 'الجودة والاعتماد الأكاديمي', years: '5' }, { domain: 'الاعتماد البرامجي', years: '5' },
      { domain: 'إعداد الدراسة الذاتية', years: '4' }, { domain: 'قياس نواتج التعلم', years: '5' },
      { domain: 'مؤشرات الأداء والمقارنة المرجعية', years: '5' }, { domain: 'المراجعة الداخلية وخطط التحسين', years: '5' },
      { domain: 'تطوير المناهج والبرامج الأكاديمية', years: '3' }, { domain: 'توصيف المقررات والخطط الدراسية', years: '3' },
      { domain: 'التعلم الإلكتروني', years: '6' }, { domain: 'الدراسات العليا والبحث العلمي', years: '4' },
      { domain: 'الإشراف العلمي', years: '5' }, { domain: 'إدارة المشروعات البحثية', years: '4' },
      { domain: 'متابعة الخريجين', years: '1' }
    ],
    skills: ['بناء أدوات التقويم', 'تصميم نواتج التعلم', 'التدريس الإلكتروني', 'تطوير المقررات', 'التعلم النشط', 'Microsoft Word', 'Microsoft PowerPoint', 'Microsoft Excel', 'أنظمة إدارة التعلم', 'أدوات الذكاء الاصطناعي', 'تصميم المحتوى التعليمي', 'قواعد البيانات العلمية', 'إدارة فرق العمل', 'قياس مؤشرات الأداء', 'إدارة الجودة', 'إعداد التقارير'].map(name => ({ name })),
    education: [
      { degree: 'دكتوراه', specialization: 'التفسير وعلوم القرآن', institution: 'جامعة أم القرى', country: 'السعودية', year: '1440' },
      { degree: 'ماجستير', specialization: 'التفسير وعلوم القرآن', institution: 'جامعة أم القرى', country: 'السعودية', year: '1436' },
      { degree: 'بكالوريوس', specialization: 'الشريعة', institution: 'جامعة الطائف', country: 'السعودية', year: '1432' }
    ],
    appointments: [
      { role: 'أستاذ مساعد', institution: 'جامعة الطائف', start: '1440', end: '1445' },
      { role: 'أستاذ مشارك', institution: 'جامعة الطائف', start: '1445', end: 'حتى الآن' }
    ],
    languages: [{ name: 'العربية', level: '' }, { name: 'الإنجليزية', level: 'مبتدئ' }],
    administration: [], publications: [], teaching: [], service: [], committees: [],
    grants: [], awards: [], training: [], certifications: [], licenses: [],
    notes: '', teachingStatement: '', website: '', scopus: '', photo: '', updatedAt: '2026-10-09T10:00:00Z'
  }
};

