// "How do I compare?" without a made-up peer group.
// The website page (html/benchmarking.html) shows "Avg Peer" and "Top 10%" columns from a table of numbers typed into
// alerts/health_score.py (benchmark_comparison) and says they come from SEBI, AMFI, RBI and NPS Trust reports. There is no dataset,
// link or date behind them, and when the server is offline the page shows invented figures for the person. They are not ported.
// What is honest, and is here: the person's own figures against the same rules of thumb the Money Score uses, each labelled as a
// rule of thumb. No percentile, no "peers", no ranking. An unrecorded figure is "Not recorded", never a guess.
import { TARGETS, benchmarkMultiple } from './moneyScore.ts';

export const LENDER_STRETCH = 0.40;      // the Money Score's own text: "Lenders see 40%+ as stretched"
export const CLOSE_RATIO = 0.75;         // within 75% of a target counts as "close"

export interface BenchInput {
  age: number | null; monthlyIncome: number | null; monthlyExpenses: number | null; monthlyEmi: number | null;
  liquidSavings: number | null; monthlyInvesting: number | null; investedTotal: number | null;
  termCover: number | null; dependents: number | null;
}
export type BenchStatus = 'meets' | 'close' | 'below' | 'unknown' | 'na';
export interface BenchRow {
  id: string; label: string;
  value: number | null;                  // the person's figure (a fraction for rates, months or a multiple otherwise)
  unit: 'pct' | 'months' | 'x';
  target: number | null; targetText: string; basis: string;     // basis names the rule of thumb and says it is one
  direction: 'higher' | 'lower';
  status: BenchStatus; note: string;
}

const known = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const pos = (n: number | null | undefined): n is number => known(n) && n > 0;

function higher(value: number | null, target: number): BenchStatus {
  if (value === null) return 'unknown';
  return value >= target ? 'meets' : value >= target * CLOSE_RATIO ? 'close' : 'below';
}

export function benchmark(i: BenchInput): BenchRow[] {
  const income = pos(i.monthlyIncome) ? i.monthlyIncome : null;
  const spend = known(i.monthlyExpenses) && i.monthlyExpenses > 0 ? i.monthlyExpenses : null;
  const emi = known(i.monthlyEmi) ? i.monthlyEmi : null;
  const rows: BenchRow[] = [];

  // savings rate: what is left after spending and EMIs. EMIs unknown is read as "none recorded", so the note says it.
  const saveRate = income !== null && spend !== null ? (income - spend - (emi ?? 0)) / income : null;
  rows.push({
    id: 'savings', label: 'Savings rate', value: saveRate, unit: 'pct', target: TARGETS.savingsRate, targetText: '20% or more', basis: 'Rule of thumb used by the Money Score: keep a fifth of what you earn.',
    direction: 'higher', status: higher(saveRate, TARGETS.savingsRate),
    note: saveRate === null ? 'Needs your income and your monthly spending.' : emi === null ? 'No EMIs are recorded, so none were subtracted.' : 'Income less spending and EMIs.',
  });

  const investRate = income !== null && known(i.monthlyInvesting) ? i.monthlyInvesting / income : null;
  rows.push({
    id: 'investing', label: 'Share of income invested', value: investRate, unit: 'pct', target: TARGETS.investRate, targetText: '15% or more', basis: 'Rule of thumb used by the Money Score.',
    direction: 'higher', status: higher(investRate, TARGETS.investRate),
    note: investRate === null ? 'Needs your income and what you invest each month.' : 'Monthly SIPs and investing over monthly income.',
  });

  const dti = income !== null && emi !== null ? emi / income : null;
  rows.push({
    id: 'debt', label: 'EMIs as a share of income', value: dti, unit: 'pct', target: TARGETS.dtiFull, targetText: 'under 10% (40% or more is stretched)',
    basis: 'Rule of thumb used by the Money Score; lenders commonly treat 40% and above as stretched.', direction: 'lower',
    status: dti === null ? 'unknown' : dti <= TARGETS.dtiFull ? 'meets' : dti < LENDER_STRETCH ? 'close' : 'below',
    note: dti === null ? 'Needs your income and your monthly EMIs (enter 0 if you have none).' : 'Monthly EMIs over monthly income.',
  });

  const outgo = spend !== null ? spend + (emi ?? 0) : null;
  const months = outgo !== null && known(i.liquidSavings) ? i.liquidSavings / outgo : null;
  rows.push({
    id: 'emergency', label: 'Emergency fund', value: months, unit: 'months', target: TARGETS.emergencyMonths, targetText: '6 months of spending', basis: 'Rule of thumb used by the Money Score and the Emergency tracker.',
    direction: 'higher', status: higher(months, TARGETS.emergencyMonths),
    note: months === null ? 'Needs your emergency fund and your monthly spending.' : 'Savings you can reach quickly over monthly spending and EMIs.',
  });

  // term cover only matters if someone depends on the income; an unknown dependants count is not assumed
  const mult = income !== null && known(i.termCover) ? i.termCover / (12 * income) : null;
  const deps = i.dependents;
  rows.push({
    id: 'term', label: 'Term life cover', value: mult, unit: 'x', target: TARGETS.termMultiple, targetText: '10 times yearly income', basis: 'Rule of thumb used by the Money Score. It applies if someone depends on your income.',
    direction: 'higher',
    status: deps === 0 ? 'na' : mult === null ? 'unknown' : deps === null ? (mult >= TARGETS.termMultiple ? 'meets' : 'unknown') : higher(mult, TARGETS.termMultiple),
    note: deps === 0 ? 'You have recorded no dependents, so this target does not apply.'
      : deps === null ? 'Add whether anyone depends on your income in your profile to judge this.'
      : mult === null ? 'Needs your income and your term cover.' : 'Recorded term cover over yearly income.',
  });

  const age = known(i.age) && i.age >= 18 && i.age <= 80 ? i.age : null;
  const wealthMult = income !== null && known(i.investedTotal) ? i.investedTotal / (12 * income) : null;
  const need = age !== null ? benchmarkMultiple(age) : null;
  rows.push({
    id: 'wealth', label: 'Invested for your age', value: wealthMult, unit: 'x', target: need, targetText: need === null ? 'depends on your age' : `${need.toFixed(1)} times yearly income at ${age}`,
    basis: 'Rule of thumb used by the Money Score: widely quoted milestones by age (1x at 30, 3x at 40, 6x at 50, 8x at 60).', direction: 'higher',
    status: need === null || wealthMult === null ? 'unknown' : need === 0 ? 'meets' : higher(wealthMult, need),
    note: need === null ? 'Needs your age.' : wealthMult === null ? 'Needs your income and what you have invested.' : 'Investments, EPF, PPF, NPS and gold over yearly income.',
  });
  return rows;
}

export function tally(rows: BenchRow[]) {
  const c = { meets: 0, close: 0, below: 0, unknown: 0, na: 0 };
  rows.forEach(r => { c[r.status]++; });
  return c;
}

export const NO_PEER_DATA = 'FIN-OS does not compare you with other people. There is no verified dataset of Indian households by age, city and income behind the website\'s "average peer" and "top 10%" columns, so the phone does not show one. The targets here are rules of thumb that apply to anyone.';
