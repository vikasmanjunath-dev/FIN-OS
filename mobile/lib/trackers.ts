import { IndexedTxn, monthTotals, budgetStatus, trailing30Spend, ymd } from '@/lib/budget';
import { SavingsAccount, Policy, computeEpf, computeNps, savingsTotals, computeCoverage, hasLifeCover, hasHealthCover, EPF } from '@/lib/retirement';

// Tracker logic ported from the website (js/finos-net-worth.js, finos-emergency-fund.js,
// finos-health-score.js). Pure functions only — no React, no storage — so the formulas can be
// unit-tested and stay identical to the web app. Storage keys are the website's `finos_*` keys,
// so data lines up if/when it is synced between the two.

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  target_date?: string | null;
}

export interface TrackerData {
  name: string;
  // assets (₹)
  portfolio: number;     // stocks + funds from the Portfolio tab (read-only here)
  mfImport: number;      // website-only trackers; shown read-only if synced in
  sipValue: number;
  fd: number;
  gold: number;
  property: number;
  crypto: number;
  cash: number;
  other: number;
  epf: number;           // counted for diversification only (as on the website)
  nps: number;
  ppf: number;
  // liabilities (₹ outstanding)
  homeLoan: number;
  carLoan: number;
  personalLoan: number;
  creditCard: number;
  otherLiability: number;
  // cash flow
  income: number;
  expense: number;
  aaIncome: number;
  aaExpense: number;
  // safety net / planning
  emergencyFund: number;
  emergencyTarget: number; // months: 3 | 6 | 12
  goals: Goal[];
  streak: number;
  used80c: number;
  monthlySip: number;
  retireCorpus: number;
  retireGap: number;
  /** logged transactions (normalized) and per-category monthly budget limits */
  transactions: IndexedTxn[];
  budgetLimits: Record<string, number>;
  // retirement & protection (details behind the epf / nps / ppf values above)
  epfBasic: number; epfDoj: string; epfRetireAge: number;
  npsTier1: number; npsTier2: number; npsDob: string; npsEmp: number; npsEr: number;
  npsEq: number; npsCorp: number; npsGsec: number; npsSlab: number;
  ppfAccounts: SavingsAccount[];
  policies: Policy[];
  /** from the website's `finos_age`; 0 = unknown */
  age: number;
}

export const EMPTY_TRACKER_DATA: TrackerData = {
  name: '', portfolio: 0, mfImport: 0, sipValue: 0, fd: 0, gold: 0, property: 0, crypto: 0, cash: 0, other: 0,
  epf: 0, nps: 0, ppf: 0, homeLoan: 0, carLoan: 0, personalLoan: 0, creditCard: 0, otherLiability: 0,
  income: 0, expense: 0, aaIncome: 0, aaExpense: 0, emergencyFund: 0, emergencyTarget: 6, goals: [],
  streak: 0, used80c: 0, monthlySip: 0, retireCorpus: 0, retireGap: 1, transactions: [], budgetLimits: {},
  epfBasic: 0, epfDoj: '', epfRetireAge: EPF.RETIRE_AGE_DEFAULT,
  npsTier1: 0, npsTier2: 0, npsDob: '', npsEmp: 0, npsEr: 0, npsEq: 0, npsCorp: 0, npsGsec: 0, npsSlab: 30,
  ppfAccounts: [], policies: [], age: 0,
};

// ── Net worth ────────────────────────────────────────────────────────────────

export interface LineItem {
  field: keyof TrackerData;
  key: string;           // AsyncStorage key (same as the website)
  label: string;
  icon: string;
  color: string;
  editable: boolean;
  hint?: string;
  /** tracker screen that owns this value (read-only rows link there) */
  route?: string;
}

