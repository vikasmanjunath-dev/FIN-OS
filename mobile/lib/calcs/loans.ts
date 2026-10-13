import { num, row, type CalcDef } from './types.ts';
import { money, rupee } from './fmt.ts';

const G = 'loans' as const;
/** Monthly instalment; a 0% loan is just the principal spread over the months (the website's guard). */
const emiOf = (P: number, r: number, n: number) => (r === 0 ? P / n : P * r * (Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)));

const loanCalc = (id: string, title: string, blurb: string, web: string, rateMin: number, rateMax: number, rateDef: number,
  loanMin: number, loanMax: number, loanStep: number, loanDef: number, yMax: number, yDef: number, twoRowKind: 'pi' | 'ti'): CalcDef => ({
  id, group: G, title, blurb, web,
  inputs: [num('loan', 'Loan amount', '₹', loanDef, loanMin, loanMax, loanStep), num('rate', 'Interest rate (p.a.)', '%', rateDef, rateMin, rateMax, 0.1), num('time', 'Tenure', 'yrs', yDef, 1, yMax, 1)],
  run: ({ loan, rate, time }) => {
    const P = loan, r = rate / 12 / 100, n = time * 12;
    const emi = emiOf(P, r, n), totalPay = emi * n, interest = totalPay - P;
    const emiRow = row('emiVal', '', 'Monthly EMI: ' + money(Math.round(emi)), { hero: true });
    return twoRowKind === 'pi'
      ? [row('principalVal', 'Principal', money(P)), row('interestVal', 'Interest', money(interest)), emiRow]
      : [row('interestVal', 'Total interest', money(interest)), row('totalVal', 'Total payment', money(totalPay)), emiRow];
  },
  notes: ['Fixed rate, equal monthly instalments. Processing fees, insurance and a change in the rate are not included.'],
});

