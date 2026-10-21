// Your Number, wave 2: the extra reels rebuilt from the person's own figures. Known-answer maths for every new formula, the same sanity limits as
// mine.ts, the strain guard, both languages, the trust notes, and the documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { metaOf } from '../lib/reels/meta.ts';
import { deriveSignals } from '../lib/reels/signals.ts';
import { deriveMine, type Mine } from '../lib/reels/mine.ts';
import { PERSONAL_MORE, personaliseMore, saneIncome, saneMine } from '../lib/reels/personal-more.ts';
import { personaliseReels } from '../lib/reels/personal.ts';
import { loanFor, personalisePlay } from '../lib/reels/personal-play.ts';
import { TRUST, trustFor } from '../lib/reels/trust.ts';
import { validateReel, textsOf } from '../lib/reels/validate.ts';
import { emi, grownCost, inflatedValue, money, sipFutureValue, stepUpSipFutureValue } from '../lib/reels/figures.ts';
import { emiAfterRateRise, extraMonthlySaving, monthsCovered, monthsLeft, retireCorpus, stepUpPaid } from '../lib/reels/figures-play.ts';
import type { DeclaredEvent } from '../lib/lifeEvents.ts';
import type { Reel } from '../lib/reels/types.ts';

const NOW = new Date(2026, 9, 19, 9, 0, 0);
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) / Math.abs(b) <= tol, `${a} vs ${b}`);
const home = { label: { en: 'home loan', hi: 'होम लोन' }, balance: 4_500_000, rate: 8.75, emi: Math.round(emi(4_500_000, 8.75, 20)) };
const RICH: Mine = { sip: 10_000, spend: 40_000, fund: 160_000, loan: home };
const WELL = { strain: false, income: 150_000 };
const NEW_IDS = Object.keys(PERSONAL_MORE);
const out = (mine: Mine, ctx: Parameters<typeof personaliseMore>[2] = WELL): Reel[] => personalisePlay(personaliseReels(LIBRARY, mine, ctx), mine, ctx);
const get = (list: Reel[], id: string) => list.find(r => r.id === id)!;
const said = (r: Reel) => r.scenes.map(s => s.say.en).join(' | ');
const saidHi = (r: Reel) => r.scenes.map(s => s.say.hi).join(' | ');

// ── the maths, known answers ────────────────────────────────────────────────────────────────────────────────────

test('your number 2: an extra monthly payment ends the loan sooner (the example reel\'s own numbers, and a month-by-month check)', () => {
  // home-loan-prepay example: ₹50 lakh, 8.5%, 20 years, ₹8,000 extra a month: "about ₹19 lakh saved, about 6 years sooner"
  const e = emi(5_000_000, 8.5, 20), v = extraMonthlySaving(5_000_000, 8.5, e, 8_000);
  near(v.monthsBefore, 240, 0.005); near(v.monthsSaved, 72, 0.06); near(v.interestSaved, 1_900_000, 0.04);
  // independent check: pay the loan down one month at a time
  const sim = (pay: number) => { let b = 4_000_000, n = 0, paid = 0; while (b > 0.5 && n < 1000) { b = b * (1 + 0.09 / 12) - pay; paid += Math.min(pay, b + pay); n++; } return { n, paid }; };
  const e2 = emi(4_000_000, 9, 20), a = sim(e2), b = sim(e2 + 5_000), w = extraMonthlySaving(4_000_000, 9, e2, 5_000);
  assert.ok(Math.abs(w.monthsAfter - b.n) <= 1 && Math.abs(w.monthsBefore - a.n) <= 1, `${w.monthsBefore}/${a.n} ${w.monthsAfter}/${b.n}`);
  near(w.interestSaved, (a.paid - 4_000_000) - (b.paid - 4_000_000), 0.01);
  assert.deepEqual(extraMonthlySaving(1_000_000, 9, emi(1_000_000, 9, 10), 0).interestSaved, 0);
  assert.ok(Number.isNaN(extraMonthlySaving(1_000_000, 12, 5_000, 1_000).monthsBefore), 'an EMI under the interest never clears the loan');
});

