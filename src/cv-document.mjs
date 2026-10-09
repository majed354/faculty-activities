import { normalizeProfile, safeUrl } from './cv-schema.mjs';
import { buildCvMetrics, buildExpertise, sectionLayout } from './cv-metrics.mjs';
import { renderCvCharts } from './cv-charts.mjs';

import { html } from './cv-html.mjs';
export { html };
const clean = value => String(value ?? '').trim();
const join = (values, separator = ' · ') => values.map(clean).filter(Boolean).join(separator);
const key = value => clean(value).normalize('NFKC').replace(/[\u064b-\u065f\u0640]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const courseKey = value => key(value).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
const years = entries => [...new Set(entries.map(row => clean(row.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
const period = row => join([row.start, row.end], ' — ');
const unique = (entries, identity) => {
  const seen = new Set();
  return entries.filter(row => { const id = identity(row); if (seen.has(id)) return false; seen.add(id); return true; });
};

export function mergePublications(automatic, supplemental) {
  const rows = automatic.map(row => ({
    ...row, title: row.title, authors: row.authors || row.authors_names || '', venue: row.journal || row.venue || '',
    year: row.year || '', kind: row.kind || 'بحث', status: row.status || 'منشور',
    url: row.url || row.publication_url || row.source_url || '', date: row.publish_date || row.date || ''
  }));
  for (const row of supplemental) {
    // Match by DOI when available; title matches also require a compatible year
    // and venue, so reprinted books and similarly titled works stay separate.
    const index = rows.findIndex(existing => {
      if (row.doi && existing.doi) {
        const doi = value => clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
        return doi(row.doi) === doi(existing.doi);
      }
      return !!key(row.title) && key(existing.title) === key(row.title) && (!row.year || !existing.year || row.year === existing.year) &&
        (!row.venue || !existing.venue || key(row.venue) === key(existing.venue));
    });
    if (index < 0) rows.push({ ...row });
    else rows[index] = { ...rows[index], ...Object.fromEntries(Object.entries(row).filter(([, value]) => clean(value))) };
  }
  return rows;
}

export function groupTeaching(rows) {
  const groups = new Map();
  for (const row of rows) {
    const title = clean(row.courseName);
    // Codes sometimes substitute for missing names in the source. Omit those
    // from the CV, and list each named course once across terms and programs.
    const id = courseKey(title);
    if (!id || id === courseKey(row.courseCode) || title === 'غير محدد') continue;
    const current = groups.get(id) || { title, years: new Set() };
    if (row.year) current.years.add(String(row.year));
    groups.set(id, current);
  }
  return [...groups.values()].map(row => ({ ...row, years: [...row.years].sort((a, b) => Number(b) - Number(a)) }));
}

export function buildCvDocument(bundle, options = {}, context = {}) {
  const member = bundle.member;
  const profile = normalizeProfile(bundle.profile || {});
  const internal = options.mode === 'internal';
  const short = options.mode === 'short';
  const formatDate = context.formatDate || (value => clean(value));
  const yearLabel = context.yearLabel || (value => clean(value));
  const sections = [];
  const add = (title, entries, extra = {}) => {
    entries = entries.filter(row => row.title || row.details || row.url || row.source);
    const total = entries.length;
    if (total) sections.push({ title: short && total > 5 ? `${title} — مختارات (${5} من ${total})` : title, entries: short ? entries.slice(0, 5) : entries, ...extra });
    else if (internal) sections.push({ title, text: 'لا توجد سجلات ضمن نطاق النشاط المختار أو لم تُستكمل بيانات هذا المحور.' });
  };
  // A partially completed record still exports its supplied facts. Promote
  // details when the primary field was left blank, without adding placeholders.
  const entry = (title, details = '', row = {}) => ({ title: clean(title) || clean(details), details: clean(title) ? clean(details) : '', url: safeUrl(row.url), source: internal ? clean(row.source) : '' });

  if (profile.biography) sections.push({ title: 'النبذة العلمية', text: short && profile.biography.length > 800 ? `${profile.biography.slice(0, 800)}…` : profile.biography });
  // When the chart plots domain against duration, repeating it as a list of
  // one-line bullets spends a page restating the chart. Only domains carrying
  // a description the chart cannot show are still worth listing.
  const expertiseChart = buildExpertise(profile);
  add('مجالات الخبرة الأكاديمية والإدارية', profile.expertise
    .filter(row => !expertiseChart || clean(row.description))
    .map(row => entry(row.domain, join([row.years && `مدة الخبرة: ${Number(row.years).toLocaleString('ar-SA')} سنة`, row.description]), row)));
  add('المهارات', profile.skills.map(row => entry(row.name, join([row.level, row.details]), row)));
  add('المؤهلات العلمية', profile.education.map(row => entry(join([row.degree, row.specialization]), join([row.institution, row.country, row.year, row.thesisTitle && `عنوان الرسالة: ${row.thesisTitle}`]), row)));
  add('المسار الوظيفي', profile.appointments.map(row => entry(row.role, join([row.institution, period(row)]), row)));
  add('الترقيات الأكاديمية المسجلة', (bundle.academicPromotions || []).map(row => entry(row.title, join([row.location, formatDate(row.date)]), row)));
  add('المناصب الإدارية', profile.administration.map(row => entry(row.role, join([row.institution, period(row)]), row)));
  if (profile.researchInterests) sections.push({ title: 'الاهتمامات البحثية', entries: profile.researchInterests.split(/\n/).map(clean).filter(Boolean).map(title => entry(title)) });

  const publications = mergePublications(bundle.publications || [], profile.publications);
  const bibliography = row => entry(row.title, join([
    unclassified(row) ? row.kind : '', row.authors, row.venue, row.date ? formatDate(row.date) : row.year,
    row.volume && `المجلد ${row.volume}`, row.issue && `العدد ${row.issue}`, row.pages && `ص ${row.pages}`,
    row.status !== 'منشور' ? row.status : '', row.doi && `DOI: ${row.doi}`
  ]), { ...row, url: row.url || (row.doi && `https://doi.org/${row.doi.replace(/^https?:\/\/doi\.org\//i, '')}`) });
  const isBook = row => /كتاب|كتب|فصل|تحقيق|book|chapter/i.test(row.kind || '');
  const isPending = row => /مقبول|قيد|مقدم|submitted|review|accepted|forthcoming/i.test(row.status || '');
  const unclassified = row => !clean(row.kind) || !clean(row.status);
  const publishedResearch = publications.filter(row => !unclassified(row) && !isBook(row) && !isPending(row));
  add('البحوث المنشورة', publishedResearch.map(bibliography));
  const bookPublications = publications.filter(row => !unclassified(row) && isBook(row) && !isPending(row));
  const authoredBooks = (bundle.researchSupport || []).filter(row => row._cvType === 'تأليف كتب');
  const books = [
    ...bookPublications.map(bibliography),
    ...authoredBooks.map(row => entry(row.title, join([row.location, formatDate(row.date)]), row))
  ];
  add('الكتب والفصول والتحقيقات', unique(books, row => key(row.title) + key(row.details)));
  add('إنتاج علمي مقبول للنشر أو قيد العمل', publications.filter(row => !unclassified(row) && isPending(row)).map(bibliography));
  add('إنتاج علمي إضافي', publications.filter(unclassified).map(bibliography));

  const thesisEntry = row => entry(row.title, join([
    row.role, row.degreeLabel || row.type, row.programLabel || row.specialization,
    row.student_name && `الطالب: ${row.student_name}`, row.university || context.university,
    row.status, formatDate(row.defense_date)
  ]), row);
  const supervisions = (bundle.theses || []).filter(row => /مشرف/.test(row.role || ''));
  const discussions = (bundle.theses || []).filter(row => !/مشرف/.test(row.role || ''));
  add('الإشراف على الرسائل والمشروعات', supervisions.map(thesisEntry));
  add('مناقشة الرسائل والمشروعات', [
    ...discussions.map(thesisEntry),
    ...(bundle.researchSupport || []).filter(row => row._cvType === 'مناقشة خارجية').map(row => entry(row.title, join([row.location, row.participation_type, formatDate(row.date)]), row))
  ]);
  add('الإشراف على بحوث الطلاب', (bundle.researchSupport || []).filter(row => row._cvType === 'بحوث الطلاب').map(row => entry(row.title, join([row.location, formatDate(row.date)]), row)));

  const courses = groupTeaching(bundle.teachingDetails || []);
  const courseNames = unique([...courses.map(row => row.title), ...profile.teaching.map(row => clean(row.course)).filter(Boolean)], courseKey);
  const teachingDetails = profile.teaching.map(row => entry(row.course, join([row.degree, row.program, row.years, row.contribution]), row))
    .filter((row, index) => (row.title || row.url || row.source) && (!profile.teaching[index].course || row.details || row.url || row.source));
  if (courseNames.length || teachingDetails.length) {
    sections.push({
      title: short && teachingDetails.length > 5 ? `الخبرة التدريسية — تفاصيل مختارة (5 من ${teachingDetails.length})` : 'الخبرة التدريسية',
      ...(courseNames.length ? { text: `المقررات ومجالات التدريس: ${courseNames.join('؛ ')}.` } : {}),
      ...(teachingDetails.length ? { entries: short ? teachingDetails.slice(0, 5) : teachingDetails } : {})
    });
  } else add('الخبرة التدريسية', []);
  if (profile.teachingStatement) sections.push({ title: 'تطوير التدريس والإرشاد الأكاديمي', text: profile.teachingStatement });
  add('المؤتمرات والفعاليات العلمية', (bundle.scientificEvents || []).map(row => entry(row.title, join([row.category, row.participation_type, row.location, formatDate(row.date)]), row)));
  add('الخدمة الأكاديمية والعضويات والتحكيم', [
    ...profile.service.map(row => entry(row.role, join([row.organization, period(row), row.description]), row)),
    ...(bundle.researchSupport || []).filter(row => row._cvType === 'تحكيم علمي').map(row => entry(row.title, join([row.location, formatDate(row.date)]), row))
  ]);
  add('العمل في اللجان', profile.committees.map(row => entry(row.name, join([row.role, row.organization, period(row), row.description]), row)));
  add('المنح والمشروعات البحثية', profile.grants.map(row => entry(row.title, join([row.role, row.funder, period(row), row.description]), row)));
  const awards = (bundle.communityActivities || []).filter(row => row.category === 'جائزة' || row.category === 'براءة اختراع');
  add('الجوائز والتكريم والابتكارات', [
    ...profile.awards.map(row => entry(row.title, join([row.organization, row.year, row.description]), row)),
    ...awards.map(row => entry(row.title, join([row.category, row.location, formatDate(row.date)]), row))
  ]);
  add('خدمة المجتمع والاستشارات والمشاركات المهنية', (bundle.communityActivities || []).filter(row => !awards.includes(row)).map(row => entry(row.title, join([row.category, row.participation_type, row.location, formatDate(row.date)]), row)));
  add('الدورات والشهادات المهنية', profile.training.map(row => entry(row.title, join([row.organization, row.year, row.hours && `${row.hours} ساعة`]), row)));
  add('الشهادات المهنية والتخصصية واختبارات الكفاءة', profile.certifications.map(row => entry(row.title, join([row.domain, row.kind, row.issuer, row.year, row.expires && `الانتهاء: ${row.expires}`, row.score && `النتيجة: ${row.score}`, internal && row.credentialId ? `رقم الشهادة: ${row.credentialId}` : '']), row)));
  add('الإجازات العلمية', profile.licenses.map(row => entry(row.title, join([row.issuer, row.year, row.details]), row)));
  add('اللغات', profile.languages.map(row => entry(row.name, row.level, row)));
  if (internal) {
    sections.push({ title: 'تفاصيل التقييم الداخلي', text: `إجمالي النقاط: ${bundle.points ?? 0}`, entries: (bundle.breakdownEntries || []).map(row => entry(row.label, `العدد: ${row.count}`)) });
    add('المراقبات والمهام المشابهة', (bundle.monitorings || []).map(row => entry(row.title, join([row.category, row.location, formatDate(row.date)]), row)));
    add('أنشطة أخرى مسجلة', (bundle.otherActivities || []).map(row => entry(row.title, join([row.category, row.location, formatDate(row.date)]), row)));
    if (profile.notes) sections.push({ title: 'ملاحظات المصادر الداخلية', text: profile.notes });
  }
  const profileItems = [
    ['التخصص العام', profile.generalSpecialization], ['التخصص الدقيق', profile.specialization],
    ['البريد الجامعي', member.email]
  ];
  if (internal) profileItems.push(['الرقم الوظيفي', member.id], ['الفرع في السجل', member.branch], ['حالة العمل', member.activeLabel], ['سنة سجل العضوية', member.yearLabel]);
  if (internal || options.personal) profileItems.push(['الجنسية', member.nationality], ['الجنس', member.gender]);
  const coverageYears = years([...(bundle.publications || []), ...(bundle.theses || []), ...(bundle.scientificEvents || []), ...(bundle.teachingDetails || []), ...(bundle.communityActivities || []), ...(bundle.academicPromotions || [])]);
  const coverage = bundle.scopeYear !== 'all'
    ? `نطاق سجلات النشاط: ${bundle.scopeYearLabel}. البيانات الأكاديمية المضافة يدويًا تعرض كاملة ضمن ملف العضو الدائم.`
    : `نطاق سجلات النشاط: ${coverageYears.length ? coverageYears.map(yearLabel).join('، ') : 'لم تتوفر سجلات نشاط'}. تعتمد السيرة على البيانات المضافة والسجلات المتاحة.`;
  return {
    name: profile.displayName || member.name,
    englishName: profile.englishName,
    subtitle: join([member.rank, context.university, context.college, member.department && `قسم ${member.department}`]),
    modeLabel: internal ? 'تقرير أكاديمي داخلي' : short ? 'سيرة أكاديمية مختصرة' : 'السيرة الأكاديمية',
    photo: safeUrl(profile.photo),
    profileItems: profileItems.filter(([, value]) => clean(value)),
    links: [['الصفحة الجامعية / الشخصية', profile.website], ['ORCID', profile.orcid], ['Google Scholar', profile.scholar], ['Scopus', profile.scopus]].filter(([, url]) => safeUrl(url)),
    sections, coverage,
    // The short CV trades detail for brevity, so it keeps the charts: they carry
    // the record in less space than the lists they stand in for.
    charts: buildCvMetrics(bundle, profile, {
      published: publishedResearch, books: [...bookPublications, ...authoredBooks],
      supervisions, discussions,
      reviewing: (bundle.researchSupport || []).filter(row => row._cvType === 'تحكيم علمي'), expertiseChart
    }),
    updatedAt: profile.updatedAt,
    generatedAt: options.generatedAt || new Date().toISOString(),
    counts: [
      [publishedResearch.length, 'بحوث منشورة'],
      [books.length, 'كتب وفصول وتحقيقات'], [supervisions.length, 'إشرافات'],
      [discussions.length, 'مناقشات'], [courseNames.length + profile.teaching.filter(row => !row.course && join([row.degree, row.program, row.years, row.contribution])).length, 'مقررات وخبرات تدريسية']
    ].filter(([count]) => count > 0)
  };
}

// Mirrors the layout the PDF chooses for the same section, so the preview is a
// preview rather than a second, differently shaped document.
function renderSectionHtml(section) {
  const layout = sectionLayout(section);
  const entries = section.entries || [];
  const prose = section.text ? `<p class="cv-prose">${html(section.text)}</p>` : '';
  const link = row => row.url ? `<a href="${html(row.url)}" target="_blank" rel="noopener noreferrer">رابط الوصول</a>` : '';
  const source = row => row.source ? `<p class="cv-source">المصدر: ${html(row.source)}</p>` : '';
  let body = '';
  if (layout === 'cited') {
    body = `<ol class="cv-cited">${entries.map(row => `<li>${row.title ? `<strong>${html(row.title)}</strong>` : ''}${row.details ? `<p>${html(row.details)}</p>` : ''}${link(row)}${source(row)}</li>`).join('')}</ol>`;
  } else if (layout === 'tags') {
    body = `<ul class="cv-tags">${entries.map(row => `<li>${html(row.title)}</li>`).join('')}</ul>`;
  } else if (layout === 'columns') {
    body = `<ul class="cv-columns">${entries.map(row => `<li>${html(row.title)}</li>`).join('')}</ul>`;
  } else if (entries.length) {
    body = `<ul>${entries.map(row => `<li>${row.title ? `<strong>${html(row.title)}</strong>` : ''}${row.details ? `<p>${html(row.details)}</p>` : ''}${link(row)}${source(row)}</li>`).join('')}</ul>`;
  }
  return `<section class="cv-doc-section" data-layout="${layout}"><h3>${html(section.title)}</h3>${prose}${body}</section>`;
}

export function renderCvDocument(doc) {
  const date = value => new Date(value).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
  return `<article class="cv-document" dir="rtl">
    <header class="cv-doc-header">
      ${doc.photo ? `<img class="cv-portrait" src="${html(doc.photo)}" alt="صورة ${html(doc.name)}" referrerpolicy="no-referrer">` : ''}
      <div><p class="cv-doc-kind">${html(doc.modeLabel)}</p><h2>${html(doc.name)}</h2>${doc.englishName ? `<p lang="en" dir="ltr" class="cv-english-name">${html(doc.englishName)}</p>` : ''}<p>${html(doc.subtitle)}</p></div>
    </header>
    <dl class="cv-doc-profile">${doc.profileItems.map(([label, value]) => `<div><dt>${html(label)}</dt><dd>${label === 'البريد الجامعي' && /^[^\s@]+@[^\s@]+$/.test(value) ? `<a href="mailto:${html(value)}" dir="ltr">${html(value)}</a>` : html(value)}</dd></div>`).join('')}</dl>
    ${doc.links.length ? `<nav class="cv-doc-links" aria-label="الروابط العلمية">${doc.links.map(([label, url]) => `<a href="${html(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${html(label)}</a>`).join('')}</nav>` : ''}
    ${doc.counts.length ? `<div class="cv-doc-counts">${doc.counts.map(([count, label]) => `<span><b>${count.toLocaleString('ar-SA')}</b> ${html(label)}</span>`).join('')}</div>` : ''}
    ${renderCvCharts(doc.charts)}
    ${doc.sections.map(renderSectionHtml).join('')}
    <footer class="cv-doc-footer"><p>${html(doc.coverage)}</p><p>${doc.updatedAt ? `آخر تحديث لبيانات السيرة: ${html(date(doc.updatedAt))} · ` : ''}تاريخ إعداد الملف: ${html(date(doc.generatedAt))}</p></footer>
  </article>`;
}
