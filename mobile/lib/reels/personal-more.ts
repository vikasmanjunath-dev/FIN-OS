// Your Number, wave 2: eleven more reels rebuilt from figures already on the phone (lib/reels/mine.ts, plus income from the profile for one of them).
// Same rules as personal.ts: the lesson, the picture and the quiz are the example's; only the figures are the person's, and every figure comes from
// figures.ts / figures-play.ts. A reel whose figure is missing, outside the sane range, or whose rebuilt script breaks a rule of validateReel keeps its
// example. Each rebuilt script says in a caption that the figure came from this app and stays on this phone. Hindi is a draft for a native reviewer.
import { niceRound } from '@/lib/reels/beats';
import { fill, grownCost, loanFromEmi, money, monthsToDeplete, ratioPct, sipFutureValue, stepUpSipFutureValue, emi } from '@/lib/reels/figures';
import { emiAfterRateRise, extraMonthlySaving, monthsCovered, monthsLeft, retireCorpus, stepUpPaid } from '@/lib/reels/figures-play';
import { sc, t } from '@/lib/reels/kit';
import type { LoanFor } from '@/lib/reels/content-play';
import type { Mine, MineLoan } from '@/lib/reels/mine';
import { validateReel } from '@/lib/reels/validate';
import type { Beat, L, Reel, Scene } from '@/lib/reels/types';

/**
 * What the builders may know besides `Mine`. `Signals` (lib/reels/signals.ts) fits this shape, so a caller can pass it as it is.
 * `strain` is true when the biggest loan's EMI is at or above half of income, or a loss of income is declared and active.
 */
export interface PersonalCtx { strain?: boolean; income?: number }

// ── Sanity limits: the same ones as mine.ts, so a figure built by hand (or a typo) is held to them too ─────────────────────────────────────────

const inRange = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/** The figures that pass mine.ts's limits (a SIP of ₹500 to ₹5 lakh, spending ₹5,000 to ₹10 lakh a month, a loan whose EMI covers its interest, and so on). */
export function saneMine(m: Mine): Mine {
  const out: Mine = {};
  if (inRange(m.sip, 500, 500_000)) out.sip = m.sip;
  if (inRange(m.spend, 5_000, 1_000_000)) out.spend = m.spend;
  if (inRange(m.fund, 1_000, 100_000_000)) out.fund = m.fund;
  const l = m.loan;
  if (l && inRange(l.balance, 10_000, 500_000_000) && inRange(l.emi, 500, 50_000_000) && inRange(l.rate, 1, 40) && l.emi > (l.balance * l.rate) / 1200) out.loan = l;
  return out;
}

/** A monthly income from the profile: ₹5,000 to ₹1 crore a month. Anything else is treated as not known. */
export const saneIncome = (n: unknown): number | undefined => (inRange(n, 5_000, 10_000_000) ? Math.round(n) : undefined);

/** The loan as the guess reels need it, or null if the remaining time is not one a reel can sensibly describe (1 to 40 years). */
export function loanFor(loan: MineLoan): LoanFor | null {
  const months = Math.round(monthsLeft(loan.balance, loan.rate, loan.emi));
  return Number.isFinite(months) && months >= 12 && months <= 480 ? { label: loan.label, balance: loan.balance, rate: loan.rate, months, emi: loan.emi } : null;
}

// ── Rates the example reels use. The personal versions keep them, labelled as assumptions ──────────────────────────────────────────────────────
const SIP_RATE = 12, INFLATION = 6, STEP_PCT = 10, STEP_YEARS = 20, RETIRE_YEARS = 25, DRAW_RATE = 7, EMI_GUIDE_PCT = 40, AFFORD_YEARS = 20, RISE_PTS = 0.5;

const pct = (n: number): string => String(Math.round(n * 100) / 100);
const half = (n: number): number => Math.round(n * 2) / 2;
/** "about 3 years" from 36 months; under two years it stays in months. */
function span(months: number): L {
  if (months >= 24) { const y = pct(Math.round((months / 12) * 10) / 10); return t(`${y} years`, `${y} साल`); }
  const m = Math.max(1, Math.round(months));
  return t(`${m} months`, `${m} महीने`);
}
/** How many months of spending a fund covers, in words that never read as silly at either end. */
function monthsPhrase(months: number): L {
  if (months >= 6) return t('more than 6 months of everything you spend', 'आपके पूरे ख़र्च के 6 महीने से ज़्यादा');
  if (months < 0.5) return t('less than half a month of everything you spend', 'आपके पूरे ख़र्च के आधे महीने से भी कम');
  const v = pct(Math.round(months * 10) / 10);
  return t(`about ${v} months of everything you spend`, `आपके पूरे ख़र्च के लगभग ${v} महीने`);
}
const bar = (label: L, value: number, text: L, tone: 'cyan' | 'teal' | 'gold' | 'purple' | 'red') => ({ label, value, text, tone });

