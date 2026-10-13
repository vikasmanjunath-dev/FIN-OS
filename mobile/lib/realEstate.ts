// Buy vs rent, true cost of buying and rental yield. Port of js/finos-real-estate.js (__tests__/realEstate.parity.test.mts runs the
// website's file against this one on random inputs).
// Model: both people spend the same cash each month and whoever pays less invests the difference; the buyer pays buying costs up
// front (the renter invests that money), and selling costs and capital-gains tax come off the property at the end. Constant rates;
// no property tax, vacancy or change in the loan rate.

const n = (v: unknown, d = 0): number => { const x = Number(v); return Number.isFinite(x) ? x : d; };

export interface BuyVsRentInput {
  price: number; downPct: number; loanRate: number; tenure: number; appreciation: number; maintenance: number; maintInc: number;
  rent: number; rentInc: number; investRet: number; years: number; buyCostPct: number; sellCostPct: number; saleTaxPct: number;
  claimTax: boolean; bracketPct: number;
}
export const BVR_DEFAULTS: BuyVsRentInput = {
  price: 8000000, downPct: 20, loanRate: 8.5, tenure: 20, appreciation: 6, maintenance: 5000, maintInc: 5,
  rent: 25000, rentInc: 7, investRet: 12, years: 20, buyCostPct: 7, sellCostPct: 2, saleTaxPct: 12.5, claimTax: false, bracketPct: 20,
};

export function emiOf(loan: number, annualPct: number, months: number): number {
  if (!(loan > 0) || !(months > 0)) return 0;
  const r = annualPct / 100 / 12;
  if (r === 0) return loan / months;
  const g = Math.pow(1 + r, months);
  return loan * r * g / (g - 1);
}

/** Tax actually saved in a year: interest up to ₹2 L plus principal inside ₹1.5 L, at the bracket, plus 4% cess. Old regime only. */
export function taxSaved(interest: number, principal: number, bracketPct: number): number {
  const ded = Math.min(Math.max(0, interest), 200000) + Math.min(Math.max(0, principal), 150000);
  return ded * (bracketPct / 100) * 1.04;
}

export interface BuyVsRentResult {
  emi: number; downPay: number; loan: number; upfront: number; years: number; propertyValue: number; loanBalance: number;
  totalEmi: number; totalInterest: number; totalMaintenance: number; taxBenefits: number;
  buyNetWorth: number; rentCorpus: number; difference: number; buyWins: boolean; breakEven: number; buyByYear: number[]; rentByYear: number[];
}

export function buyVsRent(input: Partial<BuyVsRentInput>): BuyVsRentResult {
  const p = { ...BVR_DEFAULTS, ...input } as BuyVsRentInput;
  const price = n(p.price), years = Math.max(1, Math.min(40, Math.round(n(p.years, 20))));
  const tenureM = Math.max(0, Math.round(n(p.tenure) * 12));
  const months = years * 12;
  const downPay = price * n(p.downPct) / 100;
  const loan = price - downPay;
  const emi = emiOf(loan, n(p.loanRate), tenureM);
  const rate = n(p.loanRate) / 100 / 12;
  const g = n(p.investRet) / 100 / 12;
  const upfront = downPay + price * n(p.buyCostPct) / 100;
  const sellFactor = 1 - n(p.sellCostPct) / 100;
  const basis = price * (1 + n(p.buyCostPct) / 100);

  const taxMonthly: number[] = [];
  {
    let b = loan;
    for (let y = 0; y < years; y++) {
      let yi = 0, yp = 0;
      for (let k = 0; k < 12; k++) {
        const m = y * 12 + k;
        if (m < tenureM && b > 0) { const i2 = b * rate; const pr = Math.min(b, emi - i2); yi += i2; yp += pr; b -= pr; }
      }
      taxMonthly.push(p.claimTax ? taxSaved(yi, yp, n(p.bracketPct)) / 12 : 0);
    }
  }

  let bal = loan, rentCorpus = upfront, buyCorpus = 0;
  let totalEmi = 0, totalInterest = 0, totalMaint = 0, totalTax = 0;
  const buyNW: number[] = [], rentNW: number[] = [];
  for (let m = 0; m < months; m++) {
    const y = Math.floor(m / 12);
    const rentM = n(p.rent) * Math.pow(1 + n(p.rentInc) / 100, y);
    const maintM = n(p.maintenance) * Math.pow(1 + n(p.maintInc) / 100, y);
    let payM = 0;
    if (m < tenureM && bal > 0) {
      const interestM = bal * rate;
      const principalM = Math.min(bal, emi - interestM);
      bal -= principalM;
      payM = emi;
      totalEmi += emi; totalInterest += interestM;
    }
    const taxM = m < tenureM ? taxMonthly[y] : 0;
    totalMaint += maintM; totalTax += taxM;
    const diff = payM + maintM - taxM - rentM;           // > 0: the renter has spare cash, < 0: the buyer has
    rentCorpus = rentCorpus * (1 + g) + Math.max(0, diff);
    buyCorpus = buyCorpus * (1 + g) + Math.max(0, -diff);
    if ((m + 1) % 12 === 0) {
      const k = (m + 1) / 12;
      const net = price * Math.pow(1 + n(p.appreciation) / 100, k) * sellFactor;
      const tax = Math.max(0, net - basis) * n(p.saleTaxPct) / 100;
      buyNW.push(net - tax - Math.max(0, bal) + buyCorpus);
      rentNW.push(rentCorpus);
    }
  }
  const last = years - 1;
  let breakEven = 0;
  for (let k = years - 1; k >= 0; k--) { if (buyNW[k] >= rentNW[k]) breakEven = k + 1; else break; }
  return {
    emi, downPay, loan, upfront, years, propertyValue: price * Math.pow(1 + n(p.appreciation) / 100, years), loanBalance: Math.max(0, bal),
    totalEmi, totalInterest, totalMaintenance: totalMaint, taxBenefits: totalTax,
    buyNetWorth: buyNW[last], rentCorpus: rentNW[last], difference: Math.abs(buyNW[last] - rentNW[last]), buyWins: buyNW[last] > rentNW[last],
    breakEven, buyByYear: buyNW, rentByYear: rentNW,
  };
}

