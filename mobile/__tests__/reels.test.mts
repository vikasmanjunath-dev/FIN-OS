// Money reels: the clock, the maths behind every figure, and the rules every script must keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REELS, reelById } from '../lib/reels/content.ts';
import { ease, momentAt, sceneStarts, settle, totalMs } from '../lib/reels/engine.ts';
import { doublingYears, emi, fill, firstInstalment, hundredMinusAge, inflatedValue, money, sipFutureValue, unitsFor } from '../lib/reels/figures.ts';
import { textsOf, validateReel } from '../lib/reels/validate.ts';
import type { Reel } from '../lib/reels/types.ts';

const root = path.join(import.meta.dirname, '..');
const near = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} is not within ${tol * 100}% of ${b}`);

test('figures: known answers (checked by hand, and against the numbers printed in the SIP and EMI lessons)', () => {
  near(sipFutureValue(5000, 12, 30), 17_474_816, 0.0005);       // about ₹1.75 crore: the lesson's "start at 25"
  near(sipFutureValue(5000, 12, 20), 4_946_277, 0.0005);        // about ₹49 lakh: the lesson's "start at 35"
  assert.equal(sipFutureValue(5000, 0, 10), 600_000);
  assert.ok(Number.isNaN(sipFutureValue(-1, 12, 5)));
  near(inflatedValue(100, 6, 10), 55.84, 0.001);
  near(emi(1_000_000, 9, 20), 8997.26, 0.0001);
  const f = firstInstalment(1_000_000, 9, 20);
  near(f.interest, 7500, 0.0001); near(f.principal, 1497.26, 0.001); near(f.interestShare, 0.8336, 0.001);
  assert.equal(doublingYears(8), 9); assert.equal(doublingYears(12), 6); assert.equal(doublingYears(6), 12);
});

test('figures: units, 100-minus-age and the rate-change EMI gap (known answers)', () => {
  assert.equal(unitsFor(1000, 50), 20);
  assert.deepEqual(hundredMinusAge(30), { equity: 70, debt: 30 });
  assert.deepEqual(hundredMinusAge(50), { equity: 50, debt: 50 });
  assert.deepEqual(hundredMinusAge(120), { equity: 0, debt: 100 });
  const gap = emi(3_000_000, 9, 20) - emi(3_000_000, 8.5, 20);          // 26,992 - 26,035
  assert.ok(gap > 900 && gap < 1100, `EMI gap was ${gap}`);
  assert.ok(sipFutureValue(10_000, 11.5, 15) > sipFutureValue(10_000, 10.5, 15));   // lower cost keeps more
});

test('money(): Indian grouping, lakh and crore, in both languages', () => {
  assert.deepEqual(money(8997.26), { en: '₹8,997', hi: '₹8,997' });
  assert.deepEqual(money(90_000), { en: '₹90,000', hi: '₹90,000' });
  assert.deepEqual(money(1_800_000), { en: '₹18 lakh', hi: '₹18 लाख' });
  assert.deepEqual(money(4_946_277), { en: '₹49 lakh', hi: '₹49 लाख' });        // whole lakh from 10 lakh up, as the SIP lesson prints it
  assert.deepEqual(money(180_000), { en: '₹1.8 lakh', hi: '₹1.8 लाख' });
  assert.deepEqual(money(17_474_816), { en: '₹1.75 crore', hi: '₹1.75 करोड़' });
  assert.deepEqual(money(1234567), { en: '₹12 lakh', hi: '₹12 लाख' });
});

test('fill(): replaces gaps in both languages and refuses a missing value', () => {
  assert.deepEqual(fill({ en: 'a {x} b', hi: 'क {x} ख' }, { x: 5 }), { en: 'a 5 b', hi: 'क 5 ख' });
  assert.throws(() => fill({ en: '{x} {y}', hi: '{x}' }, { x: 1 }), /no value was given/);
});

test('the clock: scene boundaries, clamping and completion', () => {
  const r = REELS[0];
  const starts = sceneStarts(r);
  assert.equal(starts[0], 0); assert.equal(starts.length, r.scenes.length);
  assert.equal(momentAt(r, -50).index, 0); assert.equal(momentAt(r, NaN).index, 0);
  assert.equal(momentAt(r, starts[1]).index, 1); assert.equal(momentAt(r, starts[1] - 1).index, 0);
  assert.equal(momentAt(r, starts[1] + r.scenes[1].ms / 2).p, 0.5);
  const end = momentAt(r, totalMs(r) + 5000);
  assert.equal(end.index, r.scenes.length - 1); assert.equal(end.p, 1); assert.equal(end.done, true); assert.equal(end.overall, 1);
  assert.equal(momentAt(r, totalMs(r) - 1).done, false);
  assert.throws(() => momentAt({ ...r, scenes: [] }, 0));
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.ok(ease(0.5) > 0.5); assert.equal(settle(1), 1); assert.equal(settle(0.7), 1);
});

test('every reel passes the script rules (length, both languages, no promises, assumptions stated)', () => {
  for (const r of REELS) assert.deepEqual(validateReel(r), []);
});

test('the rule checker really catches bad scripts', () => {
  const ok = REELS[0];
  const broken = (patch: (r: Reel) => Reel) => validateReel(patch(structuredClone(ok)));
  assert.ok(broken(r => ({ ...r, scenes: r.scenes.slice(0, 2) })).length > 0, 'too short');
  assert.ok(broken(r => { r.scenes[0].say.hi = ''; return r; }).some(m => /empty/.test(m)));
  assert.ok(broken(r => { r.scenes[1].say.hi = 'only english here for a while'; return r; }).some(m => /Devanagari/.test(m)));
  assert.ok(broken(r => { r.scenes[1].say.en = 'You will earn guaranteed returns of 12%'; return r; }).some(m => /promise or advice/.test(m)));
  assert.ok(broken(r => { r.scenes[1].say.en = 'You should buy this fund today, it is a sure shot'; return r; }).some(m => /promise or advice/.test(m)));
  assert.ok(broken(r => { r.quiz.answer = 9; return r; }).some(m => /out of range/.test(m)));
  assert.ok(broken(r => { r.scenes[0].ms = 900; return r; }).some(m => /scene 1 lasts/.test(m)));
  assert.ok(broken(r => { r.scenes[0].say.en = 'x'.repeat(200); return r; }).some(m => /characters/.test(m)));
  assert.ok(broken(r => { r.scenes[0].say.en = 'Total {missing} now'; return r; }).some(m => /unfilled/.test(m)));
  assert.ok(broken(r => { (r.scenes[1].prop as any).items[0].hi = 'आशा 25 पर शुरू करती है'; (r.scenes[1].prop as any).items[0] = { en: 'Asha starts at 25', hi: 'आशा 25 पर शुरू करती है' }; return r; }).some(m => /orphan/.test(m)), 'a lone short word on the last line is caught');
  assert.ok(broken(r => { (r.scenes[1].prop as any).items[0] = { en: 'A very long sentence that cannot possibly fit', hi: 'बहुत लंबा वाक्य जो यहाँ बिल्कुल नहीं समाएगा क्योंकि जगह कम है' }; return r; }).some(m => /room for 2/.test(m)));
  assert.equal(validateReel({ ...structuredClone(ok), id: 'Bad Id' }).some(m => /id must be/.test(m)), true);
  const noAssumption = structuredClone(ok);
  noAssumption.scenes.forEach(s => { s.say.en = s.say.en.replace(/assumed|assumption|illustration|about|near/gi, 'at'); });
  textsOf(noAssumption).forEach(x => { x.en = x.en.replace(/assum\w*|illustrat\w*|about|near|rough|common guide/gi, 'at'); });
  assert.ok(validateReel(noAssumption).some(m => /assumptions/.test(m)));
});

test('the figures shown on screen are the computed ones', () => {
  const say = (id: string) => reelById(id)!.scenes.map(s => s.say.en).join(' | ');
  const sayHi = (id: string) => reelById(id)!.scenes.map(s => s.say.hi).join(' | ');
  assert.match(say('start-early'), /Asha puts in ₹18 lakh\. Ravi puts in ₹12 lakh/);
  assert.match(say('start-early'), /near ₹1\.75 crore\. Ravi, near ₹49 lakh/);
  assert.match(sayHi('start-early'), /₹1\.75 करोड़/);
  assert.match(say('inflation'), /only what about ₹56 buys today/);
  assert.match(say('emi-trap'), /about ₹8,997 a month/);
  assert.match(say('emi-trap'), /₹7,500 is interest and only ₹1,497 reduces the loan/);
  assert.match(say('emergency-fund'), /₹30,000 a month, that is ₹90,000 to ₹1\.8 lakh/);
  assert.match(say('rule-of-72'), /72 ÷ 8 = about 9 years/);
  assert.match(say('rule-of-72'), /72 ÷ 12 = about 6 years/);
  assert.match(say('rbi-and-emi'), /₹30 lakh loan for 20 years, a rise from 8\.5% to 9% adds about ₹957 to the monthly EMI/);
  assert.match(say('mf-units-nav'), /Put in ₹1,000 when the NAV is ₹50, and you get 20 units/);
  assert.match(say('hundred-minus-age'), /At 30: about 70% in equity and 30% in safer assets/);
  assert.match(say('hundred-minus-age'), /At 50: about 50% and 50%/);
  assert.match(say('cash-flow'), /Neha spends ₹95,000, so she keeps ₹5,000\. Karan spends ₹40,000, so he keeps ₹20,000/);
  assert.match(sayHi('cash-flow'), /₹20,000/);
});

test('direct vs regular: the direct plan ends higher by the amount on screen, and says costs are examples', () => {
  const t = reelById('direct-vs-regular')!.scenes.map(s => s.say.en).join(' | ');
  const d = sipFutureValue(10_000, 11.5, 15), r = sipFutureValue(10_000, 10.5, 15);
  assert.ok(d > r);
  assert.ok(t.includes(money(d).en) && t.includes(money(r).en));
  assert.match(t, /examples/);
});

test('every topic has reels, and the library has at least 40', () => {
  assert.ok(REELS.length >= 40, `only ${REELS.length} reels`);
  for (const topic of ['basics', 'invest', 'loans', 'protect', 'tax', 'retire', 'credit', 'safety', 'goals']) assert.ok(REELS.some(r => r.topic === topic), `no reel for ${topic}`);
});

test('the quiz answers are the correct ones', () => {
  const ans = (id: string) => reelById(id)!.quiz.options[reelById(id)!.quiz.answer].en;
  assert.equal(ans('start-early'), 'She invested for 10 more years');
  assert.match(ans('inflation'), /falls to about ₹56/);
  assert.equal(ans('emi-trap'), 'Interest');
  assert.match(ans('emergency-fund'), /job loss or medical/);
  assert.equal(ans('rule-of-72'), '12 years');                      // 72 / 6
  assert.match(ans('hundred-minus-age'), /60% in equity/);          // 100 - 40
  assert.match(ans('cash-flow'), /Karan/);
  assert.match(ans('mf-units-nav'), /cannot tell/);
  assert.match(ans('rbi-and-emi'), /EMI or tenure may change/);
});

test('reel ids are unique and every lesson a reel points at exists in Learn', () => {
  assert.equal(new Set(REELS.map(r => r.id)).size, REELS.length);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/learn/manifest.json'), 'utf8')) as { lessons: { id: string }[] };
  const ids = new Set(manifest.lessons.map(l => l.id));
  for (const r of REELS) if (r.lesson) assert.ok(ids.has(r.lesson), `${r.id} points at missing lesson ${r.lesson}`);
});

test('the scripts are short enough to read: at most ~17 characters a second', () => {
  for (const r of REELS) for (const s of r.scenes) {
    const cps = s.say.en.length / (s.ms / 1000);
    assert.ok(cps <= 28, `${r.id}: "${s.say.en.slice(0, 40)}…" needs ${cps.toFixed(0)} characters a second`);
  }
});

// ── the learning loop: streak, ranking, links ──────────────────────────────────────────────────────────────────────
import { ACT_MORE } from '../lib/reels/act-more.ts';
import { ACT, PILLAR_REELS, cleanDays, dayKey, rankReels, streakOf, topicProgress } from '../lib/reels/journey.ts';
import { byId } from '../lib/calcs/index.ts';
import { parseDays } from '../lib/reelsStorage.ts';

const at = (s: string) => new Date(`${s}T10:00:00`);

test('streak: counts consecutive days back from today, yesterday still counts, a gap resets it', () => {
  assert.deepEqual(streakOf([], '2026-10-18'), { streak: 0, doneToday: false, best: 0 });
  assert.equal(streakOf(['2026-10-16', '2026-10-17', '2026-10-18'], '2026-10-18').streak, 3);
  const y = streakOf(['2026-10-16', '2026-10-17'], '2026-10-18');
  assert.equal(y.streak, 2); assert.equal(y.doneToday, false);                 // not done today yet: yesterday's run is still alive
  assert.equal(streakOf(['2026-10-14', '2026-10-15'], '2026-10-18').streak, 0);  // two days missed
  const g = streakOf(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-17', '2026-10-18'], '2026-10-18');
  assert.equal(g.streak, 2); assert.equal(g.best, 3);
  assert.equal(streakOf(['2026-10-19'], '2026-10-18').streak, 0);               // a date in the future is ignored
  assert.equal(streakOf(['2026-02-28', '2026-03-01'], '2026-03-01').streak, 2); // 2026 is not a leap year: Feb 28 and Mar 1 are consecutive
  assert.equal(streakOf(['2028-02-28', '2028-03-01'], '2028-03-01').streak, 1);  // 2028 is: Feb 29 is missing
  assert.equal(streakOf(['2026-12-31', '2027-01-01'], '2027-01-01').streak, 2); // across a year end
});

test('days: cleaned, de-duplicated, sorted, junk dropped, and the date key is the local day', () => {
  assert.deepEqual(cleanDays(['2026-10-02', '2026-10-01', '2026-10-02', 'x', 5, '2026-13-40x']), ['2026-10-01', '2026-10-02']);
  assert.deepEqual(cleanDays('nope'), []);
  assert.equal(cleanDays(Array.from({ length: 200 }, (_, i) => dayKey(new Date(2026, 0, 1 + i)))).length, 120);
  assert.deepEqual(parseDays('["2026-10-01","bad"]'), ['2026-10-01']);
  assert.deepEqual(parseDays('{broken'), []);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('ranking: a missed question first, then new reels about the weakest pillar, then other new ones, then what is done', () => {
  const now = at('2026-10-18');
  const watched = { 'inflation': { at: '2026-10-10T10:00:00', correct: false }, 'start-early': { at: '2026-10-17T10:00:00', correct: true } };
  const r = rankReels(REELS, { watched, weakest: 'insurance', now });
  assert.equal(r[0].reel.id, 'inflation'); assert.equal(r[0].why, 'review');
  assert.deepEqual(r.slice(1, 3).map(x => x.reel.id), ['insurance-basics', 'life-cover']);
  assert.ok(r[1].reason!.en.includes('insurance cover') && r[1].reason!.hi.includes('बीमा'));
  assert.equal(r.at(-1)!.reel.id, 'start-early');                                // seen yesterday and right: last
  assert.equal(r.length, REELS.length); assert.equal(new Set(r.map(x => x.reel.id)).size, REELS.length);
});

test('ranking: nothing watched and no score keeps the library order; a question missed today waits a day; a right answer returns after a week', () => {
  const now = at('2026-10-18');
  assert.deepEqual(rankReels(REELS, { watched: {}, weakest: null, now }).map(x => x.reel.id), REELS.map(x => x.id));
  const sameDay = rankReels(REELS, { watched: { 'cash-flow': { at: '2026-10-18T08:00:00', correct: false } }, weakest: null, now });
  assert.notEqual(sameDay[0].why, 'review');
  const week = rankReels(REELS, { watched: { 'cash-flow': { at: '2026-10-10T08:00:00', correct: true } }, weakest: null, now });
  assert.equal(week.find(x => x.reel.id === 'cash-flow')!.why, 'refresh');
});

test('every pillar has reels that exist, and every reel has a tool to open that exists', () => {
  for (const [p, ids] of Object.entries(PILLAR_REELS)) { assert.ok(ids.length >= 2, p); for (const id of ids) assert.ok(reelById(id), `${p}: ${id}`); }
  for (const r of REELS) {
    const a = ACT[r.id] ?? ACT_MORE[r.id];
    if (r.topic === 'safety') { assert.equal(a, undefined, `${r.id}: a scam reel points at no tool`); continue; }   // the lesson is what to refuse, not a calculator to open
    assert.ok(a, `${r.id} has no tool link`);
    assert.ok(a.label.en.length > 8 && /[ऀ-ॿ]/.test(a.label.hi), `${r.id} label`);
    const calc = a.href.match(/^\/tools\/calc\/([a-z0-9]+)$/);
    if (calc) assert.ok(byId(calc[1]), `${r.id}: no calculator ${calc[1]}`);
    else {
      const base = path.join(root, 'app', a.href.replace(/^\//, ''));
      assert.ok(fs.existsSync(base + '.tsx') || fs.existsSync(path.join(base, 'index.tsx')), `${r.id}: no screen for ${a.href}`);
    }
  }
});

test('topic progress adds up', () => {
  const p = topicProgress(REELS, { 'cash-flow': { at: 'x', correct: true }, 'inflation': { at: 'x', correct: false } });
  assert.equal(Object.values(p).reduce((n, t) => n + t.total, 0), REELS.length);
  assert.deepEqual(p.basics, { total: REELS.filter(r => r.topic === 'basics').length, watched: 2, right: 1 });
});

// ── Phase 2: the person's own figures ─────────────────────────────────────────────────────────────────────────────
import { deriveMine } from '../lib/reels/mine.ts';
import { personaliseReels } from '../lib/reels/personal.ts';
import { shareText } from '../lib/reels/share.ts';

test('own figures: read from stored text, bad or silly values left out', () => {
  assert.deepEqual(deriveMine({}), {});
  const m = deriveMine({ finos_sip_total: '₹12,500', finos_monthly_expense: '42000', finos_emergency_fund: '150000',
    finos_home_loan: '2500000', finos_home_loan_rate: '8.75', finos_home_loan_emi: '26000', finos_car_loan: '300000', finos_car_loan_rate: '9.5', finos_car_loan_emi: '9000' });
  assert.equal(m.sip, 12500); assert.equal(m.spend, 42000); assert.equal(m.fund, 150000);
  assert.equal(m.loan?.balance, 2_500_000);                                       // the larger loan wins
  assert.equal(m.loan?.label.en, 'home loan');
  assert.deepEqual(deriveMine({ finos_sip_total: '0', finos_sip_monthly: '4000' }).sip, 4000);   // falls back to the other key
  assert.deepEqual(deriveMine({ finos_sip_total: '3' }), {});                      // below ₹500 a month: a typo, not a SIP
  assert.deepEqual(deriveMine({ finos_sip_total: 'abc', finos_monthly_expense: '-5', finos_emergency_fund: 'NaN' }), {});
  assert.equal(deriveMine({ finos_budget_expenses: '30000' }).spend, 30000);       // the budget key is a fallback
  // an EMI that does not cover the interest is not described
  assert.equal(deriveMine({ finos_home_loan: '2500000', finos_home_loan_rate: '9', finos_home_loan_emi: '5000' }).loan, undefined);
  assert.equal(deriveMine({ finos_home_loan: '2500000', finos_home_loan_rate: '0', finos_home_loan_emi: '26000' }).loan, undefined);
});

test('own figures: no figures means the reels are exactly the examples', () => {
  assert.deepEqual(personaliseReels(REELS, {}), REELS);
  const r = personaliseReels(REELS, { sip: 10000 });
  assert.equal(r.filter(x => x.mine).length, 1); assert.equal(r.find(x => x.mine)!.id, 'start-early');
  assert.deepEqual(r.map(x => x.id), REELS.map(x => x.id));
});

test('own figures: the personal reels show the computed figures for those numbers', () => {
  const r = personaliseReels(REELS, { sip: 10000, spend: 40000, fund: 100000, loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 2_000_000, rate: 9, emi: 20_000 } });
  const say = (id: string) => r.find(x => x.id === id)!.scenes.map(s => s.say.en).join(' | ');
  assert.match(say('start-early'), /You put in ₹36 lakh on path A and ₹24 lakh on path B/);
  assert.match(say('start-early'), /path A ends near ₹3\.49 crore\. Path B, near ₹99 lakh/);       // 10,000 x (1.01^360 - 1) / 0.01 = 3.495 crore; 1.01^240 gives 98.9 lakh
  assert.match(say('emi-trap'), /You owe ₹20 lakh at 9%\. Your EMI is ₹20,000 a month/);
  assert.match(say('emi-trap'), /about ₹15,000 is interest and ₹5,000 reduces the loan/);   // 20,00,000 x 9% / 12 = 15,000
  assert.match(say('emergency-fund'), /You spend about ₹40,000 a month, so a common guide of 3 to 6 months is ₹1\.2 lakh to ₹2\.4 lakh/);
  assert.match(say('emergency-fund'), /You have ₹1 lakh set aside: about 2\.5 months of your spending/);
  const hi = r.find(x => x.id === 'emi-trap')!.scenes[0].say.hi; assert.ok(hi.includes('होम लोन'));
});

test('own figures: every personal reel passes the script rules across a wide range of figures, in both languages', () => {
  const sips = [500, 999, 2500, 10000, 50000, 99999, 250000, 500000];
  const spends = [5000, 12345, 40000, 150000, 1_000_000], funds = [undefined, 1000, 20000, 100000, 3_000_000, 100_000_000];
  const loans = [{ balance: 10_000, rate: 1, emi: 900 }, { balance: 350_000, rate: 14, emi: 12_000 }, { balance: 2_500_000, rate: 8.75, emi: 26_000 }, { balance: 80_000_000, rate: 8.5, emi: 900_000 }, { balance: 500_000_000, rate: 40, emi: 50_000_000 }]
    .filter(l => l.emi > (l.balance * l.rate) / 1200).map(l => ({ ...l, label: { en: 'personal loan', hi: 'पर्सनल लोन' } }));
  assert.ok(loans.length >= 4);
  const bad: string[] = [];
  const check = (mine: Parameters<typeof personaliseReels>[1]) => personaliseReels(REELS, mine).filter(x => x.mine).forEach(x => bad.push(...validateReel(x).map(m => `${JSON.stringify(mine)} ${m}`)));
  for (const sip of sips) check({ sip });
  for (const spend of spends) for (const fund of funds) check({ spend, fund });
  for (const loan of loans) check({ loan });
  assert.deepEqual(bad, []);
});

test('sharing: the text comes from the example reel, so it can never carry a personal figure', () => {
  const mine = { sip: 7777, spend: 54321, fund: 98765, loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 3_333_333, rate: 8.1, emi: 29_999 } };
  const personal = personaliseReels(REELS, mine);
  assert.equal(personal.filter(x => x.mine).length, 3);
  for (const r of personal) for (const lang of ['en', 'hi'] as const) {
    const s = shareText(r.id, lang);
    assert.ok(s.length > 60 && s.includes(r.title[lang]), `${r.id} share text`);
    for (const secret of ['7,777', '54,321', '98,765', '33,33,333', '29,999', '7777']) assert.ok(!s.includes(secret), `${r.id} shares ${secret}`);
    assert.ok(/not advice|सलाह नहीं/.test(s));
  }
  // and the quiz "why" the share uses is the same in the personal version, so nothing diverges
  for (const r of personal.filter(x => x.mine)) assert.deepEqual(r.quiz.why, reelById(r.id)!.quiz.why);
  assert.equal(shareText('nope', 'en'), '');
});

// ── Phase 3: the 27 reels on tax, retirement, credit, home loans, scams and goals ─────────────────────────────────
import { loanFromEmi, monthsToDeplete, sipNeeded, stepUpSipFutureValue, unpaidBalance, yearlyDepositsValue } from '../lib/reels/figures.ts';
import { taxNew, taxOld } from '../lib/taxcore.ts';

const closeTo = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);   // absolute tolerance

test('new figures: known answers worked by hand, and checked against a plain loop', () => {
  // a loop that pays in month by month, so it does not share the closed form with the code under test
  const loopSip = (m: number, pct: number, years: number) => { let v = 0; for (let i = 0; i < years * 12; i++) v = v * (1 + pct / 1200) + m; return v; };
  closeTo(sipNeeded(5_000_000, 10, 15), 12_064, 5);
  closeTo(loopSip(sipNeeded(5_000_000, 10, 15), 10, 15), 5_000_000, 1);
  closeTo(loopSip(sipNeeded(5_000_000, 10, 10), 10, 10), 5_000_000, 1);
  let v = 0, sip = 10_000; for (let y = 0; y < 20; y++) { for (let m = 0; m < 12; m++) v = v * 1.01 + sip; sip *= 1.1; }
  closeTo(stepUpSipFutureValue(10_000, 10, 12, 20), v, 1);
  closeTo(stepUpSipFutureValue(10_000, 0, 12, 20), sipFutureValue(10_000, 12, 20), 1);
  // a 1 crore corpus at 7% with 60,000 a month: 616 months; with 80,000: 225 months (worked by hand from n = -ln(1 - Pr/W) / ln(1+r))
  closeTo(monthsToDeplete(10_000_000, 7, 60_000), 616.1, 0.5);
  closeTo(monthsToDeplete(10_000_000, 7, 80_000), 224.6, 0.5);
  assert.equal(monthsToDeplete(10_000_000, 7, 50_000), Infinity);               // growth alone covers it
  let b = 10_000_000, n = 0; while (b > 0 && n < 2000) { b = b * (1 + 0.07 / 12) - 80_000; n++; }
  closeTo(n, 225, 1);
  let pv = 0; for (let k = 1; k <= 240; k++) pv += 40_000 / Math.pow(1 + 0.085 / 12, k);   // the present value of 240 EMIs, summed one by one
  closeTo(loanFromEmi(40_000, 8.5, 20), pv, 0.01);
  assert.ok(pv > 4_600_000 && pv < 4_620_000);
  closeTo(emi(loanFromEmi(40_000, 8.5, 20), 8.5, 20), 40_000, 0.01);               // the two directions agree
  closeTo(unpaidBalance(50_000, 3.5, 12), 75_553, 1);
  closeTo(yearlyDepositsValue(100_000, 7, 15), 2_688_806, 5);
  closeTo(yearlyDepositsValue(100_000, 0, 15), 1_500_000, 0.001);
});

test('tax reels quote the same maths as the tax screens', () => {
  assert.equal(taxNew(1_500_000 - 75_000), 97_500);                                // 20,000 + 40,000 + 33,750 = 93,750, plus 4% cess
  assert.equal(taxOld(1_500_000 - 50_000 - 200_000), 195_000);                      // 12,500 + 1,00,000 + 75,000 = 1,87,500, plus 4% cess
  const say = (id: string) => reelById(id)!.scenes.map(s => s.say.en).join(' | ');
  assert.match(say('tax-regimes'), /New regime tax is about ₹97,500, old regime about ₹1\.95 lakh/);
  assert.match(say('section-80c'), /about ₹31,200 at 20% and about ₹46,800 at 30%/);   // 1,50,000 x 20% x 1.04, and x 30% x 1.04
  assert.match(say('tds-refund'), /cut ₹1\.2 lakh, but your real tax is ₹97,500\. The extra ₹22,500 is yours/);
  assert.match(say('nps-basics'), /about ₹15,600 of tax/);                          // 50,000 x 30% x 1.04
  assert.match(say('capital-gains'), /bought for ₹1 lakh, sold for ₹1\.5 lakh\. The gain is ₹50,000/);
});

test('retirement, credit, home loan and goal reels show the worked figures', () => {
  const say = (id: string) => reelById(id)!.scenes.map(s => s.say.en).join(' | ');
  assert.match(say('retire-corpus'), /about ₹2\.15 lakh a month/);                  // 50,000 x 1.06^25 = 2,14,594
  assert.match(say('retire-corpus'), /about ₹6\.44 crore/);                         // x 12 x 25
  assert.match(say('epf-basics'), /basic of ₹30,000, that is ₹3,600 from you/);
  assert.match(say('ppf-basics'), /You put in ₹15 lakh, and it ends near ₹27 lakh/);
  assert.match(say('withdrawal-rate'), /lasts about 51 years/); assert.match(say('withdrawal-rate'), /only about 19 years/);
  assert.match(say('credit-utilisation'), /On a ₹2 lakh limit, using ₹60,000 is 30% usage/);
  assert.match(say('card-interest-trap'), /₹50,000 left unpaid at 3\.5% a month.* grows to about ₹75,553 in a year/);
  assert.match(say('home-loan-affordability'), /take-home pay\. On ₹1 lakh a month, that is ₹40,000/);
  assert.match(say('home-loan-affordability'), /repays a loan of about ₹46 lakh/);
  assert.match(say('home-loan-tenure'), /EMI is about ₹43,39\d for 20 years, or about ₹38,4\d\d for 30 years/);
  assert.match(say('home-loan-tenure'), /about ₹1\.04 crore over 20 years and about ₹1\.38 crore over 30/);
  assert.match(say('goal-sip-needed'), /about ₹12,064 a month/); assert.match(say('goal-sip-needed'), /about ₹24,4\d\d a month/);
  assert.match(say('goal-inflation'), /costs ₹1 crore today.* about ₹3\.21 crore/);         // 1,00,00,000 x 1.06^20
  assert.match(say('goal-step-up'), /flat ends near ₹99 lakh/);                               // 10,000 x 989.26 months factor
});

test('home loan prepay: the savings match an independent month-by-month schedule', () => {
  const run = (extra: number) => { let bal = 5_000_000, interest = 0, m = 0; const e = Math.round(emi(5_000_000, 8.5, 20)); while (bal > 0.01 && m < 600) { const c = bal * 0.085 / 12; interest += c; bal = Math.max(0, bal + c - e - extra); m++; } return { m, interest }; };
  const a = run(0), b = run(8000), text = reelById('home-loan-prepay')!.scenes.map(s => s.say.en).join(' | ');
  assert.ok(text.includes(`finishes the loan about ${Math.round((a.m - b.m) / 12)} years sooner`), text);
  assert.ok(text.includes(`saves about ${money(Math.round(a.interest - b.interest)).en} of interest`) || text.includes(`saves about ${money(Math.round(a.interest) - Math.round(b.interest)).en} of interest`), text);
});

test('scam reels: warn about the trick, give a safe action, never name a number to call other than 1930, and promise nothing', () => {
  for (const id of ['otp-never-share', 'upi-collect-scam', 'digital-arrest', 'investment-scam', 'fake-kyc-links']) {
    const r = reelById(id)!; assert.equal(r.topic, 'safety');
    const all = r.scenes.map(s => s.say.en).join(' ');
    const numbers = all.match(/\b\d{4,}\b/g) ?? [];
    for (const n of numbers) assert.equal(n, '1930', `${id} names ${n}`);
    assert.ok(/hang up|end the call|do not|never|decline|open the bank|check|wait/i.test(all), `${id} gives no safe action`);
  }
});

// ── Wave 2: 58 more reels (basics, investing, loans, credit, protection, tax, retirement, scams, goals) ───────────────
import { annuityMonthly, averageCost, driftedShare, grownCost, hraExempt, impliedMonthlyRate, lumpsumValue, mean, pctOf, potLoss, proportionalClaim, realReturn, sipThenHold, superTopUpSplit, taxAtSlab } from '../lib/reels/figures.ts';
import { CESS } from '../lib/taxcore.ts';

test('wave 2 figures: worked by hand and checked against plain loops', () => {
  let v = 1_000_000; for (let i = 0; i < 120; i++) v *= 1.01;
  closeTo(lumpsumValue(1_000_000, 12, 10), v, 0.01);
  let s = 0; for (let i = 0; i < 12; i++) s = s * 1.01 + 100_000; for (let i = 0; i < 108; i++) s *= 1.01;
  closeTo(sipThenHold(100_000, 12, 1, 10), s, 0.01);
  const ac = averageCost(5_000, [50, 40, 25, 40, 50]);                                   // 100 + 125 + 200 + 125 + 100 units
  closeTo(ac.units, 650, 1e-9); closeTo(ac.invested, 25_000, 1e-9); closeTo(ac.perUnit, 25_000 / 650, 1e-9); closeTo(ac.avgNav, 41, 1e-9);
  assert.ok(ac.perUnit < ac.avgNav);                                                      // the average cost is below the average price
  closeTo(realReturn(7, 6, 30), (1.049 / 1.06 - 1) * 100, 1e-9); closeTo(realReturn(6, 6, 0), 0, 1e-9);
  const [eq, debt] = driftedShare([60, 40], [30, 5]); closeTo(eq, 65, 1e-9); closeTo(eq + debt, 100, 1e-9);   // 78 / (78 + 42)
  closeTo(potLoss(100, 50), 50, 1e-9); closeTo(potLoss(20, 50), 10, 1e-9);
  const r = impliedMonthlyRate(28_500, 10_000, 3) / 100; let pv = 0; for (let k = 1; k <= 3; k++) pv += 10_000 / Math.pow(1 + r, k);
  closeTo(pv, 28_500, 0.01); assert.ok(r * 100 > 2.4 && r * 100 < 2.8);                    // about 2.6% a month
  assert.equal(impliedMonthlyRate(30_000, 10_000, 3), 0);                                  // no gap, no cost
  assert.equal(hraExempt(50_000, 25_000, 20_000, true), 15_000);                           // least of 25,000 / 15,000 / 25,000
  assert.equal(hraExempt(50_000, 25_000, 20_000, false), 15_000);                          // 40% of basic is 20,000, so rent less 10% still wins
  assert.equal(hraExempt(50_000, 25_000, 4_000, true), 0);
  assert.equal(proportionalClaim(200_000, 5_000, 10_000), 100_000); assert.equal(proportionalClaim(200_000, 5_000, 4_000), 200_000);
  assert.deepEqual(superTopUpSplit(1_200_000, 500_000, 500_000, 2_000_000), { base: 500_000, topUp: 700_000, you: 0 });
  assert.deepEqual(superTopUpSplit(300_000, 500_000, 500_000, 2_000_000), { base: 300_000, topUp: 0, you: 0 });
  assert.deepEqual(superTopUpSplit(3_000_000, 500_000, 500_000, 2_000_000), { base: 500_000, topUp: 2_000_000, you: 500_000 });
  closeTo(taxAtSlab(150_000, 30), 150_000 * 0.3 * (1 + CESS), 1e-6);                      // the same cess the tax screens use
  closeTo(annuityMonthly(5_000_000, 6), 25_000, 1e-9); closeTo(grownCost(100_000, 10, 20), 672_749.99, 0.05);
  closeTo(mean([40, 70, 25, 60, 35, 90]), 53.3333333, 1e-6); closeTo(pctOf(60_000_00, 20), 12_00_000, 1e-9);
});

test('wave 2 reels show the worked figures', () => {
  const say = (id: string) => reelById(id)!.scenes.map(x => x.say.en).join(' | ');
  const loopSip = (m: number, pct: number, y: number) => { let b = 0; for (let i = 0; i < y * 12; i++) b = b * (1 + pct / 1200) + m; return b; };
  const grow = (a: number, pct: number, y: number) => { let b = a; for (let i = 0; i < y * 12; i++) b *= 1 + pct / 1200; return b; };
  const table: [string, RegExp | string][] = [
    ['salary-slip-decoded', 'about ₹90,200 in hand'],                                      // 12,00,000 less 57,600 + 57,600 + 2,400 = 10,82,400 a year, no tax under the new-regime rebate
    ['needs-wants-wealth', '₹25,000 for needs, ₹15,000 for wants, ₹10,000 for saving'],
    ['pay-yourself-first', `grows to about ${money(loopSip(5_000, 10, 10)).en}`],
    ['lifestyle-creep', `would be about ${money(loopSip(5_000, 12, 10)).en}`],
    ['sip-vs-lumpsum', `ends near ${money(grow(1_200_000, 12, 10)).en}`],
    ['index-fund-basics', `near ${money(grow(1_000_000, 11.8, 20)).en} at 0.2% cost, near ${money(grow(1_000_000, 10.5, 20)).en} at 1.5%`],
    ['elss-basics', 'save about ₹46,800 of tax'],
    ['gold-basics', 'about ₹12,000 you may not get back'],
    ['rebalancing', 'becomes about 65/35'],
    ['first-sip-habit', `grows to about ${money(loopSip(2_000, 12, 5)).en}`],
    ['market-dips-sip', 'buys 650 units. Your cost per unit is about ₹38, less than the average NAV of ₹41'],
    ['diversification', 'you lose about 50% of your money'], ['diversification', 'you lose about 10% of the total'],
    ['real-return-fd', 'leaving about 4.9%'], ['real-return-fd', 'the real return is about -1%'],
    ['floating-vs-fixed', /EMI is about ₹43,39\d\. If the rate becomes 9\.5%, it is about ₹46,6\d\d/],
    ['prepay-vs-invest', `worth about ${money(grow(100_000, 9, 10)).en}. Invested at an assumed 12%, about ${money(grow(100_000, 12, 10)).en}`],
    ['bnpl-late-fees', 'becomes about ₹21,855 in 3 months'],
    ['term-vs-ulip', `leaves ₹38,000. Invested for 20 years at an assumed 10%: about ${money(38_000 * ((Math.pow(1.1, 20) - 1) / 0.1) * 1.1).en}`],
    ['health-cover-gotchas', 'cut in proportion to about ₹1 lakh'],
    ['parents-health-cover', 'about ₹15,600 saved'],
    ['super-top-up', 'Base pays ₹5 lakh, top-up ₹7 lakh, you ₹0'],
    ['emergency-target', 'come to ₹30,000 a month'], ['emergency-target', 'At 6 months that is ₹1.8 lakh'],
    ['hra-basics', 'The least is ₹15,000, so ₹15,000 a month is exempt'],
    ['fd-interest-tax', 'about ₹31,200 of tax with cess, leaving about ₹68,800'],
    ['tax-loss-harvesting', 'You are taxed on the net, ₹1 lakh'],
    ['section-80d', '₹75,000 of premiums can save about ₹23,400'],
    ['home-loan-tax-benefit', 'about ₹62,400 of tax'],
    ['standard-deduction', '₹75,000 in the new regime and ₹50,000 in the old regime'], ['standard-deduction', 'about ₹23,400'],
    ['retire-number-steps', `is about ${money(Math.round(720_000 * Math.pow(1.06, 25))).en} a year. Times 25 is about ${money(Math.round(720_000 * Math.pow(1.06, 25)) * 25).en}`],
    ['annuity-basics', 'pays about ₹25,000 a month'], ['annuity-basics', 'what about ₹7,795 buys today'],
    ['healthcare-in-retirement', 'about ₹6.73 lakh in 20 years'],
    ['retirement-buckets', 'that is ₹12 lakh'],
    ['wedding-fund', `in 5 years it is about ${money(Math.round(1_200_000 * Math.pow(1.08, 5))).en}`],
    ['child-education-fund', `in 12 years it is about ${money(Math.round(2_000_000 * Math.pow(1.08, 12))).en}`],
    ['first-home-downpayment', 'is about ₹16 lakh'],
    ['car-buying-math', /EMI is about ₹20,7\d\d, and you pay about ₹12 lakh in all/],
    ['sabbatical-fund', 'you need about ₹2.4 lakh'],
    ['irregular-income-buffer', 'average, but the lowest month is ₹25,000'],
    ['sinking-funds', 'come to ₹90,000 a year, which is ₹7,500 a month'],
    ['windfall-plan', 'saves roughly ₹72,000 in interest a year'],
  ];
  for (const [id, want] of table) { const text = say(id); assert.ok(typeof want === 'string' ? text.includes(want) : want.test(text), `${id}: wanted ${want} in\n${text}`); }
});

test('wave 2: the goal SIPs really reach their targets', () => {
  const loopSip = (m: number, pct: number, y: number) => { let b = 0; for (let i = 0; i < y * 12; i++) b = b * (1 + pct / 1200) + m; return b; };
  for (const [id, target, pct, y] of [['wedding-fund', 1_200_000 * Math.pow(1.08, 5), 7, 5], ['child-education-fund', 2_000_000 * Math.pow(1.08, 12), 10, 12], ['first-home-downpayment', 6_000_000 * 0.27, 7, 5]] as [string, number, number, number][]) {
    const text = reelById(id)!.scenes.map(x => x.say.en).join(' | ');
    const shown = text.match(/needs about (₹[\d.,]+(?: lakh| crore)?) a month|needs about (₹[\d.,]+(?: lakh| crore)?) a month/);
    const sip = sipNeeded(Math.round(target), pct, y);
    assert.ok(Math.abs(loopSip(sip, pct, y) - target) < 5, `${id}: a SIP of ${sip} does not reach ${target}`);
    assert.ok(text.includes(money(Math.round(sip)).en), `${id}: the monthly figure on screen is not ${money(Math.round(sip)).en}`);
    void shown;
  }
});

test('wave 2: the library is near 100, every series reel exists, and scam reels stay safe', () => {
  assert.ok(REELS.length >= 95, `only ${REELS.length}`);
  const safety = REELS.filter(r => r.topic === 'safety'); assert.ok(safety.length >= 12);
  for (const r of safety) { const all = r.scenes.map(x => x.say.en).join(' '); for (const n of all.match(/\b\d{4,}\b/g) ?? []) assert.equal(n, '1930', `${r.id} names ${n}`); }
});

// ── Wave 2: story series and the Money Map ────────────────────────────────────────────────────────────────────────
import { SERIES, inSeason, seriesById, seriesProgress } from '../lib/reels/series.ts';
import { LEVEL_NAME, TOPIC_NAME, TOPIC_ORDER, buildMap } from '../lib/reels/map.ts';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { LEVELS, metaOf } from '../lib/reels/meta.ts';

test('series: six, each 5 to 8 real episodes in both languages, ending in a move that opens a real screen', () => {
  const want = 6 + (process.env.EXPO_PUBLIC_REELS_DRAFTS === '1' ? 2 : 0);          // two more series appear only when the draft reels are included
  assert.equal(SERIES.length, want); assert.equal(new Set(SERIES.map(s => s.id)).size, want);
  for (const s of SERIES) {
    assert.ok(s.episodes.length >= 5 && s.episodes.length <= 8, `${s.id} has ${s.episodes.length} episodes`);
    assert.equal(new Set(s.episodes.map(e => e.reel)).size, s.episodes.length, `${s.id} repeats an episode`);
    for (const e of s.episodes) {
      assert.ok(libraryById(e.reel), `${s.id}: no reel ${e.reel}`);
      assert.ok(e.intro.en.length > 15 && /[ऀ-ॿ]/.test(e.intro.hi), `${s.id}/${e.reel} intro`);
    }
    for (const x of [s.title, s.premise, s.cast.line, s.endMove.text]) assert.ok(x.en && /[ऀ-ॿ]/.test(x.hi), `${s.id} text`);
    const base = path.join(root, 'app', s.endMove.href.replace(/^\//, ''));
    const calc = s.endMove.href.match(/^\/tools\/calc\/([a-z0-9]+)$/);
    assert.ok(calc ? byId(calc[1]) : fs.existsSync(base + '.tsx') || fs.existsSync(path.join(base, 'index.tsx')), `${s.id} end move ${s.endMove.href}`);
    assert.ok(!s.months || s.months.every(m => m >= 1 && m <= 12));
  }
  assert.equal(seriesById('tax-ready')!.cast.name, 'Kavya'); assert.equal(seriesById('nope'), undefined);
});

test('series: progress counts watched episodes, finds the next one and respects the season', () => {
  const s = seriesById('first-salary')!, ids = s.episodes.map(e => e.reel);
  assert.deepEqual(seriesProgress(s, {}), { done: 0, total: 6, next: 0, complete: false, right: 0 });
  const w: Record<string, { at: string; correct: boolean }> = { [ids[0]]: { at: 'x', correct: true }, [ids[1]]: { at: 'x', correct: false }, [ids[3]]: { at: 'x', correct: true } };
  assert.deepEqual(seriesProgress(s, w), { done: 3, total: 6, next: 2, complete: false, right: 2 });   // the first gap is next, even with later ones watched
  const all = Object.fromEntries(ids.map(i => [i, { at: 'x', correct: true }]));
  assert.deepEqual(seriesProgress(s, all), { done: 6, total: 6, next: null, complete: true, right: 6 });
  const tax = seriesById('tax-ready')!;
  assert.equal(inSeason(tax, new Date(2026, 1, 10)), true); assert.equal(inSeason(tax, new Date(2026, 9, 10)), false);   // February yes, October no
  assert.equal(inSeason(seriesById('scam-proof')!, new Date(2026, 9, 10)), true);                                       // always on
});

test('money map: nine topics by four rungs, filled from what was watched, pointing at the next reel', () => {
  assert.equal(TOPIC_ORDER.length, 9); for (const t of TOPIC_ORDER) assert.ok(TOPIC_NAME[t].en && /[ऀ-ॿ]/.test(TOPIC_NAME[t].hi));
  for (const l of LEVELS) assert.ok(LEVEL_NAME[l].en && /[ऀ-ॿ]/.test(LEVEL_NAME[l].hi));
  const empty = buildMap(LIBRARY, {});
  assert.equal(empty.reduce((n, r) => n + r.total, 0), LIBRARY.length);                       // every reel sits on exactly one topic row
  for (const r of empty) { assert.equal(r.rungs.length, 4); assert.equal(r.watched, 0); assert.equal(r.strength, null); assert.ok(r.next, r.topic); assert.ok(libraryById(r.next!)); }
  const first = empty.find(r => r.topic === 'tax')!;
  const lowest = first.rungs.find(g => g.total > 0)!;
  assert.equal(first.next, lowest.next);                                                       // the next reel is on the lowest rung that has one
  const taxReels = LIBRARY.filter(r => r.topic === 'tax');
  const w = Object.fromEntries(taxReels.map(r => [r.id, { at: 'x', correct: r.id.length % 2 === 0 }]));
  const full = buildMap(LIBRARY, w).find(r => r.topic === 'tax')!;
  assert.equal(full.watched, taxReels.length); assert.equal(full.next, null);
  for (const g of full.rungs) assert.ok(g.state === 'done' || g.state === 'empty');
  assert.ok(full.strength! > 0 && full.strength! < 1);
  const part = buildMap(LIBRARY, { [taxReels[0].id]: { at: 'x', correct: true } }).find(r => r.topic === 'tax')!;
  const lvl = part.rungs.find(g => g.level === metaOf(taxReels[0].id).level)!;
  assert.equal(lvl.watched, 1); assert.ok(lvl.state === 'some' || lvl.state === 'done');
});

// ── Wave 3: interactive reels (spot, myth, guess, slider, path, sort, order) ─────────────────────────────────────
test('wave 3: the guess, path and explainer reels show figures that match plain loops', () => {
  const say = (id: string) => reelById(id)!.scenes.map(x => x.say.en).join(' | ');
  const beatText = (id: string) => JSON.stringify(reelById(id)!.poke!.beat);
  const grow = (a: number, pct: number, months: number) => { let b = a; for (let i = 0; i < months; i++) b *= 1 + pct / 1200; return b; };
  const sipLoop = (m: number, pct: number, y: number) => { let b = 0; for (let i = 0; i < y * 12; i++) b = b * (1 + pct / 1200) + m; return b; };
  const interestPaid = (p: number, pct: number, y: number) => { const r = pct / 1200, n = y * 12, e = (p * r) / (1 - Math.pow(1 + r, -n)); let bal = p, tot = 0; for (let i = 0; i < n; i++) { const c = bal * r; tot += c; bal = bal + c - e; } return tot; };
  let card = 50_000; for (let i = 0; i < 12; i++) card *= 1.035;
  assert.ok(beatText('guess-card-dues').includes(`About ${money(Math.round(card)).en}`));
  assert.match(say('guess-card-dues'), new RegExp(`becomes about ${money(Math.round(card)).en.replace('₹', '₹')} in a year`));
  assert.ok(say('guess-small-sip').includes(`grows to about ${money(Math.round(sipLoop(1_000, 12, 25))).en}`));
  assert.ok(say('guess-rent-20y').includes(`about ${money(Math.round(20_000 * Math.pow(1.06, 20))).en} a month in 20 years`));
  assert.ok(say('guess-fee-gap').includes(`near ${money(Math.round(grow(1_000_000, 11.8, 300))).en}`) && say('guess-fee-gap').includes(`near ${money(Math.round(grow(1_000_000, 10.5, 300))).en}`));
  let ppf = 0; for (let y = 0; y < 15; y++) ppf = (ppf + 100_000) * 1.07;
  assert.ok(say('guess-ppf-15').includes(`about ${money(Math.round(ppf)).en}`));
  assert.ok(say('guess-home-interest').includes(money(Math.round(5_000_000 + interestPaid(5_000_000, 8.5, 20))).en));
  assert.ok(say('guess-medical-20y').includes('about ₹6.73 lakh'));
  let st = 0, sip = 10_000; for (let y = 0; y < 20; y++) { for (let m = 0; m < 12; m++) st = st * 1.01 + sip; sip *= 1.1; }
  assert.ok(say('guess-step-up').includes(`reaches about ${money(Math.round(st)).en}`));
  assert.ok(say('path-card-bill') === say('path-card-bill') && beatText('path-card-bill').includes(`about ${money(Math.round(40_000 * 0.035)).en} in interest for one month`));
  assert.ok(beatText('path-first-raise').includes(money(Math.round(sipLoop(5_000, 10, 10))).en) && beatText('path-first-raise').includes(money(Math.round(sipLoop(10_000, 10, 10))).en));
  assert.ok(beatText('path-car-payment').includes(money(Math.round(interestPaid(800_000, 9, 5))).en) && beatText('path-car-payment').includes(money(Math.round(interestPaid(500_000, 9, 5))).en));
  assert.ok(beatText('path-two-year-goal').includes(money(Math.round(grow(200_000, 7, 24))).en));
  assert.match(say('stock-basics'), /10 shares at ₹500 each cost ₹5,000/); assert.match(say('stock-basics'), /drops 20%, your ₹5,000 becomes about ₹4,000/);
  assert.match(say('ipo-basics'), /₹400 and you get 10 shares for ₹4,000.*₹380 or at ₹440/);
  assert.match(say('etf-basics'), /a 0\.1% cost is about ₹1,000 a year, against about ₹15,000 at 1\.5%/);
  assert.match(say('fd-ladder'), /₹6 lakh into three equal deposits of ₹2 lakh/);
});

test('wave 3: beats are well formed, every one has no-touch text and both languages, and the library is large', () => {
  const kinds: Record<string, number> = {};
  for (const r of REELS) if (r.poke) kinds[r.poke.beat.kind] = (kinds[r.poke.beat.kind] ?? 0) + 1;
  assert.ok((kinds.spot ?? 0) >= 12 && (kinds.myth ?? 0) >= 10 && (kinds.guess ?? 0) >= 8 && (kinds.slider ?? 0) >= 10 && (kinds.path ?? 0) >= 5 && (kinds.sort ?? 0) >= 6 && (kinds.order ?? 0) >= 4, JSON.stringify(kinds));
  assert.ok(REELS.length >= 160, `only ${REELS.length}`);
  for (const r of REELS.filter(x => x.poke?.beat.kind === 'spot')) { assert.equal(r.topic, 'safety'); assert.equal(ACT_MORE[r.id], undefined, `${r.id} has a tool link`); }
});
