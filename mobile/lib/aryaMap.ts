// Arya "Map" tab: where the money sits, and eight branches (income, investing, goals, debt, safety, insurance, tax, independence)
// as on the website's mind map, from recorded figures only. No ideal allocation, no 100-minus-age rule, no benchmarks.
import { type ArFacts, inr, inrShort, incomeMonthly, expenseMonthly, holdingsValue, used80c, netWorthKnown } from '@/lib/aryaFacts';
import { computeCoverage } from '@/lib/retirement';

export interface Slice { label: string; value: number; pct: number; color: string }
export function allocation(f: ArFacts): Slice[] {
  const nw = f.computed.netWorth;
  return nw.assets.slice().sort((a, b) => b.value - a.value).map(a => ({ label: a.label, value: a.value, pct: nw.totalAssets > 0 ? (a.value / nw.totalAssets) * 100 : 0, color: a.color }));
}

export interface Branch { id: string; icon: string; label: string; headline: string; rows: { label: string; value: string }[]; route: string }
const NR = 'Not recorded';

export function branches(f: ArFacts): Branch[] {
  const c = f.computed, inc = incomeMonthly(f), exp = expenseMonthly(f);
  const cov = computeCoverage(f.data.policies, inc, null);
  const u = used80c(f);
  return [
    { id: 'income', icon: '💰', label: 'Income', headline: inc > 0 ? `${inr(inc)} a month` : NR, route: '/tracker/budget', rows: [
      { label: 'Monthly income', value: inc > 0 ? inr(inc) : NR }, { label: 'Yearly (×12)', value: inc > 0 ? inr(inc * 12) : NR },
      { label: 'Monthly spending', value: exp > 0 ? inr(exp) : NR }, { label: 'Savings rate', value: c.budget.known ? `${c.budget.savingsRate}%` : NR }] },
    { id: 'investing', icon: '📈', label: 'Investing', headline: f.data.monthlySip > 0 ? `${inr(f.data.monthlySip)} a month in SIPs` : 'No SIP recorded', route: '/tracker/networth', rows: [
      { label: 'SIPs a month', value: f.data.monthlySip > 0 ? inr(f.data.monthlySip) : NR }, { label: 'Stocks and funds', value: holdingsValue(f) > 0 ? inrShort(holdingsValue(f)) : NR }] },
    { id: 'goals', icon: '🎯', label: 'Goals', headline: c.goals.items.length ? `${c.goals.items.length} recorded` : 'None recorded', route: '/tracker/goals',
      rows: c.goals.items.slice(0, 4).map(g => ({ label: g.name, value: `${Math.round(g.progress)}% of ${inrShort(g.target)}` })) },
    { id: 'debt', icon: '⛓️', label: 'Debt', headline: c.netWorth.totalLiabilities > 0 ? inr(c.netWorth.totalLiabilities) : 'None recorded', route: '/tools/debt', rows: [
      { label: 'Total owed', value: c.netWorth.totalLiabilities > 0 ? inr(c.netWorth.totalLiabilities) : 'None recorded' },
      { label: 'Share of a year\'s income', value: c.netWorth.totalLiabilities > 0 && inc > 0 ? `${Math.round((c.netWorth.totalLiabilities / (inc * 12)) * 100)}%` : NR },
      { label: 'EMIs a month', value: f.loans.some(l => l.emi > 0) ? inr(f.loans.reduce((s, l) => s + l.emi, 0)) : NR }] },
    { id: 'safety', icon: '🛟', label: 'Safety', headline: c.emergency.fund > 0 ? `${inr(c.emergency.fund)} set aside` : NR, route: '/tracker/emergency', rows: [
      { label: 'Emergency fund', value: c.emergency.fund > 0 ? inr(c.emergency.fund) : NR }, { label: 'Months covered', value: c.emergency.fund > 0 && exp > 0 ? c.emergency.covered.toFixed(1) : NR },
      { label: `Tracker target (${c.emergency.target} months)`, value: exp > 0 ? inr(c.emergency.targetAmount) : NR }] },
    { id: 'insurance', icon: '🛡️', label: 'Insurance', headline: f.data.policies.length ? `${f.data.policies.length} polic${f.data.policies.length === 1 ? 'y' : 'ies'}` : 'None recorded', route: '/tracker/insurance', rows: [
      { label: 'Health cover', value: cov.hasHealth ? inrShort(cov.totalHealth) : 'None recorded' }, { label: 'Term life cover', value: cov.hasTerm ? inrShort(cov.totalLife) : 'None recorded' },
      { label: 'Premiums a year', value: f.data.policies.length ? inr(cov.annualPremium) : NR }] },
    { id: 'tax', icon: '🧾', label: 'Tax', headline: u === null ? NR : `${inr(u)} of 80C used`, route: '/tools/taxplanner', rows: [
      { label: '80C used', value: u === null ? NR : inr(u) }, { label: '80C limit', value: '₹1,50,000 (old regime)' }, { label: '80C room', value: u === null ? NR : inr(Math.max(0, 150000 - u)) }] },
    { id: 'independence', icon: '🔥', label: 'Independence', headline: exp > 0 ? `25x rule: ${inrShort(exp * 300)}` : NR, route: '/tools/retirement', rows: [
      { label: 'Net worth', value: netWorthKnown(f) ? inrShort(c.netWorth.netWorth) : NR }, { label: '25x yearly spending (rule of thumb)', value: exp > 0 ? inrShort(exp * 300) : NR }] },
  ];
}
