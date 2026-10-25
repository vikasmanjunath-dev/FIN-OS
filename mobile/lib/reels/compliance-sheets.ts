// Builds the files a compliance reader works from (docs/compliance-review/): the claims sheet (every regulatory or factual claim, with an empty
// `source` to fill), an index of which reels have sign-offs, a summary by category, and a README that says how to use them and what a sign-off means.
// Pure: the same corpus gives the same bytes (no dates, no clock). scripts/compliance-sheet.mts writes the result to disk.
import { CATEGORY_INFO, CLAIM_CATEGORIES, TAXCORE_FY, extractClaims, type Claim, type ClaimCategory } from '@/lib/reels/claims';
import { gateState, toCsv, type CorpusItem } from '@/lib/reels/review-corpus';

export interface CategoryRow { category: ClaimCategory; label: string; claims: number; reels: number; asserted: number; mismatches: number; matched: number }

export interface ComplianceSheets {
  files: Record<string, string>;
  claims: Claim[];
  byCategory: CategoryRow[];
  counts: { reels: number; withClaims: number; claims: number; mismatches: number; signed: number; statedAsFact: number };
}

export const claimInputs = (corpus: CorpusItem[]) =>
  corpus.flatMap(c => c.texts.map(t => ({ id: c.id, topic: c.topic, origin: (c.release === 'fact' ? 'fact' : t.group === 'trust' ? 'trust' : 'reel') as 'fact' | 'trust' | 'reel', where: t.where, en: t.en, hi: t.hi })));

/**
 * Caveats the trust-note pass wrote down (docs/REELS-FIGURE-FINDINGS.md), by reel id. The file groups them under "## A. ...", "## B. ..." and "## C. ...",
 * one `- <reel id> | what the reel says | what is not stated` line each; the letter is kept so the reader can tell a hidden assumption from a tax-year risk.
 */
export function parseFigureFindings(md: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let sec = '';
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^## ([A-Z])\./); if (h) { sec = h[1]; continue; }
    const m = line.match(/^- ([a-z0-9-]+) \| (.+)$/); if (m && sec) (out[m[1]] ??= []).push(`[${sec}] ${m[2]}`);
  }
  return out;
}

export function buildComplianceSheets(corpus: CorpusItem[], opts: { findings?: string } = {}): ComplianceSheets {
  const caveats = parseFigureFindings(opts.findings ?? '');
  const claims = extractClaims(claimInputs(corpus));
  const item = new Map(corpus.map(c => [c.id, c]));
  const files: Record<string, string> = {};

  const rows: (string | number)[][] = [['Claim ID', 'Reel ID', 'Topic', 'Release', 'Gate', 'Origin', 'Where', 'Category', 'Figure', 'Framing', 'Meant as', 'Text (English)', 'Same screen text in Hindi', 'Auto cross-check', 'Cross-check note', 'Known caveat on this reel (first row of the reel only)', 'Source (reader fills: name, section, date)', 'Verdict (OK / change / remove)', 'Reader note']];
  const shown = new Set<string>();
  for (const k of claims) {
    const c = item.get(k.reel)!;
    const cav = shown.has(k.reel) ? '' : (caveats[k.reel] ?? []).join('\n'); shown.add(k.reel);
    rows.push([k.id, k.reel, c.topic, c.release, gateState(c).signed ? 'signed off' : 'not signed off', k.origin, k.where, k.category, k.figure, k.framing, k.meant, k.text, k.hindi, k.check.status, k.check.note, cav, '', '', '']);
  }
  files['claims.csv'] = toCsv(rows);

  const byCategory: CategoryRow[] = CLAIM_CATEGORIES.map(category => {
    const x = claims.filter(k => k.category === category);
    return { category, label: CATEGORY_INFO[category].label, claims: x.length, reels: new Set(x.map(k => k.reel)).size, asserted: x.filter(k => k.meant === 'asserted').length, mismatches: x.filter(k => k.check.status === 'mismatch').length, matched: x.filter(k => k.check.status === 'matches' || k.check.status === 'matches-literal' || k.check.status === 'known').length };
  });
  files['summary-by-category.csv'] = toCsv([['Category', 'What it is', 'What the reader asks', 'Claims', 'Reels', 'Asserted by the reel', 'Cross-check mismatches', 'Cross-check matches'], ...byCategory.map(r => [r.category, r.label, CATEGORY_INFO[r.category].ask, r.claims, r.reels, r.asserted, r.mismatches, r.matched])]);

  const idx: (string | number)[][] = [['Reel ID', 'Topic', 'Title', 'Release', 'Compliance sign-off (review.ts)', 'Hindi sign-off (review.ts)', 'Signed on', 'Claims', ...CLAIM_CATEGORIES, 'Cross-check mismatches', 'Known caveats', 'Compliance read by (fill in)']];
  for (const c of corpus) {
    const mine = claims.filter(k => k.reel === c.id), g = gateState(c);
    idx.push([c.id, c.topic, c.title, c.release, g.compliance || 'none', g.hindi || 'none', g.on, mine.length, ...CLAIM_CATEGORIES.map(cat => mine.filter(k => k.category === cat).length), mine.filter(k => k.check.status === 'mismatch').length, (caveats[c.id] ?? []).length, '']);
  }
  files['reels-index.csv'] = toCsv(idx);

  const counts = {
    reels: corpus.filter(c => c.release !== 'fact').length,
    withClaims: new Set(claims.map(k => k.reel)).size,
    claims: claims.length, mismatches: claims.filter(k => k.check.status === 'mismatch').length,
    signed: corpus.filter(c => c.release !== 'fact' && gateState(c).signed).length,
    statedAsFact: claims.filter(k => k.framing === 'stated as fact').length,
  };
  files['README.md'] = readme(byCategory, counts, corpus, Object.keys(caveats).length);
  return { files, claims, byCategory, counts };
}

