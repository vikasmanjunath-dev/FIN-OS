// Independent numeric check of phone calculators and planners.
//
//   cd mobile && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/verify-numbers.mts
//
// The expected values below are computed here, by a DIFFERENT method from the app code (a month-by-month ledger instead of a closed form,
// a bisection on the payment instead of the annuity formula, logarithms instead of powers, plain arithmetic worked out by hand, ...),
// and compared with the text the app shows (parsed back to a number, tolerance = half of the last printed digit).
// It is a throwaway cross-check, not a test of the website parity (that is __tests__/webCalc.parity.test.mts).
import { CALCS } from '../lib/calcs/index.ts';
import { simulate } from '../lib/growthSim.ts';
import { findSIP, sipFV, plan } from '../lib/lifeGoals.ts';
import { splitShared, overview } from '../lib/couple.ts';
import { holt } from '../lib/forecast.ts';
import { taxNew, taxOld } from '../lib/taxcore.ts';
import { compute as stepup } from '../lib/sipStepup.ts';
import { xirr } from '../lib/xirr.ts';
import { compute as homeLoan } from '../lib/homeLoan.ts';

const INFO: string[] = [];
let checks = 0; const fails: string[] = [];
const near = (name: string, got: number, want: number, tol: number) => {
  checks++;
  if (!(Math.abs(got - want) <= tol)) fails.push(`${name}: app ${got} vs hand ${want} (diff ${(got - want).toFixed(4)}, tol ${tol})`);
};
// "₹6.00 L" -> {value 600000, tol 500}; "₹0.51 Cr" -> tol 50000; "₹10,747" -> tol 0.5; "14.87%" -> tol 0.005
function parse(text: string): { v: number; tol: number } {
  let m = text.match(/([0-9,]*\.?[0-9]+)\s*Cr/); if (m) return { v: parseFloat(m[1].replace(/,/g, '')) * 1e7, tol: 0.005 * 1e7 };
  m = text.match(/([0-9,]*\.?[0-9]+)\s*L\b/); if (m) return { v: parseFloat(m[1].replace(/,/g, '')) * 1e5, tol: 0.005 * 1e5 };
  m = text.match(/-?([0-9][0-9,]*\.?[0-9]*)/); if (!m) throw new Error('cannot parse ' + text);
  const dec = (m[1].split('.')[1] || '').length;
  return { v: parseFloat(m[1].replace(/,/g, '')) * (text.trim().startsWith('-') ? -1 : 1), tol: 0.5 * Math.pow(10, -dec) };
}
function run(id: string, over: Record<string, any> = {}) {
  const c = CALCS.find(c => c.id === id); if (!c) throw new Error('no calc ' + id);
  const v: any = {}; c.inputs.forEach(i => { v[i.key] = i.def; }); Object.assign(v, over);
  const rows = c.run(v); const get = (rid: string) => { const r = rows.find(r => r.id === rid); if (!r) throw new Error(`${id}: no row ${rid}`); return parse(r.text); };
  return { v, rows, get };
}
const chk = (label: string, id: string, rid: string, over: Record<string, any>, want: number, extraTol = 0) => {
  const { get } = run(id, over); const g = get(rid); near(`${label} [${id}.${rid} ${JSON.stringify(over)}]`, g.v, want, g.tol + extraTol);
};

// ---------- hand-method helpers ----------
// SIP by a month ledger (instalment at the START of the month, interest at month end)
const sipLedger = (P: number, annual: number, years: number) => { let b = 0; for (let m = 0; m < years * 12; m++) b = (b + P) * (1 + annual / 1200); return b; };
// EMI by bisection: the payment that brings a loan to zero in n months
const emiBisect = (L: number, annual: number, n: number) => {
  let lo = 0, hi = L; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let b = L; for (let m = 0; m < n; m++) b = b * (1 + annual / 1200) - mid; if (b > 0) lo = mid; else hi = mid; } return (lo + hi) / 2;
};

