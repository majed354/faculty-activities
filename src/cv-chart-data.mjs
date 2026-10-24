// Editable representations of the chart model for Word and CSV. These only
// format values already on doc.charts; they never recount activity records.
import { term, digits } from './cv-i18n.mjs';

const L = (locale, ar, en) => (locale === 'en' ? en : ar);

export function chartTable(chart, locale = 'ar') {
  const number = value => digits(value, locale);
  const head = (ar, en) => L(locale, ar, en);

  if (chart.kind === 'grouped-bars') return {
    headings: [head('الدرجة', 'Degree'), ...chart.legend.map(item => item.label)],
    rows: chart.groups.map(group => [
      group.label,
      // A group omits a bar whose value is zero, so columns are filled by the
      // legend's order rather than by position — otherwise a missing bar would
      // shift the next one into the wrong column.
      ...chart.legend.map(item => number(group.bars.find(bar => bar.label === item.label)?.value || 0))
    ])
  };
  if (chart.kind === 'bars') return {
    headings: [
      chart.id === 'expertise' ? head('مجال الخبرة', 'Area of Expertise') : head('السنة', 'Year'),
      chart.unit || head('القيمة', 'Value')
    ],
    rows: chart.rows.map(row => [row.label, number(row.value)])
  };
  if (chart.kind === 'timeline') return {
    headings: [head('السنة', 'Year'), head('المؤهل أو الوظيفة', 'Qualification or Post'), head('التفاصيل', 'Detail')],
    rows: chart.events.map(event => [event.yearLabel, event.title, [event.detail, event.endLabel].filter(Boolean).join(' · ')])
  };
  return { headings: [], rows: [] };
}

export function chartCsvRows(doc) {
  const locale = doc.locale === 'en' ? 'en' : 'ar';
  return (doc.charts || []).flatMap(chart => {
    const table = chartTable(chart, locale);
    return [
      ...table.rows.map(([label, ...values]) => [doc.name, chart.title, label, values.map((value, index) => `${table.headings[index + 1]}: ${value}`).join(' · '), '', '']),
      ...(chart.note ? [[doc.name, chart.title, '', chart.note, '', '']] : [])
    ];
  });
}
