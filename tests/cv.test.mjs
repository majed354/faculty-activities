import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createCvHandler } from '../src/cv-api.mjs';
import { normalizeProfile } from '../src/cv-schema.mjs';
import { buildCvDocument, renderCvDocument, mergePublications, groupTeaching } from '../src/cv-document.mjs';
import { createWordBlob } from '../src/cv-word.mjs';
import { chooseEntry, chooseInterest, draftBiography, EXPERIENCE_AREAS, searchKey } from '../src/cv-choices.mjs';

function fixture() {
  const objects = new Map();
  let version = 0;
  const env = { CV_SESSION_SECRET: 'test-only-signing-secret', CV_LOGIN_PASSWORD: 'test-login', CV_ADMIN_PASSWORD: 'test-admin' };
  const store = {
    async getWithMetadata(key) { return objects.get(key) || null; },
    async setJSON(key, data, condition) {
      const current = objects.get(key);
      if (condition.onlyIfNew && current || condition.onlyIfMatch && current?.etag !== condition.onlyIfMatch) return { modified: false };
      const etag = `"version-${++version}"`; objects.set(key, { data, etag }); return { modified: true, etag };
    }
  };
  const handler = createCvHandler({ openStore: () => store, roster: ['100', '200'], getEnv: key => env[key] });
  const request = (body, cookie = '', path = '') => handler(new Request(`https://cv.example/.netlify/functions/cv-profiles${path}`, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'Content-Type': 'application/json', Origin: 'https://cv.example' } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  const login = async id => {
    const response = await request({ action: 'login', employeeId: id, password: 'test-login' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { request, login, objects };
}

test('stored CVs require a valid signed session and roster ID', async () => {
  const { request, login } = fixture();
  assert.equal((await request(null, '', '?ids=100')).status, 401);
  assert.equal((await request({ action: 'login', employeeId: '300', password: 'test-login' })).status, 401);
  const cookie = await login('100');
  assert.equal((await request(null, cookie.replace(/.$/, 'x'), '?ids=100')).status, 401);
  assert.equal((await request(null, cookie, '?ids=300')).status, 400);
  const response = await request(null, cookie, '?ids=100');
  assert.equal((await response.json()).records[0].profile.education.length, 0);
});

test('saving another member requires privileges and concurrent edits never overwrite', async () => {
  const { request, login, objects } = fixture();
  const cookie = await login('100');
  const save = { action: 'save', employeeId: '200', profile: { biography: 'نبذة موثقة' } };
  assert.equal((await request(save, cookie)).status, 403);
  const response = await request({ ...save, privilegePassword: 'test-admin' }, cookie);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal((await request({ ...save, privilegePassword: 'test-admin' }, cookie)).status, 409);
  const edit = await request({ ...save, profile: { biography: 'نسخة أحدث' }, privilegePassword: 'test-admin', expectedEtag: saved.etag }, cookie);
  assert.equal(edit.status, 200);
  assert.equal((await request({ ...save, privilegePassword: 'test-admin', expectedEtag: saved.etag }, cookie)).status, 409);
  assert.equal(objects.get('member-200').data.profile.biography, 'نسخة أحدث');
  const read = await request(null, await login('100'), '?ids=200');
  assert.equal((await read.json()).records[0].profile.biography, 'نسخة أحدث');
});

test('server validates profile fields and rejects unsupported URLs and incomplete records', async () => {
  const { request, login } = fixture(); const cookie = await login('100');
  const save = profile => request({ action: 'save', employeeId: '100', profile }, cookie);
  assert.equal((await save({ website: 'javascript:alert(1)' })).status, 400);
  assert.equal((await save({ biography: 'x'.repeat(4001) })).status, 400);
  assert.equal((await save({ education: [{ degree: 'دكتوراه' }] })).status, 400);
  const profile = normalizeProfile({ biography: '<script>alert(1)</script>', password: 'never-stored', education: [{ degree: 'دكتوراه', institution: 'جامعة' }] }, { strict: true });
  assert.equal(profile.password, undefined);
  assert.equal((await save(profile)).status, 200);
});

const bundle = {
  member: { id: '100', name: 'د. عضو تجريبي', rank: 'أستاذ مشارك', department: 'القراءات', email: 'test@example.com', nationality: 'السعودية', gender: 'ذكر', branch: 'الحوية' },
  scopeYear: 'all', scopeYearLabel: 'كل السنوات المسجلة', points: 21,
  profile: { biography: 'نبذة علمية', education: [{ degree: 'دكتوراه', institution: 'جامعة اختبار', year: '١٤٢٨هـ' }], notes: 'ملاحظة داخلية لا تنشر', website: 'https://example.com/profile' },
  publications: [], theses: [{ role: 'مشرف رئيسي', title: 'مشروع بحثي', type: 'ماجستير', student_name: 'طالب', status: 'منجزة', year: '1448' }],
  researchSupport: [], scientificEvents: [], communityActivities: [], teachingDetails: [], monitorings: [{ title: 'مراقبة اختبار' }]
};

test('publication CV hides internal fields and empty sections while retaining permanent qualifications', () => {
  const doc = buildCvDocument(bundle, { mode: 'public' });
  const markup = renderCvDocument(doc);
  assert.ok(doc.sections.some(section => section.title === 'المؤهلات العلمية'));
  assert.ok(doc.sections.some(section => section.title === 'الإشراف على الرسائل والمشروعات'));
  assert.ok(!doc.sections.some(section => section.title === 'البحوث المنشورة'));
  for (const privateText of ['النقاط', 'الرقم الوظيفي', 'الجنسية', 'مراقبة اختبار', 'ملاحظة داخلية لا تنشر', 'لا توجد سجلات']) assert.ok(!markup.includes(privateText), privateText);
  const limited = buildCvDocument({ ...bundle, scopeYear: 1448, scopeYearLabel: '١٤٤٨هـ' }, { mode: 'public' });
  assert.ok(limited.sections.some(section => section.title === 'المؤهلات العلمية'));
  assert.match(limited.coverage, /١٤٤٨هـ/);
  const internal = renderCvDocument(buildCvDocument(bundle, { mode: 'internal' }));
  for (const privateText of ['النقاط', 'الرقم الوظيفي', 'الجنسية', 'مراقبة اختبار', 'ملاحظة داخلية لا تنشر']) assert.ok(internal.includes(privateText), privateText);
});

test('HTML escapes user text and supplemental metadata enriches rather than duplicates works', () => {
  const pubs = mergePublications([{ title: 'بحث واحد', journal: 'مجلة', year: '1448' }], [{ title: 'بحث واحد', venue: 'مجلة', year: '1448', pages: '١–٢٥', doi: '10.1000/test' }]);
  assert.equal(pubs.length, 1); assert.equal(pubs[0].pages, '١–٢٥');
  assert.equal(mergePublications([{ title: 'أ', doi: '10.1/23' }], [{ title: 'ب', doi: '10.12/3' }]).length, 2);
  const doc = buildCvDocument({ ...bundle, profile: { biography: '<img onerror=alert(1)>', notes: 'خاص' } });
  assert.ok(renderCvDocument(doc).includes('&lt;img onerror=alert(1)&gt;'));
  assert.ok(!renderCvDocument(doc).includes('<img onerror'));
});

test('teaching lists unique courses across terms and concise CV explicitly labels selections', () => {
  const rows = [1447, 1448].flatMap(year => [1, 2].map(term => ({ year, term, courseCode: 'Q1', courseName: 'القراءات', degree: 'بكالوريوس', programLabel: 'برنامج القراءات' })));
  assert.equal(groupTeaching(rows).length, 1); assert.equal(groupTeaching(rows)[0].years.length, 2);
  const full = { ...bundle, theses: Array.from({ length: 9 }, (_, index) => ({ ...bundle.theses[0], title: `مشروع ${index}` })) };
  const short = buildCvDocument(full, { mode: 'short' });
  const section = short.sections.find(section => section.title.includes('الإشراف'));
  assert.equal(section.entries.length, 5); assert.match(section.title, /مختارات/);
});

test('Word output is a real editable DOCX with Arabic direction, page numbers and links', async () => {
  const doc = buildCvDocument(bundle, { mode: 'public' });
  const blob = await createWordBlob([doc]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const relations = await zip.file('word/_rels/document.xml.rels').async('string');
  const footer = await zip.file('word/footer1.xml').async('string');
  assert.match(xml, /w:bidi/); assert.match(xml, /دكتوراه/); assert.match(xml, /نبذة علمية/);
  assert.ok(!xml.includes('ملاحظة داخلية لا تنشر')); assert.match(relations, /https:\/\/example.com\/profile/); assert.match(footer, /PAGE/);
});

test('experience years, skills and certificates persist in fresh sessions and older CVs retain their fields', async () => {
  const old = normalizeProfile({ version: 1, biography: 'نبذة سابقة', service: [{ role: 'عضو', organization: 'جهة سابقة' }] });
  assert.equal(old.biography, 'نبذة سابقة'); assert.equal(old.service[0].organization, 'جهة سابقة'); assert.deepEqual(old.expertise, []);
  const profile = { ...old, expertise: [{ domain: 'الجودة والاعتماد الأكاديمي', years: '٥٫٥', description: 'مساهمة موثقة' }], skills: [{ name: 'مهارة مخصصة', level: 'متقدم' }], certifications: [{ title: 'شهادة خاصة', domain: 'الجودة والاعتماد الأكاديمي', credentialId: 'private-credential' }] };
  const { request, login } = fixture();
  const response = await request({ action: 'save', employeeId: '100', profile }, await login('100'));
  assert.equal(response.status, 200);
  const read = await request(null, await login('100'), '?ids=100');
  const saved = (await read.json()).records[0].profile;
  assert.equal(saved.expertise[0].years, '5.5'); assert.equal(saved.skills[0].name, 'مهارة مخصصة'); assert.equal(saved.certifications[0].credentialId, 'private-credential');
  for (const years of ['-1', '0', '81', 'خمسة', 'Infinity']) assert.throws(() => normalizeProfile({ expertise: [{ domain: 'مجال', years }] }, { strict: true }), /سنوات الخبرة/);
  assert.throws(() => normalizeProfile({ expertise: [{ domain: 'مجال' }] }, { strict: true }), /أكمل/);
});

test('choices preserve custom text and existing details and biography drafts only use provided facts', () => {
  const entries = [{ domain: 'الجودة والاعتماد الأكاديمي', years: '6', description: 'تفاصيل لا تفقد' }, { domain: 'مجال خاص', years: '2' }];
  assert.deepEqual(chooseEntry(entries, 'domain', entries[0].domain, true), entries);
  assert.equal(chooseEntry(entries, 'domain', entries[0].domain, false)[0].domain, 'مجال خاص');
  assert.equal(chooseInterest('موضوع مخصص\nالتجويد', 'التجويد', true), 'موضوع مخصص\nالتجويد');
  assert.equal(chooseInterest('موضوع مخصص\nالتجويد', 'التجويد', false), 'موضوع مخصص');
  assert.equal(searchKey('الجودة'), searchKey('الجوده')); assert.ok(EXPERIENCE_AREAS.includes('إعداد الدراسة الذاتية'));
  const draft = draftBiography({ expertise: entries, education: [], researchInterests: '' }, bundle.member, 'جامعة اختبار');
  assert.match(draft, /6 سنة/); assert.ok(!draft.includes('دكتوراه')); assert.ok(!draft.includes('شهادة'));
});

test('public HTML and Word include experience durations and selected certificates while hiding credential IDs', async () => {
  const selected = { ...bundle, profile: { expertise: [{ domain: 'إعداد الدراسة الذاتية', years: '4' }], skills: [{ name: 'Microsoft Excel' }], certifications: [{ title: 'شهادة موثقة', domain: 'المهارات الرقمية', credentialId: 'secret-id', url: 'https://example.com/verify' }] } };
  const doc = buildCvDocument(selected, { mode: 'public' });
  const markup = renderCvDocument(doc);
  for (const text of ['إعداد الدراسة الذاتية', 'مدة الخبرة:', 'Microsoft Excel', 'شهادة موثقة', 'https://example.com/verify']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('secret-id'));
  assert.ok(!markup.includes('false'));
  assert.ok(renderCvDocument(buildCvDocument(selected, { mode: 'internal' })).includes('secret-id'));
  const zip = await JSZip.loadAsync(await (await createWordBlob([doc])).arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /إعداد الدراسة الذاتية/); assert.match(xml, /مدة الخبرة:/); assert.match(xml, /شهادة موثقة/); assert.ok(!xml.includes('secret-id'));
});