for (const [monthly, rate, years] of [[5000, 12, 10], [25000, 9.5, 20], [1000, 6, 3], [100000, 15, 30]] as const) {
  const fv = sipLedger(monthly, rate, years), inv = monthly * years * 12;
  chk('SIP total', 'sip', 'totalVal', { monthly, rate, time: years }, fv);
  chk('SIP invested', 'sip', 'investedVal', { monthly, rate, time: years }, inv);
  chk('SIP gains', 'sip', 'returnsVal', { monthly, rate, time: years }, fv - inv);
}
for (const [amount, rate, time] of [[100000, 12, 10], [250000, 7.5, 25], [5000, 30, 40]] as const) chk('Lumpsum', 'lumpsum', 'totalVal', { amount, rate, time }, amount * Math.exp(time * Math.log(1 + rate / 100)));
for (const [loan, rate, time] of [[500000, 10.5, 5], [2500000, 8.4, 20], [100000, 14, 1]] as const) {
  const e = emiBisect(loan, rate, time * 12);
  chk('EMI', 'emi', 'emiVal', { loan, rate, time }, e);
  chk('EMI total payment', 'emi', 'totalVal', { loan, rate, time }, e * time * 12);
  chk('EMI interest', 'emi', 'interestVal', { loan, rate, time }, e * time * 12 - loan);
}
// FD: quarterly compounding (the app's stated convention), computed through exp/log
for (const [deposit, rate, time] of [[100000, 7, 5], [525000, 6.75, 3], [10000, 9, 10]] as const) chk('FD maturity', 'fd', 'maturityVal', { deposit, rate, time }, deposit * Math.exp(4 * time * Math.log(1 + rate / 400)));
// RD: the app compounds monthly (documented in its notes); hand ledger of each instalment separately
for (const [monthly, rate, time] of [[5000, 7, 3], [12000, 6.5, 5]] as const) {
  let want = 0; const n = time * 12; for (let k = 1; k <= n; k++) want += monthly * Math.pow(1 + rate / 1200, n - k + 1);
  chk('RD maturity (monthly compounding)', 'rd', 'maturityVal', { monthly, rate, time }, want);
  { let q = 0; for (let k = 1; k <= n; k++) q += monthly * Math.pow(1 + rate / 400, (n - k + 1) / 3); INFO.push(`rd ${monthly}/${rate}/${time}y: app (monthly compounding) Rs ${Math.round(want)}; bank-style quarterly compounding Rs ${Math.round(q)} (app is ${(want - q).toFixed(0)} higher; the screen notes this)`); }
}
for (const [initial, final, years] of [[100000, 200000, 5], [50000, 51000, 1], [1000, 987654, 50]] as const) {
  chk('CAGR', 'cagr', 'cagrVal', { initial, final, years }, (Math.exp(Math.log(final / initial) / years) - 1) * 100);
  chk('CAGR absolute', 'cagr', 'absGrowth', { initial, final, years }, (final / initial - 1) * 100);
}
{ // SWP ledger
  for (const [corpus, withdrawal, rate, time] of [[2000000, 15000, 10, 10], [5000000, 40000, 8, 20], [1000000, 30000, 6, 5]] as const) {
    let b = corpus, w = 0; for (let m = 0; m < time * 12; m++) { b = b * (1 + rate / 1200) - withdrawal; w += withdrawal; if (b <= 0) { b = 0; break; } }
    chk('SWP final', 'swp', 'finalVal', { corpus, withdrawal, rate, time }, b);
    chk('SWP withdrawn', 'swp', 'totalWithdrawn', { corpus, withdrawal, rate, time }, w);
  }
}
// HRA: the three limbs by hand
for (const [basic, hra, rent, metro] of [[600000, 300000, 240000, true], [600000, 300000, 240000, false], [1200000, 400000, 90000, true], [900000, 100000, 600000, false]] as const) {
  const want = Math.max(0, Math.min(hra, rent - 0.1 * basic, basic * (metro ? 0.5 : 0.4)));
  chk('HRA exempt', 'hra', 'exemptVal', { basic, hra, rent, metro }, want);
  chk('HRA taxable', 'hra', 'taxableVal', { basic, hra, rent, metro }, hra - want);
}
// Gratuity: (last basic x 15 / 26) x years
for (const [basic, years] of [[50000, 5], [123456, 17], [10000, 40]] as const) chk('Gratuity', 'gratuity', 'gratuityVal', { basic, years }, basic * 15 / 26 * years);
// Inflation, health inflation, real return
chk('Inflation cost then', 'inflationimpact', 'costFuture', { currentCost: 50000, inflation: 6, time: 20 }, 50000 * Math.exp(20 * Math.log(1.06)));
chk('Medical cost then', 'healthinflation', 'futureVal', { cost: 500000, inflation: 10, years: 20 }, 500000 * Math.pow(1.1, 20));
chk('Real rate', 'realreturn', 'realRate', { nominal: 12, inflation: 6, principal: 100000, years: 10 }, ((1.12 / 1.06) - 1) * 100);
chk('Real value', 'realreturn', 'realValue', { nominal: 12, inflation: 6, principal: 100000, years: 10 }, 100000 * Math.pow(1.12 / 1.06, 10));
// Post-retirement monthly payout: bisection on payment so the corpus reaches zero after n months
for (const [corpus, rate, time] of [[10000000, 7, 25], [3500000, 6, 15]] as const) {
  let lo = 0, hi = corpus; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let b = corpus; for (let m = 0; m < time * 12; m++) b = b * (1 + rate / 1200) - mid; if (b > 0) lo = mid; else hi = mid; }
  chk('Post-retirement payout', 'postretirement', 'monthlyVal', { corpus, rate, time }, (lo + hi) / 2);
}
// SSY: 15 deposits at the start of years 1..15, annual interest, 21 years
{ const y = 150000, r = 0.082; let want = 0; for (let k = 1; k <= 15; k++) want += y * Math.pow(1 + r, 22 - k); chk('SSY maturity', 'ssy', 'maturityVal', { yearly: y, rate: 8.2 }, want); }
// Prepayment impact: ledger with a yearly lump sum, independent loop
{
  const loan = 3000000, emi = 30000, rate = 9, prepay = 50000;
  // convention A: the lump sum goes in right after the 12th, 24th, ... EMI (so the next month's interest is on the smaller balance)
  const sim = (extra: number, late = false) => { let b = loan, m = 0, i = 0; while (b > 0 && m < 360) { const int = b * rate / 1200; i += int; b = b + int - emi; m++; if (b < 0) b = 0; if (!late && m % 12 === 0 && extra) b = Math.max(0, b - extra); if (late && m > 1 && m % 12 === 1 && extra) b = Math.max(0, b - extra); } return { m, i }; };
  const a = sim(0), c = sim(prepay), cLate = sim(prepay, true);
  const out = run('emiprepay', { loan, emi, rate, prepay });
  // the app charges the month-13 (25, ...) interest on the balance BEFORE the lump sum, i.e. the lump sum acts one month late: convention B reproduces it
  near('Prepay interest saved (app timing, hand ledger)', out.get('saveVal').v, a.i - cLate.i, out.get('saveVal').tol + 50);
  near('Prepay months saved (years x 10)', out.get('timeVal').v, Math.round((a.m - cLate.m) / 12 * 10) / 10, 0.11);
  INFO.push(`emiprepay: the app applies each yearly lump sum one month later than "right after the 12th EMI"; interest saved is Rs ${Math.round(out.get('saveVal').v)} (app) vs Rs ${Math.round(a.i - c.i)} with the lump sum made straight after the 12th EMI (${((a.i - c.i) / out.get('saveVal').v * 100 - 100).toFixed(1)}% more). Conservative, copied from the website page.`);
}

