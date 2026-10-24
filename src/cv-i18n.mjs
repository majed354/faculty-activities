// English rendering of the academic CV, for accreditation files.
//
// One glossary, keyed by the Arabic term the rest of the system already uses,
// so nothing upstream has to learn a second vocabulary. A term that is absent
// falls through to Arabic unchanged: the CV then shows what the member wrote
// rather than a guess, and a reviewer can see exactly what was not translated.
// Nothing here is machine translation — every entry is reviewed.
//
// Member free text (publication titles, biography) is never translated. The
// bibliographic convention for a non-English work is the original title with a
// bracketed translation, so an Arabic title in an English CV is correct, not a
// gap. `bilingual()` builds that pairing when the member supplies a rendering.

const clean = value => String(value ?? '').trim();

export const LOCALES = ['ar', 'en'];
export const isEnglish = locale => locale === 'en';

export const GLOSSARY = {
  // ── Document furniture ────────────────────────────────────────────────
  'السيرة الأكاديمية': 'Academic Curriculum Vitae',
  'سيرة أكاديمية مختصرة': 'Academic CV — Concise',
  'تقرير أكاديمي داخلي': 'Internal Academic Report',
  'صفحة': 'Page',
  'رابط الوصول': 'Link',
  'رابط': 'Link',
  'المصدر': 'Source',

  // ── Section headings ──────────────────────────────────────────────────
  'النبذة العلمية': 'Professional Summary',
  'مجالات الخبرة الأكاديمية والإدارية': 'Academic and Administrative Expertise',
  'مجالات الخبرة ومدتها': 'Areas of Expertise by Duration',
  'المهارات': 'Skills',
  'المؤهلات العلمية': 'Education',
  'المسار الوظيفي': 'Academic Appointments',
  'الترقيات الأكاديمية المسجلة': 'Academic Promotions',
  'المناصب الإدارية': 'Administrative Positions',
  'الاهتمامات البحثية': 'Research Interests',
  'البحوث المنشورة': 'Publications',
  'الكتب والفصول والتحقيقات': 'Books, Chapters and Critical Editions',
  'إنتاج علمي مقبول للنشر أو قيد العمل': 'Accepted and Work in Progress',
  'إنتاج علمي إضافي': 'Additional Scholarly Output',
  'الإشراف على الرسائل والمشروعات': 'Supervision of Theses and Research Projects',
  'مناقشة الرسائل والمشروعات': 'Examination of Theses and Research Projects',
  'الإشراف على بحوث الطلاب': 'Supervision of Student Research',
  'الخبرة التدريسية': 'Teaching Experience',
  'تطوير التدريس والإرشاد الأكاديمي': 'Teaching Development and Academic Advising',
  'المؤتمرات والفعاليات العلمية': 'Conferences and Scholarly Events',
  'الخدمة الأكاديمية والعضويات والتحكيم': 'Academic Service, Memberships and Peer Review',
  'العمل في اللجان': 'Committee Service',
  'المنح والمشروعات البحثية': 'Grants and Funded Research',
  'الجوائز والتكريم والابتكارات': 'Awards, Honours and Innovations',
  'خدمة المجتمع والاستشارات والمشاركات المهنية': 'Community Service, Consultancy and Professional Engagement',
  'الدورات والشهادات المهنية': 'Professional Development Courses',
  'الشهادات المهنية والتخصصية واختبارات الكفاءة': 'Professional Certifications and Proficiency Tests',
  'الإجازات العلمية': 'Scholarly Licences (Ijāzāt)',
  'اللغات': 'Languages',
  'المراقبات والمهام المشابهة': 'Invigilation and Related Duties',
  'أنشطة أخرى مسجلة': 'Other Recorded Activities',
  'تفاصيل التقييم الداخلي': 'Internal Assessment Detail',
  'ملاحظات المصادر الداخلية': 'Internal Source Notes',

  // ── Profile labels ────────────────────────────────────────────────────
  'التخصص العام': 'General Specialisation',
  'التخصص الدقيق': 'Area of Specialisation',
  'البريد الجامعي': 'University Email',
  'الرقم الوظيفي': 'Employee ID',
  'الفرع في السجل': 'Campus',
  'حالة العمل': 'Employment Status',
  'سنة سجل العضوية': 'Record Year',
  'الجنسية': 'Nationality',
  'الجنس': 'Gender',
  'الصفحة الجامعية / الشخصية': 'University / Personal Page',

  // ── Counters ──────────────────────────────────────────────────────────
  'بحوث منشورة': 'Publications',
  'كتب وفصول وتحقيقات': 'Books and Chapters',
  'إشراف دكتوراه': 'Doctoral Supervision',
  'إشراف ماجستير': "Master's Supervision",
  'إشراف غير محدد الدرجة': 'Supervision (Degree Unrecorded)',
  'مناقشات': 'Examinations',
  'مقررات وخبرات تدريسية': 'Courses Taught',

  // ── Charts ────────────────────────────────────────────────────────────
  'الإشراف والمناقشة حسب الدرجة': 'Supervision and Examination by Degree',
  'العبء التدريسي عبر السنوات': 'Teaching Load by Year',
  'المسار العلمي والوظيفي': 'Academic and Professional Timeline',
  'إشراف': 'Supervision',
  'مناقشة': 'Examination',
  'رسالة دكتوراه': 'Doctoral Thesis',
  'رسالة ماجستير': "Master's Thesis",
  'مشروع بحثي (ماجستير)': "Master's Research Project",
  'غير محدد الدرجة': 'Degree Unrecorded',
  'سنة': 'yrs',
  'شعبة': 'sections',

  // ── Ranks ─────────────────────────────────────────────────────────────
  'أستاذ': 'Professor',
  'أستاذ مشارك': 'Associate Professor',
  'أستاذ مساعد': 'Assistant Professor',
  'محاضر': 'Lecturer',
  'مدرس': 'Instructor',
  'معيد': 'Teaching Assistant',
  'متعاون': 'Adjunct Faculty',

  // ── Institution ───────────────────────────────────────────────────────
  'جامعة الطائف': 'Taif University',
  'كلية الشريعة': 'College of Sharia',
  'كلية الشريعة والأنظمة': 'College of Sharia and Law',
  'الشريعة': 'Sharia',
  'القراءات': 'Quranic Readings',
  'الثقافة الإسلامية': 'Islamic Culture',
  'الأنظمة': 'Law',


  // ── Institutions that recur in qualification records ─────────────────
  'جامعة أم القرى': 'Umm Al-Qura University',
  'الجامعة الإسلامية': 'Islamic University of Madinah',
  'جامعة الإمام محمد بن سعود الإسلامية': 'Imam Muhammad ibn Saud Islamic University',
  'جامعة الملك سعود': 'King Saud University',
  'جامعة الملك عبدالعزيز': 'King Abdulaziz University',
  'جامعة الملك خالد': 'King Khalid University',
  'جامعة القصيم': 'Qassim University',
  'جامعة طيبة': 'Taibah University',
  'جامعة الأزهر': 'Al-Azhar University',
  'جامعة اليرموك': 'Yarmouk University',
  'الجامعة الأردنية': 'University of Jordan',


  // ── Specialisations that recur in this college ───────────────────────
  'التفسير وعلوم القرآن': 'Quranic Exegesis and Sciences',
  'الدراسات الإسلامية': 'Islamic Studies',
  'الدراسات القرآنية': 'Quranic Studies',
  'الدراسات الشرعية': 'Sharia Studies',
  'العقيدة': 'Islamic Creed',
  'الفقه': 'Islamic Jurisprudence',
  'أصول الفقه': 'Principles of Jurisprudence',
  'الحديث وعلومه': 'Hadith and its Sciences',
  'القراءات': 'Quranic Readings',
  'الثقافة الإسلامية': 'Islamic Culture',
  'الأنظمة': 'Law',
  'السياسة الشرعية': 'Sharia Policy',

  // ── Degrees and status ────────────────────────────────────────────────
  'دكتوراه': 'PhD',
  'ماجستير': "Master's",
  'بكالوريوس': 'Bachelor',
  'رسالة علمية': 'Thesis',
  'مشروع بحثي': 'Research Project',
  'منجزة': 'Completed',
  'جارية': 'In progress',
  'منشور': 'Published',
  'مقبول للنشر': 'Accepted for publication',
  'قيد النشر': 'In press',
  'مشرف رئيسي': 'Principal Supervisor',
  'مشرف مشارك': 'Co-Supervisor',
  'مشرف': 'Supervisor',
  'مناقش': 'Examiner',
  'الطالب': 'Student',
  'المجلد': 'Vol.',
  'العدد': 'No.',
  'ص': 'pp.',


  // ── Controlled vocabulary: expertise areas (src/cv-choices.mjs) ───────
  'الجودة والاعتماد الأكاديمي': 'Quality Assurance and Academic Accreditation',
  'الاعتماد البرامجي': 'Programme Accreditation',
  'الاعتماد المؤسسي': 'Institutional Accreditation',
  'إعداد الدراسة الذاتية': 'Self-Study Report Preparation',
  'قياس نواتج التعلم': 'Learning Outcomes Assessment',
  'مؤشرات الأداء والمقارنة المرجعية': 'Performance Indicators and Benchmarking',
  'المراجعة الداخلية وخطط التحسين': 'Internal Review and Improvement Planning',
  'تطوير المناهج والبرامج الأكاديمية': 'Curriculum and Programme Development',
  'توصيف المقررات والخطط الدراسية': 'Course and Programme Specifications',
  'مصادر التعلم': 'Learning Resources',
  'التعلم الإلكتروني': 'E-Learning',
  'تطوير أداء أعضاء هيئة التدريس': 'Faculty Development',
  'الدراسات العليا والبحث العلمي': 'Graduate Studies and Research',
  'فحص الخطط العلمية': 'Research Proposal Review',
  'الإشراف العلمي': 'Research Supervision',
  'التحكيم العلمي': 'Peer Review',
  'إدارة المشروعات البحثية': 'Research Project Management',
  'الإرشاد الأكاديمي': 'Academic Advising',
  'الأنشطة والشؤون الطلابية': 'Student Activities and Affairs',
  'متابعة الخريجين': 'Alumni Follow-up',
  'دعم الطلبة المتعثرين والموهوبين': 'Support for At-Risk and Gifted Students',
  'الشكاوى والتظلمات الطلابية': 'Student Complaints and Appeals',
  'إدارة الكليات والعمادات': 'College and Deanship Administration',
  'وكالة الكليات والعمادات': 'Vice-Deanship',
  'إدارة الأقسام الأكاديمية': 'Academic Department Administration',
  'إدارة البرامج الأكاديمية': 'Academic Programme Administration',
  'إدارة المراكز والوحدات': 'Centre and Unit Administration',
  'رئاسة اللجان الأكاديمية والإدارية': 'Chairing Academic and Administrative Committees',
  'قيادة اللجان وفرق العمل': 'Committee and Team Leadership',
  'الجداول والتخطيط التدريسي': 'Timetabling and Teaching Planning',
  'الاختبارات والنتائج': 'Examinations and Results',
  'التخطيط الاستراتيجي والتشغيلي': 'Strategic and Operational Planning',
  'إدارة المخاطر': 'Risk Management',
  'العلاقات العامة والإعلام': 'Public Relations and Media',
  'الضبط والتحقيق': 'Discipline and Investigation',
  'الاستشارات الأكاديمية': 'Academic Consultancy',
  'الشراكات المجتمعية': 'Community Partnerships',
  'خدمة المجتمع والتطوع': 'Community Service and Volunteering',

  // ── Controlled vocabulary: certification domains ──────────────────────
  'التدريس والتقويم': 'Teaching and Assessment',
  'البحث العلمي': 'Scientific Research',
  'تحليل البيانات': 'Data Analysis',
  'المهارات الرقمية': 'Digital Skills',
  'إدارة المشروعات': 'Project Management',
  'القيادة والإدارة': 'Leadership and Management',
  'التدريب': 'Training',
  'الدراسات الشرعية والقرآنية': 'Sharia and Quranic Studies',

  // ── Controlled vocabulary: committees ─────────────────────────────────
  'لجنة الجودة والاعتماد لبرامج البكالوريوس': 'Quality and Accreditation Committee (Undergraduate)',
  'لجنة الجودة والاعتماد لبرامج الدراسات العليا': 'Quality and Accreditation Committee (Graduate)',
  'لجنة تطوير المناهج والبرامج الأكاديمية': 'Curriculum and Programme Development Committee',
  'لجنة الدراسات العليا والبحث العلمي': 'Graduate Studies and Research Committee',
  'لجنة فحص الخطط العلمية': 'Research Proposal Review Committee',
  'لجنة الإرشاد الأكاديمي': 'Academic Advising Committee',
  'لجنة الاختبارات والنتائج': 'Examinations and Results Committee',
  'لجنة الأنشطة والشؤون الطلابية': 'Student Activities and Affairs Committee',
  'لجنة العلاقات العامة والإعلام': 'Public Relations and Media Committee',
  'لجنة الجداول': 'Timetabling Committee',
  'لجنة المناهج والخطط الدراسية': 'Curricula and Study Plans Committee',
  'لجنة الإعلام والمتابعة': 'Media and Follow-up Committee',
  'لجنة الضبط والتحقيق': 'Discipline and Investigation Committee',
  'اللجنة الاستشارية للبرنامج الأكاديمي': 'Programme Advisory Board',

  // ── Controlled vocabulary: languages ──────────────────────────────────
  'الفرنسية': 'French',
  'الأردية': 'Urdu',
  'الإندونيسية': 'Indonesian',
  'الماليزية': 'Malay',
  'التركية': 'Turkish',
  'الفارسية': 'Persian',


  // ── Controlled vocabulary: roles, kinds and levels ───────────────────
  'دبلوم عالٍ': 'Higher Diploma',
  'دبلوم': 'Diploma',
  'عميد': 'Dean',
  'وكيل كلية': 'Vice Dean',
  'رئيس قسم': 'Head of Department',
  'منسق برنامج': 'Programme Coordinator',
  'مدير وحدة': 'Unit Director',
  'رئيس': 'Chair',
  'نائب رئيس': 'Vice Chair',
  'عضو': 'Member',
  'أمين': 'Secretary',
  'منسق': 'Coordinator',
  'أساسي': 'Basic',
  'شهادة مهنية': 'Professional certificate',
  'شهادة اجتياز': 'Certificate of completion',
  'شهادة حضور': 'Certificate of attendance',
  'اختبار كفاءة': 'Proficiency test',
  'بحث': 'Journal article',
  'كتاب': 'Book',
  'فصل في كتاب': 'Book chapter',
  'تحقيق': 'Critical edition',
  'قيد العمل': 'In preparation',
  'تحكيم علمي': 'Peer review',
  'عضوية جمعية علمية': 'Learned society membership',
  'استشارة علمية': 'Academic consultancy',
  'إرشاد أكاديمي': 'Academic advising',
  'باحث رئيسي': 'Principal Investigator',
  'باحث مشارك': 'Co-Investigator',
  'منسق مشروع': 'Project Coordinator',
  'لغة أم': 'Native',
  'إجادة تامة': 'Full proficiency',
  // Credential names are proper nouns: the awarding body's own wording is
  // what a reviewer verifies against, so only the Arabic framing is dropped.
  'إدارة المشروعات الاحترافية (PMP)': 'Project Management Professional (PMP)',
  'مساعد معتمد في إدارة المشروعات (CAPM)': 'Certified Associate in Project Management (CAPM)',
  'اختبار اللغة الإنجليزية IELTS': 'IELTS',
  'اختبار اللغة الإنجليزية TOEFL': 'TOEFL',


  // ── Controlled vocabulary: skills and their groups ───────────────────
  'بحثية وعلمية': 'Research and Scholarship',
  'مناهج البحث العلمي': 'Research Methodology',
  'تحقيق المخطوطات': 'Manuscript Editing',
  'تحليل النصوص الشرعية': 'Analysis of Sharia Texts',
  'الكتابة والنشر العلمي': 'Academic Writing and Publishing',
  'إدارة المراجع العلمية': 'Reference Management',
  'تحليل البيانات الإحصائية': 'Statistical Data Analysis',
  'تدريسية': 'Teaching',
  'التعلم النشط': 'Active Learning',
  'تطوير المقررات': 'Course Development',
  'تصميم نواتج التعلم': 'Learning Outcomes Design',
  'بناء أدوات التقويم': 'Assessment Instrument Design',
  'التدريس الإلكتروني': 'Online Teaching',
  'العرض والإلقاء': 'Presentation and Delivery',
  'رقمية': 'Digital',
  'أنظمة إدارة التعلم': 'Learning Management Systems',
  'قواعد البيانات العلمية': 'Academic Databases',
  'أدوات الذكاء الاصطناعي': 'AI Tools',
  'تصميم المحتوى التعليمي': 'Instructional Content Design',
  'إدارية ومهنية': 'Administrative and Professional',
  'التخطيط التشغيلي': 'Operational Planning',
  'إدارة فرق العمل': 'Team Management',
  'إعداد التقارير': 'Report Writing',
  'قياس مؤشرات الأداء': 'Performance Measurement',
  'إدارة الجودة': 'Quality Management',
  'التواصل المهني': 'Professional Communication',

  // ── Expertise group headings ─────────────────────────────────────────
  'الجودة والاعتماد': 'Quality and Accreditation',
  'المناهج والتدريس': 'Curriculum and Teaching',
  'الدراسات العليا والبحث': 'Graduate Studies and Research',
  'شؤون الطلاب': 'Student Affairs',
  'القيادة والإدارة الأكاديمية': 'Academic Leadership and Administration',
  'التخطيط والإدارة': 'Planning and Administration',
  'المجتمع والاستشارات': 'Community and Consultancy',

  // ── Countries that appear in qualification records ───────────────────
  'السعودية': 'Saudi Arabia',
  'المملكة العربية السعودية': 'Saudi Arabia',
  'مصر': 'Egypt',
  'الأردن': 'Jordan',
  'السودان': 'Sudan',
  'المغرب': 'Morocco',
  'اليمن': 'Yemen',
  'الهند': 'India',
  'باكستان': 'Pakistan',
  'بريطانيا': 'United Kingdom',
  'الولايات المتحدة': 'United States',
  'ماليزيا': 'Malaysia',
  'تركيا': 'Türkiye',
  'حتى الآن': 'present',

  // ── Proficiency ───────────────────────────────────────────────────────
  'العربية': 'Arabic',
  'الإنجليزية': 'English',
  'مبتدئ': 'Beginner',
  'متوسط': 'Intermediate',
  'متقدم': 'Advanced',
  'اللغة الأم': 'Native'
};