export const ASSET_ITEMS: LineItem[] = [
  { field: 'portfolio', key: 'finos_portfolio_value', label: 'Stocks & mutual funds', icon: '📈', color: '#00D4FF', editable: false, hint: 'From your Portfolio tab' },
  { field: 'mfImport',  key: 'finos_mf_import_value', label: 'Mutual funds (imported)', icon: '📥', color: '#38BDF8', editable: false, hint: 'From the website' },
  { field: 'sipValue',  key: 'finos_sip_value',       label: 'Mutual funds (SIP tracker)', icon: '🏦', color: '#22D3A6', editable: false, hint: 'From the website' },
  { field: 'epf',       key: 'finos_epf_value',       label: 'EPF / provident fund', icon: '🏢', color: '#34D399', editable: false, hint: 'From your EPF tracker', route: '/tracker/epf' },
  { field: 'nps',       key: 'finos_nps_value',       label: 'NPS', icon: '🏛️', color: '#60A5FA', editable: false, hint: 'From your NPS tracker', route: '/tracker/nps' },
  { field: 'ppf',       key: 'finos_ppf_value',       label: 'PPF & small savings', icon: '📮', color: '#A3E635', editable: false, hint: 'From your PPF tracker', route: '/tracker/ppf' },
  { field: 'fd',        key: 'finos_fd_value',        label: 'Fixed income (FD/PPF/NSC)', icon: '💰', color: '#7B2FF7', editable: true },
  { field: 'gold',      key: 'finos_gold_value',      label: 'Gold / SGB', icon: '🥇', color: '#F0A500', editable: true },
  { field: 'property',  key: 'finos_property_value',  label: 'Real estate', icon: '🏠', color: '#34D399', editable: true },
  { field: 'crypto',    key: 'finos_crypto_value',    label: 'Crypto', icon: '₿', color: '#F97316', editable: true },
  { field: 'cash',      key: 'finos_cash_value',      label: 'Savings / cash', icon: '🏧', color: '#60A5FA', editable: true },
  { field: 'other',     key: 'finos_other_value',     label: 'Other assets', icon: '📦', color: '#A78BFA', editable: true },
];

export const LIABILITY_ITEMS: LineItem[] = [
  { field: 'homeLoan',       key: 'finos_home_loan',        label: 'Home loan', icon: '🏠', color: '#FF4444', editable: true },
  { field: 'carLoan',        key: 'finos_car_loan',         label: 'Car loan', icon: '🚗', color: '#FF6B6B', editable: true },
  { field: 'personalLoan',   key: 'finos_personal_loan',    label: 'Personal loan', icon: '👤', color: '#FF8C42', editable: true },
  { field: 'creditCard',     key: 'finos_credit_card_debt', label: 'Credit card dues', icon: '💳', color: '#FF4444', editable: true },
  { field: 'otherLiability', key: 'finos_other_liability',  label: 'Other liabilities', icon: '📄', color: '#FF6B6B', editable: true },
];