interface Builder {
  /** The reel's message is "put in more" (raise a SIP, prepay, a shorter loan, growth): never personalised under strain, or when strain is not known. */
  asksMore: boolean;
  /** The figures it reads, for the docs and the tests. */
  uses: ('sip' | 'spend' | 'fund' | 'loan' | 'income')[];
  build: (r: Reel, m: Mine, c: PersonalCtx) => Reel | null;
}

const mineReel = (r: Reel, scenes: Scene[], extra: Partial<Reel> = {}): Reel => ({ ...r, mine: true, scenes, ...extra });
const poked = (r: Reel, after: number, beat: Beat): Pick<Reel, 'poke'> => ({ poke: { after: r.poke?.after ?? after, beat } });

// ── 1. Emergency fund target (spend, fund) ────────────────────────────────────────────────────────────────────────────────────────────────

function emergencyTargetFor(r: Reel, m: Mine): Reel | null {
  if (!m.spend) return null;
  const s = m.spend, lo = s * 3, hi = s * 6;
  const scenes: Scene[] = [
    r.scenes[0],
    sc('happy', fill(t('You spend about {s} a month in all. This comes from this app and stays on this phone.', 'आप महीने में कुल लगभग {s} ख़र्च करते हैं। यह इसी ऐप से है और इसी फ़ोन पर रहता है।'), { s: money(s) }),
      { prop: { kind: 'counter', from: 0, to: s, format: 'inr', tone: 'cyan', label: t('all your spending a month', 'आपका पूरा मासिक ख़र्च') } }),
    sc('surprised', fill(t('Essentials are only part of it, so 3 to 6 months of them is under {lo} to {hi}, your full spending.', 'ज़रूरी ख़र्च उसका एक हिस्सा है, इसलिए उसके 3 से 6 महीने {lo} से {hi} यानी आपके पूरे ख़र्च से कम हैं।'), { lo: money(lo), hi: money(hi) }),
      { prop: { kind: 'bars', items: [bar(t('3 months', '3 महीने'), lo, money(lo), 'gold'), bar(t('6 months', '6 महीने'), hi, money(hi), 'teal')] } }),
  ];
  if (m.fund) {
    const months = monthsCovered(m.fund, s), say = monthsPhrase(months);
    scenes.push(sc(months >= 3 ? 'cheer' : 'think', t(`You have ${money(m.fund).en} set aside: ${say.en}.`, `आपने ${money(m.fund).hi} अलग रखा है: ${say.hi}।`),
      { prop: { kind: 'bars', items: [bar(t('You have', 'आपके पास'), m.fund, money(m.fund), 'cyan'), bar(t('3 months', '3 महीने'), lo, money(lo), 'gold'), bar(t('6 months', '6 महीने'), hi, money(hi), 'teal')] } }));
  }
  scenes.push(r.scenes[3], r.scenes[4]);
  return mineReel(r, scenes);
}

// ── 2. Inflation on the person's monthly spending (spend) ─────────────────────────────────────────────────────────────────────────────────

function inflationFor(r: Reel, m: Mine, c: PersonalCtx): Reel | null {
  if (!m.spend) return null;
  const s = m.spend, later = Math.round(grownCost(s, INFLATION, 10));
  const scenes: Scene[] = [
    sc('surprised', fill(t('You spend about {s} a month. This comes from this app and stays on this phone.', 'आप महीने में लगभग {s} ख़र्च करते हैं। यह इसी ऐप से है और इसी फ़ोन पर रहता है।'), { s: money(s) }), { big: money(s), prop: { kind: 'coins', count: 4 } }),
    r.scenes[1],
    sc('worry', fill(t('At an assumed {r}% a year, spending that costs {s} now could cost about {f} a month in 10 years.', 'अनुमानित {r}% सालाना पर, जो ख़र्च आज {s} का है, वह 10 साल में लगभग {f} महीना हो सकता है।'), { r: INFLATION, s: money(s), f: money(later) }),
      { prop: { kind: 'counter', from: s, to: later, format: 'inr', tone: 'red', label: t('your spending in 10 years, assumed', '10 साल बाद आपका ख़र्च, अनुमान') } }),
    r.scenes[2], ...(c.strain ? [] : [r.scenes[4]]), r.scenes[5],       // "is my money growing faster than prices?" is left out under strain
  ];
  return mineReel(r, scenes);
}

