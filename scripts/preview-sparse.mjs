// Renders the CV across a range of completeness, from an untouched profile to
// a full one, so graceful degradation can be inspected rather than assumed.
//   node scripts/preview-sparse.mjs
import { writeFileSync } from 'node:fs';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { buildCvDocument } from '../src/cv-document.mjs';
import { renderCvTypst } from '../src/cv-typst.mjs';
import { bundle as full } from './cv-fixture.mjs';

const context = {
  university: 'جامعة الطائف', college: 'كلية الشريعة',
  formatDate: value => String(value || ''),
  yearLabel: value => `${Number(value).toLocaleString('ar-SA', { useGrouping: false })}هـ`
};

const bare = {
  member: { id: '9', name: 'د. فلان بن فلان الفلاني', rank: 'أستاذ مساعد', department: 'القراءات', email: '' },
  scopeYear: 'all',
  publications: [], theses: [], researchSupport: [], scientificEvents: [],
  communityActivities: [], academicPromotions: [], teachingDetails: [],
  monitorings: [], otherActivities: [], profile: {}
};

const cases = [
  ['أ — ملف لم يُستكمل إطلاقًا ولا سجلات نشاط', bare],
  ['ب — نبذة فقط', { ...bare, profile: { biography: 'عضو هيئة تدريس حديث التعيين في قسم القراءات، يهتم بالدراسات القرآنية.' } }],
  ['ج — بحث واحد ومؤهل واحد', {
    ...bare,
    publications: [{ title: 'أثر السياق في ترجيح أقوال المفسرين', journal: 'مجلة الدراسات القرآنية', year: '1447', kind: 'بحث', status: 'منشور' }],
    profile: { education: [{ degree: 'دكتوراه', specialization: 'التفسير', institution: 'أم القرى', year: '1446' }] }
  }],
  ['د — مهارتان فقط (دون الحد الذي يستحق وسومًا)', { ...bare, profile: { skills: [{ name: 'التعلم النشط' }, { name: 'تصميم المقررات' }] } }],
  ['هـ — خبرتان بلا مدة (دون حد المخطط)', { ...bare, profile: { expertise: [{ domain: 'الجودة' }, { domain: 'الاعتماد' }] } }],
  ['و — ملف مكتمل', full]
];

const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: ['./assets/fonts'] }] });
const docs = [];
for (const [label, data] of cases) {
  const doc = buildCvDocument(data, { mode: 'public', generatedAt: '2026-10-09T10:00:00Z' }, context);
  docs.push({ ...doc, modeLabel: label });
  console.log(`${label}\n   محاور: ${String(doc.sections.length).padStart(2)} | مخططات: ${doc.charts.length} | مؤشرات: ${doc.counts.length}`
    + `${doc.sections.length === 0 && doc.charts.length === 0 ? '  <= لا شيء سوى الترويسة' : ''}`);
}

const pdf = compiler.pdf({ mainFileContent: renderCvTypst(docs) });
if (!pdf) { console.error(JSON.stringify(compiler.fetchDiagnostics?.(), null, 2)); process.exit(1); }
writeFileSync('/tmp/cv-sparse.pdf', Buffer.from(pdf));
console.log(`\nOK /tmp/cv-sparse.pdf — ${(pdf.length / 1024).toFixed(0)}KB`);
