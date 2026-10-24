import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildCvDocument } from '../src/cv-document.mjs';
import { renderCvDocument } from '../src/cv-document.mjs';
import { createWordBlob } from '../src/cv-word.mjs';
import { chartCsvRows, chartTable } from '../src/cv-chart-data.mjs';
import { buildCvMetrics, sectionLayout, classifyThesis } from '../src/cv-metrics.mjs';
import { term, hijriYear, bilingual, registerTranslations } from '../src/cv-i18n.mjs';
import { renderCvTypst, lit } from '../src/cv-typst.mjs';
import { createCvPdfHandler, sanitizeDocument, contentDisposition, decodePortrait, planPdfBatches, MAX_DOCUMENTS, MAX_PORTRAIT_BYTES, MAX_BODY_BYTES } from '../src/cv-pdf-service.mjs';
import { matchesSupervisorCode, matchesEmployeeId } from '../src/cv-access.mjs';
import { registerEnglishNames, publishedEnglishName, englishNameFor } from '../src/cv-names.mjs';

const context = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || ''), yearLabel: value => `${value}هـ` };

const member = { id: '100', name: 'د. ماجد الجهني', rank: 'أستاذ مشارك', department: 'القراءات', email: 'm.baqi@tu.edu.sa' };

const bundle = (overrides = {}) => ({
  member, scopeYear: 'all', publications: [], theses: [], researchSupport: [],
  scientificEvents: [], communityActivities: [], academicPromotions: [],
  teachingDetails: [], monitorings: [], otherActivities: [], profile: {}, ...overrides
});

const docFor = overrides => buildCvDocument(bundle(overrides), { mode: 'public', generatedAt: '2026-10-09T10:00:00Z' }, context);
const internalDocFor = overrides => buildCvDocument(bundle(overrides), { mode: 'internal', generatedAt: '2026-10-09T10:00:00Z' }, context);

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
    ['بحوث منشورة', 'كتب وفصول وتحقيقات', 'إشراف غير محدد الدرجة', 'مناقشات'],
    'a record with no recorded degree is counted under its own heading, not assigned one');
  // Supervision survives as a chart split by degree, not as a list of titles.
  const split = doc.charts.find(chart => chart.id === 'supervision');
  assert.ok(split, 'the counts the list used to carry are charted instead');
  assert.equal(doc.sections.find(s => /الإشراف على الرسائل/.test(s.title)), undefined,
    'the published CV does not list supervised titles');
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
  const section = internalDocFor({ theses }).sections.find(item => item.title === 'الإشراف على الرسائل والمشروعات');

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
  for (const output of [renderCvDocument(internalDocFor({ theses })), renderCvTypst(internalDocFor({ theses }))]) {
    assert.ok(output.includes('مشرف رئيسي'), 'the hoisted line is printed');
    for (const row of theses) assert.ok(output.includes(row.student_name), `kept ${row.student_name}`);
  }
});

