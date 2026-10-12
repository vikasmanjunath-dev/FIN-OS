// Home loan: EMI, year-by-year amortisation, one-off prepayment impact, 24(b)/80C deductions and the 40%-of-income affordability check.
// A typed port of the calculation half of js/finos-home-loan.js; __tests__/homeLoan.parity.test.mts compares them on random loans.
// Left out on purpose: the website's "PMAY-CLSS eligibility detected" banner. It quotes MIG-I / MIG-II income bands of the
// credit-linked subsidy, which has been wound up; showing it as an eligibility result would mislead.

export interface HomeLoanParams {
  loanAmount: number; interestRate: number; tenureYears: number; prepayAmount: number; prepayYear: number;
  grossIncome: number; monthlyIncome: number;
}
export interface YearRow { year: number; interest: number; principal: number; balance: number }
export interface Schedule { emi: number; yearly: YearRow[]; totalInterest: number; totalPrincipal: number }
export interface PrepayImpact { newTenureMonths: number; savedMonths: number; savedInterest: number; newTotalInt: number }
export interface HomeLoanResult {
  emi: number; sched: Schedule;
  emiPct: number | null; affordable: boolean; maxAffordEMI: number; maxAffordLoan: number;
  sec24bDeduct: number; sec80cDeduct: number; totalTaxDeduct: number; yr1Int: number; yr1Prin: number;
  prepay: PrepayImpact; totalCost: number;
}

export const HL_DEFAULTS = { loanAmount: 5000000, interestRate: 8.75, tenureYears: 20, prepayAmount: 200000, prepayYear: 3 };
export const HL_KEYS = {
  loanAmount: 'finos_hl_amount', interestRate: 'finos_hl_rate', tenureYears: 'finos_hl_tenure', prepayAmount: 'finos_hl_prepay', prepayYear: 'finos_hl_prepayyr',
} as const;
export const PREPAY_SCENARIOS = [100000, 200000, 500000, 1000000] as const;

export function emi(principal: number, annualRate: number, tenureYears: number): number {
  const r = annualRate / 100 / 12;
  const n = tenureYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

export function amortise(principal: number, annualRate: number, tenureYears: number): Schedule {
  const r = annualRate / 100 / 12;
  const e = emi(principal, annualRate, tenureYears);
  let balance = principal;
  const yearly: YearRow[] = [];
  let totalInterest = 0, totalPrincipal = 0;
  for (let y = 0; y < tenureYears; y++) {
    let yInt = 0, yPrin = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break;
      const intPart = balance * r;
      const prinPart = Math.min(e - intPart, balance);
      yInt += intPart; yPrin += prinPart; balance -= prinPart;
      totalInterest += intPart; totalPrincipal += prinPart;
    }
    yearly.push({ year: y + 1, interest: Math.round(yInt), principal: Math.round(yPrin), balance: Math.max(0, Math.round(balance)) });
    if (balance <= 0) break;
  }
  return { emi: e, yearly, totalInterest: Math.round(totalInterest), totalPrincipal: Math.round(totalPrincipal) };
}

/** A lump sum paid at the end of `prepayYear`, with the EMI unchanged: shows how many months and how much interest it saves. */
export function prepayImpact(principal: number, annualRate: number, tenureYears: number, prepayAmount: number, prepayYear: number): PrepayImpact {
  const r = annualRate / 100 / 12;
  const e = emi(principal, annualRate, tenureYears);
  let balance = principal, months = 0, totalInt = 0, prepaid = false;
  while (balance > 0 && months < tenureYears * 12 + 120) {
    const intPart = balance * r;
    const prinPart = Math.min(e - intPart, balance);
    totalInt += intPart; balance -= prinPart; months++;
    if (!prepaid && months === prepayYear * 12) { balance = Math.max(0, balance - prepayAmount); prepaid = true; }
  }
  return {
    newTenureMonths: months,
    savedMonths: tenureYears * 12 - months,
    savedInterest: Math.round(Math.max(0, amortise(principal, annualRate, tenureYears).totalInterest - totalInt)),
    newTotalInt: Math.round(totalInt),
  };
}

export function compute(p: HomeLoanParams): HomeLoanResult {
  const sched = amortise(p.loanAmount, p.interestRate, p.tenureYears);
  const e = sched.emi;
  const monthlyIncome = p.monthlyIncome || (p.grossIncome / 12);
  const emiPct = monthlyIncome > 0 ? Math.round(e / monthlyIncome * 1000) / 10 : null;     // one decimal, as the website's toFixed(1)
  const affordable = emiPct !== null && emiPct <= 40;
  const maxAffordEMI = Math.round(monthlyIncome * 0.40);
  const mr = p.interestRate / 100 / 12;
  const maxAffordLoan = monthlyIncome > 0
    ? Math.round(mr === 0 ? maxAffordEMI * p.tenureYears * 12 : maxAffordEMI * (Math.pow(1 + mr, p.tenureYears * 12) - 1) / (mr * Math.pow(1 + mr, p.tenureYears * 12)))
    : 0;
  const yr1Int = sched.yearly[0]?.interest || 0;
  const yr1Prin = sched.yearly[0]?.principal || 0;
  const sec24bDeduct = Math.min(200000, yr1Int);
  const sec80cDeduct = Math.min(150000, yr1Prin);
  return {
    emi: e, sched, emiPct, affordable, maxAffordEMI, maxAffordLoan,
    sec24bDeduct, sec80cDeduct, totalTaxDeduct: sec24bDeduct + sec80cDeduct, yr1Int, yr1Prin,
    prepay: prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, p.prepayAmount, p.prepayYear),
    totalCost: p.loanAmount + sched.totalInterest,
  };
}

export const ymText = (months: number) => `${Math.floor(months / 12)}y ${months % 12}m`;

/** Prepay scenarios at the end of year 3, as the website's table. */
export function prepayScenarios(p: HomeLoanParams) {
  return PREPAY_SCENARIOS.map(amount => ({ amount, ...prepayImpact(p.loanAmount, p.interestRate, p.tenureYears, amount, 3) }));
}

/** Pull what a person typed into ranges the maths can handle; blank → the website's default. */
export function sanitise(raw: Partial<Record<keyof typeof HL_DEFAULTS, number | undefined>>) {
  const pick = (v: number | undefined, d: number, lo: number, hi: number) => (v === undefined || !Number.isFinite(v) || v === 0 ? d : Math.min(hi, Math.max(lo, v)));
  const tenureYears = Math.round(pick(raw.tenureYears, HL_DEFAULTS.tenureYears, 1, 40));
  return {
    loanAmount: pick(raw.loanAmount, HL_DEFAULTS.loanAmount, 10000, 1e9),
    interestRate: pick(raw.interestRate, HL_DEFAULTS.interestRate, 0.5, 30),
    tenureYears,
    prepayAmount: Math.max(0, raw.prepayAmount !== undefined && Number.isFinite(raw.prepayAmount) ? raw.prepayAmount : HL_DEFAULTS.prepayAmount),
    prepayYear: Math.round(pick(raw.prepayYear, HL_DEFAULTS.prepayYear, 1, Math.max(1, tenureYears - 1))),
  };
}
