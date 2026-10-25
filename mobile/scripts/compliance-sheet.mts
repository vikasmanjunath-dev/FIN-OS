// Writes the sheets a compliance reader works from: docs/compliance-review/ (claims.csv with an empty `source` column, an index of which reels have
// sign-offs, a summary by category, and a README on how to use them and what a sign-off means). Reads the live library and the 50 draft reels;
// changes no reel and signs nothing off.
//   npm run reels:compliance             write the sheets and print the counts
//   npm run reels:compliance -- --check  print the same without writing (exit 1 if the files on disk are out of date)
// The output has no dates, so running it twice gives identical files.
import fs from 'node:fs';
import path from 'node:path';
import { reviewCorpus } from '../lib/reels/review-corpus.ts';
import { buildComplianceSheets } from '../lib/reels/compliance-sheets.ts';

const check = process.argv.includes('--check');
const out = path.join(import.meta.dirname, '..', '..', 'docs', 'compliance-review');
const findingsFile = path.join(import.meta.dirname, '..', 'docs', 'REELS-FIGURE-FINDINGS.md');
const sheets = buildComplianceSheets(reviewCorpus(), { findings: fs.existsSync(findingsFile) ? fs.readFileSync(findingsFile, 'utf8') : '' });

let stale = 0;
if (!check) fs.mkdirSync(out, { recursive: true });
for (const [name, body] of Object.entries(sheets.files)) {
  const file = path.join(out, name);
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body;
  if (!same) stale++;
  if (!check) fs.writeFileSync(file, body);
}

const c = sheets.counts;
console.log(`Compliance review sheets: ${check ? 'checked' : 'written'} in ${path.relative(process.cwd(), out) || '.'} (${Object.keys(sheets.files).length} files)`);
console.log(`${c.claims} claims in ${c.withClaims} of ${c.reels} reels (plus money facts); ${c.signed} reels have both sign-offs`);
console.log(`${c.mismatches} cross-check mismatches; ${c.statedAsFact} rates stated as fact\n`);
console.log('Claims by category (claims / reels / asserted / mismatch / match):');
for (const r of sheets.byCategory) console.log(`  ${r.category.padEnd(18)} ${String(r.claims).padStart(4)} ${String(r.reels).padStart(4)} ${String(r.asserted).padStart(4)} ${String(r.mismatches).padStart(4)} ${String(r.matched).padStart(4)}   ${r.label}`);
if (check && stale) { console.log(`\n${stale} file(s) out of date: run npm run reels:compliance`); process.exit(1); }
