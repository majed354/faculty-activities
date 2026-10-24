import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, Footer, AlignmentType, PageNumber, Table, TableRow, TableCell, WidthType } from 'docx';
import { chartTable } from './cv-chart-data.mjs';
import { PALETTE } from './cv-metrics.mjs';
import { term, digits, isEnglish } from './cv-i18n.mjs';

const run = (text, options = {}) => new TextRun({ text: String(text || ''), font: 'Arial', size: 23, rightToLeft: /[\u0600-\u06ff]/.test(String(text)), ...options });

// An English CV laid out right-to-left reads as a translation accident. Flow
// follows the document's language, while each run still marks its own script
// so an Arabic title inside an English CV shapes correctly.
let FLOW = { bidirectional: true, alignment: AlignmentType.RIGHT, rtl: true };
const paragraph = (text, options = {}) => new Paragraph({ children: [run(text)], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, widowControl: true, spacing: { after: 100, line: 320 }, ...options });
const link = (text, url) => new ExternalHyperlink({ link: url, children: [run(text, { color: '176B68', underline: {} })] });

export async function createWordBlob(documents) {
  const english = isEnglish(documents[0]?.locale);
  FLOW = english
    ? { bidirectional: false, alignment: AlignmentType.LEFT, rtl: false }
    : { bidirectional: true, alignment: AlignmentType.RIGHT, rtl: true };
  const w = value => term(value, english ? 'en' : 'ar');
  const sections = documents.map(doc => {
    const children = [
      paragraph(doc.modeLabel, { spacing: { after: 60 } }),
      new Paragraph({ style: 'Title', children: [run(doc.name, { bold: true, size: 38, color: '000000' })], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, keepNext: true, spacing: { after: 120 } }),
      ...(doc.englishName && doc.englishName !== doc.name ? [paragraph(doc.englishName, { bidirectional: false })] : []),
      paragraph(doc.subtitle),
      ...doc.profileItems.map(([label, value]) => new Paragraph({ children: [run(`${label}: `, { bold: true }), label === w('البريد الجامعي') ? link(value, `mailto:${value}`) : run(value)], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, spacing: { after: 80 } })),
      ...(doc.links.length ? [new Paragraph({ children: doc.links.flatMap(([label, url], index) => [...(index ? [run('  |  ')] : []), link(label, url)]), bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, spacing: { after: 150 } })] : []),
      ...(doc.counts.length ? [paragraph(doc.counts.map(([count, label]) => `${digits(count, english ? 'en' : 'ar')} ${label}`).join('  ·  '))] : [])
    ];
    for (const chart of doc.charts || []) {
      const table = chartTable(chart, english ? 'en' : 'ar');
      if (!table.rows.length) continue;
      children.push(new Paragraph({ children: [run(chart.title, { bold: true, size: 28 })], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, keepNext: true, spacing: { before: 200, after: 100 } }));
      children.push(new Table({
        width: { size: 9800, type: WidthType.DXA }, visuallyRightToLeft: FLOW.rtl,
        columnWidths: table.headings.map(() => Math.floor(9800 / table.headings.length)),
        rows: [table.headings, ...table.rows].map((cells, index) => new TableRow({
          tableHeader: index === 0, cantSplit: true,
          children: cells.map(text => new TableCell({
            ...(index === 0 ? { shading: { fill: PALETTE.primary.slice(1) } } : {}),
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [run(text, { size: 19, bold: index === 0, ...(index === 0 ? { color: 'FFFFFF' } : {}) })], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, spacing: { after: 0, line: 260 } })]
          }))
        }))
      }));
      if (chart.note) children.push(paragraph(chart.note, { spacing: { before: 60, after: 100 } }));
    }
    for (const section of doc.sections) {
      children.push(new Paragraph({ style: 'Heading1', children: [run(section.title, { bold: true, size: 28, color: '000000' })], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, keepNext: true, spacing: { before: 200, after: 120 } }));
      if (section.text) children.push(...section.text.split('\n').map(text => paragraph(text)));
      for (const entry of section.entries || []) {
        if (entry.title) children.push(new Paragraph({ children: [run(entry.title, { bold: true })], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, keepNext: !!(entry.details || entry.url || entry.source), spacing: { before: 100, after: 50 } }));
        if (entry.details) children.push(paragraph(entry.details));
        if (entry.url) children.push(new Paragraph({ children: [link(w('رابط الوصول'), entry.url)], bidirectional: FLOW.bidirectional, alignment: FLOW.alignment, spacing: { after: 70 } }));
        if (entry.source) children.push(paragraph(`${w('المصدر')}: ${entry.source}`));
      }
    }
    const date = value => new Date(value).toLocaleDateString(english ? 'en-GB' : 'ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
    children.push(paragraph(doc.coverage, { spacing: { before: 250, after: 100 } }));
    children.push(paragraph(english
      ? `${doc.updatedAt ? `CV data last updated: ${date(doc.updatedAt)} · ` : ''}Document generated: ${date(doc.generatedAt)}`
      : `${doc.updatedAt ? `آخر تحديث لبيانات السيرة: ${date(doc.updatedAt)} · ` : ''}تاريخ إعداد الملف: ${date(doc.generatedAt)}`));
    return {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1050, bottom: 1400, left: 1050, footer: 500 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(english ? 'Page ' : 'صفحة '), new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 20 })] })] }) },
      children
    };
  });
  return Packer.toBlob(new Document({
    creator: english ? 'College of Sharia — Taif University' : 'كلية الشريعة — جامعة الطائف',
    title: documents.length === 1
      ? `${documents[0].modeLabel} — ${documents[0].name}`
      : (english ? 'Academic Curricula Vitae' : 'السير الأكاديمية'),
    description: english ? 'Editable academic curricula vitae' : 'سير أكاديمية قابلة للتحرير',
    sections
  }));
}
