// Content follow-ups (Oct 25 2026): the money map screen in Hindi and at large text, the FY 2026-27 tax refresh, the wording fixes from
// docs/REELS-FIGURE-FINDINGS.md, the Hindi term clean-up, and the two reels that fill the last empty Money Map cells.
// Tax sources (checked 2026-10-25): Income-tax Act 2025 s.202 (slabs), s.156 (rebate), s.19(1) (standard deduction), s.123 (80C cap, ₹1.5 lakh),
// s.124(3) (NPS, ₹50,000), s.126 (health insurance), s.22(2) (home loan interest, ₹2 lakh), s.2(101) (12 months), s.408 (advance tax dates);
// Budget 2026 speech paras 98-135 (no change to slabs, rebate or deductions; ITR-1 and ITR-2 due 31 July); PRS Union Budget 2026-27 analysis
// ("No change in income tax slabs").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { libraryById, LIBRARY } from '../lib/reels/library.ts';
import { TRUST } from '../lib/reels/trust.ts';
import { META } from '../lib/reels/meta.ts';
import { SERIES } from '../lib/reels/series.ts';
import { buildMap, TOPIC_ORDER } from '../lib/reels/map.ts';
import { TAXCORE_FY } from '../lib/reels/claims.ts';
import { validateReel, textsOf } from '../lib/reels/validate.ts';
import { lakhDec } from '../lib/reels/kit.ts';
import { CESS, NEW_REBATE_LIMIT, OLD_REBATE_LIMIT, STD_NEW, STD_OLD, taxNew, taxOld } from '../lib/taxcore.ts';

const src = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const en = (id: string) => textsOf(libraryById(id)!).map(x => x.en).join(' | ');
const hi = (id: string) => textsOf(libraryById(id)!).map(x => x.hi).join(' | ');

// ── money map screen ─────────────────────────────────────────────────────────────────────────────

