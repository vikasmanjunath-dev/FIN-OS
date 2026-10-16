import { num, row, type CalcDef } from './types.ts';
import { money, rupee } from './fmt.ts';

const G = 'health' as const;

export const HEALTH: CalcDef[] = [
  {
    id: 'expenseratio', group: G, title: 'Expense Ratio', blurb: 'What share of your income is spent each month.', web: 'financial health/expenseratio.html',
    inputs: [num('income', 'Monthly take-home income', '₹', 50000, 10000, 500000, 1000), num('needs', 'Needs (rent, food, EMI)', '₹', 25000, 5000, 300000, 1000), num('wants', 'Wants (entertainment, shopping)', '₹', 10000, 0, 100000, 1000)],
    run: ({ income, needs, wants }) => {
      const spend = needs + wants, savings = Math.max(0, income - spend), ratio = (spend / income) * 100;
      return [row('spendVal', 'Total spend', rupee(spend)), row('saveVal', 'Savings', rupee(savings)),
        row('ratioVal', '', 'Burn Rate: ' + (Number.isFinite(ratio) ? ratio.toFixed(1) + '%' : '—'), { tone: ratio < 50 ? 'good' : ratio < 75 ? 'info' : 'bad', hero: true })];
    },
  },
  {
    id: 'insurancecoverage', group: G, title: 'Insurance Coverage', blurb: 'A rough term-insurance cover to aim for.', web: 'financial health/insurancecoverage.html',
    inputs: [num('income', 'Annual income', '₹', 1200000, 300000, 5000000, 50000), num('loans', 'Outstanding loans', '₹', 2500000, 0, 10000000, 100000), num('savings', 'Current savings', '₹', 1000000, 0, 10000000, 100000)],
    run: ({ income, loans, savings }) => {
      const replacement = income * 20, net = loans - savings, need = replacement + Math.max(0, net);
      return [row('incMultVal', 'Income multiple (20×)', money(replacement)), row('netLiabVal', 'Net liability', money(Math.max(0, net))), row('coverVal', '', 'Recommended: ' + money(need), { hero: true })];
    },
    notes: ['A rule of thumb: 20 times annual income plus loans not covered by savings. Your dependants, years to retirement and existing cover change the real answer.'],
  },
  {
    id: 'savingsrate', group: G, title: 'Savings Rate', blurb: 'The share of income you keep.', web: 'financial health/savings.html',
    inputs: [num('income', 'Monthly income', '₹', 50000, 10000, 500000, 1000), num('save', 'Monthly savings / investments', '₹', 15000, 0, 400000, 1000, { id: 'save' })],
    run: ({ income, save }) => {
      const spent = Math.max(0, income - save), rate = income > 0 ? (save / income) * 100 : 0;
      return [row('spendVal', 'Spending', rupee(spent)), row('saveVal', 'Saving', rupee(save)),
        row('rateVal', '', 'Rate: ' + rate.toFixed(1) + '%', { tone: rate >= 50 ? 'good' : rate >= 20 ? 'info' : 'warn', hero: true })];
    },
  },
];