function readme(byCategory: CategoryRow[], c: ComplianceSheets['counts'], corpus: CorpusItem[], caveatReels: number): string {
  const live = corpus.filter(x => x.release === 'live').length, draft = corpus.filter(x => x.release === 'draft').length;
  const L: string[] = [];
  L.push('# Compliance review sheets for Money Reels', '');
  L.push('Generated by `npm run reels:compliance` (do not edit by hand; work in a copy and send it back). Nothing here changes a reel.', '');
  L.push(`**Scope:** ${live} live reels and ${draft} draft reels waiting behind the review gate, each with its "How this is worked out" note, plus the ${corpus.filter(x => x.release === 'fact').length} money facts shown at the end of an episode. The tool found **${c.claims} claims** in ${c.withClaims} of ${c.reels} reels (plus the money facts). ${c.signed} reels have both sign-offs in \`lib/reels/review.ts\`; the rest do not.`, '');
  L.push('## How to use `claims.csv`', '');
  L.push('1. Each row is one sentence of one on-screen text that states something a reader can check: a regulator, a section, a limit, a rate, a scheme, a date or period, a helpline, or wording that could read as advice. The **Category** says why it is there; the **Figure** column shows the exact number, section or phrase found.');
  L.push('2. For each row, find the primary source (the Act, circular, scheme notification or official site) and write it in **Source** with the section or page and the date you checked. If the claim is wrong, out of date or too strong, put `change` or `remove` in **Verdict** and say what in **Reader note**; otherwise `OK`.');
  L.push('3. **Framing** matters for rates: `stated as fact` means the sentence gives a percentage for interest, inflation or returns without calling it an assumption or an example. Those are the rows most likely to need a source or a rewrite.');
  L.push('4. **Meant as** says whether the reel asserts the sentence (`asserted`), shows it as a wrong answer option, or shows it inside an example scam message. Only `asserted` rows are claims the reel stands behind; the others are there so you can confirm the reel labels them clearly.');
  L.push(`5. **Auto cross-check** compares the amounts and rates with the constants the app itself uses (\`lib/taxcore.ts\`, \`lib/taxSavings.ts\`). \`matches\` means the sentence agrees with the app; \`matches-literal\` means it agrees with a number typed into the app without a shared constant; \`mismatch\` means it differs and is the first thing to look at; \`known\` is a number the tool lists as a fixed fact (the 1930 helpline); \`not-checked\` means the tool has nothing to compare it with. **A match with the app is not a source**: the app could be out of date too. \`lib/taxcore.ts\` is written for FY ${TAXCORE_FY}.`, '');
  L.push(`**Known caveat** carries what the trust-note pass already found on that reel (\`docs/REELS-FIGURE-FINDINGS.md\`, ${caveatReels} reels): \`[A]\` the figure is right but rests on something the reel does not say, \`[B]\` a rounding or consistency point, \`[C]\` a rule tied to a financial year that may have moved. Settle those first.`, '');
  L.push('`reels-index.csv` lists every reel with its sign-off state and how many claims it has, so you can see which reels are done and which are not. `summary-by-category.csv` is the table below.', '');
  L.push('## What a sign-off means', '');
  L.push('A compliance sign-off is a line for the reel in `lib/reels/review.ts` (`REVIEWED`), added by the content owner, with the reader’s name and the date. It records that the named person:', '');
  L.push('1. read every row for that reel in `claims.csv` and watched the whole reel, so nothing was judged only from the listed sentences;');
  L.push('2. recorded a source for every `asserted` row, or asked for the row to be changed or removed and the change was made;');
  L.push('3. checked that no wording reads as a personal recommendation or a promise of return, and that figures are labelled as examples or assumptions where they are;');
  L.push('4. is satisfied with the year the reel names, or with its wording telling the viewer to check the current rule.');
  L.push('', 'It is a record that a named person did this read, not a legal opinion and not a guarantee that the rules will not change. The tool never makes this entry, and a reel with a sign-off is only released when the Hindi sign-off is there too.', '');
  L.push('## Summary by category', '');
  L.push('| Category | What it is | Claims | Reels | Asserted | Mismatch | Match |', '|---|---|---|---|---|---|---|');
  for (const r of byCategory) L.push(`| \`${r.category}\` | ${r.label} | ${r.claims} | ${r.reels} | ${r.asserted} | ${r.mismatches} | ${r.matched} |`);
  L.push('', `${c.mismatches} claims have a cross-check mismatch; ${c.statedAsFact} give a rate as a fact without saying it is assumed.`, '');
  L.push('## What the tool cannot do', '');
  L.push('- It reads English text. Hindi sentences are shown beside each claim so you can see whether the figure agrees, but a Hindi-only claim is not extracted.');
  L.push('- It finds sentences with a number, a name or a phrase from its lists. A claim made without any of them (“the bank must refund you”) is not found. Read the reel itself for the sign-off.');
  L.push('- Worked tax examples (`tax-example`) are checked by the maths tests (`__tests__`, `npm run reels:check`), not here.');
  L.push('- Reels built from a person’s own figures (“Your Number”) fill their sentences at run time from templates in `personal*.ts`; those sentences are not in these sheets.');
  L.push('');
  return L.join('\n');
}
