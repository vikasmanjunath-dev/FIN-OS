// Trust notes, second pass (Oct 19 2026): every Money Reel that quotes a figure now says how it is worked out. These tests hold the notes to
// the reels they describe: all of them exist and read cleanly in both languages, the shared formulas match the functions that make the figures
// (known-answer checks written from the note's own words), and every rate a note calls "assumed" is a rate the reel actually uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { TRUST, trustFor } from '../lib/reels/trust.ts';
import { QA_ALLOWLIST } from '../lib/reels/qa-allowlist.ts';
import { coverage, liveContext, quotesFigures } from '../lib/reels/qa.ts';
import { textsOf } from '../lib/reels/validate.ts';
import { annuityMonthly, averageCost, driftedShare, emi, grownCost, hraExempt, impliedMonthlyRate, inflatedValue, lumpsumValue, monthsToDeplete, potLoss, proportionalClaim, realReturn, sipFutureValue, sipNeeded, stepUpSipFutureValue, superTopUpSplit, taxAtSlab, unpaidBalance, yearlyDepositsValue } from '../lib/reels/figures.ts';
import { monthsLeft, prepaySaving, retireCorpus } from '../lib/reels/figures-play.ts';
import { STD_NEW, STD_OLD, taxNew, taxOld } from '../lib/taxcore.ts';


/** The reels the author checklist listed on Oct 19 2026 as quoting figures with no trust note. */
const FLAGGED = ['emergency-fund', 'cash-flow', 'tax-regimes', 'section-80c', 'tds-refund', 'capital-gains', 'tax-dates', 'epf-basics', 'nps-basics', 'ppf-basics', 'withdrawal-rate', 'credit-utilisation', 'card-interest-trap', 'home-loan-tenure', 'goal-sip-needed', 'goal-inflation', 'salary-slip-decoded', 'needs-wants-wealth', 'pay-yourself-first', 'lifestyle-creep', 'sip-vs-lumpsum', 'index-fund-basics', 'elss-basics', 'gold-basics', 'rebalancing', 'first-sip-habit', 'market-dips-sip', 'diversification', 'real-return-fd', 'floating-vs-fixed', 'prepay-vs-invest', 'no-cost-emi', 'bnpl-late-fees', 'term-vs-ulip', 'health-cover-gotchas', 'parents-health-cover', 'super-top-up', 'hra-basics', 'fd-interest-tax', 'tax-loss-harvesting', 'section-80d', 'home-loan-tax-benefit', 'standard-deduction', 'retire-number-steps', 'annuity-basics', 'healthcare-in-retirement', 'retirement-buckets', 'wedding-fund', 'child-education-fund', 'first-home-downpayment', 'car-buying-math', 'sabbatical-fund', 'irregular-income-buffer', 'yearly-goal-review', 'sinking-funds', 'windfall-plan', 'spot-job-whatsapp', 'spot-loan-app', 'spot-parcel-fee', 'spot-reward-points', 'spot-new-number-family', 'spot-lottery-win', 'guess-card-dues', 'guess-small-sip', 'guess-rent-20y', 'guess-fee-gap', 'guess-ppf-15', 'guess-home-interest', 'guess-medical-20y', 'guess-step-up', 'slide-start-late', 'slide-rent-power', 'slide-cash-cupboard', 'path-first-raise', 'path-card-bill', 'path-car-payment', 'path-two-year-goal', 'path-spare-monthly', 'stock-basics', 'ipo-basics', 'etf-basics', 'fd-ladder', 'slide-goal-years', 'slide-step-up-rate', 'slide-tax-income', 'slide-card-wait', 'slide-car-loan-rate', 'slide-corpus-small', 'spot-invest-group', 'choose-bonus'];

const reelText = (id: string): string => textsOf(libraryById(id)!).map(x => x.en).join(' | ');
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const indian = (n: number) => Math.round(n).toLocaleString('en-IN');

// ── coverage ───────────────────────────────────────────────────────────────────────────────

test('trust notes: the checklist lists 90 reels and every one now has a note; no live reel quoting a figure is left without one', () => {
  assert.equal(FLAGGED.length, 90);
  assert.equal(new Set(FLAGGED).size, 90);
  for (const id of FLAGGED) { assert.ok(libraryById(id), `${id} is not a live reel`); assert.ok(TRUST[id], `${id} has no trust note`); }
  const missing = LIBRARY.filter(r => quotesFigures(r) && !TRUST[r.id]).map(r => r.id);
  assert.deepEqual(missing, []);
  assert.deepEqual(coverage(liveContext()).noTrustButFigures, []);
});