// ── 3. A SIP that rises each year (sip) ───────────────────────────────────────────────────────────────────────────────────────────────────

function goalStepUpFor(r: Reel, m: Mine): Reel | null {
  if (!m.sip) return null;
  const s = m.sip, flat = sipFutureValue(s, SIP_RATE, STEP_YEARS), step = stepUpSipFutureValue(s, STEP_PCT, SIP_RATE, STEP_YEARS);
  const paidFlat = s * 12 * STEP_YEARS, paidStep = stepUpPaid(s, STEP_PCT, STEP_YEARS);
  if (!(step > flat)) return null;
  const scenes: Scene[] = [
    r.scenes[0],
    sc('happy', fill(t('Your SIP is {s} a month, from this app, and stays on this phone. Flat, or raised {p}% a year, for {y} years.', 'आपकी SIP {s} महीना है, इसी ऐप से, और इसी फ़ोन पर रहती है। {y} साल तक वही, या हर साल {p}% बढ़ाकर।'), { s: money(s), p: STEP_PCT, y: STEP_YEARS })),
    sc('think', fill(t('You would put in {a} if flat, or {b} if you raise it every year.', 'स्थिर रखें तो आप {a} लगाते हैं, और हर साल बढ़ाएँ तो {b}।'), { a: money(paidFlat), b: money(paidStep) }),
      { prop: { kind: 'bars', items: [bar(t('Flat', 'स्थिर'), paidFlat, money(paidFlat), 'gold'), bar(t('Stepped up', 'स्टेप-अप'), paidStep, money(paidStep), 'cyan')] } }),
    sc('surprised', fill(t('At an assumed {r}% a year, flat ends near {f}. Stepped up, near {g}.', 'अनुमानित {r}% सालाना पर, स्थिर SIP लगभग {f} पर पहुँचती है। स्टेप-अप, लगभग {g}।'), { r: SIP_RATE, f: money(flat), g: money(step) }),
      { prop: { kind: 'bars', items: [bar(t('Flat SIP', 'स्थिर SIP'), flat, money(flat), 'gold'), bar(t('Stepped up', 'स्टेप-अप'), step, money(step), 'teal')] } }),
    r.scenes[3], r.scenes[4],
  ];
  return mineReel(r, scenes);
}

// ── 4. What an extra payment does to the person's loan (loan) ──────────────────────────────────────────────────────────────────────────────

function prepayFor(r: Reel, m: Mine): Reel | null {
  const l = m.loan && loanFor(m.loan);
  if (!m.loan || !l) return null;
  const extra = Math.max(500, Math.round((m.loan.emi * 0.1) / 500) * 500);
  if (extra > m.loan.emi) return null;
  const v = extraMonthlySaving(m.loan.balance, m.loan.rate, m.loan.emi, extra);
  const before = m.loan.emi * v.monthsBefore - m.loan.balance, after = (m.loan.emi + extra) * v.monthsAfter - m.loan.balance;
  if (!(v.monthsSaved >= 1 && v.interestSaved > 0 && v.monthsAfter >= 1 && after > 0)) return null;
  const scenes: Scene[] = [
    r.scenes[0],
    sc('happy', fill(t('Your {n}: {b} left at {r}%, EMI {e}. This is from this app and stays on this phone.', 'आपका {n}: {b} बाक़ी, {r}% पर, EMI {e}। यह इसी ऐप से है और इसी फ़ोन पर रहता है।'), { n: m.loan.label, b: money(m.loan.balance), r: pct(m.loan.rate), e: money(m.loan.emi) })),
    sc('think', fill(t('Say you add {x} a month on top: an example of about a tenth of your EMI, not a target.', 'मान लें आप ऊपर से हर महीने {x} जोड़ते हैं: आपकी EMI का लगभग दसवाँ हिस्सा, एक उदाहरण, लक्ष्य नहीं।'), { x: money(extra) })),
    sc('surprised', fill(t('That could end it about {m} sooner and save about {i} of interest.', 'इससे लोन लगभग {m} पहले ख़त्म हो सकता है और लगभग {i} ब्याज बच सकता है।'), { m: span(v.monthsSaved), i: money(v.interestSaved) }),
      { prop: { kind: 'bars', items: [bar(t('No extra', 'बिना अतिरिक्त'), before, money(before), 'red'), bar(t('With extra', 'अतिरिक्त सहित'), after, money(after), 'teal')] } }),
    r.scenes[3], r.scenes[4], r.scenes[5],
  ];
  return mineReel(r, scenes);
}