test('unrelated records are never forced into a series, and short axes keep their details', () => {
  const unrelated = ['أثر السياق في الترجيح', 'قواعد التفسير دراسة تأصيلية', 'الصرفة ووجوه الإعجاز',
    'أسباب الجهل بالعلم', 'مناهج المفسرين المعاصرين', 'القراءة الحداثية للقرآن', 'الوقف والابتداء']
    .map((title, index) => ({ role: 'مشرف', title, student_name: `ط${index}`, status: 'منجزة' }));
  const section = internalDocFor({ theses: unrelated }).sections.find(item => item.title === 'الإشراف على الرسائل والمشروعات');
  assert.equal(section.programme, undefined, 'titles sharing nothing must not be given a common heading');

  // Two records are too few to hoist: the saving would not pay for the indirection.
  const pair = internalDocFor({ theses: [
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

test('a doctorate, a thesis-track master and a research project are counted apart', () => {
  // app.js owns the rule: a master's is examined as رسالة علمية only before
  // 1441 or inside العقيدة, and stamps the verdict on degreeLabel.
  assert.equal(classifyThesis({ type: 'دكتوراه', degreeLabel: 'رسالة علمية' }), 'phd');
  assert.equal(classifyThesis({ type: 'ماجستير', degreeLabel: 'مشروع بحثي' }), 'masters-project');
  assert.equal(classifyThesis({ type: 'ماجستير', degreeLabel: 'رسالة علمية' }), 'masters-thesis');
  assert.equal(classifyThesis({}), 'unspecified', 'an unrecorded degree is never assigned one');

  const doc = docFor({ theses: [
    { role: 'مشرف', type: 'دكتوراه', degreeLabel: 'رسالة علمية', title: 'د١' },
    { role: 'مشرف', type: 'ماجستير', degreeLabel: 'مشروع بحثي', title: 'م١' },
    { role: 'مشرف', type: 'ماجستير', degreeLabel: 'مشروع بحثي', title: 'م٢' },
    { role: 'مناقش', type: 'ماجستير', degreeLabel: 'رسالة علمية', title: 'ر١' }
  ] });
  const chart = doc.charts.find(item => item.id === 'supervision');
  const group = label => chart.groups.find(item => item.label === label);
  assert.equal(group('رسالة دكتوراه').bars.find(bar => bar.label === 'إشراف').value, 1);
  assert.equal(group('مشروع بحثي (ماجستير)').bars.find(bar => bar.label === 'إشراف').value, 2);
  assert.equal(group('رسالة ماجستير').bars.find(bar => bar.label === 'مناقشة').value, 1);
  // Every record lands in exactly one group: the total must reconcile.
  assert.equal(chart.groups.flatMap(g => g.bars).reduce((sum, bar) => sum + bar.value, 0), 4);
  assert.match(chart.note, /٤/);

  // The tiles must agree with the chart rather than lump the degrees together.
  const tile = label => doc.counts.find(([, text]) => text === label)?.[0] || 0;
  assert.equal(tile('إشراف دكتوراه'), 1);
  assert.equal(tile('إشراف ماجستير'), 2);

  // And the grouped chart must survive sanitising, like every other field.
  const sanitized = sanitizeDocument(JSON.parse(JSON.stringify(doc)));
  const kept = sanitized.charts.find(item => item.id === 'supervision');
  assert.equal(kept.groups.length, chart.groups.length);
  assert.ok(renderCvTypst(doc).includes('groupbars'), 'the PDF draws it');
});

test('equal values draw equal bars regardless of their labels', () => {
  // A wider label ("مناقشة") once narrowed its own track, so two bars of the
  // same value rendered at different lengths — the chart distorted its data.
  const doc = docFor({ theses: [
    { role: 'مشرف', type: 'دكتوراه', degreeLabel: 'رسالة علمية', title: 'د١' },
    { role: 'مناقش', type: 'دكتوراه', degreeLabel: 'رسالة علمية', title: 'د٢' }
  ] });
  const source = renderCvTypst(doc);
  // The value column is a fixed width, so the proportional track is identical.
  assert.match(source, /columns: \(1fr, 16pt\)/);
  assert.ok(!/#b\.at\(1\) #b\.at\(3\)/.test(source), 'the role is carried by colour and legend, not by a variable-width label');
  const chart = doc.charts.find(item => item.id === 'supervision');
  const [supervised, examined] = chart.groups[0].bars.map(bar => bar.value);
  assert.equal(supervised, examined, 'the fixture itself must hold equal values for this to test anything');
});

test('the English CV translates its structure and leaves member prose in Arabic', () => {
  const data = {
    member: { id: '1', name: 'د. ماجد الجهني', rank: 'أستاذ مشارك', department: 'القراءات', email: 'm@tu.edu.sa' },
    publications: [{ title: 'عنوان بحث لا ترجمة مراجَعة له', journal: 'مجلة الراسخون', year: '1446', kind: 'بحث', status: 'منشور', volume: '12', issue: '3', pages: '45-67' }],
    theses: [{ role: 'مشرف', type: 'دكتوراه', degreeLabel: 'رسالة علمية', title: 'ر' }],
    researchSupport: [], scientificEvents: [], communityActivities: [], academicPromotions: [],
    teachingDetails: [], monitorings: [], otherActivities: [],
    profile: {
      englishName: 'Majed Aljuhani',
      expertise: [{ domain: 'قياس نواتج التعلم', years: '5' }, { domain: 'التعلم الإلكتروني', years: '6' }, { domain: 'الاعتماد البرامجي', years: '4' }],
      appointments: [{ role: 'أستاذ مشارك', institution: 'جامعة الطائف', start: '1445', end: 'حتى الآن' }],
      education: [{ degree: 'دكتوراه', specialization: 'التفسير وعلوم القرآن', institution: 'جامعة أم القرى', country: 'السعودية', year: '1440' }],
      skills: [{ name: 'التعلم النشط' }, { name: 'تطوير المقررات' }, { name: 'إدارة الجودة' }, { name: 'إعداد التقارير' }]
    }
  };
  const ctx = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || '') };
  const en = buildCvDocument(data, { mode: 'public', locale: 'en' }, ctx);
  const ar = buildCvDocument(data, { mode: 'public', locale: 'ar' }, ctx);

  // Structure is English.
  assert.equal(en.locale, 'en');
  assert.equal(en.modeLabel, 'Academic Curriculum Vitae');
  assert.match(en.subtitle, /Associate Professor · Taif University · College of Sharia · Department of Quranic Readings/);
  assert.ok(en.sections.some(section => section.title === 'Publications'));
  assert.ok(en.counts.some(([, label]) => label === 'Doctoral Supervision'));
  assert.ok(en.charts.some(chart => chart.title === 'Supervision and Examination by Degree'));

  // Layout keys stay Arabic, so rendering in English cannot change the shape.
  const cited = en.sections.find(section => section.title === 'Publications');
  assert.equal(cited.key, 'البحوث المنشورة');
  assert.equal(sectionLayout(cited), 'cited');
  // Every Arabic axis survives into English. English may carry one more: a
  // composed summary stands in where the member wrote only an Arabic one.
  for (const key of ar.sections.map(section => section.key)) {
    assert.ok(en.sections.some(section => section.key === key), `missing in English: ${key}`);
  }
  const extra = en.sections.map(s => s.key).filter(key => !ar.sections.some(s => s.key === key));
  assert.deepEqual(extra, ['النبذة العلمية'], 'the only added axis is the composed summary');
  assert.match(en.sections.find(s => s.key === 'النبذة العلمية').text,
    /^Majed Aljuhani is an Associate Professor/, 'the summary opens with the English name');
  assert.ok(!/[\u0600-\u06ff]/.test(en.sections.find(s => s.key === 'النبذة العلمية').text.split('.')[0]),
    'its opening clause carries no Arabic');

  // Composed labels are translated, not left half-Arabic.
  assert.match(cited.entries[0].details, /Vol\. 12 · No\. 3 · pp\. 45-67/);
  assert.match(en.sections.find(s => s.key === 'المسار الوظيفي').entries[0].details, /1445 — present/);

  // Member free text is rendered in English where a reviewed translation
  // exists, and falls back to the original where none does — never machine
  // translated on the fly.
  assert.equal(cited.entries[0].title, 'عنوان بحث لا ترجمة مراجَعة له', 'no reviewed translation: the original stands');
  registerTranslations([{ arabic: 'عنوان بحث لا ترجمة مراجَعة له', english: 'An article title with a reviewed translation' }]);
  const retitled = buildCvDocument(data, { mode: 'public', locale: 'en' }, ctx);
  assert.equal(retitled.sections.find(section => section.key === 'البحوث المنشورة').entries[0].title,
    'An article title with a reviewed translation', 'a reviewed translation is used');
  assert.equal(buildCvDocument(data, { mode: 'public', locale: 'ar' }, ctx)
    .sections.find(section => section.key === 'البحوث المنشورة').entries[0].title,
    'عنوان بحث لا ترجمة مراجَعة له', 'the Arabic CV is untouched by the translation register');

  // Numerals follow the document, not the data.
  assert.equal(en.charts.find(c => c.id === 'supervision').note, 'Total: 1 theses and projects.');
  assert.match(ar.charts.find(c => c.id === 'supervision').note, /١/);
});

test('an unglossed term stays Arabic rather than being guessed at', () => {
  assert.equal(term('مصطلح لا وجود له في المعجم', 'en'), 'مصطلح لا وجود له في المعجم');
  assert.equal(term('أستاذ مشارك', 'en'), 'Associate Professor');
  assert.equal(term('أستاذ مشارك', 'ar'), 'أستاذ مشارك', 'Arabic output is untouched');
  // A Hijri year is labelled, never silently presented as Gregorian.
  assert.equal(hijriYear('1447', 'en'), '1447 AH / 2026');
  assert.equal(hijriYear('1447', 'ar'), '١٤٤٧هـ', 'a year is a label, not a grouped quantity');
  // The bibliographic convention: original title, bracketed rendering.
  assert.equal(bilingual('قواعد التفسير', 'Principles of Exegesis', 'en'), 'Principles of Exegesis [قواعد التفسير]');
  assert.equal(bilingual('قواعد التفسير', '', 'en'), 'قواعد التفسير');
});

test('Word and CSV follow the document language too', async () => {
  const data = {
    member: { id: '1', name: 'د. ماجد الجهني', rank: 'أستاذ مشارك', department: 'القراءات', email: 'm@tu.edu.sa' },
    publications: [], researchSupport: [], scientificEvents: [], communityActivities: [],
    academicPromotions: [], teachingDetails: [], monitorings: [], otherActivities: [],
    theses: [
      { role: 'مشرف', type: 'دكتوراه', degreeLabel: 'رسالة علمية', title: 'د' },
      { role: 'مناقش', type: 'ماجستير', degreeLabel: 'مشروع بحثي', title: 'م' }
    ],
    profile: {}
  };
  const ctx = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || '') };
  const read = async locale => {
    const doc = buildCvDocument(data, { mode: 'public', locale }, ctx);
    const zip = await JSZip.loadAsync(await (await createWordBlob([doc])).arrayBuffer());
    return {
      doc,
      body: await zip.file('word/document.xml').async('string'),
      footer: await zip.file('word/footer1.xml').async('string'),
      core: await zip.file('docProps/core.xml').async('string')
    };
  };
  const en = await read('en');
  const ar = await read('ar');

  // docx inverts jc under bidirectional, so direction is read from the bidi
  // flag rather than from the alignment value.
  assert.ok(!en.body.includes('<w:bidi/>'), 'an English CV is not laid out right-to-left');
  assert.ok(ar.body.includes('<w:bidi/>'), 'the Arabic CV stays right-to-left');

  assert.match(en.footer, /<w:t[^>]*>Page <\/w:t>/);
  assert.match(ar.footer, /<w:t[^>]*>صفحة <\/w:t>/);
  assert.match(en.core, /<dc:title>Academic Curriculum Vitae/);

  // The grouped supervision chart reaches the editable exports; it was absent
  // from chartTable entirely while two removed chart kinds lingered there.
  assert.match(en.body, /Supervision and Examination by Degree/);
  assert.match(en.body, /Doctoral Thesis/);
  const table = chartTable(en.doc.charts.find(chart => chart.id === 'supervision'), 'en');
  assert.deepEqual(table.headings, ['Degree', 'Supervision', 'Examination']);
  // A group drops a zero bar, so columns must be filled by legend order.
  assert.deepEqual(table.rows, [['Doctoral Thesis', '1', '0'], ["Master's Research Project", '0', '1']]);

  assert.ok(chartCsvRows(en.doc).some(row => /Supervision: 1/.test(row[3])));
  assert.ok(chartCsvRows(ar.doc).some(row => /إشراف: ١/.test(row[3])));
});

test('a whole roster is split into batches that fit the response cap, losing nothing', () => {
  // A synchronous Netlify response is capped at 6 MB and measured output runs
  // about 50 KB per document, so a department in both languages must be split.
  const documents = Array.from({ length: 212 }, (_, index) => ({ name: `عضو ${index}`, filler: 'x'.repeat(9000) }));
  const batches = planPdfBatches(documents);
  assert.ok(batches.length > 1, 'a 212-document roster cannot go in one request');
  assert.equal(batches.flat().length, documents.length, 'every document survives the split');
  assert.deepEqual(batches.flat().map(row => row.name), documents.map(row => row.name), 'order is preserved');
  for (const batch of batches) {
    assert.ok(batch.length <= MAX_DOCUMENTS, 'a batch never exceeds the service document ceiling');
    assert.ok(JSON.stringify(batch).length <= MAX_BODY_BYTES, 'a batch never exceeds the service byte ceiling');
  }

  // A small selection stays a single file; batching must not fragment it.
  assert.equal(planPdfBatches(documents.slice(0, 3)).length, 1);
  assert.equal(planPdfBatches([]).length, 0);

  // One document larger than the budget still goes out, so the service can
  // answer with a reason instead of the client silently dropping it.
  const huge = [{ name: 'ضخم', filler: 'x'.repeat(2_000_000) }];
  assert.equal(planPdfBatches(huge).flat().length, 1);
});

test('the supervisor code releases the whole selection; a wrong code does not', () => {
  assert.ok(matchesSupervisorCode('2008'));
  assert.ok(matchesSupervisorCode('٢٠٠٨'), 'Arabic-Indic digits are accepted');
  assert.ok(matchesSupervisorCode(' 2008 '));
  for (const wrong of ['', '2007', '20080', 'abcd', null, undefined]) {
    assert.ok(!matchesSupervisorCode(wrong), `refused: ${wrong}`);
  }
  // The code is a convenience gate over a confirmation prompt, not an
  // authorisation boundary: an employee id that happens to be 2008 still
  // matches its own member, and the server session still governs access.
  assert.ok(matchesEmployeeId('٢٠٠٨', '2008'));
});

test('a proposal publishes but a contradiction does not, and evidence always wins', () => {
  registerEnglishNames([
    { id: '10', english: 'Majed Aljuhani', status: 'verified', source: 'https://orcid.org/example' },
    { id: '11', english: 'Afnan Alsawat', status: 'transliterated' },
    { id: '12', english: 'Approved Spelling', status: 'confirmed', source: 'college' },
    { id: '15', english: 'Salma al-Ghamdi', status: 'review', note: 'surname disagrees with the record' }
  ]);

  // The college asked for a Latin name on every CV, so a careful proposal
  // built from the university's own spellings publishes.
  assert.equal(publishedEnglishName({ id: '10' }), 'Majed Aljuhani');
  assert.equal(publishedEnglishName({ id: '12' }), 'Approved Spelling');
  assert.equal(publishedEnglishName({ id: '11' }), 'Afnan Alsawat', 'a proposal is published');
  // A contradiction is not a gap: it stays withheld until someone resolves it.
  assert.equal(publishedEnglishName({ id: '15' }), '', 'a flagged discrepancy does not publish');
  assert.equal(publishedEnglishName({ id: '999' }), '', 'an unknown member yields nothing, never a guess');

  // The member's own profile outranks anything gathered about them.
  assert.equal(publishedEnglishName({ id: '10' }, 'How I Spell It'), 'How I Spell It');
  assert.equal(englishNameFor({ id: '10' }, 'How I Spell It').status, 'confirmed');

  // Status still ranks, so a proposal cannot displace evidence on re-import.
  registerEnglishNames([{ id: '10', english: 'Guessed Name', status: 'transliterated' }]);
  assert.equal(publishedEnglishName({ id: '10' }), 'Majed Aljuhani', 'a proposal cannot displace evidence');
  registerEnglishNames([{ id: '11', english: 'Afnan M. Alsawat', status: 'verified', source: 'paper' }]);
  assert.equal(publishedEnglishName({ id: '11' }), 'Afnan M. Alsawat', 'evidence does displace a proposal');

  // Malformed records are ignored rather than stored half-complete.
  registerEnglishNames([{ id: '13', english: 'X' }, { id: '', english: 'Y', status: 'verified' }, { id: '14', status: 'verified' }]);
  assert.equal(publishedEnglishName({ id: '13' }), '');
  assert.equal(publishedEnglishName({ id: '14' }), '');
});

test('an English CV falls back to the Arabic name rather than inventing a Latin one', () => {
  registerEnglishNames([
    { id: '20', english: 'Hisham bin Saleh Al-Zeir', status: 'verified', source: 'tu.edu.sa staff table' },
    { id: '21', english: 'Someone Al-Suleiman', status: 'review', note: 'no affiliation in the source' }
  ]);
  const base = {
    publications: [], theses: [], researchSupport: [], scientificEvents: [], communityActivities: [],
    academicPromotions: [], teachingDetails: [], monitorings: [], otherActivities: [], profile: {}
  };
  const ctx = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || '') };
  const docFor = (id, name) => buildCvDocument(
    { ...base, member: { id, name, rank: 'أستاذ', department: 'الشريعة', email: '' } },
    { mode: 'public', locale: 'en' }, ctx);

  assert.equal(docFor('20', 'أ.د. هشام الزير').englishName, 'Hisham bin Saleh Al-Zeir');
  // Under review, and unknown: both keep the Arabic name. The document must
  // never assert a spelling the person has not been shown to use.
  assert.equal(docFor('21', 'عبدالسلام السليمان').englishName, '');
  assert.equal(docFor('999', 'عضو غير مسجل').englishName, '');
  // The member's own entry still overrides the register.
  const own = buildCvDocument({ ...base, member: { id: '21', name: 'x', rank: 'أستاذ', department: 'الشريعة', email: '' }, profile: { englishName: 'As I Sign It' } }, { mode: 'public', locale: 'en' }, ctx);
  assert.equal(own.englishName, 'As I Sign It');
});

