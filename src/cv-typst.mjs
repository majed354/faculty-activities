// Typst source for the academic CV.
//
// This is the third renderer over the document model that cv-document.mjs
// builds, alongside the HTML preview and the Word export. It owns presentation
// only: every number it prints was counted upstream.
//
// SAFETY: Typst treats `#` as the start of code, so member-supplied text is
// never pasted into markup. Every value crosses into the document as a Typst
// string literal via `lit()`, which is inert wherever it lands.

import { sectionLayout, PALETTE } from './cv-metrics.mjs';

const clean = value => String(value ?? '').trim();

export function lit(value) {
  const text = String(value ?? '')
    // Control characters would survive escaping and corrupt the source.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n?|\n/g, '\\n');
  return `"${text}"`;
}

// A digit run ending an RTL line flips without a directional anchor; the spike
// rendered "45-67." as "67-45.". Ranges get an en dash and a trailing mark.
const bidi = value => clean(value)
  .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
  .replace(/([0-9A-Za-z–)\]])$/, '$1‏');

// `lit()` is a string literal only in code mode. Dropped bare into a markup
// block it is plain text, and Typst would read constructs like `@tu.edu.sa` or
// `*word*` inside it as syntax. `say()` keeps every value in code position, so
// markup never sees member-supplied characters.
const say = (value, options = '') => `text(${options ? `${options}, ` : ''}${lit(value)})`;

const num = value => Number(value || 0).toLocaleString('ar-SA');
// Addresses are shown without their scheme, and truncated rather than wrapped,
// so a long profile URL cannot blow out the identity grid.
const shortUrl = value => {
  const text = clean(value).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return text.length > 34 ? `${text.slice(0, 33)}…` : text;
};
const pair = (...values) => `(${values.join(', ')})`;
const color = name => `rgb("${PALETTE[name] || PALETTE.primary}")`;
const arr = values => `(${values.join(', ')}${values.length === 1 ? ',' : ''})`;
const date = value => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
};


