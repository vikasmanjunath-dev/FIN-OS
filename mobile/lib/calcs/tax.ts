import type { CalcDef } from './types.ts';
import { num, row } from './types.ts';
import { rupee } from './fmt.ts';

const G = 'tax' as const;

export const TAX: CalcDef[] = [
  {
    id: 'sec80c', group: G, title: '80C Optimizer', blurb: 'How much of the ₹1.5 L deduction you have used.', web: 'tax & salary/80c.html',
    inputs: [num('epf', 'EPF (employee provident fund)', '₹', 50000, 0, 150000, 1000), num('ppf', 'PPF / ELSS / LIC premium', '₹', 20000, 0, 150000, 1000), num('hl', 'Home loan principal', '₹', 0, 0, 150000, 1000), num('tution', 'Tuition fees (children)', '₹', 0, 0, 150000, 1000)],
    run: ({ epf, ppf, hl, tution }) => {
      const total = epf + ppf + hl + tution, utilized = Math.min(total, 150000), gap = 150000 - utilized;
      return [row('utilVal', 'Utilized', rupee(utilized)), row('gapVal', 'Gap to ₹1.5 L', rupee(gap)), row('msgVal', '', gap === 0 ? 'Maxed Out! ✅' : 'Invest ' + rupee(gap) + ' more', { tone: gap === 0 ? 'good' : 'info', hero: true })];
    },
    notes: ['Section 80C is available only under the old tax regime. The new regime has no 80C deduction.'],
  },
  {
    id: 'capgains', group: G, title: 'Capital Gains Tax', blurb: 'Tax on a sale of equity, debt funds or property.', web: 'tax & salary/captalgains.html',
    inputs: [
      { kind: 'choice', key: 'asset', label: 'Asset class', def: 'equity', id: 'asset', options: [{ id: 'equity', label: 'Equity (stocks / equity MF)' }, { id: 'debt', label: 'Debt mutual funds' }, { id: 'property', label: 'Real estate' }] },
      num('buy', 'Total buy value', '₹', 100000, 10000, 5000000, 10000), num('sell', 'Total sell value', '₹', 150000, 10000, 10000000, 10000), num('time', 'Holding period', 'months', 13, 1, 60, 1),
    ],
    run: ({ asset, buy, sell, time }) => {
      const gain = sell - buy;
      let tax = 0;
      if (gain > 0) {
        if (asset === 'equity') tax = time > 12 ? Math.max(0, gain - 125000) * 0.125 : gain * 0.20;
        else if (asset === 'debt') tax = gain * 0.30;
        else if (asset === 'property') tax = time > 24 ? gain * 0.125 : gain * 0.30;
      }
      if (tax > 0) tax = tax * 1.04;
      return [row('gainVal', 'Total gain', rupee(gain)), row('taxVal', 'Tax payable', rupee(tax), { tone: 'warn' }), row('netVal', '', 'Net Profit: ' + rupee(gain - tax), { hero: true })];
    },
    notes: ['Equity: long-term after 12 months, 12.5% above ₹1.25 L of gain a year; short-term 20%. Debt funds are shown at 30% (your slab may be lower). Property: 12.5% after 24 months, 30% before. Cess of 4% is added; surcharge and losses to set off are not.'],
  },
  {
    id: 'gratuity', group: G, title: 'Gratuity Calculator', blurb: 'Your exit benefit after years of service.', web: 'tax & salary/gratuity.html',
    inputs: [num('basic', 'Last drawn basic salary + DA', '₹', 50000, 10000, 500000, 5000), num('years', 'Years of service', 'yrs', 5, 5, 40, 1)],
    run: ({ basic, years }) => [row('tenureVal', 'Tenure', years + ' Years'), row('gratuityVal', '', 'Total: ' + rupee((15 * basic * years) / 26), { hero: true })],
    notes: ['The formula for employees covered by the Gratuity Act: 15 days of pay per year of service, using 26 working days a month. Gratuity is tax-free up to ₹20 L. A part-year of more than six months counts as a full year.'],
  },
  {
    id: 'hra', group: G, title: 'HRA Exemption', blurb: 'The part of your HRA that is tax-free.', web: 'tax & salary/hra.html',
    inputs: [num('basic', 'Basic salary + DA (yearly)', '₹', 600000, 300000, 3000000, 50000), num('hra', 'HRA received (yearly)', '₹', 300000, 100000, 1500000, 10000), num('rent', 'Rent paid (yearly)', '₹', 240000, 0, 1500000, 10000),
      { kind: 'toggle', key: 'metro', label: 'Metro city', def: true, id: 'metro' }],
    run: ({ basic, hra, rent, metro }) => {
      const exempt = Math.min(hra, Math.max(0, rent - 0.10 * basic), basic * (metro ? 0.50 : 0.40));
      return [row('exemptVal', 'Exempt HRA', rupee(exempt), { tone: 'good' }), row('taxableVal', 'Taxable HRA', rupee(hra - exempt)), row('msgVal', '', exempt === hra ? 'Fully Exempt! 🎉' : 'Partially Taxable', { hero: true })];
    },
    notes: ['The lowest of: HRA received, rent paid minus 10% of basic, and 50% (metro) or 40% of basic. Available only under the old tax regime.'],
  },
  {
    id: 'leaveencash', group: G, title: 'Leave Encashment', blurb: 'The tax-free part of leave salary.', web: 'tax & salary/leave.html',
    inputs: [num('basic', 'Average monthly basic', '₹', 50000, 10000, 500000, 5000), num('received', 'Amount received', '₹', 300000, 0, 5000000, 10000), num('days', 'Unavailed leave', 'days', 30, 0, 300, 1)],
    run: ({ basic, received, days }) => {
      const exempt = Math.min(received, 2500000, 10 * basic, (days / 30) * basic);
      const taxable = Math.max(0, received - exempt);
      return [row('exemptVal', 'Exempt amount', rupee(exempt), { tone: 'good' }), row('taxableVal', 'Taxable amount', rupee(taxable)), row('limitMsg', '', taxable > 0 ? 'Taxable Portion Exists ⚠️' : 'Fully Tax Free ✅', { tone: taxable > 0 ? 'warn' : 'good', hero: true })];
    },
    notes: ['On retirement or resignation the exempt amount is the least of: the amount received, ₹25 L, ten months\' average salary, and the cash value of the leave you had unused.'],
  },
  {
    id: 'professionaltax', group: G, title: 'Professional Tax', blurb: 'The state deduction from a monthly salary.', web: 'tax & salary/professional.html',
    inputs: [
      num('salary', 'Gross monthly salary', '₹', 50000, 5000, 200000, 1000),
      { kind: 'choice', key: 'state', label: 'State', def: 'MH', id: 'state', options: [{ id: 'MH', label: 'Maharashtra' }, { id: 'KA', label: 'Karnataka' }, { id: 'WB', label: 'West Bengal' }, { id: 'TN', label: 'Tamil Nadu' }, { id: 'TG', label: 'Telangana' }, { id: 'GUJ', label: 'Gujarat' }, { id: 'OTH', label: 'Other / exempt' }] },
    ],
    run: ({ salary, state }) => {
      let pt = 0;
      if (state === 'MH') { if (salary > 10000) pt = 200; else if (salary > 7500) pt = 175; }
      else if (state === 'KA') { if (salary >= 15000) pt = 200; }
      else if (state === 'WB') { if (salary > 40000) pt = 200; else if (salary > 25000) pt = 150; else if (salary > 15000) pt = 130; else if (salary > 10000) pt = 110; }
      else if (state === 'TN') { if (salary > 12500) pt = 208; }
      else if (state === 'TG') { if (salary > 20000) pt = 200; else if (salary > 15000) pt = 150; }
      else if (state === 'GUJ') { if (salary >= 12000) pt = 200; else if (salary >= 9000) pt = 150; else if (salary >= 6000) pt = 80; }
      const annual = state === 'MH' && pt === 200 ? 2500 : pt * 12;
      return [row('monthlyVal', 'Monthly PT', '₹' + Math.round(pt)), row('annualVal', 'Annual PT', '₹' + annual), row('ruleMsg', '', pt > 0 ? 'Deduction Active' : 'No Deduction', { hero: true })];
    },
    notes: ['Slabs are approximate and states revise them, so check your payslip. Tamil Nadu is shown as a monthly average of a half-yearly charge.'],
  },
  {
    id: 'stcgltcg', group: G, title: 'STCG vs LTCG', blurb: 'What waiting a year saves on an equity gain.', web: 'tax & salary/shortlong.html',
    inputs: [num('gain', 'Investment profit', '₹', 200000, 10000, 1000000, 10000)],
    run: ({ gain }) => {
      const stcg = gain * 0.20 * 1.04;
      const ltcg = Math.max(0, gain - 125000) * 0.125 * 1.04;
      return [row('stcgVal', 'Sell within 1 year', 'Tax: ' + rupee(stcg), { tone: 'warn' }), row('ltcgVal', 'Sell after 1 year', 'Tax: ' + rupee(ltcg), { tone: 'good' }), row('diffVal', '', 'Save ' + rupee(stcg - ltcg) + ' by waiting', { hero: true })];
    },
    notes: ['Listed equity and equity funds. 20% short-term, 12.5% long-term above ₹1.25 L a year, plus 4% cess. Surcharge is not included.'],
  },
];