test('one supervised programme reads as one series in either language', () => {
  // Real in-range titles from data/theses.csv, in the two phrasings the
  // records actually use. Unifying the translations is what lets both be
  // recognised as one series rather than two.
  const titles = [
    'تصنيفات الاختلافات التفسيرية عند ابن الجوزي في كتابه زاد المسير من بداية الآية 168 إلى نهاية 186 من سورة آل عمران: جمعاً ودراسة',
    'تصنيفات الاختلافات التفسيرية عند ابن الجوزي في كتابه زاد المسير من بداية الآية 24 إلى نهاية 34 من سورة النساء: جمعاً ودراسة',
    'تصنيفات الاختلافات التفسيرية عند ابن الجوزي في كتابه زاد المسير من بداية الآية 35 إلى نهاية 44 من سورة النساء: جمعاً ودراسة',
    'تصنيفات الاختلافات التفسيرية في زاد المسير في علم التفسير للإمام ابن الجوزي من سورة الأعراف آية 19 إلى سورة الأعراف آية 37: جمعاً ودراسة',
    'تصنيفات الاختلافات التفسيرية في زاد المسير في علم التفسير للإمام ابن الجوزي من سورة الأنعام آية 102 إلى سورة الأنعام آية 121: جمعاً ودراسة',
    'تصنيفات الاختلافات التفسيرية عند ابن الجوزي في كتابه زاد المسير من بداية الآية 59 إلى نهاية 77 من سورة النساء: جمعاً ودراسة'
  ];
  const theses = titles.map((title, index) => ({
    role: 'مشرف رئيسي', type: 'ماجستير', degreeLabel: 'مشروع بحثي',
    programLabel: 'مشروع بحثي دراسات قرآنية', student_name: `طالب ${index + 1}`,
    university: 'جامعة الطائف', status: 'منجزة', defense_date: '١٤٤٧هـ', year: '1447', title
  }));
  const ctx = { university: 'جامعة الطائف', college: 'كلية الشريعة', formatDate: value => String(value || '') };
  const base = {
    member: { id: '1', name: 'د. فلان', rank: 'أستاذ', department: 'القراءات', email: '' },
    publications: [], researchSupport: [], scientificEvents: [], communityActivities: [],
    academicPromotions: [], teachingDetails: [], monitorings: [], otherActivities: [], profile: {}, theses
  };
  for (const locale of ['ar', 'en']) {
    const section = buildCvDocument(base, { mode: 'internal', locale }, ctx)
      .sections.find(item => item.key === 'الإشراف على الرسائل والمشروعات');
    assert.equal(section.programme.covered, titles.length, `${locale}: both phrasings join one series`);
    assert.equal(section.entries.length, titles.length, 'no record is folded away');
    // The constants are stated once; the Hijri date follows the document's
    // numerals rather than staying Arabic-Indic inside an English CV.
    assert.deepEqual(section.shared, locale === 'en'
      ? ['Principal Supervisor', 'Research Project in Quranic Studies', 'Taif University', 'Completed', '1447AH']
      : ['مشرف رئيسي', 'مشروع بحثي دراسات قرآنية', 'جامعة الطائف', 'منجزة', '١٤٤٧هـ']);
    // Each record keeps its own scope whole: the verse range is what tells one
    // project in the programme from the next, so it is never trimmed away.
    assert.match(section.entries[0].title, locale === 'en' ? /verse 168/ : /الآية 168/);
  }

  // A title with no reviewed translation stays Arabic and therefore falls
  // outside the English series — withheld rather than guessed at.
  const withGap = { ...base, theses: [...theses, { ...theses[0], title: 'عنوان رسالة لم تُراجَع ترجمته بعد', student_name: 'طالب ٩٩' }] };
  const english = buildCvDocument(withGap, { mode: 'internal', locale: 'en' }, ctx)
    .sections.find(item => item.key === 'الإشراف على الرسائل والمشروعات');
  assert.equal(english.entries.length, titles.length + 1, 'the untranslated record is still listed');
  assert.ok(english.entries.some(entry => /عنوان رسالة/.test(entry.title)), 'and keeps its Arabic title');
});
