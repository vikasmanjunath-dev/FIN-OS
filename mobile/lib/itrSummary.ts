// @ts-nocheck
// ITR Filing Prep Kit arithmetic: gross income, 80C / 80CCD / 80D / 24(b) deductions, tax in both regimes, TDS and the balance due.
// Machine-assisted port of the calculation in js/finos-itr-summary.js. The tax slabs, HRA rule and _compute() are sliced unchanged;
// localStorage is replaced by a `read(key)` function and the clock by `nowArg`, so __tests__/itrSummary.parity.test.mts can feed both
// the same key/value store and prove the figures are the same.
export function compute(read: (key: string) => string | null, nowArg: Date = new Date()) {
  const gs = (k: string) => parseFloat(read(k) as string) || 0;
  const gss = (k: string) => read(k) || '';
  const INR = (v: number) => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');
  /* ── Tax slabs: rates shown for Tax Year 2026-27 ───────────────── */
  function _taxNew(income) {
    // New regime slabs for Tax Year 2026-27.
    // 0-4L: 0%, 4L-8L: 5%, 8L-12L: 10%, 12L-16L: 15%, 16L-20L: 20%, 20L-24L: 25%, 24L+: 30%
    const slabs = [
      [0,       400000,  0.00],
      [400000,  800000,  0.05],
      [800000,  1200000, 0.10],
      [1200000, 1600000, 0.15],
      [1600000, 2000000, 0.20],
      [2000000, 2400000, 0.25],
      [2400000, Infinity,0.30],
    ];
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    // Section 87A rebate and marginal relief for resident individuals.
    tax = income <= 1200000 ? 0 : Math.min(tax, income - 1200000);
    return Math.round(tax * 1.04); // 4% cess
  }

  function _taxOld(income) {
    // Old regime: 0-2.5L: 0%, 2.5L-5L: 5%, 5L-10L: 20%, 10L+: 30%
    const slabs = [
      [0,       250000,  0.00],
      [250000,  500000,  0.05],
      [500000,  1000000, 0.20],
      [1000000, Infinity,0.30],
    ];
    let tax = 0;
    for (const [lo, hi, rate] of slabs) {
      if (income <= lo) break;
      tax += (Math.min(income, hi) - lo) * rate;
    }
    // Rebate 87A: if income ≤ 5L, tax = 0
    if (income <= 500000) tax = 0;
    return Math.round(tax * 1.04);
  }

  /* ── HRA exemption ─────────────────────────────────────────────── */
  function _hraExempt() {
    // Try to read from salary optimizer first
    const hraFromSalary = gs('finos_salary_hra_exempt');
    if (hraFromSalary > 0) return hraFromSalary;
    // Manual HRA inputs (from tax optimizer)
    const basic       = gs('finos_salary_basic') || gs('finos_ctc_basic');
    const hraRec      = gs('finos_hra_received');
    const rentPaid    = gs('finos_rent_paid');
    const isMetro     = (gss('finos_city_metro') || 'yes').toLowerCase() !== 'no';
    if (rentPaid <= 0) return 0;
    const a = hraRec;
    const b = rentPaid - 0.1 * basic;
    const c = basic * (isMetro ? 0.5 : 0.4);
    return Math.max(0, Math.min(a, b, c));
  }

  /* ── Core computation ──────────────────────────────────────────── */
  function computeInner() {
    // ── INCOME ──
    // CTC includes employer-side benefits and is not itself taxable salary. Use salary components
    // from the Salary Optimizer when present; otherwise use an explicitly entered gross salary.
    const salaryComponents = gs('finos_salary_basic') + gs('finos_salary_hra_received') + gs('finos_salary_lta') + gs('finos_salary_special');
    const grossSalary    = salaryComponents || gs('finos_gross_salary') || gs('finos_salary_ctc');
    const salaryBasis    = salaryComponents ? 'salary components' : (gs('finos_gross_salary') ? 'entered gross salary' : (gs('finos_salary_ctc') ? 'CTC proxy — verify' : 'not entered'));
    const basicAnnual    = gs('finos_salary_basic') || grossSalary * 0.40;
    const hraReceived    = gs('finos_salary_hra')    || 0;
    const hraExempt      = _hraExempt();

    const rentalIncome   = gs('finos_passive_rental_annual') || gs('finos_rental_income_annual');
    const rentalStdDed   = Math.round(rentalIncome * 0.30);  // 30% standard deduction
    const rentalTaxable  = Math.max(0, rentalIncome - rentalStdDed);

    const fdInterest     = gs('finos_fd_interest_annual');
    const dividendIncome = gs('finos_passive_dividend_annual') || 0;
    const otherIncome    = gs('finos_other_income_annual') || 0;

    // Gross total income
    const grossTotalIncome = (grossSalary - hraExempt) + rentalTaxable + fdInterest + dividendIncome + otherIncome;

    // ── DEDUCTIONS (OLD REGIME ONLY) ──

    // 80C — itemised
    const epfEmployee    = gs('finos_epf_employee_annual') || Math.round(gs('finos_salary_basic') * 0.12);
    const ppf80c         = gs('finos_ppf_80c') || 0;
    const elss80c        = gs('finos_elss_invested') || 0;
    const lic80c         = gs('finos_lic_premium_annual') || 0;
    const npsEmployee    = gs('finos_nps_employee_annual') || gs('finos_nps_emp_monthly') * 12;
    const homeLoan80c    = gs('finos_home_loan_principal_annual') || 0;
    const ssy80c         = gs('finos_ssy_annual') || 0;
    const children80c    = gs('finos_school_fees_annual') || 0;  // tuition fees Sec 80C
    const other80c       = epfEmployee + ppf80c + elss80c + lic80c + homeLoan80c + ssy80c + children80c;
    const raw80c         = other80c + npsEmployee;
    const total80c       = Math.min(raw80c, 150000);

    // A contribution cannot be claimed in both 80C and 80CCD(1B). Allocate NPS to the remaining 80C room first, then its separate ₹50K limit.
    const npsIn80c       = Math.min(npsEmployee, Math.max(0, 150000 - other80c));
    const extra80ccd1b   = Math.min(50000, Math.max(0, npsEmployee - npsIn80c));

    // Employer NPS cap: 10% of salary in old regime (non-government), 14% in new regime.
    const employerContribution = gs('finos_nps_employer_annual') || gs('finos_nps_er_monthly') * 12 || gs('finos_salary_nps_er') || Math.round(basicAnnual * 0.10);
    const npsEmployerOld = Math.round(Math.min(employerContribution, basicAnnual * 0.10));
    const npsEmployerNew = Math.round(Math.min(employerContribution, basicAnnual * 0.14));

    // 80D — health insurance premiums
    const healthPremSelf  = gs('finos_health_ins_premium') || 0;
    const healthPremParent= gs('finos_health_ins_parent_premium') || 0;
    const max80DSelf      = 25000; // <60yr; 50000 for senior citizen
    const max80DParent    = gs('finos_parent_senior') === '1' ? 50000 : 25000;
    const total80D        = Math.min(healthPremSelf, max80DSelf) + Math.min(healthPremParent, max80DParent);

    // Section 24(b) — home loan interest
    const homeLoanInterest = gs('finos_home_loan_interest_annual') || 0;
    const sec24b           = Math.min(homeLoanInterest, 200000); // max ₹2L for self-occupied

    // 80E — education loan interest (if any)
    const edu80E          = gs('finos_edu_loan_interest_annual') || 0;

    // 80TTA/TTB — savings bank interest
    const sbInterest      = gs('finos_savings_interest_annual') || 0;
    const sec80tta        = Math.min(sbInterest, 10000);

    // Standard deduction from salary (₹75,000 in new regime FY 2025-26; ₹50,000 in old)
    const stdDedNew = 75000;
    const stdDedOld = 50000;

    const totalDeductionsOld = stdDedOld + total80c + extra80ccd1b + total80D + sec24b + edu80E + sec80tta + npsEmployerOld;
    const totalDeductionsNew = stdDedNew + npsEmployerNew; // Only employer NPS + std ded in new regime

    const taxableOld = Math.max(0, grossTotalIncome - totalDeductionsOld);
    const taxableNew = Math.max(0, grossTotalIncome - totalDeductionsNew);

    const taxOld = _taxOld(taxableOld);
    const taxNew = _taxNew(taxableNew);

    const betterRegime = taxNew <= taxOld ? 'new' : 'old';
    const npsEmployer = betterRegime === 'new' ? npsEmployerNew : npsEmployerOld;
    const savedByRegime = Math.abs(taxOld - taxNew);

    // ── TDS ──
    const tdsBySalary = gs('finos_tds_salary_annual');
    const tdsByBank   = gs('finos_tds_bank_annual')   || 0;
    const totalTDS    = tdsBySalary + tdsByBank;

    // ── BALANCE ──
    const liabilityFinal  = betterRegime === 'new' ? taxNew : taxOld;
    const balanceTax      = liabilityFinal - totalTDS;  // +ve = pay, -ve = refund

    // 80C breakdown for display
    const _80cItems = [
      { label: 'EPF (Employee Contribution)',  val: epfEmployee,  note: 'Auto from EPF Tracker' },
      { label: 'PPF / Small Savings',          val: ppf80c,       note: 'From PPF Tracker' },
      { label: 'ELSS / Tax-Saving MF',         val: elss80c,      note: '' },
      { label: 'NPS (Employee — Tier 1)',       val: npsEmployee,  note: 'From NPS Tracker' },
      { label: 'Home Loan Principal',           val: homeLoan80c,  note: '' },
      { label: 'LIC / Life Insurance',         val: lic80c,       note: 'From Insurance Tracker' },
      { label: 'Sukanya Samriddhi (SSY)',       val: ssy80c,       note: '' },
      { label: 'Children Tuition Fees',        val: children80c,  note: '' },
    ].filter(i => i.val > 0);

    const now = nowArg;
    const taxYearStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = `Tax Year ${taxYearStart}-${String(taxYearStart + 1).slice(-2)}`;

    return {
      fy, grossSalary, salaryBasis, hraExempt, rentalIncome, rentalTaxable, fdInterest, dividendIncome, otherIncome,
      grossTotalIncome, epfEmployee, ppf80c, elss80c, lic80c, npsEmployee, homeLoan80c,
      raw80c, total80c, extra80ccd1b, npsEmployer, npsEmployerOld, npsEmployerNew, total80D, sec24b, edu80E, sec80tta,
      totalDeductionsOld, totalDeductionsNew, taxableOld, taxableNew,
      taxOld, taxNew, betterRegime, savedByRegime, tdsBySalary, tdsByBank, totalTDS,
      liabilityFinal, balanceTax, _80cItems,
      healthPremSelf, healthPremParent,
    };
  }
  return computeInner();
}
