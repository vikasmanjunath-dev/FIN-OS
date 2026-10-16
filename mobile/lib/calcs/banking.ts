import { num, row, type CalcDef } from './types.ts';
import { money } from './fmt.ts';

const G = 'banking' as const;

export const BANKING: CalcDef[] = [
  {
    id: 'fd', group: G, title: 'FD Calculator', blurb: 'Maturity of a fixed deposit with quarterly compounding.', web: 'banking & fixed income/fd.html',
    inputs: [num('deposit', 'Deposit', '₹', 100000, 10000, 10000000, 10000), num('rate', 'Interest rate (p.a.)', '%', 7, 3, 12, 0.1), num('time', 'Time period', 'yrs', 5, 1, 10, 1)],
    run: ({ deposit, rate, time }) => {
      const A = deposit * Math.pow(1 + rate / 400, 4 * time);
      return [row('principalVal', 'Principal', money(deposit)), row('interestVal', 'Interest', money(A - deposit)), row('maturityVal', '', 'Maturity: ' + money(A), { hero: true })];
    },
    notes: ['Banks in India compound FD interest quarterly. Interest is taxable at your slab, and TDS applies above the bank\'s limit.'],
  },
  {
    id: 'rd', group: G, title: 'RD Calculator', blurb: 'Maturity of a monthly recurring deposit.', web: 'banking & fixed income/rd.html',
    inputs: [num('monthly', 'Monthly deposit', '₹', 5000, 500, 100000, 500), num('rate', 'Interest rate (p.a.)', '%', 7, 3, 12, 0.1), num('time', 'Time period', 'yrs', 3, 1, 10, 1)],
    run: ({ monthly, rate, time }) => {
      const months = time * 12, mr = rate / 1200;
      let balance = 0;
      for (let i = 0; i < months; i++) balance = (balance + monthly) * (1 + mr);
      const invested = monthly * months;
      return [row('investedVal', 'Deposited', money(invested)), row('interestVal', 'Interest', money(balance - invested)), row('maturityVal', '', 'Maturity: ' + money(balance), { hero: true })];
    },
    notes: ['Compounds monthly. Banks usually compound RDs quarterly, so the bank\'s figure can differ slightly.'],
  },
  {
    id: 'savingsvsinvest', group: G, title: 'Savings vs Investment', blurb: 'FD or equity: growth and the gap between them.', web: 'banking & fixed income/savingsinvestment.html',
    inputs: [num('amount', 'Amount', '₹', 100000, 10000, 10000000, 10000), num('fdRate', 'FD / savings rate (p.a.)', '%', 6.5, 3, 9, 0.1), num('eqRate', 'Expected equity return (p.a.)', '%', 12, 8, 18, 0.5), num('time', 'Time period', 'yrs', 10, 1, 30, 1)],
    run: ({ amount, fdRate, eqRate, time }) => {
      const fdFinal = amount * Math.pow(1 + fdRate / 400, 4 * time);
      const eqFinal = amount * Math.pow(1 + eqRate / 100, time);
      const diff = eqFinal - fdFinal;
      return [row('fdVal', 'FD / savings value', money(fdFinal)), row('eqVal', 'Equity value', money(eqFinal)),
        row('verdictVal', '', diff >= 0 ? 'Extra Wealth from Investing: ' + money(diff) : 'FD is ahead by: ' + money(-diff), { tone: diff >= 0 ? 'good' : 'info', hero: true })];
    },
    notes: ['Equity returns are not guaranteed and can be negative over any single period. The FD figure is what the bank promises.'],
  },
  {
    id: 'bond', group: G, title: 'Bond Yield', blurb: 'Current yield and approximate yield to maturity.', web: 'banking & fixed income/bond.html',
    inputs: [num('face', 'Face value', '₹', 1000, 100, 10000, 100), num('coupon', 'Coupon rate', '%', 8, 1, 15, 0.1), num('price', 'Current market price', '₹', 950, 500, 1500, 10), num('years', 'Years to maturity', 'yrs', 5, 1, 30, 1)],
    run: ({ face, coupon, price, years }) => {
      const annualCoupon = face * (coupon / 100);
      const currentYield = (annualCoupon / price) * 100;
      const ytm = ((annualCoupon + (face - price) / years) / ((face + price) / 2)) * 100;
      const pct = (x: number) => (Number.isFinite(x) ? x.toFixed(2) + '%' : '—');
      return [row('currYield', 'Current yield', pct(currentYield)), row('incomeVal', 'Annual income', '₹' + (Math.round(annualCoupon * 100) / 100)),
        row('ytmVal', '', 'Approx YTM: ' + pct(ytm), { tone: !Number.isFinite(ytm) ? 'info' : ytm > coupon ? 'good' : ytm < coupon ? 'warn' : 'info', hero: true })];
    },
    notes: ['The yield to maturity here is the usual quick approximation, not a solved internal rate of return.'],
  },
  {
    id: 'postofficemis', group: G, title: 'Post Office MIS', blurb: 'Monthly income from the Monthly Income Scheme.', web: 'banking & fixed income/postoffice.html',
    inputs: [num('invest', 'Investment', '₹', 450000, 10000, 900000, 5000), num('rate', 'Annual interest rate', '%', 7.4, 6, 8, 0.1)],
    run: ({ invest, rate }) => {
      const monthly = (invest * rate / 100) / 12;
      return [row('depositVal', 'Deposit', money(invest)), row('totalIntVal', 'Total interest (5 years)', money(monthly * 12 * 5)), row('monthlyVal', '', 'Monthly Payout: ' + money(monthly), { hero: true })];
    },
    notes: ['The scheme runs for 5 years and pays a fixed rate set by the government each quarter. The limit is ₹9 L single, ₹15 L joint.'],
  },
  {
    id: 'scss', group: G, title: 'SCSS Calculator', blurb: 'Quarterly income from the Senior Citizen Savings Scheme.', web: 'banking & fixed income/scss.html',
    inputs: [num('deposit', 'Investment', '₹', 1500000, 10000, 3000000, 10000), num('rate', 'Interest rate (p.a.)', '%', 8.2, 7, 9, 0.1)],
    run: ({ deposit, rate }) => {
      const q = (deposit * rate / 100) / 4;
      return [row('investedVal', 'Deposit', money(deposit)), row('totalInterestVal', 'Total interest (5 years)', money(q * 4 * 5)), row('quarterlyVal', '', 'Quarterly Payout: ' + money(q), { hero: true })];
    },
    notes: ['For people aged 60 and over, 5-year term, limit ₹30 L. The rate is reset each quarter for new deposits.'],
  },
  {
    id: 'ssy', group: G, title: 'SSY Calculator', blurb: 'Sukanya Samriddhi Yojana maturity at 21 years.', web: 'banking & fixed income/ssy.html',
    inputs: [num('yearly', 'Yearly investment', '₹', 150000, 1000, 150000, 1000), num('rate', 'Current interest rate', '%', 8.2, 7, 9, 0.1)],
    run: ({ yearly, rate }) => {
      const r = rate / 100;
      let balance = 0, invested = 0;
      for (let i = 1; i <= 21; i++) {
        if (i <= 15) { balance += yearly; invested += yearly; }
        balance = balance * (1 + r);
      }
      return [row('investedVal', 'Invested', money(invested)), row('interestVal', 'Returns', money(balance - invested)), row('maturityVal', '', 'Maturity: ' + money(balance), { hero: true })];
    },
    notes: ['Deposits for the first 15 years, maturity at 21. Deposits are assumed at the start of each year and interest is added at year end. The rate is revised quarterly.'],
  },
];
