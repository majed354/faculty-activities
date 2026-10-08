import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, Footer, AlignmentType, PageNumber } from 'docx';

const run = (text, options = {}) => new TextRun({ text: String(text || ''), font: 'Arial', size: 23, rightToLeft: /[\u0600-\u06ff]/.test(String(text)), ...options });
const paragraph = (text, options = {}) => new Paragraph({ children: [run(text)], bidirectional: true, alignment: AlignmentType.RIGHT, widowControl: true, spacing: { after: 100, line: 320 }, ...options });
const link = (text, url) => new ExternalHyperlink({ link: url, children: [run(text, { color: '176B68', underline: {} })] });

export async function createWordBlob(documents) {
  const sections = documents.map(doc => {
    const children = [
      paragraph(doc.modeLabel, { spacing: { after: 60 } }),
      new Paragraph({ style: 'Title', children: [run(doc.name, { bold: true, size: 38, color: '000000' })], bidirectional: true, alignment: AlignmentType.RIGHT, keepNext: true, spacing: { after: 120 } }),
      ...(doc.englishName ? [paragraph(doc.englishName, { bidirectional: false })] : []),
      paragraph(doc.subtitle),
      ...doc.profileItems.map(([label, value]) => new Paragraph({ children: [run(`${label}: `, { bold: true }), label === 'البريد الجامعي' ? link(value, `mailto:${value}`) : run(value)], bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 80 } })),
      ...(doc.links.length ? [new Paragraph({ children: doc.links.flatMap(([label, url], index) => [...(index ? [run('  |  ')] : []), link(label, url)]), bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 150 } })] : []),
      ...(doc.counts.length ? [paragraph(doc.counts.map(([count, label]) => `${count.toLocaleString('ar-SA')} ${label}`).join('  ·  '))] : [])
    ];
    for (const section of doc.sections) {
      children.push(new Paragraph({ style: 'Heading1', children: [run(section.title, { bold: true, size: 28, color: '000000' })], bidirectional: true, alignment: AlignmentType.RIGHT, keepNext: true, spacing: { before: 200, after: 120 } }));
      if (section.text) children.push(...section.text.split('\n').map(text => paragraph(text)));
      for (const entry of section.entries || []) {
        children.push(new Paragraph({ children: [run(entry.title, { bold: true })], bidirectional: true, alignment: AlignmentType.RIGHT, keepNext: !!(entry.details || entry.url || entry.source), spacing: { before: 100, after: 50 } }));
        if (entry.details) children.push(paragraph(entry.details));
        if (entry.url) children.push(new Paragraph({ children: [link('رابط الوصول', entry.url)], bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 70 } }));
        if (entry.source) children.push(paragraph(`المصدر: ${entry.source}`));
      }
    }
    const date = value => new Date(value).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
    children.push(paragraph(doc.coverage, { spacing: { before: 250, after: 100 } }));
    children.push(paragraph(`${doc.updatedAt ? `آخر تحديث لبيانات السيرة: ${date(doc.updatedAt)} · ` : ''}تاريخ إعداد الملف: ${date(doc.generatedAt)}`));
    return {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1050, bottom: 1400, left: 1050, footer: 500 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('صفحة '), new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 20 })] })] }) },
      children
    };
  });
  return Packer.toBlob(new Document({ creator: 'كلية الشريعة — جامعة الطائف', title: documents.length === 1 ? `السيرة الأكاديمية — ${documents[0].name}` : 'السير الأكاديمية', description: 'سير أكاديمية قابلة للتحرير', sections }));
}
