import { num, row, type CalcDef } from './types.ts';
import { money, rupee } from './fmt.ts';

const G = 'desi' as const;

export const DESI: CalcDef[] = [
  {
    id: 'childedu', group: G, title: 'Child Education Reality', blurb: 'What a degree will cost by the time they start.', web: 'desi reality check/childedu.html',
    inputs: [num('cost', 'Current cost of degree', '₹', 2500000, 500000, 10000000, 50000), num('inf', 'Education inflation (p.a.)', '%', 10, 6, 15, 0.5), num('time', 'Years until college', 'yrs', 15, 1, 25, 1)],
    run: ({ cost, inf, time }) => {
      const future = cost * Math.pow(1 + inf / 100, time);
      return [row('nowVal', 'Cost today', money(cost)), row('laterVal', 'Cost later', money(future)), row('multVal', '', 'Costs Increase ' + (future / cost).toFixed(1) + 'x', { tone: 'warn', hero: true })];
    },
  },
  {
    id: 'creditaddiction', group: G, title: 'Credit Card Addiction', blurb: 'The true cost of rolling a balance for years.', web: 'desi reality check/creditaddiction.html',
    inputs: [num('balance', 'Average rolling balance', '₹', 50000, 10000, 500000, 5000), num('time', 'Years of the habit', 'yrs', 10, 1, 20, 1), num('rate', 'Interest rate (APR)', '%', 36, 18, 48, 1)],
    run: ({ balance, time, rate }) => {
      const r = rate / 100, totalInterest = balance * r * time;
      const out = (balance * r) / 12, inv = 0.12 / 12, n = time * 12;
      const lost = out * ((Math.pow(1 + inv, n) - 1) / inv) * (1 + inv);
      return [row('intVal', 'Interest paid', money(totalInterest), { tone: 'warn' }), row('lostVal', 'Lost wealth', money(lost), { tone: 'bad' }), row('msgVal', '', 'Lost ' + money(lost) + ' Opportunity', { hero: true })];
    },
    notes: ['"Lost wealth" is what the interest you paid would have become if invested every month at 12% a year.'],
  },
  {
    id: 'emidisease', group: G, title: 'EMI Lifestyle Disease', blurb: 'Is debt eating your future?', web: 'desi reality check/emidiease.html',
    inputs: [num('income', 'Net monthly income', '₹', 80000, 20000, 500000, 5000), num('emi', 'Total monthly EMIs', '₹', 45000, 0, 400000, 1000), num('rate', 'Opportunity cost rate (p.a.)', '%', 12, 8, 15, 0.5)],
    run: ({ income, emi, rate }) => {
      const r = rate / 1200, ratio = income > 0 ? (emi / income) * 100 : 0, months = 120;
      const fv = emi * ((r === 0 ? months : (Math.pow(1 + r, months) - 1) / r)) * (1 + r);
      return [row('ratioVal', 'Debt ratio', ratio.toFixed(1) + '%'), row('lostVal', 'Lost corpus (10 years)', money(fv)),
        row('healthVal', '', ratio <= 30 ? 'Financial Fit ✅' : ratio <= 50 ? 'Borderline ⚠️' : 'Debt Trap 🚨', { tone: ratio <= 30 ? 'good' : ratio <= 50 ? 'warn' : 'bad', hero: true })];
    },
    notes: ['Shows what your EMIs would be worth if invested instead for 10 years. A home or education loan builds an asset, which this does not count.'],
  },
  {
    id: 'govtvsprivate', group: G, title: 'Govt vs Private Job', blurb: 'Security against growth over 30 years.', web: 'desi reality check/govvspvt.html',
    inputs: [num('gSal', 'Govt: starting salary', '₹', 40000, 0, 10000000, 1000), num('pSal', 'Private: starting salary', '₹', 60000, 0, 10000000, 1000), num('sip', 'Private: share invested', '%', 20, 10, 50, 5, { id: 'sip' })],
    run: ({ gSal, pSal, sip }) => {
      let g = gSal, p = pSal, gC = 0, pC = 0;
      const pct = sip / 100;
      for (let i = 0; i < 30; i++) {
        gC = (gC + g * 0.15 * 12) * 1.08; g = g * 1.03;
        pC = (pC + p * pct * 12) * 1.12; p = p * 1.08;
      }
      return [row('govtVal', 'Govt corpus', money(gC)), row('pvtVal', 'Private corpus', money(pC)), row('winnerVal', '', pC > gC ? 'Private Wins 🚀' : 'Govt Wins 🏛️', { tone: 'good', hero: true })];
    },
    notes: ['Fixed assumptions: government saves 15% a year at 8% with 3% hikes; private saves your chosen share at 12% with 8% hikes. Pension, job security and the real hike path are not included, so treat this as an illustration.'],
  },
  {
    id: 'lifestylecreep', group: G, title: 'Lifestyle Inflation Detector', blurb: 'Has spending grown faster than income?', web: 'desi reality check/lifestyle.html',
    inputs: [num('incOld', 'Before: monthly income', '₹', 50000, 10000, 500000, 5000), num('expOld', 'Before: monthly spending', '₹', 30000, 5000, 400000, 1000), num('incNew', 'Now: monthly income', '₹', 80000, 10000, 500000, 5000), num('expNew', 'Now: monthly spending', '₹', 60000, 5000, 400000, 1000)],
    run: ({ incOld, expOld, incNew, expNew }) => {
      const ig = ((incNew - incOld) / incOld) * 100, eg = ((expNew - expOld) / expOld) * 100;
      const v = eg > ig + 10 ? row('verdictVal', '', 'Lifestyle Creep! ⚠️', { tone: 'bad', hero: true }) : eg < ig ? row('verdictVal', '', 'Wealth Building ✅', { tone: 'good', hero: true }) : row('verdictVal', '', 'Breaking Even ⚖️', { tone: 'info', hero: true });
      return [row('incGrowthVal', 'Income growth', ig.toFixed(1) + '%'), row('expGrowthVal', 'Expense growth', eg.toFixed(1) + '%'), v];
    },
  },
  {
    id: 'logkyakahenge', group: G, title: 'Log Kya Kahenge Cost', blurb: 'The price of spending for approval.', web: 'desi reality check/logkyakahenge.html',
    inputs: [num('spend', 'Annual "status" spending', '₹', 100000, 10000, 1000000, 5000), num('time', 'Years of this habit', 'yrs', 20, 5, 30, 1), num('rate', 'If invested at (p.a.)', '%', 12, 8, 15, 0.5)],
    run: ({ spend, time, rate }) => {
      const r = rate / 100;
      const fv = spend * ((r === 0 ? time : (Math.pow(1 + r, time) - 1) / r));
      const direct = spend * time;
      return [row('spentVal', 'Total spent', money(direct)), row('lostVal', 'Lost wealth', money(fv), { tone: 'bad' }), row('msgVal', '', 'Validation Cost: ' + money(fv - direct) + ' lost interest', { hero: true })];
    },
  },
  {
    id: 'middleclass', group: G, title: 'Middle-Class Trap', blurb: 'Income rises, and so does spending.', web: 'desi reality check/middleclass.html',
    inputs: [num('salary', 'Current salary', '₹', 50000, 30000, 300000, 5000), num('hike', 'Annual salary hike', '%', 8, 2, 15, 0.5), num('lifeInf', 'Lifestyle inflation', '%', 8, 2, 15, 0.5)],
    run: ({ salary, hike, lifeInf }) => {
      const h = hike / 100, f = lifeInf / 100, expense = salary * 0.90;
      const fs = salary * Math.pow(1 + h, 10), fe = expense * Math.pow(1 + f, 10);
      const diff = (((fs - fe) / fs) * 100) - (((salary - expense) / salary) * 100);
      const v = diff > 5 ? row('gapVal', '', 'Escaping the Trap! 🚀', { tone: 'good', hero: true }) : diff < -1 ? row('gapVal', '', 'Trapped deeper! ⚠️', { tone: 'bad', hero: true }) : row('gapVal', '', 'Stagnant (Rat Race) 🐀', { tone: 'info', hero: true });
      return [row('salVal', 'Salary in 10 years', rupee(fs)), row('spendVal', 'Spend in 10 years', rupee(fe)), v];
    },
    notes: ['Assumes you spend 90% of your salary today.'],
  },
  {
    id: 'parental', group: G, title: 'Parental Dependency', blurb: 'The wealth impact of supporting parents.', web: 'desi reality check/parental.html',
    inputs: [num('support', 'Monthly support', '₹', 15000, 5000, 100000, 1000), num('med', 'Medical / emergency costs (yearly)', '₹', 50000, 0, 500000, 5000), num('years', 'Years of support', 'yrs', 20, 5, 30, 1)],
    run: ({ support, med, years }) => {
      const annual = support * 12 + med, direct = annual * years, rate = 0.12;
      const fv = annual * ((Math.pow(1 + rate, years) - 1) / rate);
      return [row('cashVal', 'Total cash flow', money(direct)), row('corpusVal', 'Corpus impact', money(fv)), row('msgVal', '', 'Impact: ' + (fv / direct).toFixed(1) + 'x Multiplier', { hero: true })];
    },
    notes: ['This shows what the same money would grow to at 12% a year. It is not an argument against supporting family.'],
  },
  {
    id: 'shaadicost', group: G, title: 'Shaadi Cost vs Wealth', blurb: 'What a wedding\'s cost could become by retirement.', web: 'desi reality check/shaadicost.html',
    inputs: [num('cost', 'Wedding cost', '₹', 2000000, 200000, 10000000, 100000), num('rate', 'Investment return (p.a.)', '%', 12, 8, 15, 0.5), num('time', 'Years to retirement', 'yrs', 30, 10, 40, 1)],
    run: ({ cost, rate, time }) => {
      const lost = cost * Math.pow(1 + rate / 100, time);
      return [row('costVal', 'Wedding cost', money(cost)), row('lostVal', 'Lost wealth (future value)', money(lost), { tone: 'bad' }), row('delayVal', '', `Cost Multiplies ${(lost / cost).toFixed(1)}x`, { hero: true })];
    },
  },
];
