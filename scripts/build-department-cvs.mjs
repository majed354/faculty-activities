// Produces the English CVs for one department as a single PDF, from the
// repository's own activity data.
//
//   node scripts/build-department-cvs.mjs <department> <locale> <out.pdf>
//
// The site assembles a member's bundle in the browser from the live Sheet;
// this assembles the same shape from data/ so a department's file can be
// produced, inspected and handed over without a browser.
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { buildCvDocument } from '../src/cv-document.mjs';
import { planPdfBatches } from '../src/cv-pdf-service.mjs';
import handler from '../netlify/functions/cv-pdf.mjs';

const YEARS = new Set(['1446', '1447', '1448']);
const csv = name => Papa.parse(readFileSync(`data/${name}.csv`, 'utf8').trim(), { header: true, skipEmptyLines: true }).data;
const text = value => String(value ?? '').trim();
const ids = value => text(value).split(/[,;|]/).map(text).filter(Boolean);
const inRange = row => YEARS.has(text(row.year));

const [department = 'القراءات', locale = 'en', out = '/tmp/department-cvs.pdf'] = process.argv.slice(2);

// Latest record per member, within the years the accreditation file covers.
const roster = new Map();
for (const row of csv('faculty')) {
  if (!inRange(row) || text(row.department) !== department) continue;
  const id = text(row.id);
  if (!id) continue;
  const held = roster.get(id);
  if (!held || Number(row.year) > Number(held.year)) roster.set(id, row);
}

const theses = csv('theses').filter(inRange);
const publications = csv('publications').filter(inRange);
const participations = csv('participations').filter(inRange);
const promotions = csv('academic_promotions');
const teaching = JSON.parse(readFileSync('data/teaching_data.json', 'utf8')).records
  .filter(record => YEARS.has(String(record.y)));

// app.js owns the rule that a master's is a رسالة علمية only before 1441 or
// in العقيدة; it is mirrored here so the degree labels match the site's.
const scientific = row => text(row.type) === 'دكتوراه'
  || (text(row.type) === 'ماجستير' && (Number(text(row.year)) <= 1440 || text(row.specialization) === 'العقيدة'));
const degreeLabel = row => (scientific(row) ? 'رسالة علمية' : 'مشروع بحثي');

const bundleFor = (id, member) => {
  const supervised = theses.filter(row => [row.supervisor_id, row.co_supervisor_id].map(text).includes(id));
  const examined = theses.filter(row => [row.examiner1_id, row.examiner2_id].map(text).includes(id));
  const thesis = (row, role) => ({
    ...row, role, degreeLabel: degreeLabel(row),
    programLabel: `${degreeLabel(row)} ${text(row.specialization)}`.trim()
  });
  const mine = participations.filter(row => ids(row.participant_ids).includes(id));
  const byCategory = pattern => mine.filter(row => pattern.test(text(row.category)));
  return {
    member: {
      id, name: text(member.name), rank: text(member.rank), department: text(member.department),
      email: text(member.email), branch: text(member.branch),
      nationality: text(member.nationality), gender: text(member.gender)
    },
    publications: publications.filter(row => ids(row.authors_ids).includes(id))
      .map(row => ({ ...row, kind: 'بحث', status: 'منشور' })),
    theses: [...supervised.map(row => thesis(row, 'مشرف رئيسي')), ...examined.map(row => thesis(row, 'مناقش'))],
    researchSupport: [
      ...byCategory(/تحكيم/).map(row => ({ ...row, _cvType: 'تحكيم علمي' })),
      ...byCategory(/كتاب|تأليف/).map(row => ({ ...row, _cvType: 'تأليف كتب' })),
      ...byCategory(/بحوث الطلاب/).map(row => ({ ...row, _cvType: 'بحوث الطلاب' }))
    ],
    scientificEvents: byCategory(/مؤتمر|ندوة|ورشة|لقاء|دورة/),
    communityActivities: byCategory(/مجتمع|تطوع|استشار|جائزة|إعلام/),
    academicPromotions: promotions.filter(row => ids(row.participant_ids).includes(id))
      .map(row => ({ ...row, title: `الترقية إلى ${text(row.promotion_rank)}` })),
    teachingDetails: teaching.filter(record => text(record.fid) === id)
      .flatMap(record => (record.cs || []).map(course => ({
        year: String(record.y), semester: record.sn, courseName: text(course.cn),
        courseCode: text(course.cc), students: course.e, hours: course.h, degreeLabel: text(course.dg)
      }))),
    monitorings: byCategory(/مراقب/), otherActivities: [], profile: {}
  };
};

const context = {
  university: 'جامعة الطائف', college: 'كلية الشريعة',
  formatDate: value => text(value),
  yearLabel: value => `${Number(value).toLocaleString('ar-SA', { useGrouping: false })}هـ`
};
const documents = [...roster.entries()]
  .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ar'))
  .map(([id, member]) => buildCvDocument(bundleFor(id, member), { mode: 'public', locale, generatedAt: new Date().toISOString() }, context));

const filled = documents.filter(doc => doc.counts.length || doc.charts.length).length;
console.log(`${department}: ${documents.length} members, ${filled} with recorded activity`);

const batches = planPdfBatches(documents);
const parts = [];
for (const [index, batch] of batches.entries()) {
  const response = await handler(new Request('https://local/api/cv-pdf', {
    method: 'POST', body: JSON.stringify({ documents: batch, fileName: out })
  }));
  if (response.status !== 200) throw new Error(`batch ${index + 1}: HTTP ${response.status}`);
  parts.push(Buffer.from(await response.arrayBuffer()));
}
parts.forEach((part, index) => {
  const name = parts.length > 1 ? out.replace(/\.pdf$/, `-${index + 1}.pdf`) : out;
  writeFileSync(name, part);
  console.log(`${name} — ${(part.length / 1024).toFixed(0)}KB, ${(part.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length} pages`);
});
