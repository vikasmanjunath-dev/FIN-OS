import { loadDnaScores } from '@/lib/dnaStorage';
import { LEARNED_KEY, learnedCount } from '@/lib/learn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTransactions } from '@/lib/txnStorage';
import { asList, asRecord, isPlainObject, finite, text, scalarsOnly, keepIfUnreadable } from '@/lib/safeStore';
import { INSTRUMENTS, POLICY_META, type SavingsAccount, type Policy, savingsTotals } from '@/lib/retirement';
import {
  type TrackerData, EMPTY_TRACKER_DATA, ASSET_ITEMS, LIABILITY_ITEMS, computeAll, type Goal,
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
    const keys = [...Object.values(FIELD_KEY) as string[], GOALS_KEY, STREAK_KEY, BUDGETS_KEY, PPF_KEY, POLICIES_KEY, LEARNED_KEY];
    const map = Object.fromEntries(await AsyncStorage.multiGet(keys));
    for (const [field, key] of Object.entries(FIELD_KEY) as [keyof TrackerData, string][]) {
      if (STRING_FIELDS.has(field)) (d as any)[field] = map[key] ?? '';
      else if (field === 'emergencyTarget') d.emergencyTarget = n(map[key], 6);
      else if (field === 'retireGap') d.retireGap = n(map[key], 1);
      else if (field === 'epfRetireAge') d.epfRetireAge = n(map[key], 58);
      else if (field === 'npsSlab') d.npsSlab = n(map[key], 30);
      else (d as any)[field] = n(map[key]);
    }
    d.goals = asList(map[GOALS_KEY]).map(cleanGoal).filter((g): g is Goal => g !== null);
    d.streak = Math.max(0, Math.floor(finite(asRecord(map[STREAK_KEY])?.count, 0)));
    d.learnedModules = learnedCount(map[LEARNED_KEY]);
    {
      const lim = asRecord(map[BUDGETS_KEY])?.limits;
      d.budgetLimits = isPlainObject(lim)
        ? Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, finite(v, 0)] as const).filter(([k, v]) => v > 0 && k !== '__proto__'))
        : {};
    }
    d.transactions = await loadTransactions();
    d.dna = await loadDnaScores();
    d.ppfAccounts = parseAccounts(map[PPF_KEY]);
    d.policies = parsePolicies(map[POLICIES_KEY]);
    // Values the website derives from the details behind them
    if (d.ppfAccounts.length) d.ppf = savingsTotals(d.ppfAccounts).total;
    if (d.npsTier1 + d.npsTier2 > 0) d.nps = d.npsTier1 + d.npsTier2;
  } catch { /* storage unavailable → defaults */ }
  return d;
}

function parseAccounts(raw: string | null | undefined): SavingsAccount[] {
  return asList(raw).filter((a): a is Record<string, any> => isPlainObject(a) && typeof a.type === 'string' && a.type in INSTRUMENTS).map((a, i) => ({
    ...scalarsOnly(a), // keep anything else the website stored on the account
    id: text(a.id, `acct_${i}`), type: a.type, nickname: text(a.nickname),
    currentBalance: Math.max(0, finite(a.currentBalance)), annualDeposit: Math.max(0, finite(a.annualDeposit)), openDate: text(a.openDate),
  })) as SavingsAccount[];
}

function parsePolicies(raw: string | null | undefined): Policy[] {
  // Keep every policy the website wrote (even unknown types) so nothing is lost on save; the website's policies have no id
  return asList(raw).filter(isPlainObject).map((p: Record<string, any>, i) => ({
    ...scalarsOnly(p), // keep anything else the website stored on the policy
    id: text(p.id, `idx_${i}`), type: (typeof p.type === 'string' && p.type ? p.type : 'health') as Policy['type'],
    provider: text(p.provider), sum_assured: Math.max(0, finite(p.sum_assured)), annual_premium: Math.max(0, finite(p.annual_premium)),
    renewal_date: text(p.renewal_date), policy_number: text(p.policy_number), notes: text(p.notes, '', 2000), added_at: text(p.added_at),
  })) as Policy[];
}

/** A stored goal made safe to show and sum: text as text, amounts finite. Needs a name and some target (website records say target or target_amount). */
function cleanGoal(g: unknown): Goal | null {
  if (!isPlainObject(g) || typeof g.name !== 'string' || (g.target == null && g.target_amount == null)) return null;
  const target = finite(g.target ?? g.target_amount, 0);
  return { ...scalarsOnly(g), id: text(g.id, `goal_${g.name}`), name: g.name.slice(0, 200), target: Math.max(0, target), current: Math.max(0, finite(g.current ?? g.saved ?? g.current_amount, 0)),
    target_date: typeof g.target_date === 'string' ? g.target_date : null } as Goal;
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
  try {
    for (const [k] of pairs) if (k === GOALS_KEY || k === PPF_KEY || k === POLICIES_KEY) await keepIfUnreadable(k, 'array');
    if (pairs.some(([k]) => k === BUDGETS_KEY)) await keepIfUnreadable(BUDGETS_KEY, 'object');
    if (pairs.length) await AsyncStorage.multiSet(pairs);
  } catch { /* storage unavailable */ }
  await persistDerived(next);
  return next;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Daily-use streak (same `finos_streak` {count,last} the website uses). Call once per app launch. */
export async function touchStreak(now = new Date()) {
  try {
    const raw = asRecord(await AsyncStorage.getItem(STREAK_KEY)) ?? {};
    const today = dayKey(now);
    if (raw.last === today) return;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const count = raw.last === dayKey(y) ? Math.max(0, Math.floor(finite(raw.count, 0))) + 1 : 1;
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify({ count, last: today }));
  } catch { /* non-fatal */ }
}
