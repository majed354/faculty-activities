// Editable representations of the chart model for Word and CSV. These only
// format values already on doc.charts; they never recount activity records.
const number = value => Number(value || 0).toLocaleString('ar-SA');

export function chartTable(chart) {
  if (chart.kind === 'stacked-bars') return {
    headings: ['السنة', ...chart.legend.map(item => item.label)],
    rows: chart.rows.map(row => [row.label, ...row.parts.map(part => number(part.value))])
  };
  if (chart.kind === 'split') return {
    headings: ['نوع المخرج', 'العدد'],
    rows: chart.slices.map(slice => [slice.label, number(slice.value)])
  };
  if (chart.kind === 'bars') return {
    headings: [chart.id === 'expertise' ? 'مجال الخبرة' : 'السنة', chart.unit || 'القيمة'],
    rows: chart.rows.map(row => [row.label, number(row.value)])
  };
  if (chart.kind === 'timeline') return {
    headings: ['السنة', 'المؤهل أو الوظيفة', 'التفاصيل'],
    rows: chart.events.map(event => [event.yearLabel, event.title, [event.detail, event.endLabel].filter(Boolean).join(' · ')])
  };
  return { headings: [], rows: [] };
}

export function chartCsvRows(doc) {
  return (doc.charts || []).flatMap(chart => {
    const table = chartTable(chart);
    return [
      ...table.rows.map(([label, ...values]) => [doc.name, chart.title, label, values.map((value, index) => `${table.headings[index + 1]}: ${value}`).join(' · '), '', '']),
      ...(chart.note ? [[doc.name, chart.title, '', chart.note, '', '']] : [])
    ];
  });
}
