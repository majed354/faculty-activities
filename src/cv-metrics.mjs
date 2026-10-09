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

// A master's degree is examined as a رسالة علمية only before 1441 or inside the
// العقيدة programme; otherwise it is a مشروع بحثي. app.js owns that rule and
// stamps its verdict on `degreeLabel`, so this reads the verdict instead of
// deriving a second, divergent one — `type` alone cannot tell the two apart.
export const THESIS_KINDS = [
  { id: 'phd', label: 'رسالة دكتوراه' },
  { id: 'masters-thesis', label: 'رسالة ماجستير' },
  { id: 'masters-project', label: 'مشروع بحثي (ماجستير)' },
  // A record whose degree was never recorded is counted under its own heading
  // rather than assigned one, and never dropped: the total must still add up.
  { id: 'unspecified', label: 'غير محدد الدرجة' }
];

export function classifyThesis(row) {
  const type = clean(row?.type);
  const degree = clean(row?.degreeLabel);
  if (type === 'دكتوراه' || /دكتوراه/.test(degree)) return 'phd';
  if (type === 'ماجستير') return degree === 'مشروع بحثي' ? 'masters-project' : 'masters-thesis';
  if (/مشروع/.test(degree)) return 'masters-project';
  if (/رسالة/.test(degree)) return 'masters-thesis';
  return 'unspecified';
}

