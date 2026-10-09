// Dev harness: renders a representative CV without the browser or the deployed
// function, so the document design can be iterated on directly.
//   node scripts/preview-cv.mjs           -> /tmp/cv-preview.pdf and .html
import { writeFileSync, readFileSync } from 'node:fs';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { buildCvDocument, renderCvDocument } from '../src/cv-document.mjs';
import { renderCvTypst } from '../src/cv-typst.mjs';
import { bundle } from './cv-fixture.mjs';

const doc = buildCvDocument(bundle, { mode: 'public', generatedAt: '2026-10-09T10:11:00Z' }, {
  university: 'جامعة الطائف', college: 'كلية الشريعة',
  formatDate: value => String(value || ''),
  yearLabel: value => `${Number(value).toLocaleString('ar-SA', { useGrouping: false })}هـ`
});

console.log('charts:', doc.charts.map(chart => `${chart.id}/${chart.kind}`).join(', ') || '(none)');
console.log('sections:', doc.sections.length, '| counts:', doc.counts.map(([n, label]) => `${n} ${label}`).join(' · '));

const source = renderCvTypst(doc);
writeFileSync('/tmp/cv-source.typ', source);
const compiler = NodeCompiler.create({ fontArgs: [{ fontPaths: ['./assets/fonts'] }] });
const started = Date.now();
const pdf = compiler.pdf({ mainFileContent: source });
if (!pdf) { console.error('COMPILE FAILED'); console.error(JSON.stringify(compiler.fetchDiagnostics?.(), null, 2)); process.exit(1); }
writeFileSync('/tmp/cv-preview.pdf', Buffer.from(pdf));
console.log(`PDF  /tmp/cv-preview.pdf — ${(pdf.length / 1024).toFixed(0)}KB in ${Date.now() - started}ms`);

const css = readFileSync('cv-studio.css', 'utf8');
const fonts = ['400', '500', '600', '700'].map(weight =>
  `@font-face{font-family:"Readex Pro";font-weight:${weight};src:url("data:font/ttf;base64,${readFileSync(`assets/fonts/ReadexPro-${weight}.ttf`).toString('base64')}")}`).join('');
writeFileSync('/tmp/cv-preview.html', `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة السيرة</title>
<style>${fonts}${css}body{background:#eef3f2;padding:20px;font-family:"Readex Pro",Arial,sans-serif}</style>
</head><body class="cv-print-body">${renderCvDocument(doc)}</body></html>`);
console.log('HTML /tmp/cv-preview.html');