test('your number 2: a rise in the rate changes the EMI by the ratio of the standard EMIs (the example reel\'s numbers)', () => {
  // rbi-and-emi example: ₹30 lakh, 20 years, 8.5% to 9%: ₹26,035 to ₹26,992, about ₹957 more
  const now = emi(3_000_000, 8.5, 20), after = emiAfterRateRise(3_000_000, 8.5, 240, 0.5, now);
  near(now, 26_035, 0.0005); near(after, 26_992, 0.0005); near(after - now, 957, 0.01);
  // the person's own EMI is the starting point, not a recalculated one
  near(emiAfterRateRise(3_000_000, 8.5, 240, 0.5, 30_000), 30_000 * 26_992 / 26_035, 0.0005);
  near(emiAfterRateRise(3_000_000, 8.5, 240, 0, 30_000), 30_000, 1e-9);
  assert.ok(Number.isNaN(emiAfterRateRise(0, 8.5, 240, 0.5, 30_000)) && Number.isNaN(emiAfterRateRise(1e6, 8.5, 0, 0.5, 30_000)));
});

test('your number 2: money put in by a SIP that rises each year, a retirement number, and months of cover', () => {
  // ₹10,000 a month, up 10% a year, 20 years: 120,000 × (1.1^20 − 1) ÷ 0.1
  near(stepUpPaid(10_000, 10, 20), 6_873_000, 0.0005);
  assert.equal(stepUpPaid(10_000, 0, 20), 2_400_000);
  assert.ok(stepUpPaid(5_000, 10, 20) < stepUpSipFutureValue(5_000, 10, 12, 20), 'what is put in is less than what it grows to at 12%');
  // retire-corpus example: ₹50,000 a month, 6%, 25 years: ₹2.15 lakh a month, a corpus of about ₹6.44 crore
  const r = retireCorpus(50_000, 6, 25);
  near(r.futureMonthly, 214_594, 0.0005); near(r.corpus, 64_378_200, 0.0005);
  assert.equal(retireCorpus(100_000, 0, 10).corpus, 100_000 * 12 * 25);
  assert.equal(monthsCovered(120_000, 40_000), 3); assert.equal(monthsCovered(0, 40_000), 0);
  near(grownCost(30_000, 6, 10), 53_725, 0.001);
});

// ── the sanity limits are mine.ts's ─────────────────────────────────────────────────────────────────────────────

test('your number 2: the sanity limits are the same as mine.ts at every edge', () => {
  const cases: Record<string, string>[] = [
    { finos_sip_monthly: '499' }, { finos_sip_monthly: '500' }, { finos_sip_monthly: '500000' }, { finos_sip_monthly: '500001' },
    { finos_monthly_expense: '4999' }, { finos_monthly_expense: '5000' }, { finos_monthly_expense: '1000000' }, { finos_monthly_expense: '1000001' },
    { finos_emergency_fund: '999' }, { finos_emergency_fund: '1000' }, { finos_emergency_fund: '100000000' }, { finos_emergency_fund: '100000001' },
    ...[0.99, 1, 40, 40.01].map(rate => ({ finos_home_loan: '1000000', finos_home_loan_rate: String(rate), finos_home_loan_emi: '60000' })),
    ...[9999, 10_000, 500_000_000, 500_000_001].map(b => ({ finos_home_loan: String(b), finos_home_loan_rate: '9', finos_home_loan_emi: '5000000' })),
    ...[499, 500].map(e => ({ finos_home_loan: '20000', finos_home_loan_rate: '9', finos_home_loan_emi: String(e) })),
    { finos_home_loan: '1000000', finos_home_loan_rate: '12', finos_home_loan_emi: '10000' },     // EMI equals the interest: not a loan a reel can describe
    { finos_home_loan: '1000000', finos_home_loan_rate: '12', finos_home_loan_emi: '10001' },
  ];
  for (const raw of cases) assert.deepEqual(saneMine(deriveMine(raw)), deriveMine(raw), JSON.stringify(raw));
  // the other direction: a figure typed straight into Mine is held to the same limits
  const wild: Mine = { sip: 100, spend: 2, fund: 5e9, loan: { ...home, rate: 0, emi: 1 } };
  assert.deepEqual(saneMine(wild), {});
  assert.deepEqual(saneMine({ sip: NaN, spend: Infinity } as Mine), {});
  assert.equal(saneIncome(4_999), undefined); assert.equal(saneIncome(5_000), 5_000); assert.equal(saneIncome(1e7), 1e7); assert.equal(saneIncome(1e7 + 1), undefined); assert.equal(saneIncome('x'), undefined);
});