test('money map: the row label has a Hindi variant, and the legend sits two by two', () => {
  const s = src('app/learn/map.tsx');
  assert.match(s, /accessibilityLabel=\{hi\s*\n?\s*\?/, 'the row label branches on the language');
  assert.ok(s.includes('रील देखी।') && s.includes('अगली:') && s.includes('सब देख ली गईं।'));
  assert.ok(!/`\$\{TOPIC_NAME\[r\.topic\]\[lang\]\}, \$\{r\.watched\} of/.test(s), 'no English template wrapped around a Hindi name');
  assert.match(s, /legend: \{[^}]*flexWrap: 'wrap'/);
  assert.match(s, /legendTxt: \{[^}]*width: '50%'/);
});

test('cast: the comment counts the people the code lists', () => {
  const s = src('components/reels/Cast.tsx');
  assert.ok(!/six people/.test(s));
  assert.ok(/fourteen people/.test(s));
  const ids = s.match(/export const CAST_IDS: CastId\[\] = \[([^\]]*)\]/)![1].split(',').map(x => x.trim()).filter(Boolean);
  assert.equal(ids.length, 14);
});

// ── tax: FY 2026-27 ───────────────────────────────────────────────────────────────────────────────

test('taxcore: the constants are the FY 2026-27 ones, each confirmed unchanged from FY 2025-26 by the Act and the Budget papers', () => {
  assert.equal(STD_NEW, 75_000);               // Income-tax Act 2025 s.19(1) Table 2(a)
  assert.equal(STD_OLD, 50_000);               // s.19(1) Table 2(b)
  assert.equal(NEW_REBATE_LIMIT, 1_200_000);   // s.156(2)
  assert.equal(OLD_REBATE_LIMIT, 500_000);     // s.156(1)
  assert.equal(CESS, 0.04);
  assert.match(src('lib/taxcore.ts').split('\n')[0], /FY 2026-27/);
  assert.equal(TAXCORE_FY, '2026-27');
});

test('taxcore: known answers worked by hand from the s.202 table', () => {
  // new regime, taxable ₹14.25 lakh: 5% of 4 lakh + 10% of 4 lakh + 15% of 2.25 lakh = 20,000 + 40,000 + 33,750 = 93,750; × 1.04 = 97,500
  assert.equal(taxNew(1_425_000), 97_500);
  assert.equal(taxNew(1_200_000), 0);
  // marginal relief just above ₹12 lakh: the tax cannot exceed the income above ₹12 lakh (₹10,000), plus cess
  assert.equal(taxNew(1_210_000), Math.round(10_000 * 1.04));
  // old regime, taxable ₹12.5 lakh: 5% of 2.5 lakh + 20% of 5 lakh + 30% of 2.5 lakh = 12,500 + 100,000 + 75,000 = 187,500; × 1.04 = 195,000
  assert.equal(taxOld(1_250_000), 195_000);
  assert.equal(taxOld(500_000), 0);
});

test('tax reels and notes: every year label is FY 2026-27, none says 2025-26, and the tax notes carry the new check date', () => {
  const stale = LIBRARY.filter(r => /2025-26/.test(en(r.id)) || /2025-26/.test(hi(r.id))).map(r => r.id);
  assert.deepEqual(stale, []);
  for (const id of ['tax-regimes', 'slide-tax-income', 'standard-deduction', 'sort-old-or-new-regime'].filter(x => libraryById(x))) {
    assert.ok(/FY 2026-27/.test(en(id)), `${id} names the year`);
  }
  const taxIds = ['tax-regimes', 'slide-tax-income', 'section-80c', 'elss-basics', 'nps-basics', 'section-80d', 'parents-health-cover', 'home-loan-tax-benefit', 'hra-basics', 'standard-deduction', 'tds-refund', 'capital-gains', 'tax-dates', 'salary-slip-decoded'];
  for (const id of taxIds) {
    const n = TRUST[id];
    assert.equal(n.asOf, '2026-10-25', id);
    const all = `${n.formula.en} ${n.assumes.en} ${n.formula.hi} ${n.assumes.hi}`;
    assert.ok(!/2025-26/.test(all), `${id} still says FY 2025-26`);
  }
  // the notes name the year and (where it matters) the section of the new Act
  assert.match(TRUST['tax-regimes'].formula.en, /FY 2026-27/);
  assert.match(TRUST['section-80c'].assumes.en, /Sec 123/);
  assert.match(TRUST['section-80d'].assumes.en, /Sec 126/);
  assert.match(TRUST['nps-basics'].assumes.en, /124\(3\)/);
  assert.match(TRUST['tax-dates'].assumes.en, /31 July/);
});

test('tax reels: the figures in the text are the ones taxcore gives', () => {
  assert.match(en('tax-regimes'), /New regime tax is about ₹97,500, old regime about ₹1\.95 lakh/);
  assert.match(en('standard-deduction'), /₹75,000 in the new regime and ₹50,000 in the old regime/);
  assert.match(en('standard-deduction'), /Only higher earners are/);
  assert.match(TRUST['standard-deduction'].assumes.en, /above ₹24 lakh/);
});

// ── wording fixes from docs/REELS-FIGURE-FINDINGS.md ───────────────────────────────────────────────────

test('wording: each reel now states the assumption its note names', () => {
  assert.match(textsOf(libraryById('path-spare-monthly')!).map(x => x.en).join(' '), /20-year loan/);
  assert.ok(!/over 10 years/.test(en('path-spare-monthly')));
  assert.match(en('choose-bonus'), /3 years to go/);
  assert.match(en('no-cost-emi'), /a year, simple\./);
  assert.match(en('path-card-bill'), /at most about ₹1,400/);
  // exact totals: EMI ₹20,758 × 60 = ₹12,45,501 → ₹12.5 lakh; ₹5,000 a month, 12%, 10 years = ₹11,50,193 → ₹11.5 lakh
  assert.match(en('car-buying-math'), /about ₹12\.5 lakh in all/);
  assert.match(en('lifestyle-creep'), /would be about ₹11\.5 lakh/);
  assert.match(en('real-return-fd'), /\(cess left out\)/);
  assert.match(hi('real-return-fd'), /सेस छोड़कर/);
});

test('wording: the notes match the reels (nothing says "the reel does not say so")', () => {
  for (const id of ['path-spare-monthly', 'choose-bonus', 'no-cost-emi', 'path-card-bill', 'car-buying-math', 'lifestyle-creep', 'real-return-fd']) {
    const n = TRUST[id];
    assert.ok(!/does not say so|not shown in the reel|rounds it to ₹12 lakh|shown as about ₹12 lakh/.test(`${n.assumes.en}`), id);
  }
  assert.match(TRUST['no-cost-emi'].assumes.en, /about 36%/);
  assert.match(TRUST['real-return-fd'].assumes.en, /about 4\.8%/);
  assert.match(TRUST['car-buying-math'].assumes.en, /₹12\.5 lakh/);
});

test('lakhDec: one decimal in lakh, no trailing .0', () => {
  assert.deepEqual(lakhDec(1_245_501), { en: '₹12.5 lakh', hi: '₹12.5 लाख' });
  assert.deepEqual(lakhDec(1_150_193), { en: '₹11.5 lakh', hi: '₹11.5 लाख' });
  assert.deepEqual(lakhDec(1_200_000), { en: '₹12 lakh', hi: '₹12 लाख' });
});

// ── Hindi term clean-up ────────────────────────────────────────────────────────────────────────────

test('hindi: "emergency fund" is written one way in the live reels, and the swapped health-insurance labels agree with their sentences', () => {
  const bad = /(इमरजेंसी|इमर्जेंसी|इमरजेन्सी)\s*फ[ंँ़]*ंड|आपातकालीन फंड/u;
  const hits = LIBRARY.filter(r => bad.test(hi(r.id))).map(r => r.id);
  assert.deepEqual(hits, []);
  assert.ok(LIBRARY.some(r => hi(r.id).includes('आपातकालीन फ़ंड')));
  for (const f of ['lib/reels/content-w3-beats.ts', 'lib/reels/content-w4-more.ts']) assert.ok(!src(f).includes('हेल्थ इंश्योरेंस'), f);
});

// ── the two reels that fill the empty cells ──────────────────────────────────────────────────────────

test('new reels: Goals/Myth and Scams/Decision are filled, 30 to 45 s, the right answer is not first', () => {
  const rows = buildMap(LIBRARY, {});
  const cell = (topic: string, level: string) => rows.find(r => r.topic === topic)!.rungs.find(g => g.level === level)!;
  assert.ok(cell('goals', 'myth').total >= 1 && cell('safety', 'decision').total >= 1);
  for (const topic of TOPIC_ORDER) for (const g of rows.find(r => r.topic === topic)!.rungs) assert.ok(g.total > 0, `${topic}/${g.level} is empty`);
  for (const [id, topic, level] of [['myths-goals', 'goals', 'myth'], ['path-unknown-caller', 'safety', 'decision']]) {
    const r = libraryById(id)!;
    assert.equal(r.topic, topic);
    assert.equal(META[id].level, level);
    const s = r.scenes.reduce((n, sc) => n + sc.ms, 0) / 1000;
    assert.ok(s >= 30 && s <= 45, `${id} runs ${s} s`);
    assert.ok(r.quiz.answer !== 0, `${id}: the right answer is first`);
    assert.deepEqual(validateReel(r), [], id);
    assert.ok(r.poke, `${id} has a beat`);
    assert.ok(SERIES.some(sr => sr.episodes.some(e => e.reel === id)), `${id} is in a series`);
    for (const x of textsOf(r)) assert.ok(x.en && x.hi, `${id}: both languages`);
  }
  assert.equal(libraryById('myths-goals')!.poke!.beat.kind, 'myth');
  assert.equal(libraryById('path-unknown-caller')!.poke!.beat.kind, 'path');
});

test('new reels: the scam reel names only the helpline 1930 and no link, and the goals deck quotes no figure', () => {
  const t = en('path-unknown-caller');
  const nums = t.match(/\d[\d,]*/g) ?? [];
  assert.deepEqual(nums.filter(n => n !== '1930'), []);
  assert.ok(!/https?:|www\./i.test(t));
  assert.deepEqual((en('myths-goals').match(/₹|%|\d/g) ?? []), []);
});

test('series: the two reels sit where their story fits, and no series is over eight episodes', () => {
  const scam = SERIES.find(s => s.id === 'scam-proof')!;
  assert.equal(scam.episodes[1].reel, 'path-unknown-caller');
  assert.equal(scam.episodes.length, 8);
  const net = SERIES.find(s => s.id === 'safety-net-30')!;
  assert.ok(net.episodes.some(e => e.reel === 'myths-goals'));
  for (const s of SERIES) assert.ok(s.episodes.length >= 5 && s.episodes.length <= 8, s.id);
});
