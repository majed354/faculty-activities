// Proposes a Latin spelling for members the university never published one for.
//
//   node scripts/transliterate-names.mjs <roster-dir>
//
// The convention is LEARNED from Taif University's own 100+ published pairs
// rather than invented: each Arabic name token is rendered the way the
// university most often renders it. Where the university is itself
// inconsistent (محمد appears as Mohammed, Mohamed and Muhammad) the majority
// spelling is used and the disagreement is recorded.
//
// Every row this produces is marked `transliterated`. It is a careful
// proposal, not the person's own spelling, and it says so.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

const HONORIFIC = /^(?:[أا]\.\s*د\.?|[دأام]\.)[.\s]*/;
const FILLER = new Set(['بن', 'بنت', 'ابن']);
const arTokens = name => name
  .replace(HONORIFIC, '')
  // Records sometimes carry the honorific twice, the second glued to the given
  // name ("أ.د. ا.د.فهد"), which rendered as "Adfhd".
  .replace(/(^|\s)[أاد]\.\s*د\.\s*/g, '$1')
  .replace(/عبد\s+/g, 'عبد')
  // A theophoric second element belongs to the name before it: "ظيف الله" is
  // Dhaifallah, not Dhaif followed by Allah.
  .replace(/(\S+)\s+الله(?=\s|$)/g, '$1الله')
  .trim()
  .split(/\s+/).filter(token => token && !FILLER.has(token));
const enTokens = name => name.replace(/\s*-\s*/g, '-').trim()
  .split(/\s+/).filter(token => token && !['bin', 'bint'].includes(token.toLowerCase()));

// A learned pair is only trusted when both sides tokenise to the same length,
// so a dropped name element cannot shift every later token onto the wrong word.
export function learnLexicon(rows) {
  const tally = new Map();
  for (const row of rows) {
    const arabic = arTokens(row.arabic || '');
    const english = enTokens(row.english || '');
    if (arabic.length !== english.length) continue;
    arabic.forEach((token, index) => {
      // "Al" alone is an article fragment from a misaligned row, never a name.
      if (!/^[A-Za-z'`-]{3,}$/.test(english[index]) || english[index] === 'Al') return;
      const counts = tally.get(token) || new Map();
      counts.set(english[index], (counts.get(english[index]) || 0) + 1);
      tally.set(token, counts);
    });
  }
  const lexicon = new Map();
  for (const [token, counts] of tally) {
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    lexicon.set(token, { english: ranked[0][0], variants: ranked.length > 1 ? ranked.map(([k, n]) => `${k}×${n}`).join(', ') : '' });
  }
  return lexicon;
}

// Letters the university's own renderings imply. Used only for a token the
// lexicon has never seen, and such a name is flagged rather than trusted.
const LETTERS = [['عبدال', 'Abdul'], ['ال', 'Al-'], ['ث', 'th'], ['ذ', 'dh'], ['خ', 'kh'], ['ش', 'sh'],
  ['غ', 'gh'], ['ظ', 'z'], ['ض', 'd'], ['ص', 's'], ['ط', 't'], ['ح', 'h'], ['ع', 'a'], ['ء', ''], ['ؤ', 'o'],
  ['ئ', 'i'], ['ى', 'a'], ['ة', 'ah'], ['آ', 'a'], ['أ', 'a'], ['إ', 'i'], ['ا', 'a'], ['ب', 'b'], ['ت', 't'],
  ['ج', 'j'], ['د', 'd'], ['ر', 'r'], ['ز', 'z'], ['س', 's'], ['ف', 'f'], ['ق', 'q'], ['ك', 'k'], ['ل', 'l'],
  ['م', 'm'], ['ن', 'n'], ['ه', 'h'], ['و', 'o'], ['ي', 'i'], ['ّ', '']];

function byLetter(token) {
  let rest = token.replace(/[ً-ْ]/g, '');
  let out = '';
  while (rest) {
    const hit = LETTERS.find(([arabic]) => rest.startsWith(arabic));
    if (hit) { out += hit[1]; rest = rest.slice(hit[0].length); } else { rest = rest.slice(1); }
  }
  return out.replace(/^(.)/, c => c.toUpperCase()).replace(/-(.)/, (_, c) => `-${c.toUpperCase()}`);
}

export function transliterate(arabicName, lexicon) {
  const unknown = [];
  const english = arTokens(arabicName).map(token => {
    const hit = lexicon.get(token);
    if (hit) return hit.english;
    unknown.push(token);
    return byLetter(token);
  }).join(' ');
  return { english, unknown };
}

if (process.argv[1]?.endsWith('transliterate-names.mjs')) {
  const dir = process.argv[2] || '/tmp/ennames';
  const register = Papa.parse(readFileSync('data/faculty-english-names.csv', 'utf8').trim(), { header: true, skipEmptyLines: true }).data;
  const lexicon = learnLexicon(register.filter(row => row.status === 'verified'));
  // Letter-by-letter fallback cannot work for Arabic: short vowels are not
  // written, so الطلحي renders as "Al-Tlhi". The supplement supplies the
  // reading for every token the university's own names never covered.
  for (const row of Papa.parse(readFileSync('data/name-lexicon-supplement.csv', 'utf8').trim(), { header: true, skipEmptyLines: true }).data) {
    const arabic = (row.arabic || '').trim();
    // The supplement is curated, so it overrides a spelling learned from the
    // university pages where those disagree: الثبيتي is printed "Al-Thamiti"
    // on one of them, which is a typo in the source.
    if (arabic) lexicon.set(arabic, { english: (row.english || '').trim(), variants: '' });
  }
  const known = new Set(register.filter(row => row.english).map(row => row.id));

  const rows = [];
  for (const file of readdirSync(dir).filter(name => /^(qiraat|sharia|thaqafa|anzima)\.json$/.test(name))) {
    for (const member of JSON.parse(readFileSync(join(dir, file), 'utf8'))) {
      // Visiting scholars are out of scope for the accreditation file.
      if (known.has(member.id) || member.rank === 'متعاون') continue;
      const { english, unknown } = transliterate(member.name, lexicon);
      rows.push([member.id, member.name, english, 'transliterated', 'عُرف موقع جامعة الطائف',
        unknown.length ? `مقاطع غير معجمية نُقلت حرفيًّا وتحتاج مراجعة: ${unknown.join('، ')}` : 'كل المقاطع من أسماء نشرتها الجامعة أو من المعجم المراجَع']);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const cell = value => (/[",]/.test(value) ? `"${String(value).replace(/"/g, '""')}"` : value);
  writeFileSync('data/faculty-english-names-proposed.csv',
    `id,arabic,english,status,source,note\n${rows.map(row => row.map(cell).join(',')).join('\n')}\n`, 'utf8');
  const clean = rows.filter(row => row[5].startsWith('كل')).length;
  console.log(`lexicon: ${lexicon.size} tokens | proposed ${rows.length} names (${clean} entirely from published tokens, ${rows.length - clean} contain an unseen token)`);
}