// ── the reels ───────────────────────────────────────────────────────────────────────────────────────────────────

test('your number 2: with everything known, all eleven reels are rebuilt, keep their id and place, pass every script rule and leave the quiz alone', () => {
  assert.ok(NEW_IDS.length >= 8, 'at least eight new reels');
  const list = out(RICH);
  assert.deepEqual(list.map(r => r.id), LIBRARY.map(r => r.id));
  for (const id of NEW_IDS) {
    const r = get(list, id), base = libraryById(id)!;
    assert.equal(r.mine, true, `${id} was not rebuilt`);
    assert.deepEqual(validateReel(r), [], id);
    assert.deepEqual(r.quiz, base.quiz, `${id}: the quiz must not carry a personal figure`);
    assert.equal(r.topic, base.topic); assert.equal(r.lesson, base.lesson); assert.deepEqual(r.title, base.title);
    assert.equal(!!r.poke, !!base.poke, `${id}: a reel does not gain or lose its beat`);
    if (base.poke) { assert.equal(r.poke!.beat.kind, base.poke.beat.kind); assert.equal(r.poke!.after, base.poke.after); }
  }
});

test('your number 2: every rebuilt reel says in a caption that the figure came from this app and stays on this phone, in both languages', () => {
  const list = out(RICH);
  for (const id of NEW_IDS) {
    const r = get(list, id);
    assert.match(said(r), /this app/i, id); assert.match(said(r), /stays? on this phone/i, id);
    assert.match(saidHi(r), /ऐप/, id); assert.match(saidHi(r), /फ़ोन/, id);
    for (const x of textsOf(r)) assert.ok(x.en.trim() && /[ऀ-ॿ]/.test(x.hi) || !/[A-Za-z]{4}/.test(x.en), `${id}: "${x.en}"`);
  }
});

test('your number 2: with nothing on the phone, or figures that fail the limits, every reel keeps its example (same object)', () => {
  for (const mine of [{}, { sip: 100, spend: 3, fund: 1, loan: { ...home, emi: 1_000 } }] as Mine[]) {
    const list = out(mine);
    for (const id of NEW_IDS) assert.equal(get(list, id), libraryById(id), id);
  }
  const noIncome = out(RICH, { strain: false });
  assert.equal(get(noIncome, 'home-loan-affordability'), libraryById('home-loan-affordability'), 'the EMI share needs income');
  assert.equal(get(out(RICH, { strain: false, income: 3_000 }), 'home-loan-affordability'), libraryById('home-loan-affordability'), 'an income of ₹3,000 a month is not believed');
  assert.equal(get(out(RICH, { strain: false, income: home.emi }), 'home-loan-affordability'), libraryById('home-loan-affordability'), 'an EMI as big as the income is not described');
  const justSpend = out({ spend: 40_000 });
  assert.deepEqual(NEW_IDS.filter(id => get(justSpend, id).mine).sort(), ['emergency-target', 'inflation', 'retire-corpus']);
  const justSip = out({ sip: 10_000 });
  assert.deepEqual(NEW_IDS.filter(id => get(justSip, id).mine).sort(), ['corpus-spend-slide', 'goal-step-up', 'slide-sip-length']);
  const justLoan = out({ loan: home }, { strain: false });
  assert.deepEqual(NEW_IDS.filter(id => get(justLoan, id).mine).sort(), ['emi-rate-slide', 'home-loan-prepay', 'rbi-and-emi', 'slide-emi-tenure']);
  assert.equal(NEW_IDS.filter(id => get(out(RICH), id).mine).length, NEW_IDS.length);
});

