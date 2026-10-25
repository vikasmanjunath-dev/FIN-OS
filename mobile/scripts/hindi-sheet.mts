// Writes the sheets a native Hindi reader works from: docs/hindi-review/ (one CSV per topic, the glossary, the variants and spellings, an index of which
// reels have sign-offs, and a README with the first-pass findings). Reads the live library and the 50 draft reels; changes no reel and signs nothing off.
//   npm run reels:hindi                 write the sheets and print the totals and the ten most common issues
//   npm run reels:hindi -- --check      print the same without writing (exit 1 if the files on disk are out of date)
// The output has no dates, so running it twice gives identical files.
import fs from 'node:fs';
import path from 'node:path';
import { reviewCorpus } from '../lib/reels/review-corpus.ts';
import { buildHindiSheets } from '../lib/reels/hindi-sheets.ts';
import { LINT_CODES, LINT_INFO } from '../lib/reels/hindi-lint.ts';
import { HI } from '../lib/i18nHi.ts';

const check = process.argv.includes('--check');
const out = path.join(import.meta.dirname, '..', '..', 'docs', 'hindi-review');
const sheets = buildHindiSheets(reviewCorpus(), Object.values(HI));

let stale = 0;
if (!check) fs.mkdirSync(out, { recursive: true });
for (const [name, body] of Object.entries(sheets.files)) {
  const file = path.join(out, name);
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body;
  if (!same) stale++;
  if (!check) fs.writeFileSync(file, body);
}

const c = sheets.counts;
console.log(`Hindi review sheets: ${check ? 'checked' : 'written'} in ${path.relative(process.cwd(), out) || '.'} (${Object.keys(sheets.files).length} files)`);
console.log(`${c.reels} reels (${c.live} live, ${c.draft} draft) + ${c.facts} money facts; ${c.texts} texts, ${c.textsFlagged} with a flag; ${c.signed} reels have both sign-offs`);
console.log('\nFlags by check (flags / reels / of which likely wrong):');
for (const code of LINT_CODES) { const p = sheets.lint.perCode[code]; console.log(`  ${code.padEnd(18)} ${String(p.flags).padStart(4)} ${String(p.reels).padStart(4)} ${String(p.likely).padStart(4)}   ${LINT_INFO[code].label}`); }
console.log('\nTen most common issues:');
sheets.issues.slice(0, 10).forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}. ${x.key.padEnd(34)} ${String(x.texts).padStart(4)} texts, ${String(x.reels).padStart(3)} reels   ${x.example.slice(0, 110)}`));
if (check && stale) { console.log(`\n${stale} file(s) out of date: run npm run reels:hindi`); process.exit(1); }
