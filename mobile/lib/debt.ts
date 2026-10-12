// Debt payoff optimizer: avalanche vs snowball, and what extra payments do to a home loan.
// A typed port of the calculation half of js/finos-debt-optimizer.js; __tests__/debt.parity.test.mts compares them on random loans.
// The clock is not used here (only month counts), so it is the same function the website calls.

export type LoanKey = 'home' | 'car' | 'personal' | 'cc';
export interface LoanType { key: LoanKey; balKey: string; rateKey: string; emiKey: string; label: string; icon: string; defaultRate: number; defaultTenure: number }

export const LOAN_TYPES: LoanType[] = [
  { key: 'home', balKey: 'finos_home_loan', rateKey: 'finos_home_loan_rate', emiKey: 'finos_home_loan_emi', label: 'Home loan', icon: '🏠', defaultRate: 8.5, defaultTenure: 240 },
  { key: 'car', balKey: 'finos_car_loan', rateKey: 'finos_car_loan_rate', emiKey: 'finos_car_loan_emi', label: 'Car loan', icon: '🚗', defaultRate: 9.5, defaultTenure: 60 },
  { key: 'personal', balKey: 'finos_personal_loan', rateKey: 'finos_personal_loan_rate', emiKey: 'finos_personal_loan_emi', label: 'Personal loan', icon: '👤', defaultRate: 14, defaultTenure: 36 },
  { key: 'cc', balKey: 'finos_credit_card_debt', rateKey: 'finos_cc_rate', emiKey: 'finos_cc_min_payment', label: 'Credit card', icon: '💳', defaultRate: 36, defaultTenure: 24 },
];
export const EXTRA_KEY = 'finos_debt_extra_payment';

export function calcEMI(principal: number, annualRate: number, tenureMonths: number): number {
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate) || annualRate < 0 || !Number.isFinite(tenureMonths) || tenureMonths <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.ceil(principal / tenureMonths);
  return Math.round((principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1));
}

export function calcRemainingMonths(balance: number, emi: number, annualRate: number): number {
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(emi) || emi <= 0 || !Number.isFinite(annualRate) || annualRate < 0) return 0;
  const r = annualRate / 100 / 12;
  if (r <= 0) return Math.ceil(balance / emi);
  if (emi <= balance * r) return 999;                     // the EMI does not cover the interest: it never pays off
  return Math.ceil(-Math.log(1 - (balance * r) / emi) / Math.log(1 + r));
}

export interface DebtLoan { key?: string; label?: string; icon?: string; balance: number; rate: number; emi: number }
export interface PayoffResult { months: number; totalInterest: number; perLoan: (DebtLoan & { totalInterest: number })[]; paidOff: boolean; remainingBalance: number }

/** strategy: 'avalanche' (highest rate first) | 'snowball' (smallest balance first). Freed EMIs roll into the next loan. */
export function simulatePayoff(loans: DebtLoan[], extraMonthly: number, strategy: 'avalanche' | 'snowball'): PayoffResult {
  const working = loans.map(l => ({ ...l, balance: l.balance, totalInterest: 0 }));
  if (strategy === 'avalanche') working.sort((a, b) => b.rate - a.rate);
  else working.sort((a, b) => a.balance - b.balance);

  let months = 0, totalInterest = 0;
  const MAX_MONTHS = 600;                                  // 50-year safety cap
  while (working.some(l => l.balance > 0.01) && months < MAX_MONTHS) {
    months++;
    let extra = Math.max(0, Number(extraMonthly) || 0);
    let freed = 0;
    working.forEach(l => {
      if (l.balance <= 0) return;
      const interest = l.balance * (l.rate / 100 / 12);
      l.totalInterest += interest;
      totalInterest += interest;
      l.balance += interest;
      const payment = Math.min(l.balance, l.emi);
      l.balance = Math.max(0, l.balance - payment);
      if (l.balance <= 0.01) freed += Math.max(0, l.emi - payment);
    });
    extra += freed;
    for (const l of working) {
      if (l.balance <= 0) continue;
      const applied = Math.min(extra, l.balance);
      l.balance = Math.max(0, l.balance - applied);
      extra -= applied;
      if (extra <= 0) break;
    }
  }
  const paidOff = !working.some(l => l.balance > 0.01);
  return { months, totalInterest: Math.round(totalInterest), perLoan: working, paidOff, remainingBalance: Math.round(working.reduce((s, l) => s + Math.max(0, l.balance), 0)) };
}

export interface PrepayResult { months: number; interest: number; paidOff: boolean; remainingBalance: number }
export function calcPrepayment(balance: number, annualRate: number, emi: number, extraMonthly: number): PrepayResult {
  if (![balance, annualRate, emi, extraMonthly].every(Number.isFinite) || balance <= 0 || annualRate < 0 || emi <= 0 || extraMonthly < 0) {
    return { months: 0, interest: 0, paidOff: false, remainingBalance: Math.max(0, Number(balance) || 0) };
  }
  const r = annualRate / 100 / 12;
  let b = balance, months = 0, interest = 0;
  while (b > 0.01 && months < 600) {
    const charge = b * r;
    if (emi + extraMonthly <= charge) break;                // the balance cannot amortize
    months++;
    interest += charge;
    b = Math.max(0, b + charge - emi - extraMonthly);
  }
  return { months, interest: Math.round(interest), paidOff: b <= 0.01, remainingBalance: Math.round(Math.max(0, b)) };
}

export interface Plan {
  totalBalance: number;
  minOnly: PayoffResult; avalanche: PayoffResult; snowball: PayoffResult;
  avSaved: number; swSaved: number; avWins: boolean;
  avalancheOrder: DebtLoan[]; snowballOrder: DebtLoan[];
  homePrepay: { std: PrepayResult; prep: PrepayResult; monthsSaved: number; interestSaved: number } | null;
}

/** Everything the website's results page shows, in one call. */
export function plan(loans: DebtLoan[], extraMonthly: number): Plan {
  const minOnly = simulatePayoff(loans, 0, 'avalanche');
  const avalanche = simulatePayoff(loans, extraMonthly, 'avalanche');
  const snowball = simulatePayoff(loans, extraMonthly, 'snowball');
  const avSaved = minOnly.paidOff && avalanche.paidOff ? minOnly.totalInterest - avalanche.totalInterest : 0;
  const swSaved = minOnly.paidOff && snowball.paidOff ? minOnly.totalInterest - snowball.totalInterest : 0;
  const home = loans.find(l => l.key === 'home');
  let homePrepay: Plan['homePrepay'] = null;
  if (home && extraMonthly > 0) {
    const std = calcPrepayment(home.balance, home.rate, home.emi, 0);
    const prep = calcPrepayment(home.balance, home.rate, home.emi, extraMonthly);
    const both = std.paidOff && prep.paidOff;
    homePrepay = { std, prep, monthsSaved: both ? std.months - prep.months : 0, interestSaved: both ? std.interest - prep.interest : 0 };
  }
  return {
    totalBalance: loans.reduce((s, l) => s + l.balance, 0),
    minOnly, avalanche, snowball, avSaved, swSaved, avWins: avalanche.totalInterest <= snowball.totalInterest,
    avalancheOrder: loans.slice().sort((a, b) => b.rate - a.rate), snowballOrder: loans.slice().sort((a, b) => a.balance - b.balance),
    homePrepay,
  };
}

export const monthsToText = (m: number) => {
  if (!m || m <= 0) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return ((y > 0 ? y + 'yr ' : '') + (mo > 0 ? mo + 'mo' : '')).trim();
};