test('your number 2: the figures in the captions are the person\'s, worked out by the tested functions', () => {
  const list = out({ ...RICH, spend: 30_000, fund: 90_000, sip: 10_000 });
  // goal-step-up: the example reel says ₹99 lakh flat and ₹1.97 crore stepped up for ₹10,000 a month
  const step = get(list, 'goal-step-up');
  assert.match(said(step), /₹10,000 a month/); assert.match(said(step), /₹99 lakh/); assert.match(said(step), /₹1\.97 crore/);
  near(sipFutureValue(10_000, 12, 20), 9_892_554, 0.001);
  // emergency-target: ₹30,000 a month and ₹90,000 set aside is 3 months
  const em = get(list, 'emergency-target');
  assert.match(said(em), /₹30,000/); assert.match(said(em), /₹90,000 to ₹1\.8 lakh/); assert.match(said(em), /about 3 months/);
  // inflation: ₹30,000 now is about ₹53,725 a month in ten years at an assumed 6%
  assert.match(said(get(list, 'inflation')), /₹30,000/); assert.match(said(get(list, 'inflation')), /₹53,725/);
  // retire-corpus
  const rc = retireCorpus(30_000, 6, 25);
  assert.match(said(get(list, 'retire-corpus')), new RegExp(money(rc.corpus).en.replace('.', '\\.')));
  // the loan reels use the person's own loan
  const l = loanFor(home)!, pre = get(list, 'home-loan-prepay'), extra = Math.max(500, Math.round(home.emi * 0.1 / 500) * 500), v = extraMonthlySaving(home.balance, home.rate, home.emi, extra);
  assert.match(said(pre), /home loan/); assert.match(said(pre), new RegExp(money(extra).en)); assert.match(said(pre), new RegExp(money(v.interestSaved).en.replace('.', '\\.')));
  const rbi = get(list, 'rbi-and-emi');
  assert.match(said(rbi), /8\.75%/); assert.match(said(rbi), /9\.25%/); assert.match(said(rbi), new RegExp(money(emiAfterRateRise(home.balance, home.rate, l.months, 0.5, home.emi)).en));
});

test('your number 2: the slider reels carry the person\'s own model and a range around their figures', () => {
  const list = out(RICH);
  const rate = get(list, 'emi-rate-slide').poke!.beat as { min: number; max: number; start: number; step: number; model: { kind: string; principal: number; years: number; rate0: number } };
  assert.equal(rate.model.kind, 'emi-rate'); assert.equal(rate.model.principal, home.balance); assert.equal(rate.model.rate0, 8.75);
  near(rate.model.years * 12, monthsLeft(home.balance, home.rate, home.emi), 0.01);
  assert.ok(rate.min < 8.75 && rate.max > 8.75 && rate.start >= rate.min && rate.start <= rate.max && rate.min >= 1);
  const sip = get(list, 'slide-sip-length').poke!.beat as { model: { monthly: number; rate: number } }; assert.deepEqual(sip.model, { kind: 'sip-years', monthly: 10_000, rate: 12 });
  const ten = get(list, 'slide-emi-tenure').poke!.beat as { model: { principal: number; rate: number } }; assert.deepEqual(ten.model, { kind: 'emi-tenure', principal: home.balance, rate: 8.75 });
  const c = get(list, 'corpus-spend-slide').poke!.beat as { model: { corpus: number; rate: number }; min: number; max: number; start: number; step: number };
  near(c.model.corpus, sipFutureValue(10_000, 12, 25), 0.0001); assert.equal(c.model.rate, 7);
  assert.ok(c.min > 0 && c.max > c.min && c.start >= c.min && c.start <= c.max && (c.max - c.min) / c.step <= 200);
});

test('your number 2: the EMI share of income is the EMI over the income, and an EMI over half of income is handled gently', () => {
  const calm = get(out(RICH), 'home-loan-affordability');
  const share = Math.round((home.emi / 150_000) * 100);
  assert.match(said(calm), new RegExp(`about ${share}% of your income`)); assert.match(said(calm), /₹60,000 a month/);
  const fits = Math.round(60_000 * (1 - Math.pow(1 + 8.75 / 1200, -240)) / (8.75 / 1200));
  assert.match(said(calm), new RegExp(money(fits).en.replace('.', '\\.')));
  assert.ok(!/feels heavy/.test(said(calm)));
  const heavyMine: Mine = { loan: { ...home, emi: 80_000, balance: 6_000_000 } };
  const heavy = get(out(heavyMine, { strain: true, income: 100_000 }), 'home-loan-affordability');
  assert.equal(heavy.mine, true); assert.match(said(heavy), /about 80% of your income/); assert.match(said(heavy), /feels heavy/); assert.ok(!/comfortably repay/.test(said(heavy)));
  assert.deepEqual(validateReel(heavy), []);
});

// ── strain ──────────────────────────────────────────────────────────────────────────────────────────────────────

const jobLoss: DeclaredEvent = { id: 'e1', type: 'job_loss', date: '2026-09-01', createdAt: 0 };
const strained = deriveSignals({ now: NOW, mine: { ...RICH, loan: { ...home, emi: 62_000 } }, income: 100_000 });

