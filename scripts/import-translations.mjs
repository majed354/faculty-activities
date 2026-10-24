// Collects the reviewed translations of member free text into one register.
//
//   node scripts/import-translations.mjs <dir-of-out-tr-*.json>
//
// `confident` from the translator becomes a status the same way research
// confidence does for names: a flagged rendering is kept and marked so it can
// be reviewed, not silently dropped and not silently published as settled.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KIND = { course: 'مقرر', thesis: 'رسالة', other: 'بحث أو فعالية' };
const cell = value => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const dir = process.argv[2] || '/tmp/ennames';
const rows = [];
const seen = new Set();
for (const file of readdirSync(dir).filter(name => /^out-tr-.*\.json$/.test(name)).sort()) {
  const kind = KIND[(file.match(/^out-tr-([a-z]+)/) || [])[1]] || '';
  for (const entry of JSON.parse(readFileSync(join(dir, file), 'utf8'))) {
    const arabic = String(entry.arabic ?? '').trim();
    const english = String(entry.english ?? '').trim();
    if (!arabic || !english || seen.has(arabic)) continue;
    seen.add(arabic);
    rows.push({ arabic, english, kind, status: entry.confident ? 'translated' : 'review',
      note: String(entry.note ?? '').trim() });
  }
}
rows.sort((a, b) => a.arabic.localeCompare(b.arabic, 'ar'));
writeFileSync('data/faculty-translations.csv',
  `arabic,english,kind,status,note\n${rows.map(r => [r.arabic, r.english, r.kind, r.status, r.note].map(cell).join(',')).join('\n')}\n`, 'utf8');
const flagged = rows.filter(row => row.status === 'review').length;
console.log(`data/faculty-translations.csv — ${rows.length} entries (${rows.length - flagged} translated, ${flagged} flagged for review)`);
