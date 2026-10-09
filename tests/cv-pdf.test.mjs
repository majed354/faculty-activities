import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCvDocument } from '../src/cv-document.mjs';
import { buildCvMetrics, sectionLayout } from '../src/cv-metrics.mjs';
import { renderCvTypst, lit } from '../src/cv-typst.mjs';
import { createCvPdfHandler, sanitizeDocument, contentDisposition, MAX_DOCUMENTS } from '../src/cv-pdf-service.mjs';

const context = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || ''), yearLabel: value => `${value}هـ` };

const member = { id: '100', name: 'د. ماجد الجهني', rank: 'أستاذ مشارك', department: 'القراءات', email: 'm.baqi@tu.edu.sa' };

const bundle = (overrides = {}) => ({
  member, scopeYear: 'all', publications: [], theses: [], researchSupport: [],
  scientificEvents: [], communityActivities: [], academicPromotions: [],
  teachingDetails: [], monitorings: [], otherActivities: [], profile: {}, ...overrides
});

const docFor = overrides => buildCvDocument(bundle(overrides), { mode: 'public', generatedAt: '2026-10-09T10:00:00Z' }, context);

test('charts appear only when the data can carry them, and years stay unformatted labels', () => {
  const sparse = docFor({ publications: [{ title: 'بحث', year: '1446', kind: 'بحث', status: 'منشور' }] });
  assert.equal(sparse.charts.find(chart => chart.id === 'trend'), undefined, 'one year is not a trend');
  assert.equal(sparse.charts.find(chart => chart.id === 'contribution'), undefined, 'one category is not a composition');

  const rich = docFor({
    publications: [
      { title: 'أ', year: '1445', kind: 'بحث', status: 'منشور' },
      { title: 'ب', year: '1447', kind: 'بحث', status: 'منشور' }
    ],
    theses: [{ role: 'مشرف', title: 'رسالة', year: '1446', defense_date: '1446-01-01' }]
  });
  const trend = rich.charts.find(chart => chart.id === 'trend');
  assert.ok(trend, 'two populated years make a trend');
  assert.deepEqual(trend.rows.map(row => row.label), ['١٤٤٥', '١٤٤٦', '١٤٤٧'], 'gap years are filled, not dropped');
  assert.ok(!trend.rows.some(row => /٬|,/.test(row.label)), 'a year is a label, never grouped as ١٬٤٤٧');

  const contribution = rich.charts.find(chart => chart.id === 'contribution');
  assert.equal(contribution.total, 3);
  assert.equal(contribution.slices.reduce((sum, slice) => sum + slice.share, 0).toFixed(4), '1.0000');
});

test('the expertise list gives way to its chart but keeps domains carrying a description', () => {
  const charted = docFor({ profile: { expertise: [
    { domain: 'الجودة', years: '5' }, { domain: 'الاعتماد', years: '4' }, { domain: 'التعلم', years: '6' }
  ] } });
  assert.ok(charted.charts.some(chart => chart.id === 'expertise'));
  assert.equal(charted.sections.find(section => section.title === 'مجالات الخبرة الأكاديمية والإدارية'), undefined,
    'a chart of domain against duration already says what the list would');

  const withDetail = docFor({ profile: { expertise: [
    { domain: 'الجودة', years: '5', description: 'قاد ثلاث مراجعات داخلية' },
    { domain: 'الاعتماد', years: '4' }, { domain: 'التعلم', years: '6' }
  ] } });
  const section = withDetail.sections.find(s => s.title === 'مجالات الخبرة الأكاديمية والإدارية');
  assert.equal(section.entries.length, 1, 'only the domain the chart cannot describe survives');
  assert.match(section.entries[0].details, /قاد ثلاث مراجعات داخلية/);

  // Below the charting threshold the list must still carry every domain.
  const uncharted = docFor({ profile: { expertise: [{ domain: 'الجودة', years: '5' }, { domain: 'الاعتماد', years: '4' }] } });
  assert.equal(uncharted.charts.some(chart => chart.id === 'expertise'), false);
  assert.equal(uncharted.sections.find(s => s.title === 'مجالات الخبرة الأكاديمية والإدارية').entries.length, 2);
});

test('an open-ended appointment is not labelled "حتى حتى الآن"', () => {
  const doc = docFor({ profile: {
    education: [{ degree: 'دكتوراه', year: '1440', institution: 'أم القرى' }],
    appointments: [
      { role: 'أستاذ مساعد', institution: 'الطائف', start: '1440', end: '1445' },
      { role: 'أستاذ مشارك', institution: 'الطائف', start: '1445', end: 'حتى الآن' }
    ]
  } });
  const labels = doc.charts.find(chart => chart.id === 'career').events.map(event => event.endLabel);
  assert.ok(labels.includes('حتى ١٤٤٥'), 'a closed term is dated in Arabic-Indic digits');
  assert.ok(labels.includes('حتى الآن'), 'an open term is not prefixed twice');
  assert.ok(!labels.some(label => /حتى\s+حتى/.test(label)));
});

test('section layout separates cited records, bare tags and detailed lists', () => {
  assert.equal(sectionLayout({ title: 'البحوث المنشورة', entries: [{ title: 'أ', details: 'ب' }] }), 'cited');
  assert.equal(sectionLayout({ title: 'المهارات', entries: Array.from({ length: 6 }, (_, i) => ({ title: `مهارة ${i}` })) }), 'tags');
  assert.equal(sectionLayout({ title: 'اللجان', entries: [{ title: 'لجنة', details: 'عضو' }] }), 'list');
  assert.equal(sectionLayout({ title: 'نبذة', text: 'نص' }), 'prose');
});

