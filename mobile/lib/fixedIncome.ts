// Fixed-income tracker maths: FD, RD, PPF, NSC, SCSS, Sukanya Samriddhi, government bonds and post office deposits.
// A typed port of the calculation half of js/finos-fd-tracker.js, with the clock passed in (`now`) so it can be tested, and the RD
// 0%-rate division guarded. __tests__/fixedIncome.parity.test.mts compares it with the website's real file on random entries.
// Same storage key and entry shape as the website, so a deposit added on either side shows on the other after a tracker sync.

export const FD_KEY = 'finos_fd_portfolio';

export type InstrumentId = 'fd' | 'rd' | 'ppf' | 'nsc' | 'scss' | 'sukanya' | 'bond' | 'post_td';
export interface InstrumentDef { label: string; icon: string; compoundFreq: number; rate?: number; maxYears?: number; termYears?: number }

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  fd:      { label: 'Fixed Deposit', icon: '🏦', compoundFreq: 4 },
  rd:      { label: 'Recurring Deposit', icon: '📅', compoundFreq: 4 },
  ppf:     { label: 'Public Provident Fund', icon: '🏛️', compoundFreq: 1, rate: 7.1, maxYears: 15 },
  nsc:     { label: 'National Savings Certificate', icon: '📜', compoundFreq: 1, rate: 7.7, termYears: 5 },
  scss:    { label: 'Senior Citizens Savings Scheme', icon: '👴', compoundFreq: 4, rate: 8.2, maxYears: 5 },
  sukanya: { label: 'Sukanya Samriddhi Yojana', icon: '👧', compoundFreq: 1, rate: 8.2, maxYears: 21 },
  bond:    { label: 'Government Bond / SGB', icon: '📊', compoundFreq: 2 },
  post_td: { label: 'Post Office Time Deposit', icon: '✉️', compoundFreq: 4, rate: 7.5 },
};

export interface FDEntry {
  id: string; type: InstrumentId; label?: string; bank?: string; startDate: string; rate?: number; nominee?: string; addedAt?: string;
  principal?: number; monthlyAmount?: number; annualAmount?: number; termMonths?: number;
}
export interface FDResult {
  currentValue: number; maturityValue: number; maturityDate: Date; interestEarned: number;
  totalInvested?: number; incomePaid?: number; quarterlyIncome?: number;
}

const yearsFrom = (startDate: string, now: Date) => (now.getTime() - new Date(startDate).getTime()) / (365.25 * 86400000);

function addYears(startDate: string, years: number): Date {
  const d = new Date(startDate);
  d.setFullYear(d.getFullYear() + Math.floor(years));
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
  return d;
}

function calcFD(e: FDEntry, now: Date): FDResult {
  const principal = e.principal as number, rate = e.rate as number, termMonths = e.termMonths as number;
  const n = INSTRUMENTS[e.type]?.compoundFreq || 4;
  const termYears = termMonths / 12;
  const elapsed = Math.min(yearsFrom(e.startDate, now), termYears);
  const r = rate / 100;
  const currentValue = principal * Math.pow(1 + r / n, n * elapsed);
  const maturityValue = principal * Math.pow(1 + r / n, n * termYears);
  return { currentValue, maturityValue, maturityDate: addYears(e.startDate, termYears), interestEarned: currentValue - principal };
}

function calcRD(e: FDEntry, now: Date): FDResult {
  const monthlyAmount = e.monthlyAmount as number, rate = e.rate as number, termMonths = e.termMonths as number;
  const n = 4;                                              // quarterly compounding, as banks do for an RD
  const r = rate / 100;
  const termYears = termMonths / 12;
  const elapsed = Math.min(yearsFrom(e.startDate, now), termYears);
  const rdValue = (t: number) => (r > 0 ? ((monthlyAmount * 12) / n) * ((Math.pow(1 + r / n, n * t) - 1) / (r / n)) : monthlyAmount * 12 * t);
  const totalInvested = monthlyAmount * Math.min(termMonths, Math.round(elapsed * 12));
  const currentValue = rdValue(elapsed);
  return { currentValue, maturityValue: rdValue(termYears), maturityDate: addYears(e.startDate, termYears), interestEarned: currentValue - totalInvested, totalInvested };
}

function calcPPF(e: FDEntry, now: Date): FDResult {
  const annualAmount = e.annualAmount as number;
  const rate = (e.rate || INSTRUMENTS.ppf.rate!) / 100;
  const elapsed = yearsFrom(e.startDate, now);
  const maxYears = 15;
  const yearsInvested = Math.min(elapsed, maxYears);
  const totalInvested = annualAmount * Math.ceil(yearsInvested);
  let balance = 0;
  for (let y = 0; y < Math.ceil(yearsInvested); y++) balance += annualAmount * Math.pow(1 + rate, Math.max(0, yearsInvested - y));
  let maturityBalance = 0;
  for (let y = 0; y < maxYears; y++) maturityBalance += annualAmount * Math.pow(1 + rate, maxYears - y);
  return { currentValue: balance, maturityValue: maturityBalance, maturityDate: addYears(e.startDate, maxYears), interestEarned: balance - totalInvested, totalInvested };
}

function calcNSC(e: FDEntry, now: Date): FDResult {
  const principal = e.principal as number;
  const rate = (e.rate || INSTRUMENTS.nsc.rate!) / 100;
  const termYears = 5;
  const elapsed = Math.min(yearsFrom(e.startDate, now), termYears);
  const currentValue = principal * Math.pow(1 + rate, elapsed);
  return { currentValue, maturityValue: principal * Math.pow(1 + rate, termYears), maturityDate: addYears(e.startDate, termYears), interestEarned: currentValue - principal };
}