// Arabic terms the glossary does not carry stay as written. Silence is the
// honest outcome: a guessed translation in an accreditation file is worse than
// a visible Arabic term a reviewer can ask about.
export function term(value, locale) {
  const text = clean(value);
  if (!isEnglish(locale) || !text) return text;
  return GLOSSARY[text] || text;
}

// Compound values arrive already joined with " · ". Translating each part keeps
// controlled vocabulary working inside a sentence the builder assembled.
export function phrase(value, locale, separator = ' · ') {
  const text = clean(value);
  if (!isEnglish(locale) || !text) return text;
  return text.split(separator).map(part => term(part, locale)).join(separator);
}

export function digits(value, locale) {
  return Number(value || 0).toLocaleString(isEnglish(locale) ? 'en-US' : 'ar-SA');
}

// A Hijri year alone does not place the work for an external reviewer, so the
// Gregorian equivalent is given beside it. The conversion is the standard
// arithmetic approximation and is labelled as such with "/", never as an exact
// date — a Hijri year straddles two Gregorian ones.
export function hijriYear(value, locale) {
  const year = Number(String(value ?? '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(year) || year < 1000 || year > 1600) return clean(value);
  // A year is a label, not a quantity: grouping renders ١٤٤٧ as ١٬٤٤٧.
  if (!isEnglish(locale)) return `${year.toLocaleString('ar-SA', { useGrouping: false })}هـ`;
  const gregorian = Math.floor(year - (year / 33.7) + 622);
  return `${year} AH / ${gregorian}`;
}

// The original title with a bracketed English rendering is the bibliographic
// convention for a non-English work. When the member supplied no rendering the
// original stands alone, which is correct rather than incomplete.
export function bilingual(original, translation, locale) {
  const source = clean(original);
  const rendered = clean(translation);
  if (!isEnglish(locale) || !rendered) return source;
  return source ? `${rendered} [${source}]` : rendered;
}

// Composed from fields the member already supplied, in the same shape as the
// Arabic drafter. Nothing is translated and nothing is inferred — every clause
// restates a value that is elsewhere in the document. Used only when the member
// has not written an English summary themselves.
export function draftEnglishSummary(profile, member, university = '', college = '') {
  const name = clean(profile.englishName) || clean(profile.displayName) || clean(member?.name);
  const rank = term(member?.rank, 'en');
  const place = [term(university, 'en'), term(college, 'en')].filter(Boolean).join(', ');
  const dept = member?.department ? `the Department of ${term(member.department, 'en')}` : '';
  // "is Associate Professor in … in Taif University" read as two stacked
  // prepositions; a rank takes an article and an institution takes "at".
  const article = /^[AEIOU]/.test(rank) ? 'an' : 'a';
  const role = [rank && `${article} ${rank}`, dept && `in ${dept}`, place && `at ${place}`].filter(Boolean).join(' ');
  const opening = name && role ? `${name} is ${role}` : (name || role);

  const sentences = [opening];
  const education = (profile.education || []).filter(row => clean(row.degree));
  if (education.length) {
    sentences.push(`Holds ${education.map(row => [term(row.degree, 'en'), clean(row.specialization) && `in ${term(row.specialization, 'en')}`,
      clean(row.institution) && `from ${term(row.institution, 'en')}`].filter(Boolean).join(' ')).join('; ')}`);
  }
  const expertise = (profile.expertise || []).filter(row => clean(row.domain)).slice(0, 6);
  if (expertise.length) {
    sentences.push(`Areas of expertise include ${expertise.map(row =>
      term(row.domain, 'en') + (clean(row.years) ? ` (${clean(row.years)} yrs)` : '')).join(', ')}`);
  }
  const interests = clean(profile.researchInterests).split('\n').map(clean).filter(Boolean);
  if (interests.length) sentences.push(`Research interests: ${interests.map(value => term(value, 'en')).join(', ')}`);
  return sentences.filter(Boolean).join('. ').replace(/\.*$/, '') + '.';
}