test('member text can never escape its Typst string literal', () => {
  const hostile = [
    '#set page(fill: red)', ']#panic("owned")[', '#read("/etc/passwd")',
    '#import "@preview/evil:1.0.0": *', 'm.baqi@tu.edu.sa', '*bold* _em_ `code` $x^2$',
    'trailing\\', 'two\nlines', '<label> @ref', '"quoted"'
  ];
  const source = renderCvTypst({
    name: hostile[0], englishName: hostile[1], subtitle: hostile[2], modeLabel: 'السيرة الأكاديمية',
    profileItems: [['حقل', hostile[3]], ['البريد الجامعي', hostile[4]]],
    links: [], counts: [[3, hostile[5]]], charts: [],
    sections: [
      { title: hostile[6], entries: [{ title: hostile[7], details: hostile[8], url: '', source: '' }] },
      { title: 'الكتب والفصول والتحقيقات', entries: [{ title: hostile[9], details: '', url: '', source: '' }] },
      { title: 'نص', text: hostile[0] }
    ],
    coverage: hostile[2], updatedAt: '', generatedAt: '2026-10-09T10:00:00Z'
  });

  // Blank out every string literal; any surviving directive escaped its quotes.
  const outsideLiterals = source.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const directive of ['#panic', '#read(', '#import', 'set page(fill: red)', '@preview']) {
    assert.ok(!outsideLiterals.includes(directive), `${directive} escaped its literal`);
  }
  // Quotes and backslashes are neutralised rather than dropped.
  assert.ok(source.includes('\\"quoted\\"'));
  assert.ok(source.includes('trailing\\\\'));
  assert.equal(lit('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(lit('x\ny'), '"x\\ny"');
});

test('the service rebuilds the document from scratch and refuses what it cannot render', async () => {
  const compiled = [];
  const handler = createCvPdfHandler({ compile: async source => { compiled.push(source); return Buffer.from('%PDF-1.7 fake'); } });
  const post = body => handler(new Request('https://cv.example/api/cv-pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }));

  assert.equal((await handler(new Request('https://cv.example/api/cv-pdf'))).status, 405);
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post({ documents: [] })).status, 400);
  assert.equal((await post({ documents: Array.from({ length: MAX_DOCUMENTS + 1 }, () => ({ name: 'x' })) })).status, 413);

  const ok = await post({ documents: [docFor({ publications: [{ title: 'بحث', year: '1446', kind: 'بحث', status: 'منشور' }] })], fileName: 'السيرة' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['Content-Type'], 'application/pdf');
  assert.match(ok.headers['Content-Disposition'], /filename\*=UTF-8''/);

  // Unknown keys are dropped rather than forwarded to the renderer.
  const sanitized = sanitizeDocument({ name: 'اسم', evil: '#panic()', sections: [{ title: 'ت', entries: [{ title: 'أ', extra: 'x' }] }] });
  assert.equal(sanitized.evil, undefined);
  assert.deepEqual(Object.keys(sanitized.sections[0].entries[0]).sort(), ['details', 'source', 'title', 'url']);
  assert.equal(sanitizeDocument({ links: [['site', 'javascript:alert(1)'], ['ok', 'https://a.test']] }).links.length, 1,
    'only http(s) links survive');

  const failing = createCvPdfHandler({ compile: async () => { throw new Error('typst exploded'); } });
  const broken = await failing(new Request('https://cv.example/api/cv-pdf', { method: 'POST', body: JSON.stringify({ documents: [{ name: 'x' }] }) }));
  assert.equal(broken.status, 500);
  assert.ok(!broken.body.includes('typst exploded'), 'engine diagnostics stay in the logs');
});

test('an Arabic file name survives as filename* and never degrades to "..pdf"', () => {
  assert.match(contentDisposition('السيرة-الأكاديمية-د.-ماجد'), /filename="academic-cv\.pdf"/);
  assert.match(contentDisposition('السيرة-الأكاديمية'), /filename\*=UTF-8''%D8/);
  assert.match(contentDisposition('report/2026:draft'), /filename="report2026draft\.pdf"/, 'path and drive separators are stripped');
  assert.ok(!contentDisposition('د.ماجد').includes('filename="..pdf"'));
});

test('metrics count exactly what the sections list', () => {
  const doc = docFor({
    publications: [
      { title: 'أ', year: '1445', kind: 'بحث', status: 'منشور' },
      { title: 'ب', year: '1446', kind: 'كتاب', status: 'منشور' }
    ],
    theses: [
      { role: 'مشرف', title: 'ر١', year: '1446', defense_date: '1446-01-01' },
      { role: 'مناقش', title: 'ر٢', year: '1447', defense_date: '1447-01-01' }
    ]
  });
  const slice = label => doc.charts.find(chart => chart.id === 'contribution').slices.find(item => item.label === label)?.value || 0;
  const count = label => doc.counts.find(([, text]) => text === label)?.[0] || 0;
  assert.equal(slice('بحوث منشورة'), count('بحوث منشورة'));
  assert.equal(slice('كتب وفصول وتحقيقات'), count('كتب وفصول وتحقيقات'));
  assert.equal(slice('إشراف على الرسائل'), count('إشرافات'));
  assert.equal(slice('مناقشة الرسائل'), count('مناقشات'));
});

test('buildCvMetrics reuses the expertise verdict it was handed', () => {
  const chart = { kind: 'bars', id: 'expertise', title: 'مُمرَّر', rows: [], max: 1 };
  const metrics = buildCvMetrics(bundle(), {}, { published: [], books: [], supervisions: [], discussions: [], reviewing: [], expertiseChart: chart });
  assert.ok(metrics.includes(chart), 'the caller and the chart must agree on one verdict');
});