// Typst helpers are static and trusted; data reaches them only as arguments.
const PREAMBLE = `
#let INK = rgb("#1d2f31")
#let DIM = rgb("#5f7678")
#let LINE = rgb("#d8e4e2")
#let PRIMARY = rgb("${PALETTE.primary}")
#let DEEP = rgb("${PALETTE.deep}")
#let WASH = rgb("#f2f8f6")

#let tile(value, label) = box(
  fill: WASH, inset: (x: 7pt, y: 6pt), radius: 3pt, stroke: 0.5pt + LINE,
)[
  #align(center)[
    #text(size: 13pt, weight: 700, fill: PRIMARY)[#value]
    #linebreak()
    #text(size: 7.5pt, fill: DIM)[#label]
  ]
]

#let sechead(title) = block(above: 13pt, below: 7pt, width: 100%)[
  #grid(columns: (auto, 1fr), column-gutter: 7pt, align: horizon,
    text(size: 11.5pt, weight: 700, fill: DEEP)[#title],
    line(length: 100%, stroke: 0.6pt + LINE))
]

#let chartframe(title, note, body) = block(
  width: 100%, breakable: false, above: 11pt, below: 9pt,
  fill: WASH, inset: (x: 10pt, y: 9pt), radius: 3pt, stroke: 0.5pt + LINE,
)[
  #text(size: 9.5pt, weight: 600, fill: DEEP)[#title]
  #v(6pt)
  #body
  #if note != "" [ #v(5pt) #text(size: 7pt, fill: DIM)[#note] ]
]

// A grid of equal fractions spreads the columns over the full frame; a plain
// stack left two thirds of the box empty. RTL ordering puts the earliest year
// at the right margin, so the series reads with the text.
#let groupbars(groups, maxv, swatch) = grid(
  columns: (auto, 1fr), column-gutter: 8pt, row-gutter: 7pt, align: (horizon, horizon),
  ..groups.map(g => (
    text(size: 8.5pt, weight: 600)[#g.at(0)],
    stack(dir: ttb, spacing: 3pt, ..g.at(1).map(b => grid(
      columns: (1fr, 16pt), column-gutter: 6pt, align: (horizon, horizon + left),
      box(width: 100%, height: 8pt, radius: 1.5pt, fill: white, stroke: 0.4pt + LINE)[
        #place(top + right, rect(width: 100% * calc.max(b.at(0) / maxv, 0.03), height: 8pt, radius: 1.5pt, fill: b.at(2), stroke: none))],
      text(size: 7.5pt, fill: DIM)[#b.at(1)])))
  )).flatten())

#let swatches(items) = text(size: 7.5pt, fill: DIM)[
  #items.map(it => box(baseline: 0.1em, [#box(width: 6pt, height: 6pt, radius: 1pt, fill: it.at(1)) #h(3pt) #it.at(0)])).join(h(9pt))]

#let barlist(rows, maxv, unit) = grid(
  columns: (auto, 1fr, auto), column-gutter: 7pt, row-gutter: 5pt, align: horizon,
  ..rows.map(r => (
    text(size: 8pt)[#r.at(0)],
    box(width: 100%, height: 7pt, radius: 1.5pt, fill: white, stroke: 0.4pt + LINE)[
      #place(top + right, rect(width: 100% * calc.max(r.at(1) / maxv, 0.02), height: 7pt, radius: 1.5pt, fill: PRIMARY, stroke: none))],
    text(size: 7.5pt, fill: DIM)[#r.at(2) #unit]
  )).flatten())

#let timeline(events) = grid(
  columns: (auto, auto, 1fr), column-gutter: 8pt, row-gutter: 6pt, align: (horizon, horizon, top),
  ..events.map(e => (
    text(size: 8pt, weight: 600, fill: PRIMARY)[#e.at(0)],
    box(width: 6pt, height: 6pt, radius: 3pt, fill: PRIMARY),
    block[#text(size: 8.5pt, weight: 600)[#e.at(1)]#if e.at(2) != "" [ #linebreak() #text(size: 7.5pt, fill: DIM)[#e.at(2)]]]
  )).flatten())

// Boxes joined by inline spacing flow and wrap as one paragraph. Joining with
// any block-level spacing instead put every tag on its own line.
#let tags(items) = {
  set par(leading: 1.15em, justify: false)
  items.map(it => box(
    fill: WASH, inset: (x: 6pt, y: 3.5pt), radius: 2pt, stroke: 0.4pt + LINE,
    text(size: 8.5pt, it))).join(h(4pt))
}

// Two layouts rather than a reserved slot: without a portrait the identity
// text uses the full band, so a member who supplies none sees no gap.
#let masthead(kind, name, english, subtitle, portrait) = {
  let identity = {
    text(size: 8pt, fill: rgb(255, 255, 255, 170), tracking: 0.5pt, kind)
    v(3pt)
    text(size: 20pt, weight: 700, fill: white, name)
    if english != "" { v(2pt); text(size: 10pt, fill: rgb(255, 255, 255, 200), dir: ltr, english) }
    v(4pt)
    text(size: 9.5pt, fill: rgb(255, 255, 255, 215), subtitle)
  }
  block(width: 100%, fill: DEEP, inset: (x: 13pt, y: 12pt), radius: 3pt)[
    #if portrait == none { identity } else {
      grid(columns: (1fr, auto), column-gutter: 14pt, align: horizon,
        identity,
        box(width: 24mm, height: 24mm, radius: 50%, clip: true, stroke: 1pt + rgb(255, 255, 255, 90),
          image(portrait, width: 24mm, height: 24mm, fit: "cover")))
    }
  ]
}

#let record(title, details, url, source) = block(above: 5pt, below: 5pt, breakable: false)[
  #if title != "" [#text(size: 9.5pt, weight: 600)[#title]]
  #if details != "" [#if title != "" [#linebreak()] #text(size: 8.5pt, fill: DIM)[#details]]
  #if url != "" [ #h(3pt) #text(size: 8pt)[#link(url)[#text(fill: PRIMARY)[رابط الوصول]]]]
  #if source != "" [#linebreak() #text(size: 7.5pt, fill: DIM, style: "italic")[المصدر: #source]]
]
`;

function renderChart(chart) {
  const frame = (body, note = '') => `#chartframe(${lit(chart.title)}, ${lit(note)}, ${body})`;
  if (chart.kind === 'grouped-bars') {
    const groups = chart.groups.map(group => pair(
      lit(bidi(group.label)),
      arr(group.bars.map(bar => pair(bar.value, lit(num(bar.value)), color(bar.color), lit(bar.label))))
    ));
    const legend = arr(chart.legend.map(item => pair(lit(item.label), color(item.color))));
    return frame(`[#groupbars(${arr(groups)}, ${chart.max}, none) #v(6pt) #swatches(${legend})]`, chart.note || '');
  }
  if (chart.kind === 'bars') {
    const rows = chart.rows.map(row => `(${lit(row.label)}, ${row.value}, ${lit(num(row.value))})`);
    return frame(`barlist(${arr(rows)}, ${chart.max}, ${lit(chart.unit || '')})`, chart.note || '');
  }
  if (chart.kind === 'timeline') {
    const events = chart.events.map(event => `(${lit(event.yearLabel)}, ${lit(bidi(event.title))}, ${lit(bidi([event.detail, event.endLabel].filter(Boolean).join(' · ')))})`);
    return frame(`timeline(${arr(events)})`);
  }
  return '';
}

