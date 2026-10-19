// Writes a review sheet for the draft reels: every caption, picture label, interaction and quiz in English and Hindi side by side, with the facts that
// change and the sign-off boxes for the Hindi reader and the compliance reader.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/review-sheet.mts > ../docs/review/wave4-review-sheet.md
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { DRAFT_META } from '../lib/reels/drafts-meta.ts';
import { textsOf } from '../lib/reels/validate.ts';
import type { L, Reel } from '../lib/reels/types.ts';

const row = (what: string, l: L) => `| ${what} | ${l.en.replace(/\|/g, '/')} | ${l.hi.replace(/\|/g, '/')} |`;
const sensitive = (r: Reel): string[] => {
  const all = textsOf(r).map(x => x.en).join(' ');
  const out: string[] = [];
  if (r.topic === 'safety' || /scam|fraud/i.test(all)) out.push('scam wording: no real sender, no real link, only 1930');
  if (/tax|regime|deduction|ITR/i.test(all)) out.push('tax rules (FY 2025-26): check against the current year');
  if (/insur|cover|claim|premium/i.test(all)) out.push('insurance terms: check wording and limits');
  if (/SIP|fund|share|return|invest/i.test(all)) out.push('investing: every rate is an assumption; no promise or advice');
  if (/loan|EMI|interest/i.test(all)) out.push('loan figures are examples, not offers');
  return out;
};

console.log('# Review sheet: draft reels\n');
console.log(`${DRAFT_REELS.length} reels. For each: a native Hindi reader checks the Hindi column reads naturally and says the same thing as the English; a compliance reader checks the flagged points. Sign off in \`lib/reels/review.ts\` (\`REVIEWED\`).\n`);
for (const r of DRAFT_REELS) {
  console.log(`## ${r.id}: ${r.title.en}\n`);
  const m = DRAFT_META[r.id];
  console.log(`Topic: ${r.topic}${m ? ` · rung: ${m.level}` : ''}${r.poke ? ` · interaction: ${r.poke.beat.kind}` : ''}\n`);
  const flags = sensitive(r);
  if (flags.length) console.log(flags.map(f => `- ${f}`).join('\n') + '\n');
  console.log('| Where | English | Hindi |\n|---|---|---|');
  console.log(row('Title', r.title));
  r.scenes.forEach((s, i) => { console.log(row(`Scene ${i + 1}`, s.say)); if (s.big) console.log(row(`Scene ${i + 1} big`, s.big)); });
  if (r.poke) {
    const b = r.poke.beat;
    console.log(row('Prompt', b.q));
    if (b.kind === 'myth') b.cards.forEach((c, i) => { console.log(row(`Card ${i + 1} (${c.fact ? 'fact' : 'myth'})`, c.s)); console.log(row(`Card ${i + 1} reason`, c.why)); });
    if (b.kind === 'spot') { console.log(row('From', b.from)); b.parts.forEach((p, i) => { console.log(row(`Piece ${i + 1}${p.flag ? ' (flag)' : ''}`, p.t)); if (p.flag) console.log(row(`Piece ${i + 1} reason`, p.flag)); }); console.log(row('What to do', b.todo)); }
    if (b.kind === 'path') { console.log(row('Setup', b.setup)); b.options.forEach((o, i) => { console.log(row(`Option ${i + 1}`, o.label)); console.log(row(`Option ${i + 1} result`, o.result)); }); console.log(row('Verdict', b.verdict)); }
    if (b.kind === 'sort') { b.bins.forEach((x, i) => console.log(row(`Bin ${i + 1}`, x))); b.cards.forEach((c, i) => { console.log(row(`Card ${i + 1} (bin ${c.bin + 1})`, c.t)); console.log(row(`Card ${i + 1} reason`, c.why)); }); }
    if (b.kind === 'order') b.items.forEach((c, i) => { console.log(row(`Step ${i + 1}`, c.t)); console.log(row(`Step ${i + 1} reason`, c.why)); });
    if (b.kind === 'guess') console.log(row('Reveal', b.reveal));
    if (b.kind === 'slider') { console.log(row('Label', b.label)); console.log(row('Takeaway', b.takeaway)); }
  }
  console.log(row('Quiz', r.quiz.q)); r.quiz.options.forEach((o, i) => console.log(row(`Option ${i + 1}${i === r.quiz.answer ? ' (right)' : ''}`, o))); console.log(row('Why', r.quiz.why));
  console.log('\n- [ ] Hindi reviewed by: ______  date: ______\n- [ ] Compliance reviewed by: ______  date: ______\n');
}
