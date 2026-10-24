// Reconciles wording that several translators rendered differently.
//
//   node scripts/unify-translations.mjs [--apply]
//
// Without --apply it only reports. Every substitution is printed with the
// entry it touched, so the change is reviewable rather than silent.
//
// The rulings behind these rules:
//  - الأنظمة is "Regulations", matching the college's own English name
//    (College of Sharia and Regulations) and Umm Al-Qura's usage. القانون
//    stays "Law"; only the department word is unified.
//  - A named classical work is transliterated whole, so زاد المسير في علم
//    التفسير is a title, not half a title and half a gloss.
//  - British spelling throughout, which is the majority already present and
//    the usual register of Saudi university English.
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';

export const RULES = [
  // Only where the Arabic actually says الأنظمة; a law course stays Law.
  { when: row => /الأنظمة|الانظمة/.test(row.arabic), from: /\bthe Study of Law\b/g, to: 'the Study of Regulations' },
  // One book, one title.
  { from: /Zad al-Masir in the science of Quranic exegesis/g, to: "Zad al-Masir fi 'Ilm al-Tafsir" },
  { from: /Zad al-Masir fi Ilm al-Tafsir/g, to: "Zad al-Masir fi 'Ilm al-Tafsir" },
  // The Zad al-Masir theses are a single supervised programme; three variants
  // of the same opening kept them from reading — and grouping — as one.
  { from: /^Classifications of exegetical disagreements/g, to: 'The classifications of exegetical disagreements' },
  { from: /^The classification of exegetical disagreements/g, to: 'The classifications of exegetical disagreements' },
  { from: /^Classification of exegetical disagreements/g, to: 'The classifications of exegetical disagreements' },
  // British spelling.
  { from: /\bMemoriz/g, to: 'Memoris' }, { from: /\bmemoriz/g, to: 'memoris' },
  { from: /\bOrganiz/g, to: 'Organis' }, { from: /\borganiz/g, to: 'organis' },
  { from: /\bdigitization\b/g, to: 'digitisation' },
  { from: /\bDefense\b/g, to: 'Defence' },
  { from: /\bspecialization\b/g, to: 'specialisation' }
];

export function unify(rows, rules = RULES) {
  const changes = [];
  for (const row of rows) {
    for (const rule of rules) {
      if (rule.when && !rule.when(row)) continue;
      const next = row.english.replace(rule.from, rule.to);
      if (next !== row.english) {
        changes.push({ arabic: row.arabic, before: row.english, after: next });
        row.english = next;
      }
    }
  }
  return changes;
}

if (process.argv[1]?.endsWith('unify-translations.mjs')) {
  const path = 'data/faculty-translations.csv';
  const rows = Papa.parse(readFileSync(path, 'utf8').trim(), { header: true, skipEmptyLines: true }).data;
  const changes = unify(rows);
  for (const change of changes) console.log(`• ${change.arabic.slice(0, 44)}\n    ${change.before.slice(0, 76)}\n  → ${change.after.slice(0, 76)}`);
  console.log(`\n${changes.length} substitutions across ${new Set(changes.map(c => c.arabic)).size} entries`);
  if (process.argv.includes('--apply')) {
    const cell = value => (/[",]/.test(value) ? `"${String(value).replace(/"/g, '""')}"` : value);
    writeFileSync(path, `arabic,english,kind,status,note\n${rows.map(r =>
      [r.arabic, r.english, r.kind, r.status, r.note].map(cell).join(',')).join('\n')}\n`, 'utf8');
    console.log('applied');
  } else console.log('(dry run — pass --apply to write)');
}
