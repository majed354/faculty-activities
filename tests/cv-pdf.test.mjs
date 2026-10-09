import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildCvDocument } from '../src/cv-document.mjs';
import { renderCvDocument } from '../src/cv-document.mjs';
import { createWordBlob } from '../src/cv-word.mjs';
import { chartCsvRows } from '../src/cv-chart-data.mjs';
import { buildCvMetrics, sectionLayout } from '../src/cv-metrics.mjs';
import { renderCvTypst, lit } from '../src/cv-typst.mjs';
import { createCvPdfHandler, sanitizeDocument, contentDisposition, decodePortrait, MAX_DOCUMENTS, MAX_PORTRAIT_BYTES } from '../src/cv-pdf-service.mjs';

const context = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || ''), yearLabel: value => `${value}هـ` };

const member = { id: '100', name: 'د. ماجد الجهني', rank: 'أستاذ مشارك', department: 'القراءات', email: 'm.baqi@tu.edu.sa' };

const bundle = (overrides = {}) => ({
  member, scopeYear: 'all', publications: [], theses: [], researchSupport: [],
  scientificEvents: [], communityActivities: [], academicPromotions: [],
  teachingDetails: [], monitorings: [], otherActivities: [], profile: {}, ...overrides
});

const docFor = overrides => buildCvDocument(bundle(overrides), { mode: 'public', generatedAt: '2026-10-09T10:00:00Z' }, context);