// ---------- planners ----------
// Growth simulator: closed form per year (annuity due with the SIP stepping up each 12 months), not the monthly loop
function growthClosed(corpus: number, sip: number, step: number, years: number, annual: number) {
  const r = annual / 1200; let v = corpus * Math.pow(1 + r, 12 * years), s = sip;
  for (let y = 0; y < years; y++) { const fv = r === 0 ? s * 12 : s * (Math.pow(1 + r, 12) - 1) / r * (1 + r); v += fv * Math.pow(1 + r, 12 * (years - y - 1)); s *= 1 + step / 100; }
  return v;
}
for (const [c, s, st, y, a] of [[0, 10000, 0, 20, 12], [500000, 15000, 10, 15, 11], [250000, 0, 0, 30, 8], [100000, 20000, 5, 7, 0]] as const) {
  const r = simulate({ startCorpus: c, monthlySip: s, stepUpPct: st, years: y, annualReturn: a });
  near(`Growth sim ${c}/${s}/${st}/${y}/${a}`, r.final, growthClosed(c, s, st, y, a), 0.01);
  let inv = c, ss = s; for (let k = 0; k < y; k++) { inv += ss * 12; ss *= 1 + st / 100; } near('Growth invested', r.invested, inv, 0.01);
}
{ const r = simulate({ startCorpus: 100000, monthlySip: 5000, stepUpPct: 0, years: 10, annualReturn: 10, inflationPct: 6 }); near('Growth real value', r.realFinal as number, r.final / Math.pow(1.06, 10), 0.01); }
// Life goals: SIP needed = target / annuity-due factor, rounded up to the next 500; inflated target = amount x (1+i)^years; savings pool shared by the earliest goal first
{
  for (const [target, years, rate] of [[5000000, 10, 0.12], [1200000, 3, 0.08], [100000, 1, 0]] as const) {
    let lo = 0, hi = target; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let b = 0; for (let m = 0; m < years * 12; m++) b = (b + mid) * (1 + rate / 12); if (b < target) lo = mid; else hi = mid; }
    near(`findSIP ${target}/${years}/${rate}`, findSIP(target, years, rate), Math.ceil(hi / 500 - 1e-9) * 500, 0);
  }
  const p = plan({ age: 30, income: 100000, savings: 900000, surplus: 40000, retireAge: 60, returnRate: 0.12, goals: [{ name: 'Car', amount: 800000, years: 3, inflation: 0.06 }, { name: 'House', amount: 5000000, years: 10, inflation: 0.07 }] });
  // by hand: expenses 60,000 -> emergency target 360,000; pool 540,000. Car: 800000*1.06^3 = 952,812.8; useful = /1.12^3 = 678,159.6 > pool -> uses all 540,000 -> grows to 540000*1.12^3 = 758,661.1; net 194,151.7
  const car = 800000 * Math.pow(1.06, 3), carGrow = Math.pow(1.12, 3);
  near('Plan: emergency target', p.efTarget, 360000, 0); near('Plan: pool', p.pool, 540000, 0.01);
  const carP = p.processed.find(g => g.name === 'Car')!;
  near('Plan: car inflated', carP.inflatedTarget, car, 0.01); near('Plan: car from savings', carP.fromSavings, 540000, 0.01); near('Plan: car net target', carP.netTarget, car - 540000 * carGrow, 0.01);
  near('Plan: house SIP (nothing left in the pool)', p.processed.find(g => g.name === 'House')!.sipNeeded, (() => { const t = 5000000 * Math.pow(1.07, 10); let lo = 0, hi = t; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let b = 0; for (let m = 0; m < 120; m++) b = (b + mid) * 1.01; if (b < t) lo = mid; else hi = mid; } return Math.ceil(hi / 500 - 1e-9) * 500; })(), 0);
  near('sipFV annuity due', sipFV(10000, 36, 0.12), (() => { let b = 0; for (let m = 0; m < 36; m++) b = (b + 10000) * 1.01; return b; })(), 1e-6);
}
// Couple: two people, income 150,000 and 50,000: shares 75 / 25. Bills paid: A pays rent 40,000, B pays groceries 10,000 -> total 50,000; fair B = 12,500; B paid 10,000 -> B owes A 2,500.
{
  const A = { name: 'A', income: 150000, expense: 60000 }, B = { name: 'B', income: 50000, expense: 30000 };
  const o = overview(A, B); near('Couple joint income', o.jointIncome as number, 200000, 0); near('Couple joint savings', o.jointSavings as number, 110000, 0); near('Couple savings rate', o.savingsRate as number, 0.55, 1e-12);
  const s = splitShared([{ id: '1', label: 'Rent', amount: 40000, paidBy: 'a' }, { id: '2', label: 'Food', amount: 10000, paidBy: 'b' }, { id: '3', label: 'Wifi', amount: 1000, paidBy: 'joint' }], A, B);
  near('Couple total', s.total, 50000, 0); near('Couple fair B', s.fairB as number, 12500, 1e-9); near('Couple settle', s.settle as number, 2500, 1e-9); near('Couple equal settle', s.settleEqual, 15000, 1e-9);
  near('Couple large items (>15% of 200,000 = 30,000)', s.largeItems.length, 1, 0);
}
// Holt: a straight line is forecast exactly; a hand-worked noisy series
near('Holt linear', holt([100, 110, 120, 130]), 140, 1e-9);
{ // [100,130,100]: level0=100 trend0=30. i=1: L=.3*130+.7*130=130, T=.1*30+.9*30=30. i=2: L=.3*100+.7*(160)=142, T=.1*(142-130)+.9*30=28.2 -> 170.2
  near('Holt hand-worked', holt([100, 130, 100]), 170.2, 1e-9); }
