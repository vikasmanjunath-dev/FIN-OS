// Pure port of js/finos-offer-compare.js — what a job offer really puts in your hand.
// CTC is not salary: employer PF, gratuity and employer NPS sit inside it, variable pay may not be paid in full,
// and the tax regime changes the result. Up to three offers are compared year by year.
//   fixed = CTC − variable;  basic = basicPct × fixed;  PF wage = basic (or the ₹15,000/month ceiling)
//   employer PF = employee PF = 12% × PF wage;  gratuity = 4.81% × basic;  employer NPS = npsPct × basic
//   cash gross = fixed − employer PF − gratuity − employer NPS + variable × payout (+ joining bonus in year 1)
//   tax = lower of new/old regime;  take-home = cash gross − employee PF − professional tax − tax
//   total value = take-home + employee PF + employer PF + employer NPS + gratuity accrual
// Gratuity is only payable after five years of service; surcharge (> ₹50L) is not modelled.
import { STD_NEW, STD_OLD, best } from './taxcore.ts';

export interface Offer {
  name: string; ctc: number; variable: number; payout: number; basicPct: number;
  pfBasis: 'actual' | 'ceiling'; npsPct: number; joiningBonus: number; hike: number;
}
export interface Options { years: number; oldDeductions: number; profTax: number }
export interface YearRow {
  year: number; ctc: number; gross: number; tax: number; regime: 'new' | 'old'; taxNew: number; taxOld: number;
  eePF: number; erPF: number; erNPS: number; gratuity: number; bonus: number; takeHome: number; locked: number; totalValue: number;
}
export interface Evaluation {
  offer: Offer; opts: Options; years: YearRow[]; monthlyInHand: number; regime: 'new' | 'old'; takeHomeShare: number;
  totals: { takeHome: number; locked: number; gratuity: number; tax: number; totalValue: number; ctc: number };
}
export interface Comparison { results: Evaluation[]; winnerMonthly: number; winnerTotal: number; gapMonthly: number; gapTotal: number }

export const PF_RATE = 0.12;
export const GRATUITY_RATE = 0.0481;
const PF_CEILING_ANNUAL = 15000 * 12;
const NPS_CAP_NEW = 0.14; // 80CCD(2) limit, % of basic
const NPS_CAP_OLD = 0.10;

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export function normalize(o: Partial<Offer> | null | undefined): Offer {
  const ctc = Math.max(0, num(o?.ctc, 0));
  return {
    name: String(o?.name || 'Offer').trim() || 'Offer',
    ctc,
    variable: Math.min(ctc, Math.max(0, num(o?.variable, 0))),
    payout: Math.max(0, Math.min(200, num(o?.payout, 100))),
    basicPct: Math.max(1, Math.min(100, num(o?.basicPct, 40))),
    pfBasis: o?.pfBasis === 'ceiling' ? 'ceiling' : 'actual',
    npsPct: Math.max(0, Math.min(14, num(o?.npsPct, 0))),
    joiningBonus: Math.max(0, num(o?.joiningBonus, 0)),
    hike: Math.max(0, Math.min(50, num(o?.hike, 8))),
  };
}

function yearCalc(o: Offer, y: number, includeBonus: boolean, opts: Options): YearRow {
  const g = Math.pow(1 + o.hike / 100, y);
  const ctc = o.ctc * g;
  const variable = o.variable * g;
  const fixed = ctc - variable;
  const basic = fixed * (o.basicPct / 100);
  const pfWage = o.pfBasis === 'ceiling' ? Math.min(basic, PF_CEILING_ANNUAL) : basic;
  const erPF = PF_RATE * pfWage;
  const eePF = PF_RATE * pfWage;
  const gratuity = GRATUITY_RATE * basic;
  const erNPS = (o.npsPct / 100) * basic;
  const fixedCash = Math.max(0, fixed - erPF - gratuity - erNPS);
  const variableCash = variable * (o.payout / 100);
  const bonus = includeBonus && y === 0 ? o.joiningBonus : 0;
  const gross = fixedCash + variableCash + bonus;

  const taxableNew = gross - STD_NEW - Math.min(erNPS, NPS_CAP_NEW * basic);
  const taxableOld = gross - STD_OLD - opts.profTax - Math.min(erNPS, NPS_CAP_OLD * basic) - opts.oldDeductions;
  const t = best(taxableNew, taxableOld);
  const takeHome = gross - eePF - opts.profTax - t.tax;
  const locked = eePF + erPF + erNPS;
  return {
    year: y + 1, ctc, gross, tax: t.tax, regime: t.regime, taxNew: t.taxNew, taxOld: t.taxOld,
    eePF, erPF, erNPS, gratuity, bonus, takeHome, locked,
    totalValue: takeHome + locked + gratuity,
  };
}

export function evaluate(offer: Partial<Offer> | null | undefined, options?: Partial<Options>): Evaluation {
  const o = normalize(offer);
  const opts: Options = {
    years: Math.max(1, Math.min(10, Math.round(num(options?.years, 5)))),
    oldDeductions: Math.max(0, num(options?.oldDeductions, 150000)),
    profTax: Math.max(0, num(options?.profTax, 2400)),
  };
  const years: YearRow[] = [];
  for (let y = 0; y < opts.years; y++) years.push(yearCalc(o, y, true, opts));
  const steady = yearCalc(o, 0, false, opts); // year 1 without the one-time joining bonus
  const sum = (k: keyof YearRow) => years.reduce((a, r) => a + (r[k] as number), 0);
  return {
    offer: o, opts, years,
    monthlyInHand: steady.takeHome / 12,
    regime: steady.regime,
    takeHomeShare: o.ctc > 0 ? steady.takeHome / o.ctc : 0,
    totals: {
      takeHome: sum('takeHome'), locked: sum('locked'), gratuity: sum('gratuity'),
      tax: sum('tax'), totalValue: sum('totalValue'), ctc: sum('ctc'),
    },
  };
}

export function compare(offers: Partial<Offer>[] | null | undefined, options?: Partial<Options>): Comparison {
  const list = (offers || []).filter(o => num(o?.ctc, 0) > 0).slice(0, 3);
  const results = list.map(o => evaluate(o, options));
  const pick = (fn: (r: Evaluation) => number) => (results.length ? results.reduce((b, r) => (fn(r) > fn(b) ? r : b), results[0]) : null);
  const byMonthly = pick(r => r.monthlyInHand);
  const byTotal = pick(r => r.totals.totalValue);
  return {
    results,
    winnerMonthly: byMonthly ? results.indexOf(byMonthly) : -1,
    winnerTotal: byTotal ? results.indexOf(byTotal) : -1,
    gapMonthly: results.length > 1 ? Math.max(...results.map(r => r.monthlyInHand)) - Math.min(...results.map(r => r.monthlyInHand)) : 0,
    gapTotal: results.length > 1 ? Math.max(...results.map(r => r.totals.totalValue)) - Math.min(...results.map(r => r.totals.totalValue)) : 0,
  };
}
