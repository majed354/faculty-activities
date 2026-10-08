import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import Papa from 'papaparse';

await rm('public', { recursive: true, force: true });
await mkdir('public/assets', { recursive: true });
for (const file of ['index.html', 'add-activity.html', 'app.js', 'style.css', 'style-additions.css', 'teaching.js', 'teaching-styles.css', '_headers', 'cv-studio.css', 'data']) {
  await cp(file, `public/${file}`, { recursive: true });
}
const csv = await readFile('data/faculty.csv', 'utf8');
const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
const ids = [...new Set(rows.map(row => String(row.id || '').trim()).filter(id => /^\d{1,12}$/.test(id)))];
await writeFile('src/faculty-roster.json', JSON.stringify(ids));
await build({ entryPoints: ['src/cv-studio.mjs'], outfile: 'public/assets/cv-studio.js', bundle: true, minify: true, target: 'es2020', format: 'iife', loader: { '.css': 'text' } });
await build({ entryPoints: ['src/cv-word.mjs'], outfile: 'public/assets/cv-word.js', bundle: true, minify: true, target: 'es2020', format: 'esm' });
console.log(`Built site and academic CV exports (${ids.length} faculty IDs).`);
