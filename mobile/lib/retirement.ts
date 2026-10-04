// Retirement & protection trackers ported from the website:
//   EPF  — js/finos-epf-tracker.js
//   NPS  — js/finos-nps-tracker.js
//   PPF & small savings — js/finos-ppf-tracker.js
//   Insurance — html/insurance-hub.html (coverage + gap rules)
// Pure functions only (no React / storage), so every formula can be parity-tested against the website.

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ═══ EPF ═════════════════════════════════════════════════════════════════════
// FY 2025-26: employee 12% of basic+DA; employer 3.67% to EPF and 8.33% to EPS (wage capped at ₹15,000);
// interest 8.25% p.a., compounded annually.

export const EPF = { EMP_RATE: 0.12, EMPR_RATE: 0.0367, EPS_RATE: 0.0833, EPS_WAGE_CAP: 15000, INTEREST: 8.25, RETIRE_AGE_DEFAULT: 58 } as const;

export interface EpfInput { balance: number; basic: number; doj: string; retireAge: number }

export function epfContributions(basic: number) {
  const empEPF = Math.round(basic * EPF.EMP_RATE);
  const empWage = Math.min(basic, EPF.EPS_WAGE_CAP);
  const eps = Math.round(empWage * EPF.EPS_RATE);
  const emprEPF = Math.round(basic * EPF.EMPR_RATE);
  const totalEPF = empEPF + emprEPF; // what actually lands in the EPF account
  return { empEPF, eps, emprEPF, totalEPF, total: empEPF + eps + emprEPF };
}

