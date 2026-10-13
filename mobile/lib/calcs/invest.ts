import { num, row, type CalcDef } from './types.ts';
import { money, moneyRaw, moneySigned } from './fmt.ts';

const G = 'invest' as const;

export const INVEST: CalcDef[] = [
  {
    id: 'sip', group: G, title: 'SIP Calculator', blurb: 'What a monthly investment grows to.', web: 'investment & wealth/sip.html',
    inputs: [num('monthly', 'Monthly investment', '₹', 5000, 500, 100000, 500), num('rate', 'Expected return (p.a.)', '%', 12, 1, 30, 0.5), num('time', 'Time period', 'yrs', 10, 1, 40, 1)],
    run: ({ monthly, rate, time }) => {
      const P = monthly, n = time * 12, i = (rate / 100) / 12;
      const fv = i === 0 ? P * n : P * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
      const invested = P * n, gains = fv - invested;
      return [row('investedVal', 'Invested', moneyRaw(invested)), row('returnsVal', 'Est. returns', moneyRaw(gains)), row('totalVal', '', 'Total: ' + moneyRaw(Math.round(fv)), { hero: true })];
    },
    notes: ['Instalments are assumed at the start of each month and the return is a single steady rate. Real funds move up and down.'],
  },
  {
    id: 'lumpsum', group: G, title: 'Lumpsum Calculator', blurb: 'What a one-time investment grows to.', web: 'investment & wealth/lupsum.html',
    inputs: [num('amount', 'Investment', '₹', 100000, 5000, 10000000, 5000), num('rate', 'Return rate (p.a.)', '%', 12, 1, 30, 0.5), num('time', 'Time period', 'yrs', 10, 1, 40, 1)],
    run: ({ amount, rate, time }) => {
      const fv = amount * Math.pow(1 + rate / 100, time), gains = fv - amount;
      return [row('investedVal', 'Invested', moneyRaw(amount)), row('returnsVal', 'Est. returns', moneyRaw(Math.round(gains))), row('totalVal', '', 'Total: ' + moneyRaw(Math.round(fv)), { hero: true })];
    },
  },
  {
    id: 'swp', group: G, title: 'SWP Calculator', blurb: 'How long a corpus lasts while you withdraw monthly.', web: 'investment & wealth/swp.html',
    inputs: [num('corpus', 'Corpus', '₹', 2000000, 100000, 50000000, 100000), num('withdrawal', 'Monthly withdrawal', '₹', 15000, 1000, 200000, 1000), num('rate', 'Expected return (p.a.)', '%', 10, 1, 20, 0.5), num('time', 'Time period', 'yrs', 10, 1, 40, 1)],
    run: ({ corpus, withdrawal, rate, time }) => {
      const mr = (rate / 100) / 12, months = time * 12;
      let balance = corpus, totalWithdrawn = 0;
      for (let i = 0; i < months; i++) {
        balance += balance * mr;
        balance -= withdrawal;
        totalWithdrawn += withdrawal;
        if (balance <= 0) { balance = 0; break; }
      }
      const verdict = balance > corpus ? row('verdict', '', 'Sustainable Growth! 🚀', { tone: 'good', hero: true })
        : balance > 0 ? row('verdict', '', 'Capital Depleting ⚠️', { tone: 'warn', hero: true })
        : row('verdict', '', 'Money runs out! 🚨', { tone: 'bad', hero: true });
      return [row('totalWithdrawn', 'Total withdrawn', moneySigned(totalWithdrawn)), row('finalVal', 'Final value', moneySigned(balance)), verdict];
    },
  },
  {
    id: 'cagr', group: G, title: 'CAGR Calculator', blurb: 'The steady yearly growth rate between two values.', web: 'investment & wealth/cagr.html',
    inputs: [num('initial', 'Initial investment', '₹', 100000, 1000, 10000000, 1000), num('final', 'Final value', '₹', 200000, 1000, 20000000, 1000), num('years', 'Time period', 'yrs', 5, 1, 50, 1)],
    run: ({ initial, final, years }) => {
      if (initial === 0 || years === 0) return [];
      const cagr = (Math.pow(final / initial, 1 / years) - 1) * 100;
      const abs = ((final - initial) / initial) * 100;
      const verdict = cagr > 15 ? row('verdict', '', 'Superb Growth 🚀', { tone: 'good', hero: true }) : cagr > 8 ? row('verdict', '', 'Good Performance ✅', { tone: 'info', hero: true }) : row('verdict', '', 'Below Average ⚠️', { tone: 'warn', hero: true });
      return [row('cagrVal', 'CAGR', cagr.toFixed(2) + '%'), row('absGrowth', 'Total growth', abs.toFixed(1) + '%'), verdict];
    },
  },
  {
    id: 'mutualfunds', group: G, title: 'Mutual Fund Returns', blurb: 'How the expense ratio eats into a SIP.', web: 'investment & wealth/mutualfunds.html',
    inputs: [num('monthly', 'Monthly investment', '₹', 10000, 500, 100000, 500), num('rate', 'Expected return (p.a.)', '%', 12, 1, 30, 0.5), num('expense', 'Expense ratio', '%', 1.5, 0, 3, 0.1), num('time', 'Time period', 'yrs', 20, 1, 40, 1)],
    run: ({ monthly, rate, expense, time }) => {
      const n = time * 12;
      const iG = (rate / 100) / 12;
      const fvG = monthly * (iG === 0 ? n : (Math.pow(1 + iG, n) - 1) / iG) * (1 + iG);
      const netRate = Math.max(0, rate - expense);
      const iN = (netRate / 100) / 12;
      const fvN = monthly * (iN === 0 ? n : (Math.pow(1 + iN, n) - 1) / iN) * (1 + iN);
      const loss = fvG - fvN;
      return [row('grossVal', 'Gross return', moneyRaw(Math.round(fvG))), row('netVal', 'Net return', moneyRaw(Math.round(fvN))), row('lossVal', '', 'Fees Cost You: ' + moneyRaw(Math.round(loss)), { tone: 'warn', hero: true })];
    },
  },
  {
    id: 'etf', group: G, title: 'ETF Returns', blurb: 'Growth of a lumpsum after a low expense ratio.', web: 'investment & wealth/etf.html',
    inputs: [num('invest', 'Lumpsum', '₹', 100000, 10000, 5000000, 10000), num('rate', 'Expected return (p.a.)', '%', 12, 1, 25, 0.5), num('exp', 'Expense ratio', '%', 0.1, 0, 2, 0.05), num('time', 'Time period', 'yrs', 10, 1, 40, 1)],
    run: ({ invest, rate, exp, time }) => {
      const FV = invest * Math.pow(1 + (rate - exp) / 100, time);
      const profit = FV - invest;
      return [row('invVal', 'Invested', money(invest)), row('retVal', 'Returns', money(profit)), row('totalVal', '', 'Value: ' + money(FV), { hero: true })];
    },
  },
  {
    id: 'assetalloc', group: G, title: 'Asset Allocation', blurb: 'The balance of equity, debt, gold and cash.', web: 'investment & wealth/assetalloc.html',
    inputs: [num('equity', 'Equity holdings', '₹', 500000, 0, 10000000, 10000), num('debt', 'Debt holdings', '₹', 300000, 0, 10000000, 10000), num('gold', 'Gold / commodities', '₹', 100000, 0, 5000000, 10000), num('cash', 'Cash / liquid', '₹', 100000, 0, 2000000, 5000)],
    run: ({ equity, debt, gold, cash }) => {
      const total = equity + debt + gold + cash;
      const ePct = total > 0 ? ((equity / total) * 100).toFixed(1) : 0;
      const assets = [{ name: 'Equity', val: equity }, { name: 'Debt', val: debt }, { name: 'Gold', val: gold }, { name: 'Cash', val: cash }];
      const dominant = assets.reduce((prev, cur) => (prev.val > cur.val ? prev : cur));
      return [row('totalVal', 'Total value', moneyRaw(total)), row('equityPct', 'Equity share', ePct + '%'), row('dominant', '', 'Dominant: ' + dominant.name, { hero: true })];
    },
  },
  {
    id: 'dividend', group: G, title: 'Dividend Reinvestment', blurb: 'What reinvesting dividends adds over the years.', web: 'investment & wealth/dividend.html',
    inputs: [num('initial', 'Initial investment', '₹', 100000, 10000, 5000000, 10000), num('growth', 'Price growth (p.a.)', '%', 8, 0, 25, 0.5), num('yield', 'Dividend yield', '%', 3, 0, 10, 0.1), num('time', 'Time period', 'yrs', 20, 1, 40, 1)],
    run: ({ initial, growth, yield: y, time }) => {
      const g = growth / 100, d = y / 100;
      const noDrip = initial * Math.pow(1 + g, time);
      const drip = initial * Math.pow(1 + g + d, time);
      return [row('noDripVal', 'Without reinvesting', money(noDrip)), row('dripVal', 'With reinvesting', money(drip)), row('diffVal', '', 'Extra Wealth: ' + money(drip - noDrip), { tone: 'good', hero: true })];
    },
    notes: ['Dividends are treated as a steady yield added to price growth. Real dividends vary and are taxed in your hands.'],
  },
  {
    id: 'growth', group: G, title: 'Growth Simulator', blurb: 'Current savings plus monthly additions.', web: 'investment & wealth/portfolio.html',
    inputs: [num('current', 'Current corpus', '₹', 500000, 0, 5000000, 50000), num('monthly', 'Monthly addition', '₹', 10000, 0, 100000, 1000), num('rate', 'Rate of return (p.a.)', '%', 12, 1, 30, 0.5), num('time', 'Time period', 'yrs', 15, 1, 40, 1)],
    run: ({ current, monthly, rate, time }) => {
      const n = time * 12, i = (rate / 100) / 12;
      const fvCorpus = current * Math.pow(1 + i, n);
      const fvSIP = monthly * (i === 0 ? n : (Math.pow(1 + i, n) - 1) / i) * (1 + i);
      const total = fvCorpus + fvSIP;
      const cashOut = current + monthly * n;
      return [row('investedVal', 'Total invested', moneyRaw(cashOut)), row('interestVal', 'Interest', moneyRaw(total - cashOut)), row('finalVal', '', 'Portfolio: ' + moneyRaw(total), { hero: true })];
    },
  },
  {
    id: 'rollingreturns', group: G, title: 'Rolling Returns', blurb: 'A rough range of likely returns over a horizon.', web: 'investment & wealth/rollingreturns.html',
    inputs: [num('avg', 'Average market return', '%', 12, 5, 20, 0.5), num('vol', 'Volatility (±)', '%', 5, 1, 15, 1), num('time', 'Investment horizon', 'yrs', 5, 1, 20, 1)],
    run: ({ avg, vol, time }) => {
      const eff = vol / Math.sqrt(time);
      return [row('minRet', 'Worst case', (avg - eff).toFixed(2) + '%', { tone: 'bad' }), row('maxRet', 'Best case', (avg + eff).toFixed(2) + '%', { tone: 'good' }), row('avgRet', '', 'Avg Likely: ' + avg + '%', { hero: true })];
    },
    notes: ['A simple rule of thumb: the swing is the volatility divided by the square root of the years. It is not a forecast or a historical rolling-return table.'],
  },
  {
    id: 'taxadj', group: G, title: 'Tax-Adjusted Returns', blurb: 'What you keep after tax on the gain.', web: 'investment & wealth/taxadj.html',
    inputs: [num('invested', 'Invested amount', '₹', 500000, 10000, 5000000, 10000), num('gains', 'Total profit', '₹', 150000, 1000, 2000000, 5000), num('tax', 'Tax rate', '%', 12, 0, 30, 1)],
    run: ({ gains, tax }) => {
      const taxAmount = gains * (tax / 100);
      return [row('grossVal', 'Gross profit', moneyRaw(gains)), row('netVal', 'Net profit', moneyRaw(gains - taxAmount)), row('taxMsg', '', 'Tax Bite: ' + moneyRaw(taxAmount), { tone: 'warn', hero: true })];
    },
  },
  {
    id: 'xirr', group: G, title: 'XIRR (approximate)', blurb: 'A quick estimate of return on a lumpsum plus SIP.', web: 'investment & wealth/xirr.html',
    inputs: [num('lump', 'Initial lumpsum', '₹', 50000, 0, 1000000, 10000), num('sip', 'Monthly SIP', '₹', 5000, 500, 50000, 500), num('final', 'Value today', '₹', 400000, 10000, 5000000, 10000), num('time', 'Period', 'yrs', 3, 1, 10, 1)],
    run: ({ lump, sip, final, time }) => {
      const totalInvested = lump + sip * 12 * time;
      const profit = final - totalInvested;
      const weightedTime = (lump * time + (sip * 12 * time) * (time / 2)) / totalInvested;
      let xirr = 0;
      if (weightedTime > 0 && totalInvested > 0) xirr = (Math.pow(final / totalInvested, 1 / weightedTime) - 1) * 100;
      const abs = (profit / totalInvested) * 100;
      return [row('totalInv', 'Total invested', moneyRaw(totalInvested)), row('absGain', 'Absolute gain', abs.toFixed(1) + '%'),
        row('xirrVal', '', 'Approx XIRR: ' + xirr.toFixed(2) + '%', { tone: xirr > 12 ? 'good' : xirr > 6 ? 'info' : 'warn', hero: true })];
    },
    notes: ['This is an approximation from the average time your money was invested, not a dated cash-flow XIRR.'],
  },
];
