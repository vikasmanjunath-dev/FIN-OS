// Bonus & windfall allocator: where a lump sum should go first. Port of the allocation waterfall in js/finos-windfall.js
// (emergency fund → card debt → personal loan → 80C gap → NPS → home-loan prepayment → goals / long-term wealth), with the
// figures it reads passed in instead of taken from localStorage. __tests__/windfall.parity.test.mts compares the two.
// Divergences: the property-sale tax note follows the July 2024 rules (the website still quotes 20% with indexation for everyone).
import { taxNew, STD_NEW } from './taxcore.ts';

export type WindfallType = 'bonus' | 'rsu' | 'property' | 'fd' | 'inheritance' | 'other';
export const WINDFALL_TYPES: { key: WindfallType; label: string; icon: string; taxNote: string }[] = [
  { key: 'bonus', label: 'Salary bonus', icon: '💰', taxNote: 'Taxed as salary income (TDS by your employer at slab rate).' },
  { key: 'rsu', label: 'RSU / ESOP vesting', icon: '📊', taxNote: 'Taxable as a perquisite at fair market value on the vest date; the employer deducts TDS.' },
  { key: 'property', label: 'Property sale', icon: '🏠', taxNote: 'Held over 2 years: long-term gain at 12.5% without indexation (for property bought before 23 July 2024 a resident individual may choose 20% with indexation). Under 2 years: slab rate. Section 54 / 54F exemption if you reinvest as the rules require.' },
  { key: 'fd', label: 'FD maturity', icon: '🏦', taxNote: 'The interest is taxed at your slab; the principal is your own money and is not taxable.' },
  { key: 'inheritance', label: 'Inheritance / gift', icon: '🎁', taxNote: 'From specified close relatives (spouse, parents, siblings, in-laws…) it is exempt under section 56(2)(x).' },
  { key: 'other', label: 'Other (dividends, refund…)', icon: '✨', taxNote: 'Check the treatment of each: dividends are taxed at slab.' },
];

export interface WindfallContext {
  monthlyExpense: number;     // what the person spends in a month; 0 = unknown (the website then assumes ₹50,000)
  efCurrent: number; c80cGap: number; creditDebt: number; personalLoan: number; homeLoanOut: number; goalsSip: number; homeEmi: number;
}
export interface Step {
  id: 'ef' | 'ccdebt' | 'pl' | 'c80c' | 'nps' | 'homeloan' | 'goals' | 'wealth';
  label: string; icon: string; color: string; reason: string; vehicle: string;
  amount: number; skip: boolean; allocated: number; remaining: number;
}
export interface Allocation { allocated: Step[]; totalAllocated: number; remaining: number; efTarget: number; assumedExpense: boolean }

const DEFAULT_EXPENSE = 50000;

export function allocate(amount: number, c: WindfallContext): Allocation {
  const assumedExpense = !(c.monthlyExpense > 0);
  const monthlyExp = c.monthlyExpense > 0 ? c.monthlyExpense : DEFAULT_EXPENSE;
  const efTarget = monthlyExp * 6;
  const efGap = Math.max(0, efTarget - c.efCurrent);
  const { c80cGap, creditDebt, personalLoan, homeLoanOut } = c;

  const steps: Omit<Step, 'allocated' | 'remaining'>[] = [
    { id: 'ef', label: 'Emergency fund top-up', icon: '🛡️', color: '#22D3A6', reason: '6-month safety net first — liquid, before investing anywhere', amount: Math.min(amount, efGap), vehicle: 'Liquid mutual fund or sweep FD (same-day redemption)', skip: efGap <= 0 },
    { id: 'ccdebt', label: 'Credit card debt', icon: '💳', color: '#FF6B6B', reason: '18–42% effective rate — paying it off is a guaranteed return', amount: Math.min(amount, creditDebt), vehicle: 'Pay the outstanding balance immediately', skip: creditDebt <= 0 },
    { id: 'pl', label: 'Personal loan closure', icon: '🏧', color: '#FFA07A', reason: '12–20% rate — paying off beats any debt-fund return', amount: Math.min(amount, personalLoan), vehicle: 'Foreclose the loan (check the prepayment penalty)', skip: personalLoan <= 0 },
    { id: 'c80c', label: '80C gap (ELSS / PPF)', icon: '📋', color: '#4F7CFF', reason: 'Fill the ₹1.5L 80C limit — worth 5–30% depending on slab (old regime only)', amount: Math.min(amount, c80cGap > 0 ? c80cGap : 150000), vehicle: 'ELSS (3-year lock-in, equity returns) or PPF (15 years, tax-free)', skip: c80cGap <= 0 },
    { id: 'nps', label: 'NPS 80CCD(1B) extra', icon: '🏛️', color: '#22D3A6', reason: '₹50K extra deduction over the 80C limit (old regime only)', amount: 50000, vehicle: 'NPS Tier 1 — any pension fund manager', skip: false },
    { id: 'homeloan', label: 'Home loan prepayment', icon: '🏠', color: '#FFB347', reason: `Guaranteed ${c.homeEmi > 0 ? '8–9%' : 'interest-rate'} return, no market risk, shortens the loan`, amount: Math.min(amount, homeLoanOut > 0 ? Math.min(homeLoanOut * 0.1, 500000) : 200000), vehicle: 'Pay to principal (tell the bank separately; it is not an EMI)', skip: homeLoanOut <= 0 },
    { id: 'goals', label: 'Goal acceleration', icon: '🎯', color: '#4F7CFF', reason: 'Top up under-funded goals (home, education, car)', amount: 0, vehicle: 'A dedicated goal SIP or lump sum based on the timeline', skip: false },
    { id: 'wealth', label: 'Long-term wealth', icon: '📈', color: '#22D3A6', reason: 'Everything left — equity lump sum or SIP top-up for long-term compounding', amount: 0, vehicle: 'Equity index fund (Nifty 50 / flexi cap) or SGB', skip: false },
  ];

  let remaining = amount;
  const allocated: Step[] = steps.filter(s => !s.skip).map(s => {
    const take = Math.min(remaining, Math.max(0, s.amount));
    remaining = Math.max(0, remaining - take);
    return { ...s, allocated: Math.round(take), remaining: Math.round(remaining) };
  });
  const goalIdx = allocated.findIndex(s => s.id === 'goals');
  const wealthIdx = allocated.findIndex(s => s.id === 'wealth');
  if (goalIdx > -1 && wealthIdx > -1) {
    const goalAmt = Math.round(remaining * 0.4);
    allocated[goalIdx].allocated = goalAmt;
    allocated[wealthIdx].allocated = remaining - goalAmt;
    remaining = 0;
  }
  return { allocated, totalAllocated: allocated.reduce((s, a) => s + a.allocated, 0), remaining, efTarget, assumedExpense };
}

export interface TaxImpact { taxableIncome: number; before: number; after: number; onWindfall: number; applies: boolean }
/** New-regime tax before and after a bonus or RSU vest, on the salary the person entered (Standard deduction ₹75,000 and employer NPS taken off). */
export function taxImpact(type: WindfallType, amount: number, grossAnnualSalary: number, employerNps: number, basic: number): TaxImpact {
  const nps = Math.min(employerNps, basic * 0.14);
  const taxableIncome = Math.max(0, grossAnnualSalary - STD_NEW - nps);
  const before = taxNew(taxableIncome);
  const applies = type === 'bonus' || type === 'rsu';
  const after = applies ? taxNew(taxableIncome + amount) : before;
  return { taxableIncome, before, after, onWindfall: after - before, applies };
}
