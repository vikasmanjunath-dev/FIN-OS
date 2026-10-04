import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTransactions } from '@/lib/txnStorage';
import { INSTRUMENTS, POLICY_META, SavingsAccount, Policy, savingsTotals } from '@/lib/retirement';
import {
  TrackerData, EMPTY_TRACKER_DATA, ASSET_ITEMS, LIABILITY_ITEMS, computeAll, Goal,
} from '@/lib/trackers';

// Same keys the website writes (js/finos-*.js), so the two stay compatible.
const SIMPLE_KEYS: Partial<Record<keyof TrackerData, string>> = {
  name: 'finos_user_name',
  income: 'finos_monthly_income',
  expense: 'finos_monthly_expense',
  aaIncome: 'finos_aa_income',
  aaExpense: 'finos_aa_expense',
  emergencyFund: 'finos_emergency_fund',
  emergencyTarget: 'finos_emergency_months_target',
  used80c: 'finos_80c_used',
  monthlySip: 'finos_sip_total',
  retireCorpus: 'finos_retire_corpus',
  retireGap: 'finos_retire_gap',
  epf: 'finos_epf_value',
  nps: 'finos_nps_value',
  ppf: 'finos_ppf_value',
  epfBasic: 'finos_epf_basic',
  epfDoj: 'finos_epf_doj',
  epfRetireAge: 'finos_epf_retire_age',
  npsTier1: 'finos_nps_tier1',
  npsTier2: 'finos_nps_tier2',
  npsDob: 'finos_nps_dob',
  npsEmp: 'finos_nps_emp_monthly',
  npsEr: 'finos_nps_er_monthly',
  npsEq: 'finos_nps_equity_pct',
  npsCorp: 'finos_nps_corp_pct',
  npsGsec: 'finos_nps_gsec_pct',
  npsSlab: 'finos_nps_tax_slab',
  age: 'finos_age',
};
const STRING_FIELDS = new Set<keyof TrackerData>(['name', 'epfDoj', 'npsDob']);
const PPF_KEY = 'finos_ppf_portfolio';
const POLICIES_KEY = 'finos_insurance_policies';
const GOALS_KEY = 'finos_goals';
const STREAK_KEY = 'finos_streak';
const BUDGETS_KEY = 'finos_budgets';

const FIELD_KEY: Partial<Record<keyof TrackerData, string>> = {
  ...SIMPLE_KEYS,
  ...Object.fromEntries([...ASSET_ITEMS, ...LIABILITY_ITEMS].map(i => [i.field, i.key])),
};

const n = (v: string | null | undefined, fallback = 0) => {
  const x = parseFloat(v ?? '');
  return Number.isFinite(x) ? x : fallback;
};

export async function loadTrackerData(): Promise<TrackerData> {
  const d: TrackerData = { ...EMPTY_TRACKER_DATA };
  try {
    const keys = [...Object.values(FIELD_KEY) as string[], GOALS_KEY, STREAK_KEY, BUDGETS_KEY, PPF_KEY, POLICIES_KEY];
    const map = Object.fromEntries(await AsyncStorage.multiGet(keys));
    for (const [field, key] of Object.entries(FIELD_KEY) as [keyof TrackerData, string][]) {
      if (STRING_FIELDS.has(field)) (d as any)[field] = map[key] ?? '';
      else if (field === 'emergencyTarget') d.emergencyTarget = n(map[key], 6);
      else if (field === 'retireGap') d.retireGap = n(map[key], 1);
      else if (field === 'epfRetireAge') d.epfRetireAge = n(map[key], 58);
      else if (field === 'npsSlab') d.npsSlab = n(map[key], 30);
      else (d as any)[field] = n(map[key]);
    }
    try { const g = JSON.parse(map[GOALS_KEY] ?? '[]'); d.goals = Array.isArray(g) ? g.filter(isGoal) : []; } catch { d.goals = []; }
    try { d.streak = Number(JSON.parse(map[STREAK_KEY] ?? '{}')?.count) || 0; } catch { d.streak = 0; }
    try {
      const lim = JSON.parse(map[BUDGETS_KEY] ?? 'null')?.limits ?? {};
      d.budgetLimits = Object.fromEntries(Object.entries(lim).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    } catch { d.budgetLimits = {}; }
    d.transactions = await loadTransactions();
    d.ppfAccounts = parseAccounts(map[PPF_KEY]);
    d.policies = parsePolicies(map[POLICIES_KEY]);
    // Values the website derives from the details behind them
    if (d.ppfAccounts.length) d.ppf = savingsTotals(d.ppfAccounts).total;
    if (d.npsTier1 + d.npsTier2 > 0) d.nps = d.npsTier1 + d.npsTier2;
  } catch { /* storage unavailable → defaults */ }
  return d;
}

function parseAccounts(raw: string | null | undefined): SavingsAccount[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter(a => a && a.type in INSTRUMENTS).map((a, i) => ({
      ...a, // keep anything else the website stored on the account
      id: a.id ?? `acct_${i}`, type: a.type, nickname: String(a.nickname ?? ''),
      currentBalance: Math.max(0, Number(a.currentBalance) || 0), annualDeposit: Math.max(0, Number(a.annualDeposit) || 0), openDate: String(a.openDate ?? ''),
    }));
  } catch { return []; }
}