// Supervision is evidence of standing, but twenty-three near-identical project
// titles say less than the counts do. The counts are kept and the list is not,
// split by degree because supervising a doctorate is not the same claim as
// supervising a master's project.
export function buildSupervisionSplit(parts) {
  const tally = kind => ({
    supervised: parts.supervisions.filter(row => classifyThesis(row) === kind).length,
    examined: parts.discussions.filter(row => classifyThesis(row) === kind).length
  });
  const groups = THESIS_KINDS
    .map(kind => ({ label: kind.label, ...tally(kind.id) }))
    .filter(group => group.supervised || group.examined)
    .map(group => ({
      label: group.label,
      bars: [
        { label: 'إشراف', value: group.supervised, color: 'primary' },
        { label: 'مناقشة', value: group.examined, color: 'accent' }
      ].filter(bar => bar.value > 0)
    }));
  if (!groups.length) return null;
  const max = Math.max(...groups.flatMap(group => group.bars.map(bar => bar.value)));
  if (!max) return null;
  const total = groups.reduce((sum, group) => sum + group.bars.reduce((inner, bar) => inner + bar.value, 0), 0);
  return {
    kind: 'grouped-bars', id: 'supervision', title: 'الإشراف والمناقشة حسب الدرجة',
    note: `الإجمالي: ${arabic(total)} رسالة ومشروعًا.`,
    legend: [{ label: 'إشراف', color: 'primary' }, { label: 'مناقشة', color: 'accent' }],
    groups, max
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

// A supervision list repeats its own constants: role, degree, programme and
// university are identical down all twenty-three rows, and only the student,
// the scope and the date actually differ. Anything present in *every* entry is
// a property of the section, so it is stated once under the heading and struck
// from the rows. Nothing is discarded — the same facts are said in one place.
const SEPARATOR = ' · ';
export function hoistSharedDetails(entries) {
  if (entries.length < 3) return { shared: [], entries };
  const parts = entries.map(row => clean(row.details).split(SEPARATOR).map(clean).filter(Boolean));
  if (parts.some(list => !list.length)) return { shared: [], entries };
  const shared = parts[0].filter(token => parts.every(list => list.includes(token)));
  // Striking every token would leave rows that say nothing at all.
  if (!shared.length || parts.some(list => list.every(token => shared.includes(token)))) {
    return { shared: [], entries };
  }
  return {
    shared,
    entries: entries.map((row, index) => ({
      ...row, details: parts[index].filter(token => !shared.includes(token)).join(SEPARATOR)
    }))
  };
}

// Titles vary in wording even inside one supervised series — "تصنيف" against
// "تصنيفات", "لابن الجوزي" against "عند ابن الجوزي في كتابه" — so matching is
// done on normalised token runs, never on the literal string.
const fold = word => word.normalize('NFKC')
  .replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[ىئ]/g, 'ي').replace(/ة/g, 'ه');

// Folding is for comparison only. The surface spelling is kept alongside it so
// a detected phrase is shown as the member actually wrote it — a heading
// reading "التفسيريه" would be the normaliser talking, not the CV.
const tokenize = title => {
  const words = clean(title).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return { words, keys: words.map(fold) };
};

// Words that locate a record inside a series rather than name the series. They
// are shared by every title precisely because they are scaffolding, so a label
// must not begin or end on one: "… لابن الجوزي سورة" names nothing.
const SCOPE = new Set(['من', 'الي', 'في', 'عند', 'سوره', 'الايه', 'ايه', 'بدايه', 'نهايه', 'حتي', 'علي', 'مع', 'و']);
const trimScope = phrase => {
  const words = phrase.split(' ');
  while (words.length && SCOPE.has(fold(words[words.length - 1]))) words.pop();
  while (words.length && SCOPE.has(fold(words[0]))) words.shift();
  return words.join(' ');
};

const runsOf = (keys, minimum = 2) => {
  const runs = new Map();
  for (let start = 0; start < keys.length; start += 1) {
    for (let end = start + minimum; end <= keys.length; end += 1) {
      const run = keys.slice(start, end).join(' ');
      if (!runs.has(run)) runs.set(run, start);
    }
  }
  return runs;
};

// Returns the phrases the titles share, in the order they appear, so a reader
// sees the series these records belong to rather than twenty-three
// near-identical lines. Coverage is preferred over length: a shorter phrase
// true of every record beats a longer one true of three quarters.
export function detectProgramme(entries, { minimum = 6 } = {}) {
  if (entries.length < minimum) return null;
  const parsed = entries.map(row => tokenize(row.title)).filter(item => item.keys.length);
  if (parsed.length < minimum) return null;
  const maps = parsed.map(item => runsOf(item.keys));

  for (const threshold of [1, 0.9, 0.8, 0.7]) {
    const needed = Math.ceil(parsed.length * threshold);
    const common = [...maps[0].keys()].filter(run => maps.filter(map => map.has(run)).length >= needed);
    // Keep only maximal runs: "زاد المسير" adds nothing beside "في زاد المسير".
    const maximal = common.filter(run => !common.some(other => other !== run && other.includes(run)));
    const placed = maximal.map(run => ({ run, at: maps[0].get(run) })).sort((a, b) => a.at - b.at);
    if (!placed.length) continue;

    // Render each run from the first title's own words, not the folded keys,
    // and keep the result a heading: beyond this the shared text is scope
    // boilerplate ("من الآية … إلى الآية") that describes no series.
    const BUDGET = 8;
    let spent = 0;
    const phrases = [];
    for (const item of placed) {
      if (spent >= BUDGET) break;
      const length = item.run.split(' ').length;
      phrases.push(parsed[0].words.slice(item.at, item.at + Math.min(length, BUDGET - spent)).join(' '));
      spent += length;
    }
    const label = phrases.map(trimScope).filter(Boolean).join(' … ');
    if (label.replace(/[\s…]/g, '').length < 14) continue;
    const covered = maps.filter(map => placed.every(item => map.has(item.run))).length;
    if (covered < needed) continue;
    return { label, covered, total: entries.length };
  }
  return null;
}

// `parts` carries the classifications buildCvDocument already computed, so the
// charts count exactly what the sections list — no second, divergent pass.
// `parts.expertiseChart` is passed in because the caller needs the same verdict
// to decide whether the expertise list still earns its place.
export function buildCvMetrics(bundle, profile, parts) {
  return [
    buildSupervisionSplit(parts),
    parts.expertiseChart ?? buildExpertise(profile),
    buildTeachingLoad(bundle),
    buildCareerTimeline(bundle, profile)
  ].filter(Boolean);
}
