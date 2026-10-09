// Chart models for the academic CV.
//
// These are computed once inside buildCvDocument and travel on the document, so
// the preview, Word and the Typst PDF all draw the same numbers. Each builder
// returns null when the data cannot carry a chart: a bar chart of a single year,
// or a split with nothing to compare, says less than the list it would replace.

// Chart colours live here because every renderer must draw the same series in
// the same colour; a legend that disagrees with the PDF is worse than none.
export const PALETTE = {
  primary: '#176b68', deep: '#0d3f3d', accent: '#b9892f',
  muted: '#6f9c99', soft: '#bcd6d2'
};

const clean = value => String(value ?? '').trim();
const arabic = value => Number(value || 0).toLocaleString('ar-SA');
// Years are labels, not quantities: grouping renders ١٤٤٧ as ١٬٤٤٧.
const arabicYear = value => /^\d{3,4}$/.test(clean(value))
  ? Number(value).toLocaleString('ar-SA', { useGrouping: false })
  : clean(value);

// Activity rows carry a Hijri year in `year`; dates sometimes hold it instead.
const yearOf = row => {
  const direct = clean(row?.year);
  if (/^\d{3,4}$/.test(direct)) return direct;
  const match = clean(row?.date || row?.publish_date || row?.defense_date).match(/\b(1[0-5]\d{2})\b/);
  return match ? match[1] : '';
};