test('trust notes: no allowlist line still excuses a missing note on a live reel', () => {
  const stale = QA_ALLOWLIST.filter(e => e.code === 'trust-missing' && libraryById(e.id)).map(e => e.id);
  assert.deepEqual(stale, []);
});

test('trust notes: each new note belongs to a reel that quotes a figure, and is a real note in both languages', () => {
  for (const id of FLAGGED) {
    assert.ok(quotesFigures(libraryById(id)!), `${id} has a note but quotes no figure`);
    const t = trustFor(id)!;
    for (const [name, x] of [['formula', t.formula], ['assumes', t.assumes]] as const) {
      assert.ok(x.en.trim().length > 20, `${id} ${name}: English is empty or too short`);
      assert.ok(/[ऀ-ॿ]/.test(x.hi) && x.hi.trim().length > 20, `${id} ${name}: Hindi is empty or not Devanagari`);
      assert.ok(x.en.length < 280, `${id} ${name}: English is ${x.en.length} characters`);
      assert.ok(x.hi.length < 280, `${id} ${name}: Hindi is ${x.hi.length} characters`);
      assert.ok(!/\{\w+\}|NaN|undefined|TODO/.test(x.en + x.hi), `${id} ${name}: placeholder text`);
      assert.ok(!/\b(guaranteed returns?|risk-free|you should|you must|sure profit|will double)\b/i.test(x.en), `${id} ${name}: advice or promise wording`);
    }
    assert.match(t.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(t.asOf)) && t.asOf >= '2026-10-01', `${id}: asOf ${t.asOf}`);
  }
});

test('trust notes: a rate called “assumed” is a rate the reel itself uses', () => {
  for (const id of FLAGGED) {
    const text = reelText(id), json = JSON.stringify(libraryById(id)!.poke?.beat.kind === 'slider' ? libraryById(id)!.poke : {});
    for (const m of trustFor(id)!.assumes.en.matchAll(/assumed (\d+(?:\.\d+)?)%/g)) assert.ok(text.includes(`${m[1]}%`) || json.includes(`"rate":${m[1]}`) || json.includes(`"monthlyPct":${m[1]}`) || json.includes(`"rate0":${m[1]}`), `${id}: note says an assumed ${m[1]}% but the reel never uses it`);
  }
});

test('trust notes: scam reels say nothing is calculated, and name the helpline the reel names', () => {
  for (const id of FLAGGED.filter(x => x.startsWith('spot-'))) {
    const t = trustFor(id)!;
    assert.match(t.formula.en, /Nothing is calculated/);
    assert.match(t.assumes.en, /invented|made up/i, id);
    assert.match(t.assumes.en, /1930/);
    assert.match(reelText(id) + ' | ' + JSON.stringify(libraryById(id)!.poke ?? {}), /1930|scam|fee|deposit|pay/i);
  }
});

// ── shared formulas are shared, and match the function ─────────────────────────────────────────────────────────────

const same = (ids: string[], base: string) => { for (const id of ids) assert.equal(TRUST[id].formula.en, TRUST[base].formula.en, `${id} should share the ${base} formula`); };

test('trust notes: reels with the same maths share one formula text', () => {
  same(['pay-yourself-first', 'lifestyle-creep', 'first-sip-habit', 'guess-small-sip', 'path-first-raise'], 'start-early');
  same(['floating-vs-fixed', 'slide-car-loan-rate'], 'emi-trap');
  same(['goal-sip-needed', 'slide-goal-years', 'yearly-goal-review'], 'goal-sip-slide');
  same(['withdrawal-rate', 'slide-corpus-small'], 'corpus-spend-slide');
  same(['slide-rent-power', 'slide-cash-cupboard'], 'inflation');
  same(['home-loan-tenure', 'guess-home-interest', 'car-buying-math', 'path-car-payment'], 'home-loan-tenure');
  same(['card-interest-trap', 'guess-card-dues', 'slide-card-wait', 'bnpl-late-fees'], 'card-interest-trap');
  same(['guess-rent-20y', 'guess-medical-20y', 'healthcare-in-retirement', 'goal-inflation'], 'goal-inflation');
  same(['section-80c', 'elss-basics', 'nps-basics', 'section-80d', 'parents-health-cover', 'home-loan-tax-benefit', 'standard-deduction'], 'section-80c');
  same(['tax-regimes', 'slide-tax-income'], 'tax-regimes');
  same(['guess-ppf-15', 'term-vs-ulip'], 'ppf-basics');
  same(['guess-step-up', 'slide-step-up-rate'], 'guess-step-up');
  same(['index-fund-basics', 'guess-fee-gap', 'path-two-year-goal', 'prepay-vs-invest'], 'index-fund-basics');
  // and a difference that is real stays different: the shared constants are not used where the maths is not the same
  assert.notEqual(TRUST['slide-start-late'].formula.en, TRUST['start-early'].formula.en);
  assert.notEqual(TRUST['wedding-fund'].formula.en, TRUST['goal-sip-needed'].formula.en);
});