test('strain: with an EMI at half of income or an active job loss, no personalised reel uses growth framing', () => {
  assert.equal(strained.strain, true);
  for (const s of [strained, deriveSignals({ now: NOW, mine: RICH, income: 150_000, events: [jobLoss] })]) {
    assert.equal(s.strain, true);
    const list = personalisePlay(personaliseReels(LIBRARY, s.mine, s), s.mine, s);
    for (const r of list) if (r.mine) assert.ok(!metaOf(r.id).growth, `${r.id} is a growth reel but was personalised under strain`);
    for (const id of NEW_IDS.filter(i => PERSONAL_MORE[i].asksMore)) assert.equal(get(list, id), libraryById(id), `${id} asks for more and must keep its example under strain`);
    for (const id of ['start-early', 'guess-sip', 'delay-cost']) assert.equal(get(list, id), libraryById(id), id);
    // the gentler reels are still rebuilt, and none of them talks of growth, investing or putting in more
    const kept = NEW_IDS.filter(id => get(list, id).mine);
    assert.ok(kept.length >= 4, kept.join());
    for (const id of kept) assert.ok(!/\b(grow\w*|invest\w*|put in more|raise your|step up|prepay\w*)\b/i.test(said(get(list, id))), `${id}: ${said(get(list, id))}`);
  }
});

test('strain: not under strain the same people get every reel; with strain unknown the growth reels keep their examples', () => {
  const s = deriveSignals({ now: NOW, mine: RICH, income: 150_000 });
  assert.equal(s.strain, false);
  const list = personalisePlay(personaliseReels(LIBRARY, s.mine, s), s.mine, s);
  for (const id of NEW_IDS) assert.equal(get(list, id).mine, true, id);
  for (const id of ['start-early', 'guess-sip', 'delay-cost', 'emi-trap', 'guess-emi', 'emergency-fund']) assert.equal(get(list, id).mine, true, id);
  // no context at all: strain is not known, so the reels that ask for more are not rebuilt (fail closed); the rest are
  const blind = personalisePlay(personaliseReels(LIBRARY, RICH), RICH);
  for (const id of NEW_IDS) assert.equal(!!get(blind, id).mine, !PERSONAL_MORE[id].asksMore && id !== 'home-loan-affordability', id);
  assert.equal(get(personalisePlay(LIBRARY, RICH), 'guess-sip').mine, true, 'the three first-wave playable reels keep working with two arguments');
});

test('strain: every wave-2 reel that the meta file calls growth is marked as asking for more', () => {
  for (const id of NEW_IDS) if (metaOf(id).growth) assert.equal(PERSONAL_MORE[id].asksMore, true, id);
});

test('strain: 300 made-up people, and none under strain is shown a personalised growth reel', () => {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let strainedCount = 0;
  for (let i = 0; i < 300; i++) {
    const income = 20_000 + Math.round(rnd() * 180_000), balance = 300_000 + Math.round(rnd() * 8_000_000), rate = 7 + Math.round(rnd() * 90) / 10;
    const e = Math.round(Math.min(emi(balance, rate, 5 + rnd() * 20) * (0.8 + rnd() * 0.6), income * (0.15 + rnd() * 0.8)));
    const mine = deriveMine({ finos_sip_monthly: String(500 + Math.round(rnd() * 30_000)), finos_monthly_expense: String(10_000 + Math.round(rnd() * 90_000)), finos_emergency_fund: String(Math.round(rnd() * 600_000) + 2000),
      finos_home_loan: String(balance), finos_home_loan_rate: String(rate), finos_home_loan_emi: String(e) });
    const s = deriveSignals({ now: NOW, mine, income, events: rnd() > 0.9 ? [jobLoss] : [] });
    const list = personalisePlay(personaliseReels(LIBRARY, s.mine, s), s.mine, s);
    for (const r of list) {
      if (!r.mine) continue;
      assert.deepEqual(validateReel(r), [], `person ${i}: ${r.id}`);
      if (s.strain) assert.ok(!metaOf(r.id).growth && !(PERSONAL_MORE[r.id]?.asksMore), `person ${i}: ${r.id}`);
    }
    if (s.strain) strainedCount++;
  }
  assert.ok(strainedCount > 40, `only ${strainedCount} strained people were tested`);
});

// ── a wide range of figures ─────────────────────────────────────────────────────────────────────────────────────