// ── 5. A half-point rise on the person's loan (loan) ──────────────────────────────────────────────────────────────────────────────────────

function rbiFor(r: Reel, m: Mine): Reel | null {
  const l = m.loan && loanFor(m.loan);
  if (!m.loan || !l) return null;
  const after = emiAfterRateRise(m.loan.balance, m.loan.rate, l.months, RISE_PTS, m.loan.emi);
  if (!(after - m.loan.emi >= 1)) return null;
  const r2 = pct(m.loan.rate + RISE_PTS);
  const scenes: Scene[] = [
    r.scenes[0], r.scenes[1],
    sc('think', fill(t('Your {n}: {b} left at {r}%, EMI {e}. This is from this app and stays on this phone.', 'आपका {n}: {b} बाक़ी, {r}% पर, EMI {e}। यह इसी ऐप से है और इसी फ़ोन पर रहता है।'), { n: m.loan.label, b: money(m.loan.balance), r: pct(m.loan.rate), e: money(m.loan.emi) })),
    sc('worry', fill(t('If its rate rose half a point to {r}% with the same months left, the EMI would be about {b}.', 'अगर इसकी दर आधा अंक बढ़कर {r}% हो और बाक़ी महीने वही रहें, तो EMI लगभग {b} होगी।'), { r: r2, b: money(after) }),
      { prop: { kind: 'bars', items: [bar(t(`At ${pct(m.loan.rate)}%`, `${pct(m.loan.rate)}% पर`), m.loan.emi, money(m.loan.emi), 'teal'), bar(t(`At ${r2}%`, `${r2}% पर`), after, money(after), 'gold')] } }),
    r.scenes[3], r.scenes[4],
  ];
  return mineReel(r, scenes);
}

// ── 6. The EMI slider on the person's own loan (loan) ─────────────────────────────────────────────────────────────────────────────────────

function emiRateSlideFor(r: Reel, m: Mine): Reel | null {
  const l = m.loan && loanFor(m.loan);
  if (!m.loan || !l || r.poke?.beat.kind !== 'slider') return null;
  const years = l.months / 12, lo = Math.max(1, half(m.loan.rate - 2)), hi = Math.min(40, half(m.loan.rate + 3));
  if (!(hi > lo)) return null;
  const start = Math.min(hi, Math.max(lo, half(m.loan.rate + 1)));
  const eLo = emi(m.loan.balance, lo, years), eHi = emi(m.loan.balance, hi, years);
  const y = pct(Math.round(years * 10) / 10);
  const scenes: Scene[] = [
    r.scenes[0],
    sc('think', fill(t('Your {n}: {b} left at {r}%, about {y} years to go. From this app; it stays on this phone.', 'आपका {n}: {b} बाक़ी, {r}% पर, लगभग {y} साल बाक़ी। इसी ऐप से; यह इसी फ़ोन पर रहता है।'), { n: m.loan.label, b: money(m.loan.balance), r: pct(m.loan.rate), y }),
      { prop: { kind: 'steps', items: [fill(t('Left {b}', 'बाक़ी {b}'), { b: money(m.loan.balance) }), fill(t('{y} years to go', '{y} साल बाक़ी'), { y }), fill(t('Now {r}%', 'अभी {r}%'), { r: pct(m.loan.rate) })] } }),
    sc('surprised', fill(t('At about {lo}% the EMI would be {a}. At about {hi}% it would be {b}.', 'लगभग {lo}% पर EMI {a} होगी। लगभग {hi}% पर {b}।'), { lo: pct(lo), hi: pct(hi), a: money(eLo), b: money(eHi) }),
      { prop: { kind: 'bars', items: [bar(t(`At ${pct(lo)}%`, `${pct(lo)}% पर`), eLo, money(eLo), 'teal'), bar(t(`At ${pct(hi)}%`, `${pct(hi)}% पर`), eHi, money(eHi), 'gold')] } }),
    r.scenes[3], r.scenes[4], r.scenes[5],
  ];
  const beat: Beat = { ...r.poke.beat, min: lo, max: hi, start, model: { kind: 'emi-rate', principal: m.loan.balance, years, rate0: m.loan.rate } };
  return mineReel(r, scenes, poked(r, 1, beat));
}