/** The website assumes you joined at 22 when working out when you retire — kept identical so numbers match. */
export function epfAgeAt(doj: string, retireAge: number, now = new Date()) {
  if (!doj) return { yearsService: 0, monthsToRetire: 0, totalServiceYears: 0 };
  const dojDate = new Date(doj);
  const birthEstimate = new Date(dojDate);
  birthEstimate.setFullYear(dojDate.getFullYear() - 22);
  const yearsService = (now.getTime() - dojDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  const retireDate = new Date(birthEstimate);
  retireDate.setFullYear(birthEstimate.getFullYear() + retireAge);
  const monthsToRetire = Math.max(0, Math.round((retireDate.getTime() - now.getTime()) / (30.44 * 24 * 3600 * 1000)));
  const totalServiceYears = yearsService + monthsToRetire / 12;
  return { yearsService: Math.round(yearsService * 10) / 10, monthsToRetire, totalServiceYears };
}

export function epfProjectedCorpus(currentBalance: number, monthlyEPFContrib: number, monthsToRetire: number) {
  const r = EPF.INTEREST / 100;
  let balance = currentBalance;
  for (let m = 0; m < monthsToRetire; m++) {
    balance += monthlyEPFContrib;
    if ((m + 1) % 12 === 0) balance *= 1 + r; // interest credited once a year
  }
  const partialMonths = monthsToRetire % 12;
  if (partialMonths > 0) balance += balance * r * (partialMonths / 12);
  return Math.round(balance);
}

/** EPS pension = (pensionable salary × service years, max 35) / 70 */
export function epsPension(yearsService: number, avgBasic: number) {
  const pensionSalary = Math.min(avgBasic, EPF.EPS_WAGE_CAP);
  return Math.round((pensionSalary * Math.min(35, yearsService)) / 70);
}

export interface EpfResult {
  balance: number; basic: number; contributions: ReturnType<typeof epfContributions>;
  yearsService: number; monthsToRetire: number; projected: number; pension: number;
  /** projections need basic pay AND a joining date */
  complete: boolean;
}

export function computeEpf(i: EpfInput, now = new Date()): EpfResult {
  const contributions = epfContributions(i.basic);
  const age = epfAgeAt(i.doj, i.retireAge, now);
  const complete = i.balance >= 0 && i.basic > 0 && !!i.doj && !Number.isNaN(Date.parse(i.doj));
  return {
    balance: i.balance, basic: i.basic, contributions,
    yearsService: age.yearsService, monthsToRetire: age.monthsToRetire,
    projected: complete ? epfProjectedCorpus(i.balance, contributions.totalEPF, age.monthsToRetire) : 0,
    pension: complete ? epsPension(age.totalServiceYears, i.basic) : 0,
    complete,
  };
}

// ═══ NPS ═════════════════════════════════════════════════════════════════════

export const NPS_RATES = { E: 0.105, C: 0.085, G: 0.075 } as const; // equity, corporate bonds, G-Secs p.a.

export interface NpsInput {
  tier1: number; tier2: number; dob: string; emp: number; er: number;
  equityPct: number; corpPct: number; gsecPct: number; slab: number;
}

export const npsWeightedReturn = (ep: number, cp: number, gp: number) =>
  (ep / 100) * NPS_RATES.E + (cp / 100) * NPS_RATES.C + (gp / 100) * NPS_RATES.G;

export function npsProjectCorpus(corpus: number, monthlyContrib: number, months: number, annualR: number) {
  const r = annualR / 12;
  let bal = corpus;
  for (let m = 0; m < months; m++) { bal += monthlyContrib; bal *= 1 + r; }
  return Math.round(bal);
}

/**
 * Estimated yearly tax saved. This is the website's own approximation: it treats the first ₹1.5L of your
 * contribution as 80C space (which PPF/ELSS/EPF may already be using), the next ₹50k as 80CCD(1B), and your
 * employer's share (up to ₹2L) as 80CCD(2). Treat it as an upper-end estimate.
 */
export function npsTaxSaved(empAnnual: number, erAnnual: number, slab: number) {
  const s = slab / 100;
  const c1 = Math.min(empAnnual, 150000);
  const c1b = Math.min(Math.max(empAnnual - 150000, 0), 50000);
  const c2 = Math.min(erAnnual, 200000);
  return Math.round((c1 + c1b + c2) * s);
}

export interface NpsResult {
  tier1: number; tier2: number; total: number; ageNow: number; yearsLeft: number; annualR: number;
  projected: number; annuityCorpus: number; lumpSum: number; taxSaved: number;
  /** Allocation percentages add up to 100 (or are all empty) */
  allocationOk: boolean;
}

export function computeNps(i: NpsInput, now = new Date()): NpsResult {
  const total = i.tier1 + i.tier2;
  let ageNow = 30, yearsLeft = 30;
  if (i.dob) {
    const birth = new Date(i.dob);
    ageNow = now.getFullYear() - birth.getFullYear() - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    yearsLeft = Math.max(60 - ageNow, 0);
  }
  const annualR = npsWeightedReturn(i.equityPct, i.corpPct, i.gsecPct) || 0.085;
  // Only Tier-1 is projected: Tier-2 is freely withdrawable, so it isn't pension money
  const projected = npsProjectCorpus(i.tier1, i.emp + i.er, Math.round(yearsLeft * 12), annualR);
  const annuityCorpus = Math.round(projected * 0.4); // at least 40% must buy an annuity
  const lumpSum = projected - annuityCorpus;
  const taxSaved = npsTaxSaved(i.emp * 12, i.er * 12, i.slab || 30);
  const sum = i.equityPct + i.corpPct + i.gsecPct;
  return { tier1: i.tier1, tier2: i.tier2, total, ageNow, yearsLeft, annualR, projected, annuityCorpus, lumpSum, taxSaved, allocationOk: sum === 0 || Math.abs(sum - 100) < 0.5 };
}

// ═══ PPF & small savings ═════════════════════════════════════════════════════

export type SmallSavingsType = 'PPF' | 'SSY' | 'NSC' | 'SCSS' | 'KVP';

export interface Instrument {
  name: string; rate: number; compounding: 'annual' | 'half-yearly' | 'quarterly'; maxYrs: number;
  minAmt: number; maxAmt: number | null; taxFree: boolean; c80c: boolean; color: string;
}

export const INSTRUMENTS: Record<SmallSavingsType, Instrument> = {
  PPF:  { name: 'Public Provident Fund',          rate: 7.1, compounding: 'annual',      maxYrs: 15,  minAmt: 500,  maxAmt: 150000,  taxFree: true,  c80c: true,  color: '#00D4FF' },
  SSY:  { name: 'Sukanya Samriddhi Yojana',       rate: 8.2, compounding: 'annual',      maxYrs: 21,  minAmt: 250,  maxAmt: 150000,  taxFree: true,  c80c: true,  color: '#9B5DE5' },
  NSC:  { name: 'National Savings Certificate',   rate: 7.7, compounding: 'half-yearly', maxYrs: 5,   minAmt: 1000, maxAmt: null,    taxFree: false, c80c: true,  color: '#FFB347' },
  SCSS: { name: 'Senior Citizens Savings Scheme', rate: 8.2, compounding: 'quarterly',   maxYrs: 5,   minAmt: 1000, maxAmt: 3000000, taxFree: false, c80c: true,  color: '#22D3A6' },
  KVP:  { name: 'Kisan Vikas Patra',              rate: 7.5, compounding: 'annual',      maxYrs: 9.6, minAmt: 1000, maxAmt: null,    taxFree: false, c80c: false, color: '#EF4444' },
};

export interface SavingsAccount {
  /** the website writes numeric ids (Date.now()); new accounts here do too so its delete button keeps working */
  id: number | string;
  type: SmallSavingsType;
  nickname: string;
  currentBalance: number;
  annualDeposit: number;
  /** YYYY-MM-DD */
  openDate: string;
}

export function maturityValue(principal: number, ratePA: number, type: Instrument['compounding'], years: number) {
  const r = ratePA / 100;
  switch (type) {
    case 'half-yearly': return Math.round(principal * Math.pow(1 + r / 2, years * 2));
    case 'quarterly':   return Math.round(principal * Math.pow(1 + r / 4, years * 4));
    default:            return Math.round(principal * Math.pow(1 + r, years));
  }
}

/** PPF/SSY: a deposit every year, all growing at the scheme rate. */
export function ppfProjection(currentBalance: number, annualDeposit: number, yearsLeft: number, rate: number) {
  let bal = currentBalance;
  const r = rate / 100;
  for (let y = 0; y < yearsLeft; y++) bal = (bal + annualDeposit) * (1 + r);
  return Math.round(bal);
}

export function savingsTotals(accounts: SavingsAccount[]) {
  const total = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
  const c80c = accounts
    .filter(a => INSTRUMENTS[a.type]?.c80c)
    .reduce((s, a) => s + Math.min(a.annualDeposit || 0, INSTRUMENTS[a.type]?.maxAmt || Infinity), 0);
  return { total, c80c, annualDeposits: accounts.reduce((s, a) => s + (a.annualDeposit || 0), 0) };
}

export function accountProjection(a: SavingsAccount, now = new Date()) {
  const inst = INSTRUMENTS[a.type];
  const openYr = a.openDate ? new Date(a.openDate).getFullYear() : null;
  const ageYrs = openYr ? now.getFullYear() - openYr : null;
  const yearsLeft = inst.maxYrs && ageYrs !== null ? Math.max(inst.maxYrs - ageYrs, 0) : inst.maxYrs || 5;
  const maturityYear = openYr ? Math.floor(openYr + inst.maxYrs) : now.getFullYear() + Math.floor(yearsLeft);
  const projected = a.type === 'PPF' || a.type === 'SSY'
    ? ppfProjection(a.currentBalance, a.annualDeposit || 0, yearsLeft, inst.rate)
    : maturityValue(a.currentBalance, inst.rate, inst.compounding, yearsLeft);
  return { yearsLeft, maturityYear, projected, gain: projected - a.currentBalance };
}

// ═══ Insurance ═══════════════════════════════════════════════════════════════

export type PolicyType = 'health' | 'life_term' | 'life_ulip' | 'vehicle' | 'home' | 'travel' | 'critical';

export interface Policy {
  id: string;
  type: PolicyType;
  provider: string;
  sum_assured: number;
  annual_premium: number;
  /** YYYY-MM-DD, optional */
  renewal_date: string;
  policy_number: string;
  notes: string;
  added_at: string;
}

export const POLICY_META: Record<PolicyType, { icon: string; label: string; color: string }> = {
  health:    { icon: '🏥', label: 'Health insurance', color: '#22D3A6' },
  life_term: { icon: '🛡️', label: 'Term life',        color: '#00D4FF' },
  life_ulip: { icon: '📈', label: 'ULIP',             color: '#7B2FF7' },
  vehicle:   { icon: '🚗', label: 'Vehicle',          color: '#FF9500' },
  home:      { icon: '🏠', label: 'Home',             color: '#C7F000' },
  travel:    { icon: '✈️', label: 'Travel',           color: '#00D4FF' },
  critical:  { icon: '❤️', label: 'Critical illness', color: '#FF4444' },
};

export interface Gap { icon: string; title: string; severity: 'critical' | 'high' | 'medium' | 'low'; msg: string }

const rupeeShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${Math.round(a / 1e3)}K`;
  return `₹${Math.round(a).toLocaleString('en-IN')}`;
};

export interface Coverage {
  totalHealth: number; totalLife: number; totalCritical: number;
  recHealth: number; recLife: number; recCritical: number;
  hasHealth: boolean; hasTerm: boolean; hasVehicle: boolean;
  annualPremium: number;
  gaps: Gap[];
}

/** Coverage vs the website's rules of thumb: health 2× annual income, term life 15×, critical illness 5×. */
export function computeCoverage(policies: Policy[], monthlyIncome: number, age: number): Coverage {
  const income = monthlyIncome > 0 ? monthlyIncome : 50000; // the website assumes ₹50k when income is unknown
  const sum = (t: PolicyType) => policies.filter(p => p.type === t).reduce((s, p) => s + num(p.sum_assured), 0);
  const totalHealth = sum('health'), totalLife = sum('life_term'), totalCritical = sum('critical');
  const recHealth = income * 12 * 2, recLife = income * 12 * 15, recCritical = income * 12 * 5;
  const hasHealth = policies.some(p => p.type === 'health');
  const hasTerm = policies.some(p => p.type === 'life_term');
  const hasVehicle = policies.some(p => p.type === 'vehicle');

  const gaps: Gap[] = [];
  if (!hasHealth) gaps.push({ icon: '🏥', title: 'No health insurance', severity: 'critical', msg: `One hospitalisation can cost ₹5–25L. Get a ${rupeeShort(recHealth)} family floater plan.` });
  else if (totalHealth < recHealth) gaps.push({ icon: '🏥', title: `Health cover is low (${rupeeShort(totalHealth)})`, severity: 'high', msg: `Recommended: ${rupeeShort(recHealth)}. Consider a top-up on your existing cover.` });
  if (!hasTerm && age < 55) gaps.push({ icon: '🛡️', title: 'No term life insurance', severity: 'critical', msg: `If others depend on your income, aim for about ${recLife > 10000000 ? rupeeShort(recLife) : '₹1 Cr+'} of pure term cover.` });
  else if (hasTerm && totalLife < income * 12 * 10) gaps.push({ icon: '🛡️', title: `Life cover may be insufficient (${rupeeShort(totalLife)})`, severity: 'medium', msg: `Ideal is about 15× annual income (${rupeeShort(recLife)}). Review it if your liabilities have grown.` });
  if (!hasVehicle) gaps.push({ icon: '🚗', title: 'Vehicle insurance not recorded', severity: 'low', msg: 'Third-party vehicle cover is legally mandatory in India. Skip this if you do not own a vehicle.' });
  if (age > 35 && !policies.some(p => p.type === 'critical')) gaps.push({ icon: '❤️', title: 'No critical illness cover', severity: 'medium', msg: `Cancer, heart attack or stroke treatment can cost ₹10–50L. A ${rupeeShort(recCritical)} cover is a sensible target.` });

  return { totalHealth, totalLife, totalCritical, recHealth, recLife, recCritical, hasHealth, hasTerm, hasVehicle, annualPremium: policies.reduce((s, p) => s + num(p.annual_premium), 0), gaps };
}

/** Days until renewal (negative = expired), or null when no date is set. */
export function renewalDays(p: Pick<Policy, 'renewal_date'>, now = new Date()): number | null {
  if (!p.renewal_date) return null;
  const t = Date.parse(p.renewal_date);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now.getTime()) / 86400000);
}

/** Same matching rule the website's health score uses to spot life / health cover. */
export function hasLifeCover(policies: { type?: string; category?: string }[]) { return policies.some(p => /life/i.test(p.type || p.category || '')); }
export function hasHealthCover(policies: { type?: string; category?: string }[]) { return policies.some(p => /health/i.test(p.type || p.category || '')); }

// ═══ Shared validation ═══════════════════════════════════════════════════════

/** Valid, real, not-in-the-future YYYY-MM-DD (or empty when optional). */
export function validDate(s: string, opts: { allowFuture?: boolean; optional?: boolean } = {}, now = new Date()): boolean {
  const t = s.trim();
  if (!t) return !!opts.optional;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return false;
  if (+m[1] < 1900) return false;
  return opts.allowFuture ? true : t <= isoDay(now);
}
