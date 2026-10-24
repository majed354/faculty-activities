// Latin spellings of faculty names, for the English CV.
//
// A person's own spelling of their name is a fact about them, not a string
// transformation: محمد is Mohammed, Muhammad, Mohamed or Mohammad depending on
// what the person themselves uses, and their passport, ORCID and published
// papers all have to agree. An accreditation file that spells a scholar's name
// differently from their own publications does them real damage.
//
// So every entry carries where it came from and how far it can be trusted, and
// the document only presents the ones that were actually evidenced. This
// follows the rule the project already applies to nationality in AGENTS.md:
// do not infer a personal attribute from a name, and leave anything unproven
// marked for human confirmation rather than quietly deciding it.

// confirmed    — a human at the college approved it. Outranks everything.
// verified     — a source shows this person's name spelled this way, and the
//                identity match is sound (an employee number on the page, or
//                a university email, not a resemblance between names).
// review       — a source was found but something does not line up: a surname
//                that disagrees with the record, two self-spellings in two of
//                the member's own papers, a name element the source drops.
//                Real evidence, unresolved question. Not published.
// transliterated — produced by convention from the Arabic. A reasonable
//                rendering, NOT the person's own spelling. Not published.
export const NAME_STATUS = ['confirmed', 'verified', 'review', 'transliterated'];

// Only these assert that the person spells their name this way.
const PUBLISHABLE = new Set(['confirmed', 'verified']);

const clean = value => String(value ?? '').trim();

// Keyed by employee id, which is stable; names are not.
export const ENGLISH_NAMES = {};

export function registerEnglishNames(entries) {
  for (const entry of entries || []) {
    const id = clean(entry?.id);
    const english = clean(entry?.english);
    if (!id || !english || !NAME_STATUS.includes(entry.status)) continue;
    const existing = ENGLISH_NAMES[id];
    // A stronger status wins; equal statuses keep the first entry so a later
    // bulk import cannot silently overwrite a human decision.
    if (existing && NAME_STATUS.indexOf(existing.status) <= NAME_STATUS.indexOf(entry.status)) continue;
    ENGLISH_NAMES[id] = { english, status: entry.status, source: clean(entry.source), note: clean(entry.note) };
  }
  return ENGLISH_NAMES;
}

// The member's own profile always wins: it is the one place the person can
// state their own name. Only an evidenced spelling is used as a fallback.
export function englishNameFor(member, profileName = '') {
  const own = clean(profileName);
  if (own) return { english: own, status: 'confirmed', source: 'ملف العضو' };
  const record = ENGLISH_NAMES[clean(member?.id)];
  return record || null;
}

// Anything short of evidenced is withheld from the published CV, so neither a
// guess nor an unresolved discrepancy reaches an accreditation file by
// default. The caller may opt in to see the rest, for a review sheet.
export function publishedEnglishName(member, profileName = '', { includeUnverified = false } = {}) {
  const record = englishNameFor(member, profileName);
  if (!record) return '';
  if (!PUBLISHABLE.has(record.status) && !includeUnverified) return '';
  return record.english;
}

// Registered at import time from the register the build emits, so every
// renderer sees the same reviewed set without threading it through callers.
import GENERATED from './cv-names.generated.mjs';
registerEnglishNames(GENERATED);