// ── 7. The EMI as a share of income (loan, income) ────────────────────────────────────────────────────────────────────────────────────────

function affordabilityFor(r: Reel, m: Mine, c: PersonalCtx): Reel | null {
  const income = saneIncome(c.income);
  if (!m.loan || !income) return null;
  const share = ratioPct(m.loan.emi, income), shown = Math.round(share);
  if (!(shown >= 1 && share < 100)) return null;
  const guide = Math.round((income * EMI_GUIDE_PCT) / 100), fits = Math.round(loanFromEmi(guide, m.loan.rate, AFFORD_YEARS));
  const heavy = !!c.strain || share >= 50;
  const scenes: Scene[] = [
    r.scenes[0],
    sc('think', fill(t('Your {n} EMI is {e}; your monthly income is {i}. Both are from this app and stay on this phone.', 'आपके {n} की EMI {e} है; आपकी मासिक आमदनी {i}। दोनों इसी ऐप से हैं और इसी फ़ोन पर रहते हैं।'), { n: m.loan.label, e: money(m.loan.emi), i: money(income) }),
      { prop: { kind: 'donut', parts: [{ value: m.loan.emi, label: t('This EMI', 'यह EMI'), tone: 'cyan' }, { value: income - m.loan.emi, label: t('The rest', 'बाक़ी'), tone: 'teal' }], centre: t(`${shown}% of income`, `${shown}% आमदनी`) } }),
    sc('happy', fill(t('This EMI is about {p}% of your income. A common guide keeps all EMIs under about {g}%, here {c} a month.', 'यह EMI आपकी आमदनी का लगभग {p}% है। आम सुझाव है कि सारी EMI लगभग {g}% से नीचे रहें, यहाँ {c} महीना।'), { p: shown, g: EMI_GUIDE_PCT, c: money(guide) })),
    sc('surprised', fill(t('At your loan’s {r}% over {y} years, assumed, {c} a month repays about {l}.', 'आपके लोन की {r}% दर पर, {y} साल के अनुमान से, {c} महीना लगभग {l} चुकाता है।'), { r: pct(m.loan.rate), y: AFFORD_YEARS, c: money(guide), l: money(fits) }),
      { prop: { kind: 'counter', from: 0, to: fits, format: 'inr', tone: 'teal', label: t('loan that fits (illustration)', 'जो लोन समाता है (उदाहरण)') } }),
    ...(heavy
      ? [sc('think', t('If your EMI feels heavy, that is common and it can be talked through. Lenders have options, so ask early.', 'EMI भारी लगे तो यह आम बात है और इस पर बात हो सकती है। बैंकों के पास विकल्प होते हैं, इसलिए जल्दी पूछें।')), sc('cheer', t('Knowing your own number is the first step.', 'अपना आँकड़ा जानना पहला क़दम है।'))]
      : [r.scenes[3], r.scenes[4]]),
  ];
  return mineReel(r, scenes);
}

// ── 8. How long the person's own SIP runs (sip) ───────────────────────────────────────────────────────────────────────────────────────────

