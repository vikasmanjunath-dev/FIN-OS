import { num, row, type CalcDef } from './types.ts';
import { money, rupee, fx } from './fmt.ts';

const G = 'retire' as const;

export const RETIRE: CalcDef[] = [
  {
    id: 'annuity', group: G, title: 'Annuity Comparison', blurb: 'Immediate against deferred annuity income.', web: 'retirement & life planning/annuity.html',
    inputs: [num('invest', 'Investment amount', '₹', 5000000, 500000, 50000000, 100000), num('defer', 'Deferment period', 'yrs', 10, 1, 20, 1, { id: 'defer' }), num('rate', 'Annuity rate', '%', 6, 4, 10, 0.1)],
    run: ({ invest, defer, rate }) => {
      const r = rate / 100;
      const imm = (invest * r) / 12;
      const def = (invest * Math.pow(1 + r, defer) * r) / 12;
      const gain = imm > 0 ? ((def - imm) / imm) * 100 : 0;
      return [row('immVal', 'Immediate monthly', rupee(imm)), row('defVal', 'Deferred monthly', rupee(def)), row('diffVal', '', `Wait to Gain +${Math.round(gain)}%`, { hero: true })];
    },
    notes: ['Assumes the corpus grows at the annuity rate while you wait. Annuity products and rates differ, and the payout is taxed as income.'],
  },
  {
    id: 'healthinflation', group: G, title: 'Healthcare Inflation', blurb: 'What a treatment costs after years of medical inflation.', web: 'retirement & life planning/healthcare.html',
    inputs: [num('cost', 'Current treatment cost', '₹', 500000, 100000, 2000000, 50000), num('inflation', 'Medical inflation (p.a.)', '%', 10, 5, 15, 0.5), num('years', 'Years from now', 'yrs', 20, 5, 40, 1)],
    run: ({ cost, inflation, years }) => {
      const future = cost * Math.pow(1 + inflation / 100, years);
      return [row('costVal', 'Cost today', money(cost)), row('futureVal', 'Cost in the future', money(future)), row('multVal', '', `Costs jump ${fx(future / cost, 1)}x`, { tone: 'warn', hero: true })];
    },
  },
  {
    id: 'lifeexpectancy', group: G, title: 'Financial Life Expectancy', blurb: 'Whether your money lasts as long as you do.', web: 'retirement & life planning/lifeexpentancy.html',
    inputs: [num('age', 'Current age', 'yrs', 60, 30, 90, 1, { id: 'currentAge' }), num('corpus', 'Savings / corpus', '₹', 20000000, 1000000, 100000000, 500000), num('expense', 'Monthly expense', '₹', 75000, 10000, 300000, 5000),
      num('inflation', 'Inflation', '%', 6, 2, 10, 0.5), num('roi', 'Return on investment', '%', 7, 0, 12, 0.5)],
    run: ({ age, corpus, expense, inflation, roi }) => {
      let c = corpus, annual = expense * 12, cur = age;
      const inf = inflation / 100, ret = roi / 100;
      while (cur <= 100) {
        if (c <= 0) break;
        c = (c + c * ret) - annual;
        annual = annual * (1 + inf);
        cur++;
      }
      const v = cur >= 95 ? row('verdict', '', 'Financially Immortal! 🚀', { tone: 'good', hero: true }) : cur >= 85 ? row('verdict', '', 'Safe Zone ✅', { tone: 'good', hero: true }) : row('verdict', '', 'Risk of Running Out ⚠️', { tone: 'bad', hero: true });
      return [row('yearsLeft', 'Funds last for', (cur - age) + ' Years'), row('brokeAge', 'Funds run out at', 'Age ' + cur), v];
    },
    notes: ['Spending is taken at the start of each year and rises with inflation. Tax, medical shocks and a falling return are not included.'],
  },
  {
    id: 'longevity', group: G, title: 'Longevity Risk', blurb: 'Will you outlive your savings, starting at 60?', web: 'retirement & life planning/longevity.html',
    inputs: [num('corpus', 'Retirement corpus', '₹', 10000000, 1000000, 50000000, 500000), num('expense', 'Monthly expense', '₹', 50000, 10000, 200000, 1000), num('inf', 'Inflation', '%', 6, 2, 10, 0.5), num('ret', 'Return on savings', '%', 7, 2, 10, 0.5)],
    run: ({ corpus, expense, inf, ret }) => {
      let c = corpus, annual = expense * 12, age = 60;
      while (c > 0 && age < 100) {
        c = c * (1 + ret / 100);
        c = c - annual;
        annual = annual * (1 + inf / 100);
        age++;
      }
      return [row('yearsVal', 'Funds last for', (age - 60) + ' Years'), row('ageVal', 'Zero balance at', 'Age ' + age),
        row('riskMsg', '', age >= 90 ? 'Safe Plan ✅' : 'Money runs out early ⚠️', { tone: age >= 90 ? 'good' : 'bad', hero: true })];
    },
    notes: ['Assumes you retire at 60.'],
  },
  {
    id: 'pensiongap', group: G, title: 'Pension Gap', blurb: 'The shortfall between the income you want and what you will get.', web: 'retirement & life planning/pensiongap.html',
    inputs: [num('desired', 'Desired monthly income', '₹', 50000, 10000, 200000, 1000), num('actual', 'Expected pension / annuity', '₹', 20000, 0, 200000, 1000), num('years', 'Years in retirement', 'yrs', 25, 10, 40, 1)],
    run: ({ desired, actual, years }) => {
      const gap = Math.max(0, desired - actual);
      return [row('gapVal', 'Monthly gap', money(gap)), row('corpusGapVal', 'Corpus shortfall', money(gap * 12 * years)),
        row('statusVal', '', gap === 0 ? 'Fully Covered ✅' : 'Deficit: ' + money(gap) + '/mo', { tone: gap === 0 ? 'good' : 'bad', hero: true })];
    },
    notes: ['The shortfall is the gap added up over the years with no inflation and no return, so it is a floor, not a plan.'],
  },
  {
    id: 'postretirement', group: G, title: 'Post-Retirement Income', blurb: 'Monthly income a corpus can pay for a set number of years.', web: 'retirement & life planning/postretirement.html',
    inputs: [num('corpus', 'Retirement corpus', '₹', 10000000, 1000000, 100000000, 500000), num('rate', 'Expected return (p.a.)', '%', 7, 4, 12, 0.5), num('time', 'Duration', 'yrs', 25, 10, 40, 1)],
    run: ({ corpus, rate, time }) => {
      const r = rate / 12 / 100, n = time * 12;
      const monthly = r === 0 ? corpus / n : corpus * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      return [row('monthlyVal', 'Monthly payout', money(monthly)), row('annualVal', 'Annual payout', money(monthly * 12))];
    },
    notes: ['A level payout that uses up the whole corpus at the end. It does not rise with inflation.'],
  },
];