const countBy = (rows, pick) => {
  const counts = new Map();
  for (const row of rows || []) {
    const key = pick(row);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

// Years run oldest to newest so a trajectory reads naturally, and gap years are
// filled with zero rather than dropped — a silent gap would overstate output.
function yearSeries(groups) {
  const present = [...new Set(groups.flatMap(group => [...group.counts.keys()]))].map(Number).filter(Number.isFinite);
  if (!present.length) return [];
  const span = [];
  for (let year = Math.min(...present); year <= Math.max(...present); year += 1) span.push(String(year));
  return span.length <= 12 ? span : present.map(String).sort((a, b) => Number(a) - Number(b));
}

export function buildOutputTrend(bundle, parts) {
  const groups = [
    { label: 'بحوث وكتب', color: 'primary', counts: countBy(parts.published.concat(parts.books), yearOf) },
    { label: 'إشراف', color: 'accent', counts: countBy(parts.supervisions, yearOf) },
    { label: 'مناقشة', color: 'muted', counts: countBy(parts.discussions, yearOf) }
  ].filter(group => group.counts.size);
  const years = yearSeries(groups);
  if (years.length < 2 || !groups.length) return null;
  const rows = years.map(year => ({
    label: arabicYear(year),
    parts: groups.map(group => ({ label: group.label, color: group.color, value: group.counts.get(year) || 0 }))
  }));
  const max = Math.max(...rows.map(row => row.parts.reduce((sum, part) => sum + part.value, 0)));
  if (!max) return null;
  return {
    kind: 'stacked-bars', id: 'trend', title: 'الإنتاج العلمي عبر السنوات',
    note: 'بالسنة الهجرية، حسب السجلات المتاحة.',
    legend: groups.map(group => ({ label: group.label, color: group.color })),
    rows, max
  };
}

export function buildContribution(parts) {
  const slices = [
    { label: 'بحوث منشورة', value: parts.published.length, color: 'primary' },
    { label: 'كتب وفصول وتحقيقات', value: parts.books.length, color: 'accent' },
    { label: 'إشراف على الرسائل', value: parts.supervisions.length, color: 'deep' },
    { label: 'مناقشة الرسائل', value: parts.discussions.length, color: 'muted' },
    { label: 'تحكيم علمي', value: parts.reviewing.length, color: 'soft' }
  ].filter(slice => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  // One slice is a number, not a composition.
  if (slices.length < 2 || !total) return null;
  return {
    kind: 'split', id: 'contribution', title: 'تركيبة الإنتاج العلمي',
    slices: slices.map(slice => ({ ...slice, share: slice.value / total })),
    total, totalLabel: 'مخرجًا علميًّا'
  };
}

export function buildExpertise(profile) {
  // Expertise durations are the clearest quantitative claim a member makes about
  // themselves, and the flat list wastes a page on them.
  const rows = (profile.expertise || [])
    .map(row => ({ label: clean(row.domain), value: Number(row.years) || 0 }))
    .filter(row => row.label && row.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length < 3) return null;
  return {
    kind: 'bars', id: 'expertise', title: 'مجالات الخبرة ومدتها',
    unit: 'سنة', rows: rows.slice(0, 12), max: Math.max(...rows.map(row => row.value))
  };
}

export function buildTeachingLoad(bundle) {
  const rows = bundle.teachingDetails || [];
  const byYear = new Map();
  for (const row of rows) {
    const year = yearOf(row);
    if (!year) continue;
    const current = byYear.get(year) || { sections: 0, students: 0 };
    current.sections += 1;
    current.students += Number(row.students) || 0;
    byYear.set(year, current);
  }
  if (byYear.size < 2) return null;
  const years = [...byYear.keys()].sort((a, b) => Number(a) - Number(b));
  const series = years.map(year => ({ label: arabicYear(year), value: byYear.get(year).sections, extra: byYear.get(year).students }));
  const max = Math.max(...series.map(row => row.value));
  if (!max) return null;
  const students = years.reduce((sum, year) => sum + byYear.get(year).students, 0);
  return {
    kind: 'bars', id: 'teaching', title: 'العبء التدريسي عبر السنوات',
    unit: 'شعبة', note: students ? `إجمالي الطلاب المسجلين: ${arabic(students)}.` : '',
    rows: series, max
  };
}

export function buildCareerTimeline(bundle, profile) {
  const events = [
    ...(profile.education || []).map(row => ({ year: clean(row.year), title: clean(row.degree), detail: clean(row.institution), kind: 'education' })),
    ...(profile.appointments || []).map(row => ({ year: clean(row.start), title: clean(row.role), detail: clean(row.institution), kind: 'appointment', end: clean(row.end) })),
    ...(bundle.academicPromotions || []).map(row => ({ year: yearOf(row), title: clean(row.title), detail: clean(row.location), kind: 'promotion' }))
  ].filter(event => event.year && event.title);
  if (events.length < 3) return null;
  events.sort((a, b) => Number(a.year) - Number(b.year) || a.title.localeCompare(b.title, 'ar'));
  return {
    kind: 'timeline', id: 'career', title: 'المسار العلمي والوظيفي',
    events: events.map(event => ({
      ...event, yearLabel: arabicYear(event.year),
      // An open-ended post already reads "حتى الآن"; prefixing again stutters.
      endLabel: event.end ? (/^حتى/.test(event.end) ? event.end : `حتى ${arabicYear(event.end)}`) : ''
    }))
  };
}

// Bibliographic axes earn a numbered, hanging-indent list: a reviewer counts
// and cites them. Everything else is classified by the shape of its own
// entries, so a renderer never has to guess per section.
const CITED = new Set([
  'البحوث المنشورة', 'الكتب والفصول والتحقيقات',
  'إنتاج علمي مقبول للنشر أو قيد العمل', 'إنتاج علمي إضافي'
]);

export function sectionLayout(section) {
  const entries = section.entries || [];
  if (!entries.length) return section.text ? 'prose' : 'empty';
  if (CITED.has(section.title)) return 'cited';
  // Bare labels with no supporting detail read as tags, not as records; a
  // bullet each would spend a page on fifteen one-word skills.
  const bare = entries.every(row => !row.details && !row.url && !row.source);
  const terse = entries.every(row => clean(row.title).length <= 32);
  if (bare && terse && entries.length >= 4) return 'tags';
  if (bare && entries.length >= 4) return 'columns';
  return 'list';
}

// `parts` carries the classifications buildCvDocument already computed, so the
// charts count exactly what the sections list — no second, divergent pass.
// `parts.expertiseChart` is passed in because the caller needs the same verdict
// to decide whether the expertise list still earns its place.
export function buildCvMetrics(bundle, profile, parts) {
  return [
    buildOutputTrend(bundle, parts),
    buildContribution(parts),
    parts.expertiseChart ?? buildExpertise(profile),
    buildTeachingLoad(bundle),
    buildCareerTimeline(bundle, profile)
  ].filter(Boolean);
}
