// Turns the name-research output into the reviewable register the site reads.
//
//   node scripts/import-english-names.mjs <dir-of-out-*.json>
//
// Research confidence maps onto publication status deliberately:
//   high   -> verified   (published: the source showed this person's own name
//                         and the identity match rested on an employee number
//                         or a university email, not on names looking alike)
//   medium -> review     (withheld: real evidence, unresolved question)
//   none   -> omitted    (no row at all; absence is not a guess)
// Nothing here invents a spelling. A member with no evidenced name simply has
// no row, and the English CV falls back to their Arabic name.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STATUS = { high: 'verified', medium: 'review' };
const csvCell = value => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const dir = process.argv[2] || '/tmp/ennames';
const rows = [];
const seen = new Set();
for (const file of readdirSync(dir).filter(name => /^out-.*\.json$/.test(name)).sort()) {
  for (const entry of JSON.parse(readFileSync(join(dir, file), 'utf8'))) {
    const id = String(entry.id ?? '').trim();
    const english = String(entry.english ?? '').trim();
    const status = STATUS[entry.confidence];
    if (!id || !english || !status || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, arabic: String(entry.arabic ?? '').trim(), english, status,
      source: String(entry.source ?? '').trim(), note: String(entry.evidence ?? '').trim() });
  }
}
rows.sort((a, b) => a.id.localeCompare(b.id));

const header = 'id,arabic,english,status,source,note';
const body = rows.map(row => [row.id, row.arabic, row.english, row.status, row.source, row.note].map(csvCell).join(','));
writeFileSync('data/faculty-english-names.csv', `${header}\n${body.join('\n')}\n`, 'utf8');

const counts = rows.reduce((tally, row) => ({ ...tally, [row.status]: (tally[row.status] || 0) + 1 }), {});
console.log(`data/faculty-english-names.csv — ${rows.length} rows (verified ${counts.verified || 0}, review ${counts.review || 0})`);