/** SCSS pays its interest out every quarter; it does not compound. */
function calcSCSS(e: FDEntry, now: Date): FDResult {
  const principal = Number(e.principal) || 0;
  const rate = (Number(e.rate) || INSTRUMENTS.scss.rate!) / 100;
  const termYears = (e.termMonths || INSTRUMENTS.scss.maxYears! * 12) / 12;
  const elapsed = Math.max(0, Math.min(yearsFrom(e.startDate, now), termYears));
  const incomePaid = principal * rate * elapsed;
  return { currentValue: principal, maturityValue: principal, maturityDate: addYears(e.startDate, termYears), interestEarned: incomePaid, incomePaid, quarterlyIncome: Math.round((principal * rate) / 4) };
}

function calcGeneric(e: FDEntry, now: Date): FDResult {
  const inst = INSTRUMENTS[e.type] || ({} as InstrumentDef);
  const rate = (e.rate || inst.rate || 7) / 100;
  const n = inst.compoundFreq || 4;
  const termYears = (e.termMonths || (inst.termYears || inst.maxYears || 5) * 12) / 12;
  const principal = e.principal || e.annualAmount || 0;
  const elapsed = Math.min(yearsFrom(e.startDate, now), termYears);
  const currentValue = principal * Math.pow(1 + rate / n, n * elapsed);
  return { currentValue, maturityValue: principal * Math.pow(1 + rate / n, n * termYears), maturityDate: addYears(e.startDate, termYears), interestEarned: currentValue - principal };
}

export function calcEntry(e: FDEntry, now: Date = new Date()): FDResult {
  switch (e.type) {
    case 'rd': return calcRD(e, now);
    case 'ppf': return calcPPF(e, now);
    case 'nsc': return calcNSC(e, now);
    case 'scss': return calcSCSS(e, now);
    default: return e.termMonths ? calcFD(e, now) : calcGeneric(e, now);
  }
}

export interface Totals { principal: number; currentValue: number; interest: number; yld: number }
export function totals(portfolio: FDEntry[], now: Date = new Date()): Totals {
  let principal = 0, currentValue = 0;
  portfolio.forEach(e => {
    const m = calcEntry(e, now);
    const p = e.principal || e.annualAmount || e.monthlyAmount || 0;
    principal += e.type === 'rd' || e.type === 'ppf' ? (m.totalInvested || p) : p;
    currentValue += m.currentValue;
  });
  const interest = currentValue - principal;
  return { principal, currentValue, interest, yld: principal > 0 ? (currentValue / principal - 1) * 100 : 0 };
}

/** totals() for what is shown and saved: an entry whose date or amount cannot be read adds nothing, so a total is never NaN.
 *  (totals() itself stays identical to the website's, which turns the whole total into NaN in that case.) */
export function safeTotals(portfolio: FDEntry[], now: Date = new Date()): Totals {
  return totals(portfolio.filter(e => Number.isFinite(calcEntry(e, now).currentValue)), now);
}

export interface NewEntryForm { type: InstrumentId; label: string; bank: string; amount: number; rate: number; startDate: string; termMonths: number; nominee: string }

/** The website's _save(): same checks, same entry shape. Returns the entry, or the reason it was refused. */
export function buildEntry(f: NewEntryForm, now: Date = new Date()): { ok: true; entry: FDEntry } | { ok: false; error: string } {
  const inst = INSTRUMENTS[f.type];
  if (!inst) return { ok: false, error: 'Choose what kind of investment this is.' };
  if (!f.amount || f.amount < 100) return { ok: false, error: 'Enter a valid amount (min ₹100).' };
  if (!f.rate && !inst.rate) return { ok: false, error: 'Enter the interest rate.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || Number.isNaN(new Date(f.startDate).getTime())) return { ok: false, error: 'Enter the start date as YYYY-MM-DD.' };
  const termNeeded = !['ppf', 'nsc', 'scss', 'sukanya'].includes(f.type);
  if (termNeeded && (!f.termMonths || f.termMonths < 1)) return { ok: false, error: 'Enter the term in months.' };
  const entry: FDEntry = {
    id: `fd_${now.getTime()}`, type: f.type, label: f.label.trim() || inst.label, bank: f.bank.trim(), startDate: f.startDate,
    rate: f.rate || inst.rate, nominee: f.nominee.trim(), addedAt: now.toISOString(),
  };
  if (f.type === 'rd') { entry.monthlyAmount = f.amount; entry.termMonths = f.termMonths; }
  else if (f.type === 'ppf') entry.annualAmount = f.amount;
  else if (!termNeeded) entry.principal = f.amount;
  else { entry.principal = f.amount; entry.termMonths = f.termMonths; }
  return { ok: true, entry };
}

/** Everything maturing within `months` months (already-matured entries included, like the website's calendar), soonest first. */
export function upcomingMaturities(portfolio: FDEntry[], now: Date = new Date(), months = 24) {
  const horizon = new Date(now); horizon.setMonth(horizon.getMonth() + months);
  return portfolio
    .map(entry => ({ entry, result: calcEntry(entry, now) }))
    .filter(x => Number.isFinite(x.result.currentValue) && Number.isFinite(x.result.maturityDate.getTime()) && x.result.maturityDate.getTime() <= horizon.getTime())
    .sort((a, b) => a.result.maturityDate.getTime() - b.result.maturityDate.getTime());
}