function sipLengthFor(r: Reel, m: Mine): Reel | null {
  if (!m.sip || r.poke?.beat.kind !== 'slider') return null;
  const s = money(m.sip);
  const scenes: Scene[] = [
    r.scenes[0],
    sc('think', fill(t('Your SIP: {s} a month, at an assumed {r}% a year. This is from this app and stays on this phone.', 'आपकी SIP: {s} महीना, अनुमानित {r}% सालाना। यह इसी ऐप से है और इसी फ़ोन पर रहती है।'), { s, r: SIP_RATE }),
      { prop: { kind: 'steps', items: [fill(t('{s} a month', 'महीने का {s}'), { s }), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमानित'), { r: SIP_RATE }), t('You choose the years', 'साल आप चुनें')] } }),
    r.scenes[2], r.scenes[3], r.scenes[4],
  ];
  const beat: Beat = { ...r.poke.beat, q: fill(t('Drag the years to see what {s} a month becomes.', 'साल खिसकाकर देखें {s} महीना क्या बनता है।'), { s }), model: { kind: 'sip-years', monthly: m.sip, rate: SIP_RATE } };
  return mineReel(r, scenes, poked(r, 1, beat));
}

// ── 9. The person's loan balance spread over a different term (loan) ─────────────────────────────────────────────────────────────────────

function emiTenureFor(r: Reel, m: Mine): Reel | null {
  if (!m.loan || r.poke?.beat.kind !== 'slider') return null;
  const b = money(m.loan.balance);
  const scenes: Scene[] = [
    r.scenes[0],
    sc('think', fill(t('Take your {n} balance, {b} at {r}%, as if it were a fresh loan. From this app; it stays on this phone.', 'अपने {n} की बाक़ी रकम {b}, {r}% पर, नए लोन की तरह लें। इसी ऐप से; यह इसी फ़ोन पर रहती है।'), { n: m.loan.label, b, r: pct(m.loan.rate) }),
      { prop: { kind: 'steps', items: [fill(t('{b} left', '{b} बाक़ी'), { b }), fill(t('{r}% a year, yours', '{r}% सालाना, आपकी'), { r: pct(m.loan.rate) }), t('You choose the years', 'साल आप चुनें')] } }),
    r.scenes[2], r.scenes[3], r.scenes[4],
  ];
  const beat: Beat = { ...r.poke.beat, q: fill(t('Drag the years to see the EMI and the interest on {b}.', 'साल खिसकाकर {b} पर EMI और ब्याज देखें।'), { b }), model: { kind: 'emi-tenure', principal: m.loan.balance, rate: m.loan.rate } };
  return mineReel(r, scenes, poked(r, 1, beat));
}

// ── 10. A rough retirement number from the person's spending (spend) ────────────────────────────────────────────────────────────────────

function retireCorpusFor(r: Reel, m: Mine): Reel | null {
  if (!m.spend) return null;
  const rc = retireCorpus(m.spend, INFLATION, RETIRE_YEARS), later = Math.round(rc.futureMonthly), corpus = Math.round(rc.corpus);
  const scenes: Scene[] = [
    r.scenes[0],
    sc('happy', fill(t('You spend about {s} a month. This comes from this app and stays on this phone.', 'आप महीने में लगभग {s} ख़र्च करते हैं। यह इसी ऐप से है और इसी फ़ोन पर रहता है।'), { s: money(m.spend) })),
    sc('worry', fill(t('At an assumed {r}% inflation, in {y} years that is about {f} a month.', 'अनुमानित {r}% महँगाई पर, {y} साल बाद यह लगभग {f} महीना होगा।'), { r: INFLATION, y: RETIRE_YEARS, f: money(later) }),
      { prop: { kind: 'counter', from: m.spend, to: later, format: 'inr', tone: 'red', label: t('your spending in 25 years (illustration)', '25 साल बाद आपका ख़र्च (उदाहरण)') } }),
    sc('happy', fill(t('A rough rule of thumb: a corpus of about 25 times your yearly spend. Here, about {c}.', 'मोटा नियम: कॉर्पस लगभग सालाना ख़र्च का 25 गुना। यहाँ, लगभग {c}।'), { c: money(corpus) }),
      { prop: { kind: 'counter', from: 0, to: corpus, format: 'inr', tone: 'teal', label: t('rough corpus (illustration)', 'मोटा कॉर्पस (उदाहरण)') } }),
    r.scenes[3], r.scenes[4],
  ];
  return mineReel(r, scenes);
}

// ── 11. What the person's SIP could build, and how long it lasts (sip) ─────────────────────────────────────────────────────────────────────

/** A slider step of 1, 2 or 5 times a power of ten that gives about `n` positions across `span`. */
function niceStep(span: number, n: number): number {
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

function corpusSlideFor(r: Reel, m: Mine): Reel | null {
  if (!m.sip || r.poke?.beat.kind !== 'slider') return null;
  const corpus = Math.round(sipFutureValue(m.sip, SIP_RATE, RETIRE_YEARS)), s = money(m.sip), c = money(corpus);
  const step = niceStep(corpus * 0.0065, 25), min = Math.max(step, Math.round((corpus * 0.0035) / step) * step), max = Math.round((corpus * 0.01) / step) * step;
  const start = Math.min(max, Math.max(min, Math.round((corpus * 0.007) / step) * step));
  const wA = niceRound(corpus * 0.0065), wB = niceRound(corpus * 0.0095);
  const yrs = (w: number) => monthsToDeplete(corpus, DRAW_RATE, w) / 12;
  if (!(max > min) || !(wB > wA) || !Number.isFinite(yrs(wA)) || !Number.isFinite(yrs(wB))) return null;
  const yText = (w: number): L => { const y = Math.round(yrs(w)); return t(`${y} yrs`, `${y} साल`); };
  const scenes: Scene[] = [
    sc('think', fill(t('Your SIP of {s} for {y} years, at an assumed {r}%, could build about {c}. From this app; it stays on this phone.', 'आपकी {s} की SIP {y} साल में, अनुमानित {r}% पर, लगभग {c} बना सकती है। इसी ऐप से; यह इसी फ़ोन पर रहती है।'), { s, y: RETIRE_YEARS, r: SIP_RATE, c }), { big: t('Your corpus', 'आपका कोष') }),
    { ...r.scenes[1], prop: { kind: 'steps', items: [fill(t('{c} to start', 'शुरू में {c}'), { c }), t('A monthly withdrawal', 'हर महीने की निकासी'), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमान'), { r: DRAW_RATE })] } },
    sc('surprised', fill(t('Taking {a} a month lasts about {x} years. Taking {b} lasts about {y}.', '{a} महीना निकालने पर लगभग {x} साल चलता है। {b} निकालने पर लगभग {y}।'), { a: money(wA), x: Math.round(yrs(wA)), b: money(wB), y: Math.round(yrs(wB)) }),
      { prop: { kind: 'bars', items: [bar(t(money(wA).en, money(wA).hi), yrs(wA), yText(wA), 'teal'), bar(t(money(wB).en, money(wB).hi), yrs(wB), yText(wB), 'gold')] } }),
    r.scenes[3], r.scenes[4], r.scenes[5],
  ];
  const beat: Beat = { ...r.poke.beat, q: fill(t('Drag the monthly withdrawal to see how long {c} lasts.', 'मासिक निकासी खिसकाकर देखें {c} कितना चलता है।'), { c }), min, max, step, start, model: { kind: 'corpus-spend', corpus, rate: DRAW_RATE } };
  return mineReel(r, scenes, poked(r, 1, beat));
}

// ── The table ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const PERSONAL_MORE: Record<string, Builder> = {
  'emergency-target': { asksMore: false, uses: ['spend', 'fund'], build: emergencyTargetFor },
  'inflation': { asksMore: false, uses: ['spend'], build: inflationFor },
  'goal-step-up': { asksMore: true, uses: ['sip'], build: goalStepUpFor },
  'home-loan-prepay': { asksMore: true, uses: ['loan'], build: prepayFor },
  'rbi-and-emi': { asksMore: false, uses: ['loan'], build: rbiFor },
  'emi-rate-slide': { asksMore: false, uses: ['loan'], build: emiRateSlideFor },
  'home-loan-affordability': { asksMore: false, uses: ['loan', 'income'], build: affordabilityFor },
  'slide-sip-length': { asksMore: true, uses: ['sip'], build: sipLengthFor },
  'slide-emi-tenure': { asksMore: true, uses: ['loan'], build: emiTenureFor },
  'retire-corpus': { asksMore: false, uses: ['spend'], build: retireCorpusFor },
  'corpus-spend-slide': { asksMore: true, uses: ['sip'], build: corpusSlideFor },
};

/**
 * The library with each wave-2 reel rebuilt from the person's figures where they are there and sensible. Order and ids are unchanged.
 * A reel that asks for more money (a higher SIP, an extra payment, a shorter loan, growth) is only rebuilt when `ctx` says the person is not
 * under strain: with strain, or with no `ctx` at all (strain not known), it keeps its example. A rebuilt script that breaks any rule of
 * validateReel (a caption too long for an unusual figure, say) is dropped for the example too.
 */
export function personaliseMore(base: Reel[], mine: Mine, ctx?: PersonalCtx): Reel[] {
  const m = saneMine(mine), c: PersonalCtx = { ...(ctx?.strain ? { strain: true } : {}), ...(saneIncome(ctx?.income) ? { income: saneIncome(ctx?.income) } : {}) };
  return base.map(r => {
    const b = PERSONAL_MORE[r.id];
    if (!b || (b.asksMore && (!ctx || ctx.strain))) return r;
    try {
      const out = b.build(r, m, c);
      return out && validateReel(out).length === 0 ? out : r;
    } catch { return r; }
  });
}