test('a chart appears only when the data can carry it, and years stay labels', () => {
  const sparse = docFor({ teachingDetails: [{ courseName: 'التفسير', year: '1446', students: '30' }] });
  assert.equal(sparse.charts.find(chart => chart.id === 'teaching'), undefined, 'one year is not a trend');

  const rich = docFor({ teachingDetails: [
    { courseName: 'التفسير', year: '1446', students: '30' },
    { courseName: 'علوم القرآن', year: '1447', students: '25' },
    { courseName: 'التفسير', year: '1447', students: '40' }
  ] });
  const teaching = rich.charts.find(chart => chart.id === 'teaching');
  assert.ok(teaching, 'two populated years make a trend');
  assert.deepEqual(teaching.rows.map(row => row.label), ['١٤٤٦', '١٤٤٧']);
  assert.ok(!teaching.rows.some(row => /٬|,/.test(row.label)), 'a year is a label, never grouped as ١٬٤٤٧');
  assert.match(teaching.note, /٩٥/, 'the note totals the enrolled students');
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

test('expertise without years or beyond the chart limit remains in every document', () => {
  const expertise = Array.from({ length: 14 }, (_, index) => ({ domain: `مجال الخبرة ${index + 1}`, years: String(20 - index) }));
  expertise.push({ domain: 'مجال بلا مدة' });
  const doc = docFor({ profile: { expertise } });
  assert.equal(doc.charts.find(chart => chart.id === 'expertise').rows.length, 12);
  const remaining = doc.sections.find(section => section.title === 'مجالات الخبرة الأكاديمية والإدارية');
  assert.deepEqual(remaining.entries.map(row => row.title), ['مجال الخبرة 13', 'مجال الخبرة 14', 'مجال بلا مدة']);
  assert.ok(renderCvDocument(doc).includes('مجال بلا مدة'));
  assert.ok(renderCvTypst(doc).includes('مجال بلا مدة'));
  assert.ok(!remaining.entries.find(row => row.title === 'مجال بلا مدة').details.includes('سنة'));
});

test('Word and CSV retain plotted expertise without restoring the duplicate list', async () => {
  const doc = docFor({ profile: { expertise: [
    { domain: 'الجودة', years: '5' }, { domain: 'الاعتماد', years: '4' }, { domain: 'التعلم', years: '6' }, { domain: 'خبرة بلا مدة' }
  ] } });
  const zip = await JSZip.loadAsync(await (await createWordBlob([doc])).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  for (const label of ['الجودة', 'الاعتماد', 'التعلم', 'خبرة بلا مدة']) assert.ok(xml.includes(label), label);
  assert.match(xml, /w:tbl/);
  assert.ok(!xml.includes('مدة الخبرة:'));
  const csv = chartCsvRows(doc);
  assert.ok(csv.some(row => row[2] === 'الجودة' && row[3] === 'سنة: ٥'));
  assert.ok(csv.some(row => row[2] === 'التعلم' && row[3] === 'سنة: ٦'));
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

test('a missing or unusable portrait leaves no gap, and only real images are embedded', async () => {
  // Smallest well-formed PNG and JPEG headers the decoder should accept.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]).toString('base64');

  assert.equal(decodePortrait(`data:image/png;base64,${png}`).extension, 'png');
  assert.equal(decodePortrait(jpg).extension, 'jpg');
  for (const rejected of ['', '   ', 'not-base64-at-all', Buffer.from('<svg onload=alert(1)>').toString('base64'),
    Buffer.from('%PDF-1.7 fake').toString('base64'), Buffer.from([0x89, 0x50]).toString('base64')]) {
    assert.equal(decodePortrait(rejected), null, `refused: ${rejected.slice(0, 20)}`);
  }
  // An image larger than the ceiling is dropped rather than compiled.
  assert.equal(decodePortrait(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(MAX_PORTRAIT_BYTES + 1)]).toString('base64')), null);

  const sources = [];
  const assetSets = [];
  const handler = createCvPdfHandler({
    compile: async (source, assets) => { sources.push(source); assetSets.push(assets); return Buffer.from('%PDF-1.7'); }
  });
  const post = body => handler(new Request('https://cv.example/api/cv-pdf', { method: 'POST', body: JSON.stringify(body) }));

  assert.equal((await post({ documents: [{ name: 'بلا صورة' }] })).status, 200);
  assert.equal(assetSets.at(-1).length, 0, 'no portrait means no asset');
  assert.ok(sources.at(-1).includes(', none)'), 'the masthead is told there is no portrait');

  assert.equal((await post({ documents: [{ name: 'صورة تالفة', portraitData: '###' }] })).status, 200,
    'an unusable portrait must not fail the whole document');
  assert.equal(assetSets.at(-1).length, 0);

  assert.equal((await post({ documents: [{ name: 'مع صورة', portraitData: `data:image/png;base64,${png}` }] })).status, 200);
  assert.equal(assetSets.at(-1).length, 1);
  assert.equal(assetSets.at(-1)[0].path, '/portrait-0.png');
  assert.ok(sources.at(-1).includes('"/portrait-0.png")'), 'the document references the mounted file');
});

test('the tiles are not restated as a chart, and no chart plots a defence calendar', () => {
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
  // The KPI tiles already carry these five numbers; a composition bar beside
  // them was the same data in colour.
  assert.equal(doc.charts.find(chart => chart.id === 'contribution'), undefined);
  // Defence dates cluster in Muharram, so a per-year bar plotted the academic
  // calendar rather than output.
  assert.equal(doc.charts.find(chart => chart.id === 'trend'), undefined);
  assert.deepEqual(doc.counts.map(([, label]) => label),
    ['بحوث منشورة', 'كتب وفصول وتحقيقات', 'إشرافات', 'مناقشات']);
});

test('buildCvMetrics reuses the expertise verdict it was handed', () => {
  const chart = { kind: 'bars', id: 'expertise', title: 'مُمرَّر', rows: [], max: 1 };
  const metrics = buildCvMetrics(bundle(), {}, { published: [], books: [], supervisions: [], discussions: [], reviewing: [], expertiseChart: chart });
  assert.ok(metrics.includes(chart), 'the caller and the chart must agree on one verdict');
});

const SURAS = ['البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس', 'هود'];

test('a repetitive axis states its constants once and names the series it belongs to', () => {
  // Twenty-three supervisions differing only in student, scope and date.
  const theses = Array.from({ length: 10 }, (_, index) => ({
    role: 'مشرف رئيسي', type: 'مشروع بحثي', programLabel: 'مشروع بحثي دراسات قرآنية',
    student_name: `طالب ${index + 1}`, university: 'جامعة الطائف', status: 'منجزة',
    defense_date: '١٤٤٨هـ',
    title: `${index % 2 ? 'تصنيف' : 'تصنيفات'} الاختلافات التفسيرية في زاد المسير لابن الجوزي (سورة ${SURAS[index]} من الآية ${index * 10} إلى الآية ${index * 10 + 9})`
  }));
  const section = docFor({ theses }).sections.find(item => item.title === 'الإشراف على الرسائل والمشروعات');

  // The degree is not printed twice because the programme name already carries it.
  assert.ok(!section.shared.includes('مشروع بحثي'), 'the bare degree is dropped beside "مشروع بحثي دراسات قرآنية"');
  assert.deepEqual(section.shared, ['مشرف رئيسي', 'مشروع بحثي دراسات قرآنية', 'جامعة الطائف', 'منجزة', '١٤٤٨هـ']);

  // Constants leave the rows; what distinguishes them stays.
  assert.deepEqual(section.entries.map(row => row.details), theses.map((_, i) => `الطالب: طالب ${i + 1}`));

  assert.equal(section.programme.covered, 10);
  assert.equal(section.programme.label, 'الاختلافات التفسيرية في زاد المسير لابن الجوزي');
  // The heading must show the spelling the member used, never the folded key.
  assert.ok(!section.programme.label.includes('التفسيريه'));

  // Both renderers surface it, and no record is lost.
  for (const output of [renderCvDocument(docFor({ theses })), renderCvTypst(docFor({ theses }))]) {
    assert.ok(output.includes('مشرف رئيسي'), 'the hoisted line is printed');
    for (const row of theses) assert.ok(output.includes(row.student_name), `kept ${row.student_name}`);
  }
});

test('unrelated records are never forced into a series, and short axes keep their details', () => {
  const unrelated = ['أثر السياق في الترجيح', 'قواعد التفسير دراسة تأصيلية', 'الصرفة ووجوه الإعجاز',
    'أسباب الجهل بالعلم', 'مناهج المفسرين المعاصرين', 'القراءة الحداثية للقرآن', 'الوقف والابتداء']
    .map((title, index) => ({ role: 'مشرف', title, student_name: `ط${index}`, status: 'منجزة' }));
  const section = docFor({ theses: unrelated }).sections.find(item => item.title === 'الإشراف على الرسائل والمشروعات');
  assert.equal(section.programme, undefined, 'titles sharing nothing must not be given a common heading');

  // Two records are too few to hoist: the saving would not pay for the indirection.
  const pair = docFor({ theses: [
    { role: 'مشرف', title: 'أ', university: 'جامعة الطائف', student_name: 'ط١' },
    { role: 'مشرف', title: 'ب', university: 'جامعة الطائف', student_name: 'ط٢' }
  ] }).sections.find(item => item.title === 'الإشراف على الرسائل والمشروعات');
  assert.equal(pair.shared, undefined);
  assert.ok(pair.entries.every(row => row.details.includes('جامعة الطائف')));
});

test('the service forwards the hoisted line and series label it is sent', async () => {
  let source = '';
  const handler = createCvPdfHandler({ compile: async text => { source = text; return Buffer.from('%PDF-1.7'); } });
  const response = await handler(new Request('https://cv.example/api/cv-pdf', {
    method: 'POST',
    body: JSON.stringify({ documents: [{
      name: 'د. فلان',
      sections: [{
        title: 'الإشراف على الرسائل والمشروعات',
        shared: ['مشرف رئيسي', 'جامعة الطائف'],
        programme: { label: 'الاختلافات التفسيرية … زاد المسير', covered: 23, total: 23 },
        entries: [{ title: 'رسالة', details: 'الطالب: ط' }]
      }]
    }] })
  }));
  assert.equal(response.status, 200);
  // The allow-list dropped these silently once; the PDF then printed every
  // constant on every row while the model said otherwise.
  assert.ok(source.includes('مشرف رئيسي'), 'the hoisted constants survive sanitising');
  assert.ok(source.includes('الاختلافات التفسيرية'), 'the series label survives sanitising');
  assert.ok(source.includes('٢٣'), 'the coverage count is rendered in Arabic-Indic digits');
});