function renderSection(section) {
  const layout = sectionLayout(section);
  const body = [`#sechead(${lit(section.title)})`];
  // What every record shares is stated once here, so the rows below carry only
  // what actually distinguishes them.
  const preface = [
    section.programme && `${num(section.programme.covered)} من ${num(section.programme.total)} ضمن سلسلة واحدة: \u00ab${section.programme.label}\u00bb`,
    section.shared?.length && section.shared.join(' \u00b7 ')
  ].filter(Boolean);
  for (const line of preface) body.push(`#${say(bidi(line), 'size: 8pt, fill: DIM')}\n#v(2pt)`);
  if (section.text) body.push(`#par(justify: true)[#${say(bidi(section.text), 'size: 9.5pt')}]`);
  const entries = section.entries || [];
  if (layout === 'cited') {
    const items = entries.map(row => {
      const title = clean(row.title);
      const details = clean(row.details);
      const parts = [`#${say(bidi(title || details), 'size: 9.5pt, weight: 600')}`];
      if (title && details) parts.push(`#linebreak() #${say(bidi(details), 'size: 8.5pt, fill: DIM')}`);
      if (row.url) parts.push(`#h(3pt) #text(size: 8pt)[#link(${lit(row.url)})[#text(fill: PRIMARY)[رابط]]]`);
      if (row.source) parts.push(`#linebreak() #${say(`المصدر: ${bidi(row.source)}`, 'size: 7.5pt, fill: DIM, style: "italic"')}`);
      return `[${parts.join(' ')}]`;
    });
    body.push(`#enum(numbering: "١.", indent: 0pt, body-indent: 6pt, spacing: 7pt, ${items.join(', ')})`);
  } else if (layout === 'tags') {
    body.push(`#tags(${arr(entries.map(row => lit(bidi(row.title))))})`);
  } else if (layout === 'columns') {
    body.push(`#columns(2, gutter: 12pt)[${entries.map(row => `#${say(`• ${bidi(row.title)}`, 'size: 9pt')}#linebreak()`).join('')}]`);
  } else if (entries.length) {
    body.push(entries.map(row => `#record(${lit(bidi(row.title))}, ${lit(bidi(row.details))}, ${lit(row.url || '')}, ${lit(bidi(row.source))})`).join('\n'));
  }
  return body.join('\n');
}

function renderDocument(doc) {
  const out = [];
  const english = clean(doc.englishName);
  out.push(`#masthead(${lit(doc.modeLabel)}, ${lit(doc.name)}, ${lit(english)}, ${lit(bidi(doc.subtitle))}, ${doc.portraitPath ? lit(doc.portraitPath) : 'none'})`);

  if (doc.profileItems.length || doc.links.length) {
    const items = doc.profileItems.map(([label, value]) =>
      `[#${say(label, 'size: 7.5pt, fill: DIM')} #linebreak() #${say(bidi(value), 'size: 9pt')}]`);
    // The caption already names the service; repeating it as the link text said
    // "ORCID / ORCID". Showing the address identifies the specific profile.
    const links = doc.links.map(([label, url]) =>
      `[#${say(label, 'size: 7.5pt, fill: DIM')} #linebreak() #text(size: 8pt)[#link(${lit(url)})[#${say(shortUrl(url), 'fill: PRIMARY, dir: ltr')}]]]`);
    const cells = [...items, ...links];
    out.push(`#v(8pt)\n#grid(columns: ${Math.min(cells.length, 3)}, column-gutter: 14pt, row-gutter: 8pt, ${cells.join(', ')})`);
  }

  if (doc.counts.length) {
    out.push(`#v(10pt)\n#grid(columns: ${doc.counts.length}, column-gutter: 6pt, ${doc.counts.map(([count, label]) => `tile(${lit(num(count))}, ${lit(label)})`).join(', ')})`);
  }

  for (const chart of doc.charts || []) out.push(renderChart(chart));
  for (const section of doc.sections) out.push(renderSection(section));

  const stamp = [doc.updatedAt && `آخر تحديث لبيانات السيرة: ${date(doc.updatedAt)}`, `تاريخ إعداد الملف: ${date(doc.generatedAt)}`].filter(Boolean).join(' · ');
  out.push(`#v(12pt)\n#line(length: 100%, stroke: 0.5pt + LINE)\n#v(5pt)
#${say(bidi(doc.coverage), 'size: 7.5pt, fill: DIM')}
#linebreak()
#${say(stamp, 'size: 7.5pt, fill: DIM')}`);
  return out.join('\n');
}

export function renderCvTypst(documents, options = {}) {
  const list = Array.isArray(documents) ? documents : [documents];
  if (!list.length) throw new Error('لا توجد سيرة لتوليدها.');
  const font = options.font || 'Readex Pro';
  const title = list.length === 1 ? `${list[0].modeLabel} — ${list[0].name}` : 'السير الأكاديمية';
  return `#set document(title: ${lit(title)}, author: ${lit(list[0].name)})
#set page(
  paper: "a4", margin: (top: 16mm, bottom: 17mm, x: 16mm),
  footer: context align(center, text(size: 8pt, fill: rgb("#5f7678"))[
    صفحة #numbering("١", ..counter(page).get())
  ]),
)
#set text(font: (${lit(font)}, "Noto Naskh Arabic", "Arial"), lang: "ar", dir: rtl, size: 10pt, fill: rgb("#1d2f31"))
#set par(justify: true, leading: 0.68em, spacing: 0.75em)
#show link: it => it
${PREAMBLE}
${list.map(renderDocument).join('\n#pagebreak()\n')}
`;
}