export const LOANS: CalcDef[] = [
  loanCalc('emi', 'EMI Calculator', 'Your monthly loan repayment.', 'loans, debt & emi/emi.html', 1, 25, 10.5, 10000, 10000000, 10000, 500000, 30, 5, 'ti'),
  loanCalc('carloan', 'Car Loan', 'EMI and interest on a car loan.', 'loans, debt & emi/car.html', 7, 18, 9.5, 100000, 5000000, 50000, 1000000, 7, 5, 'pi'),
  loanCalc('personalloan', 'Personal Loan', 'EMI and interest on a personal loan.', 'loans, debt & emi/personal.html', 9, 24, 11, 10000, 2500000, 10000, 500000, 5, 3, 'pi'),
  {
    id: 'educationloan', group: G, title: 'Education Loan', blurb: 'EMI with a moratorium while you study.', web: 'loans, debt & emi/education.html',
    inputs: [num('loan', 'Loan amount', '₹', 1000000, 100000, 10000000, 50000), num('rate', 'Interest rate (p.a.)', '%', 10, 6, 18, 0.1), num('time', 'Repayment tenure', 'yrs', 7, 1, 15, 1), num('moratorium', 'Moratorium', 'months', 0, 0, 60, 1)],
    run: ({ loan, rate, time, moratorium }) => {
      const P = loan, r = rate / 12 / 100, n = time * 12;
      const finalPrincipal = P + P * r * moratorium;
      const emi = emiOf(finalPrincipal, r, n);
      const interest = emi * n - P;
      return [row('principalVal', 'Principal', money(P)), row('interestVal', 'Interest', money(interest)), row('emiVal', '', 'Monthly EMI: ' + money(Math.round(emi)), { hero: true })];
    },
    notes: ['Simple interest during the moratorium is added to the principal before the EMI starts. Some lenders compound it or subsidise it.'],
  },
  {
    id: 'creditcard', group: G, title: 'Credit Card Payoff', blurb: 'How long a balance takes at a fixed monthly payment.', web: 'loans, debt & emi/creditcard.html',
    inputs: [num('balance', 'Card balance', '₹', 50000, 5000, 500000, 1000), num('pay', 'Monthly payment', '₹', 2000, 500, 20000, 500)],
    run: ({ balance, pay }) => {
      let bal = balance;
      const rate = 3.5 / 100;
      if (pay <= bal * rate) return [row('timeVal', 'Time to be free', 'Forever', { tone: 'bad' }), row('intVal', 'Interest paid', 'Infinite', { tone: 'bad' }), row('msgVal', '', 'Payment too low! 🚨', { tone: 'bad', hero: true })];
      let months = 0, totalInt = 0;
      const initial = bal;
      while (bal > 0 && months < 300) {
        const int = bal * rate;
        let prin = pay - int;
        if (prin > bal) prin = bal;
        bal -= prin; totalInt += int; months++;
      }
      return [row('timeVal', 'Time to be free', months + ' Months'), row('intVal', 'Interest paid', rupee(totalInt), { tone: 'warn' }),
        row('msgVal', '', totalInt > initial ? 'Debt Trap! ⚠️' : 'On Track', { tone: totalInt > initial ? 'bad' : 'good', hero: true })];
    },
    notes: ['Assumes 3.5% a month (about 42% a year), which is typical for Indian cards. Check your own statement for the actual rate.'],
  },
  {
    id: 'emiprepay', group: G, title: 'Prepayment Impact', blurb: 'What a yearly lump-sum prepayment saves.', web: 'loans, debt & emi/emiprepay.html',
    inputs: [num('loan', 'Loan outstanding', '₹', 3000000, 100000, 10000000, 100000), num('emi', 'Existing EMI', '₹', 30000, 5000, 100000, 1000), num('rate', 'Loan interest rate (p.a.)', '%', 9, 5, 16, 0.05), num('prepay', 'Annual prepayment', '₹', 50000, 0, 500000, 5000)],
    run: ({ loan, emi, rate, prepay }) => {
      const r = (rate || 0) / 12 / 100;
      let bal = loan, months = 0, intOrg = 0;
      while (bal > 0 && months < 360) {
        const int = bal * r;
        let prin = emi - int;
        if (prin > bal) prin = bal;
        intOrg += int; bal -= prin; months++;
      }
      const orgMonths = months;
      bal = loan; months = 0;
      let intNew = 0;
      while (bal > 0 && months < 360) {
        const int = bal * r;
        let prin = emi - int;
        if (months > 0 && months % 12 === 0) bal -= prepay;
        if (prin > bal) prin = bal;
        intNew += int; bal -= prin; months++;
      }
      const newMonths = months;
      return [row('saveVal', 'Interest saved', money(intOrg - intNew), { tone: 'good' }), row('timeVal', 'Time saved', ((orgMonths - newMonths) / 12).toFixed(1) + ' Years'),
        row('msgVal', '', 'Payoff in ' + (newMonths / 12).toFixed(1) + ' Years!', { hero: true })];
    },
    notes: ['The loop stops at 30 years. If your EMI barely covers the monthly interest the loan never really reduces.'],
  },
  {
    id: 'interestoutflow', group: G, title: 'Interest Outflow', blurb: 'How much of a loan goes to the bank as interest.', web: 'loans, debt & emi/interest.html',
    inputs: [num('loan', 'Loan amount', '₹', 3000000, 100000, 10000000, 100000), num('rate', 'Interest rate (p.a.)', '%', 9, 6, 15, 0.1), num('time', 'Tenure', 'yrs', 15, 1, 30, 1)],
    run: ({ loan, rate, time }) => {
      const P = loan, r = rate / 12 / 100, n = time * 12;
      const emi = emiOf(P, r, n);
      let bal = P, totalInterest = 0, firstYear = 0;
      for (let year = 1; year <= time; year++) {
        let yi = 0;
        for (let m = 0; m < 12; m++) {
          if (bal <= 0) break;
          const interest = bal * r;
          const principal = emi - interest;
          yi += interest; bal -= principal; totalInterest += interest;
        }
        if (year === 1) firstYear = yi;
      }
      const ratio = (totalInterest / P) * 100;
      return [row('firstYearInt', 'First-year interest', money(firstYear)), row('totalInt', 'Total interest', money(totalInterest)), row('ratioVal', '', `Interest is ${Math.round(ratio)}% of Loan`, { hero: true })];
    },
  },
  {
    id: 'loaneligibility', group: G, title: 'Loan Eligibility', blurb: 'How much a bank may lend you.', web: 'loans, debt & emi/loaneligibility.html',
    inputs: [num('income', 'Net monthly income', '₹', 75000, 20000, 500000, 5000), num('emi', 'Existing EMIs', '₹', 10000, 0, 100000, 1000), num('rate', 'Loan rate (p.a.)', '%', 8.5, 7, 15, 0.1), num('time', 'Tenure', 'yrs', 20, 1, 30, 1)],
    run: ({ income, emi, rate, time }) => {
      const r = rate / 12 / 100, n = time * 12;
      const available = income * 0.5 - emi;
      if (available <= 0) return [row('maxEmiVal', 'Max EMI capacity', '₹0'), row('loanVal', 'Estimated loan', '₹0'), row('statusVal', '', 'Ineligible ❌', { tone: 'bad', hero: true })];
      const eligible = r === 0 ? available * n : available / (r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
      return [row('maxEmiVal', 'Max EMI capacity', money(available)), row('loanVal', 'Estimated loan', money(eligible)), row('statusVal', '', 'Eligible ✅', { tone: 'good', hero: true })];
    },
    notes: ['Uses a common rule that all EMIs together stay within half your income. Banks also look at credit score, age and employer.'],
  },
  {
    id: 'loantenure', group: G, title: 'Tenure Optimizer', blurb: 'Monthly EMI against total interest as tenure changes.', web: 'loans, debt & emi/loantenure.html',
    inputs: [num('loan', 'Loan amount', '₹', 3000000, 100000, 10000000, 100000), num('rate', 'Interest rate (p.a.)', '%', 9, 6, 15, 0.1), num('time', 'Tenure', 'yrs', 20, 1, 30, 1)],
    run: ({ loan, rate, time }) => {
      const P = loan, r = rate / 12 / 100, n = time * 12;
      const emi = emiOf(P, r, n), interest = emi * n - P;
      return [row('emiVal', 'Monthly EMI', money(Math.round(emi))), row('intVal', 'Total interest', money(interest)),
        row('msgVal', '', interest > P ? 'High Interest Alert ⚠️' : 'Optimal Range ✅', { tone: interest > P ? 'warn' : 'good', hero: true })];
    },
  },
];