test('SIP notes: monthly × ((1 + i)^n − 1) ÷ i with i = yearly rate ÷ 12 gives the figures the reels show', () => {
  const byWords = (m: number, pct: number, years: number) => { const i = pct / 100 / 12, n = years * 12; return m * ((Math.pow(1 + i, n) - 1) / i); };
  for (const [m, pct, y] of [[5000, 10, 10], [5000, 12, 10], [2000, 12, 5], [1000, 12, 25], [5000, 10, 10], [10000, 10, 10]] as const) near(byWords(m, pct, y), sipFutureValue(m, pct, y));
  assert.equal(Math.round(sipFutureValue(5000, 10, 10)), 1_024_225);          // pay-yourself-first
  assert.equal(Math.round(sipFutureValue(5000, 12, 10)), 1_150_193);          // lifestyle-creep: ₹11.5 lakh, shown as about ₹12 lakh
  assert.equal(Math.round(sipFutureValue(2000, 12, 5)), 163_339);             // first-sip-habit
  assert.equal(Math.round(sipFutureValue(1000, 12, 25)), 1_878_847);          // guess-small-sip
  assert.match(TRUST['lifestyle-creep'].assumes.en, /₹11\.5 lakh/);
});

test('EMI notes: the EMI, the total and the interest match the words of the note', () => {
  const byWords = (p: number, pct: number, years: number) => { const r = pct / 1200, n = years * 12; return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1); };
  for (const [p, pct, y] of [[5e6, 8.5, 20], [5e6, 8.5, 30], [5e6, 9.5, 20], [1e6, 9, 5], [8e5, 9, 5], [5e5, 9, 5], [8e5, 12, 5]] as const) near(byWords(p, pct, y), emi(p, pct, y));
  near(emi(5e6, 8.5, 20) * 240, 10_413_878.8, 1e-6);                          // home-loan-tenure, guess-home-interest: about ₹1.04 crore
  near(emi(5e6, 8.5, 20) * 240 - 5e6, 5_413_878.8, 1e-6);                     // interest about ₹54 lakh
  assert.equal(Math.round(emi(5e6, 8.5, 30) * 360), 13_840_443);
  assert.equal(Math.round(emi(5e6, 9.5, 20)), 46_607);                         // floating-vs-fixed
  assert.equal(Math.round(emi(1e6, 9, 5)), 20_758);                            // car-buying-math
  assert.ok(TRUST['car-buying-math'].assumes.en.includes(indian(emi(1e6, 9, 5) * 60)), 'the note quotes the exact total');
  assert.ok(TRUST['path-car-payment'].assumes.en.includes('₹1.96 lakh') && Math.round((emi(8e5, 9, 5) * 60 - 8e5) / 1e3) === 196);
  assert.ok(TRUST['path-car-payment'].assumes.en.includes('₹1.23 lakh') && Math.round((emi(5e5, 9, 5) * 60 - 5e5) / 1e3) === 123);
});