export interface NetWorth {
  assets: (LineItem & { value: number; pct: number })[];
  liabilities: (LineItem & { value: number })[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** monthly expense the FIRE target is based on, and where that number came from */
  fireMonthlyExpense: number;
  fireSource: 'expense' | 'bank' | 'income-60%' | 'default';
  fireCorpus: number;
  /** 0–100 */
  firePercent: number;
}

const val = (d: TrackerData, f: keyof TrackerData) => Math.max(0, Number(d[f]) || 0);

export function computeNetWorth(d: TrackerData): NetWorth {
  const assetRows = ASSET_ITEMS.map(a => ({ ...a, value: val(d, a.field) })).filter(a => a.value > 0);
  const totalAssets = assetRows.reduce((s, a) => s + a.value, 0);
  const assets = assetRows.map(a => ({ ...a, pct: totalAssets > 0 ? (a.value / totalAssets) * 100 : 0 }));
  const liabilities = LIABILITY_ITEMS.map(l => ({ ...l, value: val(d, l.field) })).filter(l => l.value > 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0);
  const netWorth = totalAssets - totalLiabilities;

  // FIRE = 25× annual expenses (the 4% rule), same fallbacks as the website
  let fireMonthlyExpense: number, fireSource: NetWorth['fireSource'];
  if (d.expense > 0) { fireMonthlyExpense = d.expense; fireSource = 'expense'; }
  else if (d.aaExpense > 0) { fireMonthlyExpense = d.aaExpense; fireSource = 'bank'; }
  else if (d.income > 0) { fireMonthlyExpense = d.income * 0.6; fireSource = 'income-60%'; }
  else { fireMonthlyExpense = 50000; fireSource = 'default'; }
  const fireCorpus = fireMonthlyExpense * 12 * 25;
  const firePercent = fireCorpus > 0 ? Math.max(0, Math.min(100, (netWorth / fireCorpus) * 100)) : 0;

  return { assets, liabilities, totalAssets, totalLiabilities, netWorth, fireMonthlyExpense, fireSource, fireCorpus, firePercent };
}

// ── Budget (monthly cash flow) ───────────────────────────────────────────────

export interface Budget {
  income: number;
  expense: number;
  saving: number;
  /** % of income saved, clamped to −100…100; 0 while income or spend is unknown */
  savingsRate: number;
  /** true only when BOTH income and spend are known — otherwise "saving everything" would read as a 100% rate */
  known: boolean;
}

export function computeBudget(d: TrackerData): Budget {
  const income = d.income || d.aaIncome || 0;
  const expense = d.expense || d.aaExpense || 0;
  const saving = income - expense;
  const known = income > 0 && expense > 0;
  const savingsRate = known ? Math.max(-100, Math.min(100, Math.round((saving / income) * 100))) : 0;
  return { income, expense, saving, savingsRate, known };
}

// ── Emergency fund ───────────────────────────────────────────────────────────

export interface EmergencyStatus { label: string; level: 'full' | 'almost' | 'building' | 'critical' | 'unknown' }

export interface Emergency {
  fund: number;
  target: number;       // months
  monthlyExpense: number;
  targetAmount: number;
  pct: number;          // 0–100
  covered: number;      // months, 1 decimal
  shortfall: number;
  surplus: number;
  status: EmergencyStatus;
}

export function computeEmergency(d: TrackerData): Emergency {
  const target = [3, 6, 12].includes(d.emergencyTarget) ? d.emergencyTarget : 6;
  const monthlyExpense = d.expense || d.aaExpense || 0;
  const fund = Math.max(0, d.emergencyFund);
  const targetAmount = monthlyExpense * target;
  const pct = targetAmount > 0 ? Math.min((fund / targetAmount) * 100, 100) : 0;
  const covered = monthlyExpense > 0 ? Math.round((fund / monthlyExpense) * 10) / 10 : 0;
  const status: EmergencyStatus =
    monthlyExpense <= 0 ? { label: 'Add monthly spend to measure', level: 'unknown' }
    : pct >= 100 ? { label: 'Fully funded', level: 'full' }
    : pct >= 75 ? { label: 'Almost there', level: 'almost' }
    : pct >= 40 ? { label: 'Building up', level: 'building' }
    : { label: 'Critical gap', level: 'critical' };
  return { fund, target, monthlyExpense, targetAmount, pct, covered, shortfall: Math.max(targetAmount - fund, 0), surplus: Math.max(fund - targetAmount, 0), status };
}

// ── Goals ────────────────────────────────────────────────────────────────────

export interface GoalView extends Goal { progress: number; remaining: number; monthsLeft: number | null; monthlyNeeded: number | null }

export function monthsUntil(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

export function computeGoals(goals: Goal[], now = new Date()): { items: GoalView[]; avgProgress: number } {
  const items = goals.map(g => {
    const target = Math.max(0, Number(g.target) || 0);
    const current = Math.max(0, Number(g.current) || 0);
    const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    const remaining = Math.max(0, target - current);
    const monthsLeft = monthsUntil(g.target_date, now);
    const monthlyNeeded = monthsLeft != null && monthsLeft > 0 && remaining > 0 ? remaining / monthsLeft : null;
    return { ...g, target, current, progress, remaining, monthsLeft, monthlyNeeded };
  });
  const avgProgress = items.length ? items.reduce((s, g) => s + g.progress, 0) / items.length : 0;
  return { items, avgProgress };
}

// ── Health score (7 pillars, 100 pts) — mirrors _computeLocalScore() on the website ──

export interface Pillar {
  name: string; emoji: string; score: number; max: number; pct: number; grade: string;
  headline: string; tips: string[];
  /** true when the app has no way to record this signal yet (so a low score isn't the user's fault) */
  untracked?: boolean;
}

export interface HealthScore {
  total: number;
  tier: 'ELITE' | 'GREAT' | 'GOOD' | 'FAIR' | 'DANGER';
  tierEmoji: string;
  headline: string;
  pillars: Pillar[];
}

const SAVINGS_TARGET = 25; // % — the website's default

export function computeHealth(d: TrackerData, now = new Date()): HealthScore {
  const nw = computeNetWorth(d);
  const budget = computeBudget(d);
  const ef = computeEmergency(d);
  const { items: goalItems, avgProgress } = computeGoals(d.goals, now);

  // 1. Savings discipline (20)
  const rateBase = Math.max(0, Math.min(17, Math.round((budget.savingsRate / SAVINGS_TARGET) * 17)));
  const s80c = d.used80c >= 150000 ? 3 : d.used80c >= 100000 ? 2 : d.used80c >= 50000 ? 1 : 0;
  const savingsPts = Math.min(20, rateBase + s80c);

  // 2. Emergency fund (15) — plus up to +2 for having life and/or health insurance
  const efMonths = ef.covered;
  const hasLife = hasLifeCover(d.policies), hasHealth = hasHealthCover(d.policies);
  const insBonus = hasLife && hasHealth ? 2 : hasLife || hasHealth ? 1 : 0;
  const efBase = efMonths >= 6 ? 13 : efMonths >= 4 ? 10 : efMonths >= 3 ? 7 : efMonths >= 1 ? 3 : 0;
  const efPts = Math.min(15, efBase + insBonus);

  // 3. Goals (15)
  const goalPts = goalItems.length ? Math.min(15, Math.round(avgProgress * 0.15)) : 0;

  // 4. Behavioural (15) — the DNA quiz lives on the website; without it the site assumes a neutral 50
  const behaviorPts = Math.max(0, Math.min(15, Math.round(50 * 0.15)));

  // 5. Wealth building (15)
  const income = budget.income || 60000; // website falls back to ₹60k when income is unknown
  const wealthRatio = nw.netWorth > 0 ? nw.netWorth / (income * 12) : 0;
  const wealthBase = Math.max(0, Math.min(8, Math.round(wealthRatio * 2)));
  const diversity = [d.portfolio, d.mfImport, d.sipValue, d.fd, d.gold, d.property, d.epf, d.nps, d.ppf, d.crypto].filter(v => v > 0).length;
  const divBonus = diversity >= 5 ? 4 : diversity >= 4 ? 3 : diversity >= 3 ? 2 : diversity >= 2 ? 1 : 0;
  const retireBonus = d.retireGap <= 0 && d.retireCorpus > 0 ? 3 : 0;
  const wealthPts = Math.min(15, wealthBase + divBonus + retireBonus);

  // 6. Knowledge & engagement (10) — learning modules are website-only; the daily-use streak counts here
  const streakPts = d.streak >= 30 ? 4 : d.streak >= 14 ? 3 : d.streak >= 7 ? 2 : d.streak >= 3 ? 1 : 0;
  const engagePts = streakPts;

  // 7. Spending awareness (10) — transactions logged in the last 30 days (any kind), same thresholds as the website
  const since = new Date(now); since.setDate(since.getDate() - 30);
  const recentTxns = d.transactions.filter(t => t.date >= ymd(since) && t.date <= ymd(now)).length;
  const spendingPts = recentTxns > 10 ? 10 : recentTxns > 4 ? 7 : recentTxns > 0 ? 4 : 0;

  const total = savingsPts + efPts + goalPts + behaviorPts + wealthPts + engagePts + spendingPts;
  const tier: HealthScore['tier'] = total >= 80 ? 'ELITE' : total >= 65 ? 'GREAT' : total >= 50 ? 'GOOD' : total >= 35 ? 'FAIR' : 'DANGER';
  const tierEmoji = { ELITE: '🏆', GREAT: '🌟', GOOD: '✅', FAIR: '⚠️', DANGER: '🚨' }[tier];
  const headline = {
    ELITE: 'Exceptional wealth behaviour — top 10% of Indian investors',
    GREAT: 'Strong financial discipline — keep building momentum',
    GOOD: 'Solid foundation — a few tweaks can make a big difference',
    FAIR: 'Room to grow — focus on savings rate and emergency fund',
    DANGER: 'Critical gaps — start with your emergency fund this month',
  }[tier];

  const grade = (pts: number, max: number) => { const r = pts / max; return r >= 0.8 ? 'A+' : r >= 0.6 ? 'A' : r >= 0.4 ? 'B' : r >= 0.2 ? 'C' : 'D'; };
  const pillar = (name: string, emoji: string, score: number, max: number, headline: string, tips: string[], untracked = false): Pillar =>
    ({ name, emoji, score, max, pct: Math.round((score / max) * 100), grade: grade(score, max), headline, tips: tips.slice(0, 1), untracked });

  const pillars: Pillar[] = [
    pillar('Savings discipline', '💰', savingsPts, 20,
      !budget.known ? 'Add your monthly income and spend'
        : budget.savingsRate >= 25 ? `Saving ${budget.savingsRate}% — excellent${s80c ? ' + 80C ✓' : ''}`
        : budget.savingsRate >= 15 ? `Saving ${budget.savingsRate}% — good${s80c ? ' + 80C invested' : ', push to 25%'}`
        : `Saving ${budget.savingsRate}% — below the 25% target`,
      [
        ...(!budget.known ? ['Enter your monthly income and spend in the Budget tracker'] : budget.savingsRate < 20 ? ['Automate a SIP on salary day — pay yourself first'] : []),
        ...(d.used80c < 150000 ? [`80C gap: ₹${Math.round(150000 - d.used80c).toLocaleString('en-IN')} — ELSS/PPF can save tax`] : []),
      ]),
    pillar('Emergency fund', '🛡️', efPts, 15,
      (ef.monthlyExpense <= 0 ? 'Add monthly spend to measure cover' : efMonths >= 6 ? 'Full 6-month cover' : `${efMonths.toFixed(1)} months of expenses covered`)
        + (insBonus > 0 ? ' · insurance ✓' : ' · no insurance'),
      [
        ...(efMonths < 3 ? ['Build 3 months of expenses before investing more'] : efMonths < 6 ? ['Extend your fund to 6 months of expenses'] : []),
        ...(!hasHealth ? ['Get health insurance — the biggest protection gap for Indian families'] : []),
      ]),
    pillar('Goals', '🎯', goalPts, 15,
      goalItems.length === 0 ? 'Set financial goals to track progress' : `${goalItems.length} goal${goalItems.length === 1 ? '' : 's'} · ${Math.round(avgProgress)}% funded on average`,
      goalItems.length === 0 ? ['Add your first goal — a house, education, retirement'] : []),
    pillar('Behaviour', '🧠', behaviorPts, 15,
      'Neutral baseline — take the Financial DNA quiz on the website to personalise', [], true),
    pillar('Wealth building', '📈', wealthPts, 15,
      nw.netWorth > 0 ? `${wealthRatio.toFixed(1)}× annual income · ${diversity} asset class${diversity === 1 ? '' : 'es'}${retireBonus ? ' · retirement on track ✓' : ''}` : 'Start building net worth',
      [
        ...(wealthRatio < 2 ? ['Aim for net worth of 5× annual income by 40'] : []),
        ...(diversity < 3 ? ['Spread across equity, funds, fixed income and gold'] : []),
      ]),
    pillar('Knowledge & engagement', '📚', engagePts, 10,
      `${d.streak} day streak · learning modules are on the website`, d.streak < 7 ? ['Open FIN·OS daily — a 7-day streak earns points'] : [], true),
    pillar('Spending awareness', '🔍', spendingPts, 10,
      recentTxns > 0 ? `${recentTxns} transaction${recentTxns === 1 ? '' : 's'} logged in the last 30 days` : 'No spending data — start logging',
      recentTxns < 5 ? ['Log expenses as you spend — awareness is the first step to control'] : []),
  ];

  return { total, tier, tierEmoji, headline, pillars };
}

/** The single most useful next action: the tracked pillar with the most room to improve. */
export function nextBestStep(h: HealthScore): { pillar: string; tip: string; route: string } | null {
  const routes: Record<string, string> = {
    'Savings discipline': '/tracker/budget', 'Emergency fund': '/tracker/emergency', 'Goals': '/tracker/goals',
    'Wealth building': '/tracker/networth', 'Spending awareness': '/tracker/transactions',
  };
  // Wealth building moves slowly (it needs years of saving), so it only wins when nothing else is actionable.
  const weight = (p: Pillar) => (p.max - p.score) * (p.name === 'Wealth building' ? 0.5 : 1);
  const candidates = h.pillars.filter(p => !p.untracked && p.tips.length && routes[p.name]);
  candidates.sort((a, b) => weight(b) - weight(a));
  const p = candidates[0];
  if (!p) return null;
  const tip = p.tips[0];
  return { pillar: p.name, tip, route: /insurance/i.test(tip) ? '/tracker/insurance' : routes[p.name] };
}

export function computeSpending(d: TrackerData, now = new Date()) {
  const month = ymd(now).slice(0, 7);
  return {
    month,
    totals: monthTotals(d.transactions, month),
    budget: budgetStatus(d.transactions, d.budgetLimits, now),
    trailing30: trailing30Spend(d.transactions, now),
  };
}

function ageFromDob(dob: string, now: Date): number | null {
  if (!dob || Number.isNaN(Date.parse(dob))) return null;
  const b = new Date(dob);
  return now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

export function computeRetirement(d: TrackerData, now = new Date()) {
  const epf = computeEpf({ balance: d.epf, basic: d.epfBasic, doj: d.epfDoj, retireAge: d.epfRetireAge || EPF.RETIRE_AGE_DEFAULT }, now);
  const nps = computeNps({ tier1: d.npsTier1, tier2: d.npsTier2, dob: d.npsDob, emp: d.npsEmp, er: d.npsEr, equityPct: d.npsEq, corpPct: d.npsCorp, gsecPct: d.npsGsec, slab: d.npsSlab }, now);
  const savings = savingsTotals(d.ppfAccounts);
  const age = ageFromDob(d.npsDob, now) ?? (d.age > 0 ? d.age : 30);
  const coverage = computeCoverage(d.policies, d.income || d.aaIncome || 0, age);
  // Your own 80C so far, estimated from trackers: PPF-type deposits (capped) + the employee EPF share
  const suggested80c = Math.min(150000, Math.min(savings.c80c, 150000) + epfContributionsAnnual(d));
  return { epf, nps, savings, coverage, age, suggested80c };
}

const epfContributionsAnnual = (d: TrackerData) => Math.round(d.epfBasic * EPF.EMP_RATE) * 12;

export function computeAll(d: TrackerData, now = new Date()) {
  return {
    spending: computeSpending(d, now),
    retirement: computeRetirement(d, now),
    netWorth: computeNetWorth(d),
    budget: computeBudget(d),
    emergency: computeEmergency(d),
    goals: computeGoals(d.goals, now),
    health: computeHealth(d, now),
  };
}
