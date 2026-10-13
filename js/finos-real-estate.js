/* finos-real-estate.js — buy vs rent, true cost of buying, rental yield. Pure functions; the Real Estate page and the phone use this.
 *
 *   FinosRealEstate.buyVsRent(p)    → net worth of buying vs renting-and-investing after `years`, month by month
 *   FinosRealEstate.trueCost(p)     → everything you pay to buy, beyond the price
 *   FinosRealEstate.rentalYield(p)  → gross / net yield, monthly cash flow, property vs an equity alternative
 *
 * What changed from the page's first version (it compared two things that were not like for like):
 *   • Both people spend the same cash every month. Whoever has the smaller outflow (EMI + upkeep, or rent) invests the
 *     difference. The page only let the renter do that, and kept charging the renter's "extra" after the loan ended.
 *   • Stamp duty and registration are paid up front by the buyer; the renter invests that money instead.
 *   • Selling costs and capital-gains tax are taken off the property at the end, as a buyer would pay them.
 *   • The break-even year comes from the same month-by-month run as the winner, so the two cannot disagree.
 *   • The "tax benefit" is the tax actually saved (deduction x your bracket x 1.04 cess), not the deduction itself, and it
 *     only counts if you say you claim it (old regime).
 * Still a model: constant growth rates, no property tax, no vacancy, no change in the loan rate.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosRealEstate = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : (d === undefined ? 0 : d); };

  /** Monthly instalment; no loan is 0, and a 0% loan is the principal spread over the months. */
  function emiOf(loan, annualPct, months) {
    if (!(loan > 0) || !(months > 0)) return 0;
    const r = annualPct / 100 / 12;
    if (r === 0) return loan / months;
    const g = Math.pow(1 + r, months);
    return loan * r * g / (g - 1);
  }

  const DEFAULTS = {
    price: 8000000, downPct: 20, loanRate: 8.5, tenure: 20, appreciation: 6, maintenance: 5000, maintInc: 5,
    rent: 25000, rentInc: 7, investRet: 12, years: 20,
    buyCostPct: 7, sellCostPct: 2, saleTaxPct: 12.5,
    claimTax: false, bracketPct: 20,
  };

  /** Deduction for a year: home-loan interest up to ₹2 L (24b) and principal inside the ₹1.5 L 80C limit. Old regime only. */
  function taxSaved(interest, principal, bracketPct) {
    const ded = Math.min(Math.max(0, interest), 200000) + Math.min(Math.max(0, principal), 150000);
    return ded * (bracketPct / 100) * 1.04;
  }

  function buyVsRent(input) {
    const p = Object.assign({}, DEFAULTS, input || {});
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

    // First pass: the loan month by month, to get each year's interest and principal for the tax deduction.
    const taxMonthly = [];                              // tax saved per month, by year index
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
    const buyNW = [], rentNW = [];
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
      const buyerOut = payM + maintM - taxM;
      const diff = buyerOut - rentM;                      // > 0: the renter has spare cash, < 0: the buyer has
      rentCorpus = rentCorpus * (1 + g) + Math.max(0, diff);
      buyCorpus = buyCorpus * (1 + g) + Math.max(0, -diff);
      if ((m + 1) % 12 === 0) {
        const k = (m + 1) / 12;
        const value = price * Math.pow(1 + n(p.appreciation) / 100, k);
        const net = value * sellFactor;
        const tax = Math.max(0, net - basis) * n(p.saleTaxPct) / 100;
        buyNW.push(net - tax - Math.max(0, bal) + buyCorpus);
        rentNW.push(rentCorpus);
      }
    }
    const last = years - 1;
    const value = price * Math.pow(1 + n(p.appreciation) / 100, years);
    // break-even: the first year from which buying stays ahead to the end
    let breakEven = 0;
    for (let k = years - 1; k >= 0; k--) { if (buyNW[k] >= rentNW[k]) breakEven = k + 1; else break; }
    return {
      emi, downPay, loan, upfront, years,
      propertyValue: value, loanBalance: Math.max(0, bal),
      totalEmi, totalInterest, totalMaintenance: totalMaint, taxBenefits: totalTax,
      buyNetWorth: buyNW[last], rentCorpus: rentNW[last],
      difference: Math.abs(buyNW[last] - rentNW[last]), buyWins: buyNW[last] > rentNW[last],
      breakEven,
      buyByYear: buyNW, rentByYear: rentNW,
    };
  }

  const STAMP_STATES = [
    { id: 'MH', label: 'Maharashtra', pct: 6 }, { id: 'KA', label: 'Karnataka', pct: 5 }, { id: 'DL', label: 'Delhi', pct: 7 },
    { id: 'TN', label: 'Tamil Nadu', pct: 7 }, { id: 'GJ', label: 'Gujarat', pct: 4.9 }, { id: 'TG', label: 'Telangana', pct: 6 }, { id: 'OT', label: 'Other (average)', pct: 5.5 },
  ];

  function trueCost(input) {
    const p = Object.assign({ price: 8000000, stampPct: 6, regPct: 1, gstPct: 0, loan: 6400000, procPct: 0.5, maintYear: 60000, furnish: 500000, years: 20 }, input || {});
    const price = n(p.price);
    const stamp = price * n(p.stampPct) / 100, reg = price * n(p.regPct) / 100, gst = price * n(p.gstPct) / 100;
    const proc = n(p.loan) * n(p.procPct) / 100, furnish = n(p.furnish), maint = n(p.maintYear) * n(p.years);
    const total = price + stamp + reg + gst + proc + furnish;
    return { price, stamp, reg, gst, proc, furnish, maintenance: maint, total, totalWithMaintenance: total + maint, premiumPct: price > 0 ? (total / price - 1) * 100 : 0 };
  }

  function rentalYield(input) {
    const p = Object.assign({ price: 5000000, rent: 18000, costsYear: 40000, emi: 0, appreciation: 6, years: 10, equity: 13 }, input || {});
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

  return { DEFAULTS, STAMP_STATES, emiOf, taxSaved, buyVsRent, trueCost, rentalYield };
});