export const STAMP_STATES = [
  { id: 'MH', label: 'Maharashtra', pct: 6 }, { id: 'KA', label: 'Karnataka', pct: 5 }, { id: 'DL', label: 'Delhi', pct: 7 },
  { id: 'TN', label: 'Tamil Nadu', pct: 7 }, { id: 'GJ', label: 'Gujarat', pct: 4.9 }, { id: 'TG', label: 'Telangana', pct: 6 }, { id: 'OT', label: 'Other (average)', pct: 5.5 },
];

export interface TrueCostInput { price: number; stampPct: number; regPct: number; gstPct: number; loan: number; procPct: number; maintYear: number; furnish: number; years: number }
export function trueCost(input: Partial<TrueCostInput>) {
  const p = { price: 8000000, stampPct: 6, regPct: 1, gstPct: 0, loan: 6400000, procPct: 0.5, maintYear: 60000, furnish: 500000, years: 20, ...input };
  const price = n(p.price);
  const stamp = price * n(p.stampPct) / 100, reg = price * n(p.regPct) / 100, gst = price * n(p.gstPct) / 100;
  const proc = n(p.loan) * n(p.procPct) / 100, furnish = n(p.furnish), maintenance = n(p.maintYear) * n(p.years);
  const total = price + stamp + reg + gst + proc + furnish;
  return { price, stamp, reg, gst, proc, furnish, maintenance, total, totalWithMaintenance: total + maintenance, premiumPct: price > 0 ? (total / price - 1) * 100 : 0 };
}

export interface YieldInput { price: number; rent: number; costsYear: number; emi: number; appreciation: number; years: number; equity: number }
export function rentalYield(input: Partial<YieldInput>) {
  const p = { price: 5000000, rent: 18000, costsYear: 40000, emi: 0, appreciation: 6, years: 10, equity: 13, ...input };
  const price = n(p.price), years = n(p.years);
  const grossYield = price > 0 ? n(p.rent) * 12 / price * 100 : 0;
  const netYield = price > 0 ? (n(p.rent) * 12 - n(p.costsYear)) / price * 100 : 0;
  const cashflow = n(p.rent) - n(p.emi) - n(p.costsYear) / 12;
  const finalValue = price * Math.pow(1 + n(p.appreciation) / 100, years);
  const netRent = (n(p.rent) * 12 - n(p.costsYear)) * years;
  const equityValue = price * Math.pow(1 + n(p.equity) / 100, years);
  const propertyTotal = finalValue + netRent;
  return { grossYield, netYield, cashflow, finalValue, netRent, propertyTotal, equityValue, propertyWins: propertyTotal > equityValue, gap: Math.abs(propertyTotal - equityValue),
    totalReturnPct: price > 0 ? (propertyTotal - price) / price * 100 : 0 };
}
