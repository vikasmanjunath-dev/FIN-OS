import { num, row, type CalcDef } from './types.ts';
import { fx } from './fmt.ts';

const G = 'think' as const;
/** The core-thinking pages' own format helper. */
const cur = (n: number) => (typeof n === 'number' && !Number.isFinite(n) ? '—' : n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr' : n >= 100000 ? '₹' + (n / 100000).toFixed(2) + ' L' : '₹' + n.toLocaleString('en-IN'));
const loc = (n: number) => '₹' + n.toLocaleString();

export const THINK: CalcDef[] = [
  {
    id: 'compounding', group: G, title: 'Compounding Visualizer', blurb: 'A starting amount plus monthly additions, over time.', web: 'core-thinking/compounding-visualizer.html',
    inputs: [num('principal', 'Starting amount', '₹', 10000, 1000, 1000000, 1000), num('monthly', 'Monthly addition', '₹', 5000, 0, 50000, 500), num('rate', 'Annual return', '%', 12, 1, 20, 0.5), num('years', 'Time period', 'yrs', 20, 1, 40, 1)],
    run: ({ principal, monthly, rate, years }) => {
      const r = rate / 100 / 12, n = years * 12;
      const lump = principal * Math.pow(1 + r, n);
      const sip = monthly > 0 ? monthly * (((r === 0 ? n : (Math.pow(1 + r, n) - 1) / r)) * (1 + r)) : 0;
      const total = lump + sip, contributed = principal + monthly * n;
      return [row('finalWealth', 'Final wealth', `₹${(total / 10000000).toFixed(2)} Cr`, { hero: true }), row('contributed', 'You put in', `₹${(contributed / 100000).toFixed(2)}L`), row('multiplier', 'Multiple', `${contributed > 0 && Number.isFinite(total / contributed) ? (total / contributed).toFixed(2) : '—'}x`)];
    },
  },
  {
    id: 'financialage', group: G, title: 'Financial Age', blurb: 'Are you ahead or behind your age?', web: 'core-thinking/financial-age-calculator.html',
    inputs: [num('age', 'Your age', 'yrs', 30, 18, 65, 1), num('netWorth', 'Net worth', '₹', 10, 0, 500, 5, { hint: 'in lakhs' }), num('income', 'Monthly income', '₹', 50000, 20000, 500000, 5000), num('debt', 'Monthly debt / EMI', '₹', 10000, 0, 200000, 5000), num('investing', 'Years investing', 'yrs', 5, 0, 30, 1)],
    run: ({ age, netWorth, income, debt, investing }) => {
      const nw = netWorth * 100000, annual = income * 12;
      // The benchmark divides by (income x years since 20): without both there is nothing to compare against.
      if (!(income > 0) || !(age > 20) || !Number.isFinite(nw + debt + investing)) {
        return [row('actualAge', 'Your age', age > 0 ? String(age) : '–'), row('finAge', 'Financial age', '–', { hero: true }), row('verdict', '', 'Enter your age (over 20) and monthly income', { tone: 'info' })];
      }
      const expected = annual * ((age - 20) / 10);
      let fin = 20;
      fin += (nw / expected) * (age - 20) * 0.4;
      fin -= ((debt * 12) / annual) * 10 * 0.2;
      const expInv = Math.max(0, age - 22);
      fin += (expInv > 0 ? investing / expInv : 0) * (age - 20) * 0.4;
      fin = Math.max(18, Math.round(fin));
      const diff = fin - age;
      const verdict = diff >= 5 ? `${diff} years ahead! 🎉` : diff <= -5 ? `${Math.abs(diff)} years behind ⚠️` : 'On track! ✓';
      const message = diff >= 5 ? `Excellent! Your financial maturity is ${diff} years ahead of your actual age. You're building wealth faster than your peers.`
        : diff <= -5 ? `Wake-up call: You're ${Math.abs(diff)} years behind financially. Focus on reducing debt and increasing savings rate.`
        : 'Good progress: Your financial age matches your actual age. Keep building consistently.';
      return [row('actualAge', 'Your age', String(age)), row('finAge', 'Financial age', String(fin), { hero: true }), row('verdict', '', verdict, { tone: diff >= 5 ? 'good' : diff <= -5 ? 'bad' : 'info' }), row('message', '', message)];
    },
    notes: ['A playful benchmark, not a measurement. The weights are the website\'s own rule of thumb.'],
  },
  {
    id: 'inflationimpact', group: G, title: 'Inflation Impact', blurb: 'What today\'s expense will cost later.', web: 'core-thinking/inflation-impact.html',
    inputs: [num('currentCost', 'Current expense', '₹', 50000, 1000, 500000, 1000), num('inflation', 'Inflation rate', '%', 6, 1, 15, 0.5), num('time', 'Time period', 'yrs', 20, 1, 50, 1)],
    run: ({ currentCost, inflation, time }) => {
      // The multiplier does not depend on the cost, so it is still right when the cost box is empty or 0.
      const growth = Math.pow(1 + inflation / 100, time);
      if (!Number.isFinite(growth) || !(currentCost >= 0)) {
        return [row('costToday', 'Cost today', '–'), row('costFuture', 'Cost then', '–'), row('verdict', '', 'Enter a cost, an inflation rate and a period', { tone: 'warn', hero: true })];
      }
      const future = currentCost * growth, diff = future - currentCost;
      return [row('costToday', 'Cost today', cur(currentCost)), row('costFuture', 'Cost then', cur(Math.round(future))),
        row('verdict', '', growth >= 1 ? `Cost increases ${growth.toFixed(1)}x 😱` : `Cost falls to ${growth.toFixed(1)}x`, { tone: 'warn', hero: true }),
        row('message', '', `Purchasing Power Erosion: To maintain your current lifestyle in ${time} years, you will need to spend ${cur(Math.round(diff))} more per month than you do today.`)];
    },
  },
  {
    id: 'moneybehavior', group: G, title: 'Money Behavior Analyzer', blurb: 'A quick score for your money habits.', web: 'core-thinking/money-behavior-analyzer.html',
    inputs: [num('income', 'Monthly income', '₹', 50000, 20000, 500000, 5000), num('savings', 'Monthly savings', '₹', 10000, 0, 200000, 1000), num('emergency', 'Emergency fund', 'months', 3, 0, 12, 1), num('emis', 'Active EMIs', '', 2, 0, 10, 1), num('startAge', 'Investment start age', 'yrs', 25, 18, 45, 1)],
    run: ({ income, savings, emergency, emis, startAge }) => {
      // The savings rate divides by income: without a positive income there is nothing to score.
      if (!(income > 0) || !Number.isFinite(savings + emergency + emis + startAge)) {
        return [row('score', 'Score', '–', { hero: true }), row('rating', 'Rating', 'Enter your monthly income', { tone: 'info' })];
      }
      const c25 = (x: number) => Math.max(0, Math.min(25, x));
      const rate = (savings / income) * 100;
      const total = Math.round(c25(rate * 0.8) + c25((emergency / 6) * 25) + c25(25 - emis * 3) + c25(25 - (startAge - 20) * 1.5) + (rate > 20 ? 25 : rate > 10 ? 20 : 15));
      const rating = total >= 81 ? 'Excellent' : total >= 61 ? 'Good' : total >= 41 ? 'Fair' : 'Poor';
      const lines: string[] = [];
      if (rate < 20) lines.push('⚠️Savings rate below 20%. Try to increase gradually.'); else if (rate >= 30) lines.push('✅Excellent savings discipline!');
      if (emergency < 6) lines.push(`🚨Emergency fund only covers ${emergency} months. Build to 6 months.`); else lines.push('✅Strong emergency fund!');
      if (emis > 2) lines.push(`⚠️${emis} active EMIs detected. Focus on debt reduction.`); else if (emis === 0) lines.push('✅Debt-free lifestyle!');
      if (startAge > 30) lines.push('⏰Late start. Increase monthly investments to catch up.'); else if (startAge <= 25) lines.push('✅Started early - time is on your side!');
      return [row('score', 'Score', String(total), { hero: true }), row('rating', 'Rating', rating, { tone: total >= 61 ? 'good' : total >= 41 ? 'info' : 'bad' }),
        { id: 'insights', text: lines.join(''), lines: lines.map(l => l.replace(/^(⚠️|✅|🚨|⏰)/, '$1 ')) }];
    },
    notes: ['The five parts (savings rate, emergency fund, EMIs, start age, discipline) are the website\'s own weights. It is a prompt to think, not an assessment.'],
  },
  {
    id: 'opportunitycost', group: G, title: 'Opportunity Cost', blurb: 'What an expense could have become if invested.', web: 'core-thinking/opportunity-cost.html',
    inputs: [num('spent', 'Amount spent', '₹', 50000, 1000, 500000, 1000), num('returns', 'Potential return if invested', '%', 12, 1, 20, 0.5), num('years', 'Time period', 'yrs', 10, 1, 30, 1)],
    run: ({ spent, returns, years }) => {
      const fv = Math.round(spent * Math.pow(1 + returns / 100, years));
      return [row('trueCost', 'True cost', loc(fv), { hero: true }), row('spentDisplay', 'You spent', loc(spent)), row('couldBe', 'It could be', loc(fv)), row('oppCost', 'Opportunity cost', loc(fv - spent), { tone: 'warn' })];
    },
  },
  {
    id: 'purchasingpower', group: G, title: 'Purchasing Power Loss', blurb: 'What idle cash is really worth later.', web: 'core-thinking/purchasing-power-loss.html',
    inputs: [num('cash', 'Cash amount', '₹', 100000, 10000, 5000000, 10000), num('savings', 'Savings account interest', '%', 3, 0, 8, 0.5), num('inflation', 'Inflation rate', '%', 6, 0, 15, 0.5), num('years', 'Time period', 'yrs', 10, 1, 30, 1)],
    run: ({ cash, savings, inflation, years }) => {
      const s = savings / 100, i = inflation / 100;
      const nominal = cash * Math.pow(1 + s, years), real = cash * Math.pow((1 + s) / (1 + i), years), loss = nominal - real;
      return [row('realValue', 'Real value', `₹${Math.round(real).toLocaleString()}`, { hero: true }), row('lossAmount', 'Lost to inflation', `₹${Math.round(loss).toLocaleString()}`, { tone: 'bad' }),
        row('lossPercent', 'Loss', `${nominal > 0 ? ((loss / nominal) * 100).toFixed(1) : '0.0'}%`), row('yearDisplay', 'Years', String(years))];
    },
  },
  {
    id: 'realreturn', group: G, title: 'Real Rate of Return', blurb: 'Your return after inflation.', web: 'core-thinking/real-rate-of-return.html',
    inputs: [num('nominal', 'Nominal return (p.a.)', '%', 12, 0, 20, 0.5), num('inflation', 'Inflation (p.a.)', '%', 6, 0, 15, 0.5), num('principal', 'Initial investment', '₹', 100000, 10000, 1000000, 10000), num('years', 'Time period', 'yrs', 10, 1, 30, 1)],
    run: ({ nominal, inflation, principal, years }) => {
      const n = nominal / 100, i = inflation / 100;
      const real = ((1 + n) / (1 + i)) - 1;
      return [row('realRate', 'Real rate', `${(real * 100).toFixed(2)}%`, { hero: true }), row('nominalValue', 'Nominal value', `₹${Math.round(principal * Math.pow(1 + n, years)).toLocaleString()}`),
        row('realValue', 'Real value (today\'s money)', `₹${Math.round(principal * Math.pow(1 + real, years)).toLocaleString()}`)];
    },
  },
  {
    id: 'riskreward', group: G, title: 'Risk vs Reward', blurb: 'A rough best, expected and worst year.', web: 'core-thinking/risk-vs-reward.html',
    inputs: [num('returns', 'Expected return (p.a.)', '%', 12, 1, 25, 0.5), num('risk', 'Risk / volatility', '%', 15, 1, 40, 1), num('amount', 'Investment amount', '₹', 100000, 10000, 1000000, 10000)],
    run: ({ returns, risk, amount }) => {
      const r = returns / 100, v = risk / 100;
      const worst = Math.round(amount * (1 + r - 1.65 * v));
      return [row('expected', 'Expected', `₹${Math.round(amount * (1 + r)).toLocaleString()}`), row('bestCase', 'Best case', `₹${Math.round(amount * (1 + r + 1.65 * v)).toLocaleString()}`, { tone: 'good' }),
        row('worstCase', 'Worst case', `₹${Math.max(0, worst).toLocaleString()}`, { tone: 'bad' }), row('ratio', 'Return per unit of risk', Number.isFinite(r / v) ? (r / v).toFixed(2) : '—'),
        row('riskLevel', '', v < 0.1 ? 'Low Risk' : v < 0.2 ? 'Medium Risk' : 'High Risk', { tone: v < 0.1 ? 'good' : v < 0.2 ? 'info' : 'warn', hero: true })];
    },
    notes: ['Best and worst are the expected return plus or minus 1.65 times the volatility, a one-year rule of thumb. Real markets can fall further.'],
  },
  {
    id: 'timevalue', group: G, title: 'Time Value of Money', blurb: 'Growth of a present amount over time.', web: 'core-thinking/time-value-of-money.html',
    inputs: [num('pv', 'Present value', '₹', 100000, 1000, 10000000, 5000), num('rate', 'Annual interest rate', '%', 12, 1, 30, 0.5), num('time', 'Time period', 'yrs', 10, 1, 50, 1)],
    run: ({ pv, rate, time }) => {
      const fv = pv * Math.pow(1 + rate / 100, time), interest = fv - pv, mult = fx(fv / pv, 1);
      const msg = Number(mult) >= 5 ? `Compound Effect: Your money has grown ${mult} times! This is the power of long-term investing.`
        : `Steady Growth: You earned ${cur(Math.round(interest))} in pure interest. Keep letting it compound.`;
      return [row('investedResult', 'Invested', cur(pv)), row('fvResult', 'Future value', cur(Math.round(fv))), row('verdict', '', `${mult}x Growth 🚀`, { tone: 'good', hero: true }), row('message', '', msg)];
    },
  },
  {
    id: 'wealthgap', group: G, title: 'Wealth vs Income Gap', blurb: 'A high salary against a high savings rate, over 20 years.', web: 'core-thinking/wealth-vs-income-gap.html',
    inputs: [num('incomeA', 'Person A: monthly income', '₹', 150000, 50000, 500000, 10000), num('savingsA', 'Person A: savings rate', '%', 10, 0, 50, 5), num('incomeB', 'Person B: monthly income', '₹', 60000, 30000, 300000, 5000),
      num('savingsB', 'Person B: savings rate', '%', 40, 0, 70, 5), num('returns', 'Investment return (p.a.)', '%', 12, 6, 18, 0.5)],
    run: ({ incomeA, savingsA, incomeB, savingsB, returns }) => {
      const rate = returns / 100 / 12, months = 240;
      const grow = (m: number) => Math.round(m * (((rate === 0 ? months : (Math.pow(1 + rate, months) - 1) / rate)) * (1 + rate)));
      const a = grow(incomeA * (savingsA / 100)), b = grow(incomeB * (savingsB / 100));
      return [row('wealthA', 'Person A in 20 years', `₹${(a / 10000000).toFixed(2)}Cr`), row('wealthB', 'Person B in 20 years', `₹${(b / 10000000).toFixed(2)}Cr`),
        row('winner', '', b > a ? 'Person B wins!' : 'Person A wins!', { tone: b > a ? 'good' : 'warn', hero: true }), row('difference', '', `Difference: ₹${(Math.abs(a - b) / 10000000).toFixed(2)}Cr`)];
    },
  },
];