test('your number 2: across a wide range of sane figures every rebuilt script passes every rule (nothing silently falls back)', () => {
  const bad: string[] = [];
  const check = (mine: Mine, ctx = WELL) => {
    const list = personaliseMore(LIBRARY, mine, ctx);
    for (const id of NEW_IDS) {
      const direct = PERSONAL_MORE[id].build(libraryById(id)!, saneMine(mine), ctx);
      if (direct) bad.push(...validateReel(direct).map(m => `${JSON.stringify(mine)}: ${m}`));
      if (direct && validateReel(direct).length === 0) assert.equal(get(list, id).mine, true);
    }
  };
  for (const sip of [500, 1000, 2500, 5000, 10_000, 25_000, 100_000, 499_999]) check({ sip });
  for (const spend of [5000, 12_345, 30_000, 60_000, 150_000, 1_000_000]) for (const fund of [undefined, 1000, 20_000, 90_000, 500_000, 100_000_000]) check({ spend, ...(fund ? { fund } : {}) });
  for (const balance of [50_000, 300_000, 1_000_000, 4_500_000, 20_000_000, 400_000_000]) for (const rate of [1, 6, 8.5, 12, 24, 40]) {
    const e = Math.round(emi(balance, rate, 15) * 1.05);
    if (e < 500) continue;
    check({ loan: { label: { en: 'personal loan', hi: 'पर्सनल लोन' }, balance, rate, emi: e } }, { strain: false, income: Math.max(10_000, e * 3) });
  }
  assert.deepEqual(bad, []);
});

// ── the trust notes ─────────────────────────────────────────────────────────────────────────────────────────────

test('trust: every wave-2 reel has a formula, assumptions and an as-of date, and the personal note names the person\'s own figures', () => {
  for (const id of NEW_IDS) {
    const base = TRUST[id], mine = trustFor(id, true)!;
    assert.ok(base, `${id} has no trust entry`);
    assert.match(base.asOf, /^\d{4}-\d{2}-\d{2}$/);
    for (const x of [base.formula, base.assumes, mine.formula, mine.assumes]) { assert.ok(x.en.length > 20 && /[ऀ-ॿ]/.test(x.hi), id); assert.ok(!/\{\w+\}|NaN|undefined/.test(x.en + x.hi)); }
    assert.match(mine.assumes.en, /own|your/i, id);
    assert.ok(!/Your own figures from this app, worked out with the formula above/.test(mine.assumes.en), `${id} falls back to the generic note`);
    assert.match(mine.assumes.en, /stays? on this phone/i, id); assert.match(mine.assumes.hi, /फ़ोन/, id);
    if (/%/.test(mine.assumes.en)) assert.match(mine.assumes.en, /assum|example|common guide|rough|illustrat|fixed/i, id);
  }
  assert.match(trustFor('rbi-and-emi', true)!.formula.en, /New EMI = your EMI/);
  assert.equal(trustFor('rbi-and-emi')!.formula.en.includes('New EMI'), false, 'the example keeps its own formula');
  assert.equal(trustFor('inflation')!.assumes.en.includes('own'), false, 'the example note does not claim to be the person\'s');
});

// ── nothing leaks into the library or a shared lesson ───────────────────────────────────────────────────────────

test('your number 2: rebuilding never changes the library, so a shared lesson still uses the example', () => {
  const before = JSON.stringify(LIBRARY);
  out(RICH);
  assert.equal(JSON.stringify(LIBRARY), before);
  for (const id of NEW_IDS) assert.equal(libraryById(id)!.mine, undefined, id);
});

// ── the documentation ───────────────────────────────────────────────────────────────────────────────────────────

test('docs: REELS.md has "Your Number, wave 2" and names every personalised reel and the figure it uses', () => {
  const doc = readFileSync(new URL('../../docs/REELS.md', import.meta.url), 'utf8');
  const i = doc.indexOf('Your Number, wave 2');
  assert.ok(i > 0, 'no "Your Number, wave 2" section');
  const section = doc.slice(i, i + 9000);
  for (const id of NEW_IDS) assert.ok(section.includes(`\`${id}\``), `${id} is not listed`);
  for (const id of ['start-early', 'emi-trap', 'emergency-fund', 'guess-sip', 'delay-cost', 'guess-emi']) assert.ok(section.includes(`\`${id}\``), `${id} (wave 1) is not listed`);
});