// Tax core: new regime FY25-26 by hand for 18L taxable: 0-4:0, 4-8:5%=20000, 8-12:10%=40000, 12-16:15%=60000, 16-18:20%*2L=40000 -> 160000 x 1.04 = 166,400
near('Tax new 18L', taxNew(1800000), 166400, 0);
near('Tax new 12L (87A nil)', taxNew(1200000), 0, 0);
near('Tax new 12.1L (marginal relief)', taxNew(1210000), 10400, 0);       // slab tax 61,500 but capped at the 10,000 earned above 12L; x 1.04
near('Tax old 10L', taxOld(1000000), (12500 + 100000) * 1.04, 0);        // 2.5-5L 5% = 12,500; 5-10L 20% = 100,000
near('Tax old 5L (87A nil)', taxOld(500000), 0, 0);


// SIP step-up: closed form of the geometric series, SIP paid at the END of each month (that is the screen's convention; it states none: see NOTE)
{
  for (const [base, st, years, ret] of [[10000, 10, 20, 12], [5000, 0, 10, 8], [25000, 25, 5, 15]] as const) {
    const r = ret / 1200; let want = 0;
    for (let y = 0; y < years; y++) { const sip = Math.round(base * Math.pow(1 + st / 100, y)); const fv = r === 0 ? sip * 12 : sip * (Math.pow(1 + r, 12) - 1) / r; want += fv * Math.pow(1 + r, 12 * (years - y - 1)); }
    near(`Step-up SIP ${base}/${st}/${years}/${ret}`, stepup({ baseSIP: base, stepUpPct: st, years, returnPct: ret }).finalStep, want, 1);
  }
  const flatSip = run('sip', { monthly: 10000, rate: 12, time: 20 }).get('totalVal').v, flatStep = stepup({ baseSIP: 10000, stepUpPct: 0, years: 20, returnPct: 12 }).finalFlat;
  INFO.push(`same flat SIP (Rs 10,000, 12%, 20 y): SIP calculator shows Rs ${Math.round(flatSip)} (instalment at the start of the month), step-up screen shows Rs ${flatStep} (end of month): ${((flatSip / flatStep - 1) * 100).toFixed(1)}% apart; each screen states its own convention (SIP calculator: notes line; step-up: month-end bullet), so this is a disclosed difference, not a bug.`);
}
// XIRR: Rs -100,000 on 2024-01-01 and +121,000 on 2026-01-01 (731 days) -> (1.21)^(365/731) - 1 ; and three-flow case solved by an independent Newton iteration
near('XIRR two flows', xirr([{ date: '2024-01-01', amount: -100000 }, { date: '2026-01-01', amount: 121000 }]) as number, Math.pow(1.21, 365 / 731) - 1, 1e-9);
{
  const fl = [{ d: 0, a: -50000 }, { d: 182, a: -50000 }, { d: 731, a: 120000 }]; let x = 0.1;
  for (let k = 0; k < 100; k++) { let f = 0, df = 0; for (const c of fl) { const t = c.d / 365; f += c.a / Math.pow(1 + x, t); df += -t * c.a / Math.pow(1 + x, t + 1); } x -= f / df; }
  near('XIRR three flows (Newton)', xirr([{ date: '2024-01-01', amount: -50000 }, { date: '2024-07-01', amount: -50000 }, { date: '2026-01-01', amount: 120000 }]) as number, x, 1e-7);
}
// Home loan: EMI by bisection (rounded to the rupee, as shown), total interest by ledger with the rounded EMI
{
  const hl = homeLoan({ loanAmount: 5000000, interestRate: 8.75, tenureYears: 20, prepayAmount: 0, prepayYear: 3, grossIncome: 2400000, monthlyIncome: 0 } as any);
  near('Home loan EMI', hl.emi, Math.round(emiBisect(5000000, 8.75, 240)), 0);
  let b = 5000000, ti = 0; for (let m = 0; m < 240 && b > 0; m++) { const i = b * 0.0875 / 12; const pr = Math.min(hl.emi - i, b); ti += i; b -= pr; }
  near('Home loan total interest (ledger with the shown EMI)', hl.sched.totalInterest, ti, 1);
  near('Home loan 24(b) yr-1 interest', hl.yr1Int, (() => { let bb = 5000000, t = 0; for (let m = 0; m < 12; m++) { const i = bb * 0.0875 / 12; t += i; bb -= hl.emi - i; } return t; })(), 1);
  near('Home loan affordability cap 40% of 2L', hl.maxAffordEMI, 80000, 0);
}

console.log(`${checks} comparisons, ${fails.length} mismatch(es)`);
for (const f of INFO) console.log('  NOTE', f);
for (const f of fails) console.log('  MISMATCH', f);
process.exit(fails.length ? 1 : 0);