test('goal notes: monthly amount = goal × i ÷ ((1 + i)^n − 1), and the cost-later steps, match the reels’ figures', () => {
  const byWords = (goal: number, pct: number, years: number) => { const i = pct / 1200, n = years * 12; return (goal * i) / (Math.pow(1 + i, n) - 1); };
  for (const [g, pct, y] of [[5e6, 10, 15], [5e6, 10, 10], [2e6, 10, 10], [2e6, 10, 9]] as const) near(byWords(g, pct, y), sipNeeded(g, pct, y));
  assert.equal(Math.round(sipNeeded(5e6, 10, 15)), 12_064);
  assert.equal(Math.round(sipNeeded(5e6, 10, 10)), 24_409);                    // goal-sip-needed: waiting five years leaves ten
  assert.equal(Math.round(sipNeeded(2e6, 10, 10)), 9_763);                     // yearly-goal-review
  assert.equal(Math.round(sipNeeded(2e6, 10, 9)), 11_491);                     // a year late: nine years left
  const wedding = grownCost(1_200_000, 8, 5), edu = grownCost(2_000_000, 8, 12);
  assert.equal(Math.round(sipNeeded(wedding, 7, 5)), 24_628);                  // wedding-fund
  assert.equal(Math.round(sipNeeded(edu, 10, 12)), 18_219);                    // child-education-fund
  assert.ok(TRUST['wedding-fund'].assumes.en.includes('₹17.6 lakh') && Math.round(wedding / 1e4) === 176);
  assert.ok(TRUST['child-education-fund'].assumes.en.includes('₹50.4 lakh') && Math.round(edu / 1e4) === 504);
  const down = 6_000_000 * (0.20 + 0.07);
  assert.equal(down, 1_620_000);                                               // first-home-downpayment
  assert.equal(Math.round(sipNeeded(down, 7, 5)), 22_628);
});

test('cost-later and buying-power notes: (1 + rise)^years up, ÷ (1 + inflation)^years down', () => {
  near(1e7 * Math.pow(1.06, 20), grownCost(1e7, 6, 20));
  assert.equal(Math.round(grownCost(1e7, 6, 20) / 1e5), 321);                  // goal-inflation: ₹3.21 crore
  assert.equal(Math.round(grownCost(20000, 6, 20)), 64_143);                   // guess-rent-20y
  assert.equal(Math.round(grownCost(1e5, 10, 20)), 672_750);                   // guess-medical-20y, healthcare-in-retirement
  near(25000 / Math.pow(1.06, 10), inflatedValue(25000, 6, 10));
  near(1e6 / Math.pow(1.05, 10), inflatedValue(1e6, 5, 10));
  assert.equal(Math.round(inflatedValue(25000, 6, 20)), 7_795);                // annuity-basics
  assert.equal(annuityMonthly(5e6, 6), 25_000);
  const r = retireCorpus(7.2e5 / 12, 6, 25);
  assert.equal(Math.round(r.futureMonthly * 12 / 1e5), 31);                    // retire-number-steps: about ₹31 lakh a year
  assert.equal(Math.round(r.corpus / 1e5), 773);                               // about ₹7.73 crore
});

test('card and pay-later notes: balance × (1 + monthly rate)^months, interest = balance − amount', () => {
  near(50000 * Math.pow(1.035, 12), unpaidBalance(50000, 3.5, 12));
  assert.equal(Math.round(unpaidBalance(50000, 3.5, 12)), 75_553);
  assert.equal(Math.round(unpaidBalance(20000, 3, 3)), 21_855);
  assert.equal(Math.round(40000 * 0.035), 1400);                               // path-card-bill: one month on ₹40,000
  assert.equal(Math.round(25000 * 0.035), 875);
});

test('lump-sum and cost notes: amount × (1 + i)^n, i = yearly rate ÷ 12, with the cost taken off the rate', () => {
  near(1e6 * Math.pow(1 + 0.118 / 12, 240), lumpsumValue(1e6, 11.8, 20));
  assert.equal(Math.round(lumpsumValue(1e6, 11.8, 20) / 1e5), 105);            // index-fund-basics: near ₹1.05 crore at 0.2%
  assert.equal(Math.round(lumpsumValue(1e6, 10.5, 20) / 1e5), 81);             // near ₹81 lakh at 1.5%
  assert.equal(Math.round(lumpsumValue(1e6, 11.8, 25) / 1e5), 188);            // guess-fee-gap
  assert.equal(Math.round(lumpsumValue(1e6, 10.5, 25) / 1e5), 136);
  assert.equal(Math.round(lumpsumValue(1e5, 9, 10)), 245_136);                 // prepay-vs-invest
  assert.equal(Math.round(lumpsumValue(1e5, 12, 10)), 330_039);
  assert.equal(Math.round(lumpsumValue(2e5, 7, 2) / 1e3), 230);               // path-two-year-goal
  assert.equal(Math.round(lumpsumValue(2e5, 12, 2) / 1e3), 254);
  assert.equal(Math.round(lumpsumValue(2e5, -10, 2) / 1e3), 164);
});