function parsePolicies(raw: string | null | undefined): Policy[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    // Keep every policy the website wrote (even unknown types) so nothing is lost on save; the website's policies have no id
    return v.filter(p => p && typeof p === 'object').map((p, i) => ({
      ...p, // keep anything else the website stored on the policy
      id: String(p.id ?? `idx_${i}`), type: (p.type in POLICY_META ? p.type : p.type ?? 'health') as Policy['type'],
      provider: String(p.provider ?? ''), sum_assured: Number(p.sum_assured) || 0, annual_premium: Number(p.annual_premium) || 0,
      renewal_date: String(p.renewal_date ?? ''), policy_number: String(p.policy_number ?? ''), notes: String(p.notes ?? ''), added_at: String(p.added_at ?? ''),
    }));
  } catch { return []; }
}

function isGoal(g: any): g is Goal {
  return g && typeof g.name === 'string' && (g.target != null || g.target_amount != null);
}

function retirementDerived(d: TrackerData): [string, string][] {
  const r = c0(d);
  const out: [string, string][] = [
    ['finos_nps_value', String(r.nps.total)],
    ['finos_nps_projected', String(r.nps.projected)],
    ['finos_nps_annual_tax', String(r.nps.taxSaved)],
    ['finos_ppf_value', String(r.savings.total)],
    ['finos_ppf_80c', String(r.savings.c80c)],
  ];
  if (r.epf.complete) out.push(['finos_epf_projected', String(r.epf.projected)], ['finos_epf_pension', String(r.epf.pension)]);
  return out;
}
const c0 = (d: TrackerData) => computeAll(d).retirement;

/** Write the website's derived keys so Arya, the web context and other screens see fresh numbers. */
export async function persistDerived(d: TrackerData) {
  const c = computeAll(d);
  try {
    await AsyncStorage.multiSet([
      ['finos_net_worth', String(Math.round(c.netWorth.netWorth))],
      ['finos_fire_percent', c.netWorth.firePercent.toFixed(1)],
      ['finos_emergency_months_covered', String(c.emergency.covered)],
      ['finos_savings_rate', String(c.budget.savingsRate)],
      ['finos_health_score', String(c.health.total)],
      ...retirementDerived(d),
      ['finos_health_score_detail', JSON.stringify({ total: c.health.total, tier: c.health.tier, headline: c.health.headline })],
    ]);
  } catch { /* non-fatal */ }
}

/** Persist a partial update, then refresh the derived keys. Returns the merged data. */
export async function saveTracker(patch: Partial<TrackerData>): Promise<TrackerData> {
  const current = await loadTrackerData();
  const next: TrackerData = { ...current, ...patch };
  const pairs: [string, string][] = [];
  for (const [field, value] of Object.entries(patch) as [keyof TrackerData, any][]) {
    if (field === 'goals') pairs.push([GOALS_KEY, JSON.stringify(value)]);
    else if (field === 'budgetLimits') pairs.push([BUDGETS_KEY, JSON.stringify({ limits: value, updatedAt: new Date().toISOString() })]);
    else if (field === 'transactions') continue; // owned by txnStorage
    else if (field === 'ppfAccounts') pairs.push([PPF_KEY, JSON.stringify(value)]);
    else if (field === 'policies') pairs.push([POLICIES_KEY, JSON.stringify(value)]);
    else if (field === 'streak') continue; // owned by touchStreak()
    else if (FIELD_KEY[field]) pairs.push([FIELD_KEY[field]!, STRING_FIELDS.has(field) ? String(value ?? '') : String(Number(value) || 0)]);
  }
  try { if (pairs.length) await AsyncStorage.multiSet(pairs); } catch { /* storage unavailable */ }
  await persistDerived(next);
  return next;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Daily-use streak (same `finos_streak` {count,last} the website uses). Call once per app launch. */
export async function touchStreak(now = new Date()) {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(STREAK_KEY)) ?? '{}') || {};
    const today = dayKey(now);
    if (raw.last === today) return;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const count = raw.last === dayKey(y) ? (Number(raw.count) || 0) + 1 : 1;
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ count, last: today }));
  } catch { /* non-fatal */ }
}