test('PPF note: a deposit at the start of each year, interest added yearly, matches the PPF and term-plan figures', () => {
  const byWords = (dep: number, pct: number, n: number) => { const r = pct / 100; return dep * ((Math.pow(1 + r, n) - 1) / r) * (1 + r); };
  near(byWords(1e5, 7, 15), yearlyDepositsValue(1e5, 7, 15));
  assert.equal(Math.round(yearlyDepositsValue(1e5, 7, 15)), 2_688_805);        // ppf-basics, guess-ppf-15: about ₹27 lakh
  assert.equal(Math.round(yearlyDepositsValue(38000, 10, 20) / 1e5), 24);      // term-vs-ulip: about ₹24 lakh
});

test('step-up note: balance × (1 + i) + SIP each month, raised once a year', () => {
  let bal = 0, sip = 10000;
  for (let y = 0; y < 20; y++) { for (let m = 0; m < 12; m++) bal = bal * (1 + 0.12 / 12) + sip; sip *= 1.10; }
  near(bal, stepUpSipFutureValue(10000, 10, 12, 20));
  assert.equal(Math.round(bal / 1e5), 197);                                    // guess-step-up: about ₹1.97 crore
  assert.equal(Math.round(sipFutureValue(10000, 12, 20) / 1e5), 99);           // a flat SIP: about ₹99 lakh
});

test('corpus note: months the corpus lasts = −ln(1 − C × r ÷ W) ÷ ln(1 + r)', () => {
  const byWords = (c: number, pct: number, w: number) => { const r = pct / 1200; return -Math.log(1 - (c * r) / w) / Math.log(1 + r); };
  for (const w of [60000, 80000]) near(byWords(1e7, 7, w), monthsToDeplete(1e7, 7, w));
  assert.equal(Math.round(monthsToDeplete(1e7, 7, 60000) / 12), 51);          // withdrawal-rate
  assert.equal(Math.round(monthsToDeplete(1e7, 7, 80000) / 12), 19);
  assert.equal(monthsToDeplete(5e6, 7, 25000), Infinity);            // slide-corpus-small: never used up, shown as 60+
});

// ── tax notes use the same constants and rules as lib/taxcore.ts ───────────────────────────────────────────────────

test('tax notes: the regimes example and the salary-slip example follow the rules the note states', () => {
  assert.equal(STD_NEW, 75_000);                                               // “pay − ₹75,000” in the note
  assert.equal(STD_OLD, 50_000);
  assert.match(TRUST['tax-regimes'].formula.en, /₹75,000/);
  assert.match(TRUST['tax-regimes'].formula.en, /₹12 lakh/);
  assert.match(TRUST['tax-regimes'].formula.en, /₹5 lakh/);
  assert.match(TRUST['tax-regimes'].formula.en, /4% cess/);
  assert.match(TRUST['tax-regimes'].formula.en, /FY 2025-26/);
  const pay = 1_500_000;
  assert.equal(taxNew(pay - STD_NEW), 97_500);                                 // tax-regimes, tds-refund: ₹97,500
  assert.equal(taxOld(pay - STD_OLD - 200_000), 195_000);                      // ₹1.95 lakh
  assert.equal(taxNew(12 * 100_000 - 57_600 - STD_NEW), 0);                    // salary-slip-decoded: no income tax at ₹12 lakh CTC
  const inHand = (1_200_000 - 57_600 - 57_600 - 2_400 - 0) / 12;               // CTC − employer PF − employee PF − professional tax − tax
  assert.equal(inHand, 90_200);
  assert.equal(0.4 * 1_200_000 * 0.12, 57_600);                                // basic 40% of CTC, PF 12% of basic
});

test('tax notes: tax saved = deduction × slab rate × 1.04, and the amounts the notes quote', () => {
  for (const [id, amount, slab, saved] of [['section-80c', 150000, 20, 31200], ['section-80c', 150000, 30, 46800], ['elss-basics', 150000, 30, 46800], ['nps-basics', 50000, 30, 15600], ['section-80d', 75000, 30, 23400], ['parents-health-cover', 50000, 30, 15600], ['home-loan-tax-benefit', 200000, 30, 62400], ['standard-deduction', 75000, 30, 23400]] as const) {
    near(taxAtSlab(amount, slab), saved);
    assert.ok(TRUST[id].assumes.en.includes(indian(saved)) || id === 'section-80c', `${id}: the note quotes ₹${indian(saved)}`);
    assert.ok(reelText(id).includes(indian(saved)), `${id}: the reel shows ₹${indian(saved)}`);
  }
  near(taxAtSlab(100000, 30), 31200);                                          // fd-interest-tax: ₹31,200 tax, ₹68,800 left
  assert.equal(100000 - taxAtSlab(100000, 30), 68800);
  assert.equal(120000 - 97500, 22500);                                         // tds-refund: the extra ₹22,500
  assert.match(TRUST['hra-basics'].assumes.en, /₹15,000/);
  assert.equal(hraExempt(50000, 25000, 20000, true), 15000);
  assert.equal(hraExempt(50000, 25000, 20000, false), 15000);                  // 40% of basic = 20,000, rent − 10% = 15,000: still the least
});

// ── the remaining formulas in the notes ────────────────────────────────────────────────────────────────────────────

test('no-cost EMI note: the monthly rate that makes three ₹10,000 payments worth ₹28,500, times 12', () => {
  const r = impliedMonthlyRate(28500, 10000, 3);
  near((10000 * (1 - Math.pow(1 + r / 100, -3))) / (r / 100), 28500, 1e-9);
  assert.equal(Math.round(r * 10) / 10, 2.6);
  assert.equal(Math.round(r * 12), 31);
});

test('real-return note: after-tax rate, then ÷ (1 + inflation) − 1', () => {
  const after = 7 * (1 - 0.30);
  assert.ok(Math.abs(after - 4.9) < 1e-9);
  near(((1 + after / 100) / 1.06 - 1) * 100, realReturn(7, 6, 30));
  assert.equal(Math.round(realReturn(7, 6, 30) * 100) / 100, -1.04);
});

test('market-dips, rebalancing and diversification notes: units, drift and the share of the pot', () => {
  const a = averageCost(5000, [50, 40, 25, 40, 50]);
  assert.equal(a.units, 650);
  assert.equal(a.invested, 25000);
  assert.equal(Math.round(a.perUnit), 38);
  assert.equal(a.avgNav, 41);
  assert.deepEqual(driftedShare([60, 40], [30, 5]).map(Math.round), [65, 35]);
  assert.equal(potLoss(100, 50), 50);
  assert.equal(potLoss(20, 50), 10);
});

test('protection notes: a room-rent cut in proportion, and a super top-up that starts above its deductible', () => {
  assert.equal(proportionalClaim(200000, 5000, 10000), 100000);
  assert.equal(proportionalClaim(200000, 5000, 4000), 200000);
  assert.deepEqual(superTopUpSplit(1_200_000, 500_000, 500_000, 2_000_000), { base: 500_000, topUp: 700_000, you: 0 });
});

test('loan decision notes: the same loan, the months left and the interest saved the choices quote', () => {
  const loan = 3_000_000, e = Math.round(emi(loan, 9, 20));
  assert.equal(Math.round(monthsLeft(loan, 9, e)), 240);                       // path-spare-monthly: a 20-year loan
  const extra = (emi0: number, add: number) => { const n0 = monthsLeft(loan, 9, emi0), n1 = monthsLeft(loan, 9, emi0 + add); return { years: (n0 - n1) / 12, interest: emi0 * n0 - (emi0 + add) * n1 }; };
  const x = extra(e, 15000);
  assert.equal(Math.round(x.years), 11);
  assert.equal(Math.round(x.interest / 1e5), 22);
  assert.equal(Math.round(sipFutureValue(15000, 12, 10) / 1e5), 35);
  const b = prepaySaving(400000, 9, emi(400000, 9, 3), 200000);                // choose-bonus: a 3-year loan
  assert.equal(Math.round(b.monthsSaved), 19);
  assert.equal(Math.round(b.interestSaved), 44_309);
  assert.equal(Math.round(200000 * Math.pow(1.12, 10) / 1e3), 621);            // ₹6.21 lakh, yearly compounding
  assert.equal((2 * 60000 + 200000) / 60000, 5.333333333333333);               // 2 months of spending plus the bonus: about 5.3 months
});

test('the notes’ own text names what they use: stated limits and bodies appear in the right notes', () => {
  assert.match(TRUST['epf-basics'].assumes.en, /EPFO/);
  assert.match(TRUST['nps-basics'].assumes.en, /PFRDA/);
  assert.match(TRUST['spot-invest-group'].assumes.en, /SEBI/);
  assert.match(TRUST['spot-loan-app'].assumes.en, /RBI/);
  assert.match(TRUST['health-cover-gotchas'].assumes.en, /IRDAI/);
  assert.match(TRUST['tax-dates'].formula.en, /₹10,000/);
  assert.match(TRUST['ppf-basics'].assumes.en, /quarter/);
  assert.match(TRUST['section-80d'].assumes.en, /₹25,000/);
  assert.match(TRUST['section-80d'].assumes.en, /₹50,000/);
});
