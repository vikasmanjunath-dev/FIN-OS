// "Corrupt JSON shape" guard for the phone: every storage reader and every backend-response normaliser must survive a value of
// the wrong shape (null, a string, a number, an array where an object is expected, NaN / Infinity / negatives, very long strings,
// JSON that does not parse) without throwing, return its documented fallback, never leak NaN / Infinity into what it returns, and
// never save a fallback over what was stored (a failed read must not wipe the person's data).
//
// Table driven: add a row to READERS / NORMALISERS / MUTATORS for any new reader. The corpus lives in helpers/corpus.mts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rawCorpus, valueCorpus, findNonFinite } from './helpers/corpus.mts';

// ── a fake storage that answers every key with the same corrupt raw string, and records every write ─────────────────────────────
type Write = { op: string; key: string; value?: string };
const world = { raw: null as string | null, keyed: new Map<string, string | null>(), useKeyed: false, writes: [] as Write[], failReads: false };
const answer = (k: string): string | null => (world.useKeyed ? (world.keyed.has(k) ? world.keyed.get(k)! : null) : world.raw);
const S: any = AsyncStorage;
S.getItem = async (k: string) => { if (world.failReads) throw new Error('storage unavailable'); return answer(k); };
S.multiGet = async (ks: string[]) => { if (world.failReads) throw new Error('storage unavailable'); return ks.map(k => [k, answer(k)]); };
S.getAllKeys = async () => (world.useKeyed ? [...world.keyed.keys()] : ['finos_transactions', 'finos_goals', 'finos_monthly_income']);
S.setItem = async (k: string, v: string) => { world.writes.push({ op: 'set', key: k, value: String(v) }); if (world.useKeyed) world.keyed.set(k, String(v)); };
S.multiSet = async (ps: [string, string][]) => { ps.forEach(([k, v]) => { world.writes.push({ op: 'set', key: k, value: String(v) }); if (world.useKeyed) world.keyed.set(k, String(v)); }); };
S.removeItem = async (k: string) => { world.writes.push({ op: 'remove', key: k }); if (world.useKeyed) world.keyed.delete(k); };
S.multiRemove = async (ks: string[]) => { ks.forEach(k => { world.writes.push({ op: 'remove', key: k }); if (world.useKeyed) world.keyed.delete(k); }); };
S.clear = async () => { world.writes.push({ op: 'clear', key: '*' }); world.keyed.clear(); };
const reset = (raw: string | null) => { world.raw = raw; world.useKeyed = false; world.keyed.clear(); world.writes = []; world.failReads = false; };

const NOW = new Date(Date.UTC(2026, 9, 15, 8));
const short = (s: string | null) => (s == null ? 'null' : s.length > 60 ? s.slice(0, 57) + '...' : s);

// ── 1. storage readers: called with no stored value of the right shape ───────────────────────────────────────────────────────────
interface Reader { name: string; mod: string; fn: string; args?: unknown[]; shape?: 'array' | 'object' | 'objectOrNull' | 'string' | 'number'; allowWrites?: string;
  /** returns the stored records as they are (read-only consumers normalise them): wrong types inside are not drift, see the consumer tests */ rawPassthrough?: boolean }
const READERS: Reader[] = [
  { name: 'loadFD', mod: 'fixedIncomeStorage', fn: 'loadFD', shape: 'array' },
  { name: 'loadCrypto', mod: 'cryptoStorage', fn: 'loadCrypto', shape: 'object' },
  { name: 'loadGold', mod: 'goldStorage', fn: 'loadGold', shape: 'object' },
  { name: 'loadSubscriptions', mod: 'subscriptionsStorage', fn: 'loadSubscriptions', shape: 'array' },
  { name: 'loadRecurring', mod: 'recurringStorage', fn: 'loadRecurring', shape: 'array' },
  { name: 'loadTransactions', mod: 'txnStorage', fn: 'loadTransactions', shape: 'array' },
  { name: 'listImportBatches', mod: 'txnStorage', fn: 'listImportBatches', shape: 'array' },
  { name: 'previewImport', mod: 'txnStorage', fn: 'previewImport', args: [[]], shape: 'object' },
  { name: 'loadRecent', mod: 'fundsStorage', fn: 'loadRecent', shape: 'array' },
  { name: 'loadTray', mod: 'fundsStorage', fn: 'loadTray', shape: 'array' },
  { name: 'loadRawTransactions', mod: 'fundsStorage', fn: 'loadRawTransactions', shape: 'array', rawPassthrough: true },
  { name: 'loadCustomEvents', mod: 'financialCalendarStorage', fn: 'loadCustomEvents', shape: 'array' },
  { name: 'loadAnswers', mod: 'insuranceHubStorage', fn: 'loadAnswers', shape: 'object' },
  { name: 'loadLifeEvents', mod: 'lifeEventsStorage', fn: 'loadLifeEvents', shape: 'array' },
  { name: 'loadLearned', mod: 'learnStorage', fn: 'loadLearned', shape: 'object' },
  { name: 'loadOpened', mod: 'learnStorage', fn: 'loadOpened', shape: 'object' },
  { name: 'loadDismissed', mod: 'nudgesStorage', fn: 'loadDismissed', shape: 'object' },
  { name: 'loadFacts (nudges)', mod: 'nudgesStorage', fn: 'loadFacts', args: [{ incomeMonthly: 0, savingsRate: null, topCategory: null, spentThisMonth: 0, monthlySip: 0 }], shape: 'object' },
  { name: 'loadProfile', mod: 'profileStorage', fn: 'loadProfile', shape: 'object' },
  { name: 'loadSnapshot', mod: 'pulseStorage', fn: 'loadSnapshot', shape: 'objectOrNull' },
  { name: 'loadOnboarding', mod: 'onboardingStorage', fn: 'loadOnboarding', shape: 'object' },
  { name: 'currentProfileValues', mod: 'onboardingStorage', fn: 'currentProfileValues', shape: 'object' },
  { name: 'loadPrefs (reminders)', mod: 'remindersStorage', fn: 'loadPrefs', shape: 'object' },
  { name: 'loadSavedScore', mod: 'moneyScoreStorage', fn: 'loadSavedScore', shape: 'objectOrNull' },
  { name: 'loadScoreHistory', mod: 'moneyScoreStorage', fn: 'loadScoreHistory', shape: 'array' },
  { name: 'gatherScoreData', mod: 'moneyScoreStorage', fn: 'gatherScoreData', shape: 'object' },
  { name: 'loadMemory', mod: 'aryaMemoryStorage', fn: 'loadMemory', shape: 'array' },
  { name: 'loadPrefs (arya)', mod: 'aryaMemoryStorage', fn: 'loadPrefs', shape: 'object' },
  { name: 'loadArFacts', mod: 'aryaFactsStorage', fn: 'loadArFacts', shape: 'object', allowWrites: 'loadAlerts remembers the net worth for the milestone check (same as the alerts screen)' },
  { name: 'loadAlertState', mod: 'alertsStorage', fn: 'loadAlertState', shape: 'object' },
  { name: 'loadTrackerData', mod: 'trackerStorage', fn: 'loadTrackerData', shape: 'object' },
  { name: 'loadCalendarSources', mod: 'calendarStorage', fn: 'loadCalendarSources', shape: 'object' },
  { name: 'loadCouple', mod: 'coupleStorage', fn: 'loadCouple', shape: 'object' },
  { name: 'loadCredit', mod: 'creditScoreStorage', fn: 'loadCredit', shape: 'object' },
  { name: 'loadDebtInputs', mod: 'debtStorage', fn: 'loadDebtInputs', shape: 'object' },
  { name: 'loadDna', mod: 'dnaStorage', fn: 'loadDna', shape: 'objectOrNull' },
  { name: 'loadDnaScores', mod: 'dnaStorage', fn: 'loadDnaScores' },
  { name: 'loadBenchInput', mod: 'benchmarkStorage', fn: 'loadBenchInput', shape: 'object' },
  { name: 'loadForecastInputs', mod: 'forecastStorage', fn: 'loadForecastInputs', shape: 'object' },
  { name: 'loadGoalInputs', mod: 'goalOptimizerStorage', fn: 'loadGoalInputs', shape: 'object' },
  { name: 'loadSimSources', mod: 'growthSimStorage', fn: 'loadSimSources', shape: 'object' },
  { name: 'loadHomeLoanFields', mod: 'homeLoanStorage', fn: 'loadHomeLoanFields', shape: 'object' },
  { name: 'loadItr', mod: 'itrStorage', fn: 'loadItr', shape: 'object' },
  { name: 'loadSuggestions', mod: 'itrStorage', fn: 'loadSuggestions', shape: 'object' },
  { name: 'loadLeakInputs', mod: 'leakStorage', fn: 'loadLeakInputs', shape: 'object' },
  { name: 'loadCoverPrefill', mod: 'lifeCoverStorage', fn: 'loadCoverPrefill', shape: 'object' },
  { name: 'loadPlanner', mod: 'lifeGoalsStorage', fn: 'loadPlanner', args: [NOW], shape: 'object' },
  { name: 'loadPassive', mod: 'passiveStorage', fn: 'loadPassive', shape: 'object' },
  { name: 'loadRebalancer', mod: 'rebalancerStorage', fn: 'loadRebalancer', shape: 'object' },
  { name: 'loadRetirementStore', mod: 'retirementStorage', fn: 'loadRetirementStore', shape: 'object' },
  { name: 'loadSalaryFields', mod: 'salaryStorage', fn: 'loadSalaryFields', shape: 'object' },
  { name: 'loadStepupFields', mod: 'sipStepupStorage', fn: 'loadStepupFields', shape: 'object' },
  { name: 'loadHarvest', mod: 'taxHarvestStorage', fn: 'loadHarvest', args: [NOW], shape: 'object' },
  { name: 'loadPrefill (tax planner)', mod: 'taxPlannerStorage', fn: 'loadPrefill', shape: 'object' },
  { name: 'loadWatchlist', mod: 'watchlistStorage', fn: 'loadWatchlist', shape: 'array' },
  { name: 'loadWindfallContext', mod: 'windfallStorage', fn: 'loadWindfallContext', shape: 'object' },
  { name: 'loadConsents', mod: 'feedbackStorage', fn: 'loadConsents', shape: 'object' },
  { name: 'loadFeedback', mod: 'feedbackStorage', fn: 'loadFeedback', shape: 'array' },
  { name: 'loadUsage', mod: 'feedbackStorage', fn: 'loadUsage', shape: 'object' },
  { name: 'loadCrashes', mod: 'diagnosticsStorage', fn: 'loadCrashes', shape: 'array' },
  { name: 'loadDates', mod: 'holdingDates', fn: 'loadDates', shape: 'object' },
  { name: 'loadLang', mod: 'i18n', fn: 'loadLang' },
  { name: 'readCached', mod: 'marketDataStorage', fn: 'readCached', args: ['quote:TCS'], shape: 'objectOrNull' },
];

const importMod = async (m: string) => import(`@/lib/${m}`);

async function runReader(r: Reader, raw: string | null): Promise<string | null> {
  reset(raw);
  let mod: any;
  try { mod = await importMod(r.mod); } catch (e: any) { return `IMPORT: ${String(e?.message ?? e).slice(0, 100)}`; }
  const fn = mod[r.fn];
  if (typeof fn !== 'function') return `no export ${r.fn}`;
  let out: unknown;
  try { out = await fn(...(r.args ?? [])); } catch (e: any) { return `THROWS ${e?.name}: ${String(e?.message ?? e).slice(0, 120)}`; }
  const bad = r.rawPassthrough ? null : findNonFinite(out);
  if (bad) return `non-finite number in result: ${bad}`;
  if (r.shape === 'array' && !Array.isArray(out)) return `expected an array, got ${typeof out}`;
  if (r.shape === 'object' && (out == null || typeof out !== 'object' || Array.isArray(out))) return `expected an object, got ${out === null ? 'null' : Array.isArray(out) ? 'array' : typeof out}`;
  if (r.shape === 'objectOrNull' && out !== null && (typeof out !== 'object' || Array.isArray(out))) return `expected object|null, got ${Array.isArray(out) ? 'array' : typeof out}`;
  if (!r.allowWrites && world.writes.length) return `WROTE ${world.writes.length} key(s) while only reading: ${world.writes.slice(0, 3).map(w => `${w.op} ${w.key}`).join(', ')}`;
  if (r.allowWrites) {
    // a permitted write must still be valid, never the corrupt text or a stringified NaN
    for (const w of world.writes) if (w.value != null && /NaN|Infinity|undefined/.test(w.value)) return `wrote garbage to ${w.key}: ${short(w.value)}`;
  }
  return null;
}

for (const r of READERS) {
  test(`reader ${r.name} survives every corrupt stored value and writes nothing`, async () => {
    const failures: string[] = [];
    for (const c of rawCorpus()) {
      const f = await runReader(r, c.raw);
      if (f) failures.push(`  [${c.label}] ${f}`);
    }
    // storage that throws on read
    reset(null); world.failReads = true;
    try { const mod: any = await importMod(r.mod); await mod[r.fn](...(r.args ?? [])); } catch (e: any) {
      if (!/^IMPORT/.test(String(e))) failures.push(`  [storage read throws] THROWS ${e?.name}: ${String(e?.message ?? e).slice(0, 100)}`);
    }
    const uniq = [...new Set(failures)];
    assert.equal(uniq.length, 0, `\n${r.name}:\n${uniq.slice(0, 12).join('\n')}${uniq.length > 12 ? `\n  ...and ${uniq.length - 12} more` : ''}`);
  });
}

// ── 2. valid stored data with ONE field damaged at a time ───────────────────────────────────────────────────────────────────────
// The uniform corpus above mostly trips the first type check. This layer starts from realistic, valid records under every JSON key
// the readers use, damages one field (or the whole value) with each wrong type, and runs every reader again.
const INF = '__INF__', NINF = '__NINF__', UNDEF = '__UNDEF__';
const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (x === Infinity ? INF : x === -Infinity ? NINF : x === undefined ? UNDEF : x))
  .replace(new RegExp(`"${INF}"`, 'g'), '1e999').replace(new RegExp(`"${NINF}"`, 'g'), '-1e999');

const SAMPLES: Record<string, unknown> = {
  finos_transactions: [
    { id: 't1', date: '2026-10-02', amount: 450, type: 'expense', category: 'Food & Dining', label: 'Lunch', cat: 'Food & Dining', source: 'mobile' },
    { id: 't2', date: '2026-10-01', amount: 80000, type: 'income', category: 'Income', label: 'Salary', source: 'mobile' },
    { id: 'imp1', type: 'debit', desc: 'UPI SWIGGY', category: 'Food', date: '2026-09-20', amount: 300, src: 'import', batch: 'imp_a' },
  ],
  finos_fd_portfolio: [{ id: 'fd1', type: 'fd', label: 'HDFC FD', bank: 'HDFC', principal: 100000, rate: 7, startDate: '2026-01-01', termMonths: 12, nominee: '', maturityDate: '2027-01-01', maturityValue: 107000 }],
  finos_crypto_portfolio: [{ id: 'c1', symbol: 'BTC', name: 'Bitcoin', quantity: 0.5, avgBuyPrice: 3000000 }],
  finos_crypto_prices: { BTC: 5000000 },
  finos_gold_portfolio: [
    { id: 'g1', type: 'physical', name: 'Chain', grams: 20, purchaseDate: '2024-01-01' },
    { id: 'g2', type: 'sgb', series: 'SGB 2023', units: 5, faceValue: 6000, issueDate: '2023-01-01', purchaseDate: '2023-02-01' },
  ],
  finos_subscriptions: [{ id: 's1', name: 'Netflix', category: 'video', amount: 649, cycle: 'monthly', nextDate: '2026-11-01', split: 1, status: 'active', usefulness: 3, pay: 'upi', note: '' }],
  finos_recurring_v1: [{ id: 'r1', kind: 'expense', amount: 500, category: 'Bills & Utilities', label: 'Rent', day: 5, startDate: '2026-01-01', lastRun: null, active: true }],
  finos_holdings_v1: [{ id: 'h1', type: 'Stock', symbol: 'TCS', name: 'TCS', units: 10, avgPrice: 3500, lastPrice: 3600, priceDate: '2026-10-14', sipMonthly: 0, updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'h2', type: 'MF', symbol: '120503', name: 'Axis Bluechip', units: 100, avgPrice: 50, sipMonthly: 5000, updatedAt: '2026-10-01T00:00:00Z' }],
  finos_goals: [{ id: 'g1', name: 'Car', target: 800000, current: 100000, target_date: '2028-03-01' }],
  finos_insurance_policies: [{ id: 'p1', type: 'health', provider: 'Star', sum_assured: 500000, annual_premium: 12000, renewal_date: '2027-01-15', policy_number: '123', notes: '', added_at: '2026-01-01' },
    { id: 'p2', type: 'life_term', provider: 'LIC', sum_assured: 10000000, annual_premium: 20000, renewal_date: '2027-03-15', policy_number: '', notes: '', added_at: '2026-01-01' }],
  finos_ppf_portfolio: [{ id: 'a1', type: 'ppf', nickname: 'SBI', currentBalance: 100000, annualDeposit: 150000, openDate: '2015-04-01' }],
  finos_budgets: { limits: { 'Food & Dining': 8000, Transport: 3000 }, updatedAt: '2026-10-01T00:00:00Z' },
  finos_sip_portfolio: [{ id: 'sip1', fundName: 'Axis Bluechip', monthlyAmount: 5000, startDate: '2025-01-05', sipDate: 5 }],
  finos_passive_streams: [{ id: 'ps1', type: 'rental', label: 'Flat', monthly: 15000, taxable: true, note: '' }],
  finos_money_score: { inputs: { monthlyIncome: 85000 }, score: 71, band: 'good', pillars: [{ id: 'save', score: 5 }], weakest: { id: 'save', label: 'Saving', score: 5 }, top: { id: 'a', title: 'Do a', gain: 4, href: '/tools/sip', cta: 'Open' }, at: '2026-10-01T00:00:00Z', v: 1 },
  finos_money_score_history: [{ date: '2026-09-01', score: 60 }, { date: '2026-10-01', score: 71 }],
  finos_streak: { count: 4, last: '2026-10-14' },
  finos_session_arya_life_v1: [{ id: 'e1', type: 'marriage', date: '2026-12-01', createdAt: 1760000000000 }],
  finos_calendar_custom_events: [{ id: 'ce1', title: 'Rent due', date: '2026-11-05', amount: 20000, repeat: 'monthly', note: '' }],
  finos_session_arya_memory_v1: [{ id: 'm1', text: 'Prefers index funds', kind: 'preference', source: 'user', createdAt: 1760000000000, updatedAt: 1760000000000, local: false, expiresAt: null }],
  finos_session_arya_prefs_v1: { online: true, figures: true, memory: false, lifeEvents: false, record: true },
  finos_watchlist: [{ id: 'Stock:INFY', type: 'Stock', symbol: 'INFY', name: 'Infosys', addedAt: '2026-10-01T00:00:00Z', refPrice: 1500, lastPrice: 1550, priceDate: '2026-10-14' }],
  finos_funds_recent_v1: [{ code: '120503', name: 'Axis Bluechip', nav: 55.2, navDate: '2026-10-14', seenAt: '2026-10-14T00:00:00Z' }],
  finos_funds_compare_v1: ['120503', '118989'],
  finos_insurance_checks_v1: { p1: { sum_ok: 'yes' } },
  finos_sync_never_couple_v1: { a: { name: 'A', income: 80000, expense: 30000 }, b: { name: 'B', income: 60000, expense: 20000 }, shared: [{ id: 's1', label: 'Rent', amount: 25000, paidBy: 'a' }], goals: [{ id: 'j1', title: 'Trip', target: 100000, current: 20000, targetDate: '2027-06-01', contribA: 5000, contribB: 5000 }] },
  FINOS_CORE_DNA: { responses: { l1: 'a' }, scores: [1, 2, 3] },
  finos_learned_modules: { m1: { completed_at: '2026-10-01T00:00:00Z', attempts: 1, last_visited: '2026-10-02T00:00:00Z' } },
  finos_nudges_dismissed: { n1: '2026-10-10' },
  finos_pulse_snapshot: { at: 1760000000000, netWorth: 100000, debt: 0, sip: 5000, savingsRate: 20, emergencyMonths: 3, policies: 2, goals: 1, moneyScore: 70 },
  finos_holding_dates: { 'Stock:TCS': '2024-05-01' },
  finos_target_alloc: { equity: 60, debt: 20, gold: 10, realestate: 5, crypto: 0, govt: 5 },
  finos_harvest_positions: [{ id: 'x1', name: 'TCS', qty: 10, buy: 3000, cmp: 3600, date: '2025-01-01' }],
  finos_tax_planner_inputs_v1: { income: '1500000', inv_80c: '100000' },
  finos_onboarding_mobile: { v: 1, completed: true, skipped: false, at: 1760000000000 },
  finos_reminders_mobile: { enabled: false, leadDays: 3 },
  finos_consents: { feedback: { granted: true, at: 1760000000000 } },
  finos_feedback_log: [{ id: 'f1', kind: 'rating', at: '2026-10-01T00:00:00Z', value: 4 }],
  finos_usage: { screens: { '/': 3 } },
  finos_diag_crashes: [{ at: 1760000000000, name: 'Error', message: 'x', stack: ['a'] }],
  finos_alerts_state: { dismissed: {}, seen: {} },
};
const SCALARS: Record<string, string> = {
  finos_monthly_income: '85000', finos_monthly_expense: '45000', finos_age: '32', finos_emergency_fund: '200000', finos_gold_price_per_g: '6500',
  finos_user_name: 'Asha', finos_dependents: '1', finos_epf_doj: '2018-06-01', finos_epf_basic: '40000', finos_nps_tier1: '100000', finos_nps_dob: '1994-05-05',
  finos_salary_ctc: '1500000', finos_80c_used: '50000', finos_savings_rate: '25', finos_home_loan: '3000000', finos_home_loan_rate: '8.5', finos_home_loan_emi: '26000',
  finos_leak_monthly: '3000', finos_subscriptions_monthly: '900', finos_portfolio_value: '40000', finos_fd_value: '100000',
};
const baseWorld = (): Map<string, string> => {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(SAMPLES)) m.set(k, ser(v));
  for (const [k, v] of Object.entries(SCALARS)) m.set(k, v);
  return m;
};
/** What each reader's result is fed to (the pure cores the screens call): a wrong value that gets through a reader must not crash or poison these. */
const lib = (m: string) => importMod(m) as Promise<any>;
const CONSUMERS: Record<string, (out: any) => Promise<unknown> | unknown> = {
  loadFD: async o => { const m = await lib('fixedIncome'); return [m.safeTotals(o, NOW), m.upcomingMaturities(o, NOW)]; },
  loadGold: async o => (await lib('gold')).summarize(o.holdings, o.price),
  loadCrypto: async o => (await lib('crypto')).summarize(o.holdings, o.prices),
  loadSubscriptions: async o => (await lib('subscriptions')).summarize(o, '2026-10-15'),
  loadRecurring: async o => { const m = await lib('recurring'); return o.map((r: any) => m.dueEntries(r, NOW, new Set())); },
  loadTransactions: async o => { const m = await lib('budget'); return [m.monthTotals(o, '2026-10'), m.budgetStatus(o, {}, NOW), m.trailing30Spend(o, NOW)]; },
  loadCalendarSources: async o => (await lib('calendar')).collectEvents(o.sources, NOW, 12),
  loadTrackerData: async o => (await lib('trackers')).computeAll(o, NOW),
  loadGoalInputs: async o => (await lib('goalOptimizer')).compute(o.goals, { income: o.income, savingsRate: o.savingsRate }, NOW),
  loadPassive: async o => (await lib('passive')).summarize(o.streams, o.monthlyExp),
  loadWatchlist: async o => (await lib('watchlist')).view(o, '2026-10-15'),
  loadHarvest: async o => (await lib('taxHarvest')).analyse(o.positions, o.ltcg, o.stcg, NOW),
  loadArFacts: async o => (await lib('pulseCards')).buildFeed(o, null),
};

const HEAVY = new Set(['loadArFacts', 'loadFacts (nudges)', 'loadBenchInput', 'gatherScoreData', 'loadTrackerData']);

const VARIANTS: [string, unknown][] = [
  ['null', null], ['"str"', 'str'], ['""', ''], ['123', 123], ['-5', -5], ['Infinity', Infinity],
  ['true', true], ['[]', []], ['{a:1}', { a: 1 }], ['long string', 'y'.repeat(3000)], ['missing', undefined],
];

function* mutate(value: unknown, depth = 0, path: (string | number)[] = []): Generator<{ path: (string | number)[]; set: (root: any, v: unknown) => any }> {
  yield { path, set: (_r, v) => v };
  if (depth >= 3 || value === null || typeof value !== 'object') return;
  const keys: (string | number)[] = Array.isArray(value) ? (value.length ? [0] : []) : Object.keys(value);
  for (const k of keys) {
    for (const sub of mutate((value as any)[k], depth + 1, [...path, k])) {
      yield { path: sub.path, set: (root, v) => { const copy: any = Array.isArray(root) ? [...root] : { ...root }; copy[k] = sub.set(root[k], v); if (copy[k] === undefined && !Array.isArray(copy)) delete copy[k]; return copy; } };
    }
  }
}

const sig = (v: unknown) => (v === null ? 'null' : v === undefined ? 'undefined' : Array.isArray(v) ? 'array' : typeof v);
/** Where the damaged-input result has a different JS type than the valid-input result at the same path (null / absent are fine: "unknown"). */
function drift(base: unknown, mut: unknown, p = '$', depth = 0, budget = { n: 4000 }): string | null {
  if (depth > 7 || budget.n-- < 0) return null;
  const b = sig(base), m = sig(mut);
  if (m === 'null' || m === 'undefined' || b === 'null' || b === 'undefined') return null;
  if (b !== m) return `${p}: ${b} became ${m}`;
  if (b === 'array') {
    const bl = base as unknown[], ml = mut as unknown[];
    if (!bl.length) return null;
    for (let i = 0; i < Math.min(ml.length, 50); i++) { const r = drift(bl[Math.min(i, bl.length - 1)], ml[i], `${p}[]`, depth + 1, budget); if (r) return r; }
    return null;
  }
  if (b === 'object') {
    if (mut instanceof Date || mut instanceof Map || mut instanceof Set) return null;
    for (const k of Object.keys(mut as object)) if (k in (base as object)) { const r = drift((base as any)[k], (mut as any)[k], `${p}.${k}`, depth + 1, budget); if (r) return r; }
  }
  return null;
}

let driftMs = 0;
const symptoms = new Map<string, string[]>();
const note = (reader: string, sym: string, ctx: string) => { const k = `${reader} :: ${sym}`; const a = symptoms.get(k) ?? []; if (a.length < 3) a.push(ctx); symptoms.set(k, a); };

test('baseline: the sample data loads cleanly through every reader', async () => {
  const bad: string[] = [];
  for (const r of READERS) {
    world.raw = null; world.useKeyed = true; world.keyed = baseWorld(); world.writes = []; world.failReads = false;
    const mod: any = await importMod(r.mod);
    try { const out = await mod[r.fn](...(r.args ?? [])); const nf = findNonFinite(out); if (nf) bad.push(`${r.name}: ${nf}`); } catch (e: any) { bad.push(`${r.name}: THROWS ${e?.message}`); }
  }
  assert.deepEqual(bad, []);
  world.useKeyed = false;
});

test('one damaged field at a time in valid stored data: no reader throws, returns NaN/Infinity, or is left holding the damage', async () => {
  const t0 = Date.now();
  let runs = 0;
  const baseline = new Map<string, unknown>();
  for (const r of READERS) {
    world.raw = null; world.useKeyed = true; world.keyed = baseWorld(); world.writes = []; world.failReads = false;
    try { const mod: any = await importMod(r.mod); baseline.set(r.name, await mod[r.fn](...(r.args ?? []))); } catch { /* reported by the baseline test */ }
  }
  for (const [key, sample] of Object.entries(SAMPLES)) {
    if (process.env.FUZZ_PROGRESS) console.log('key', key, ((Date.now() - t0) / 1000).toFixed(1), 'driftMs', Math.round(driftMs));
    const seen = new Set<string>();
    for (const m of mutate(sample)) {
      const pathKey = m.path.map(p => (typeof p === 'number' ? '[]' : p)).join('.');
      if (seen.has(pathKey)) continue;
      seen.add(pathKey);
      for (const [vLabel, v] of VARIANTS) {
        if (v === undefined && m.path.length === 0) continue;
        const damaged = m.set(sample, v);
        const w = baseWorld();
        w.set(key, ser(damaged));
        for (const r of READERS) {
          if (HEAVY.has(r.name) && (runs++ % 20 !== 0)) continue;
          world.raw = null; world.useKeyed = true; world.keyed = new Map(w); world.writes = []; world.failReads = false;
          let mod: any;
          try { mod = await importMod(r.mod); } catch { continue; }
          const ctx = `${key}${pathKey ? '.' + pathKey : ''} = ${vLabel}`;
          try {
            const out = await mod[r.fn](...(r.args ?? []));
            const nf = r.rawPassthrough ? null : findNonFinite(out);
            if (r.rawPassthrough) { /* checked through its consumers */ }
            else if (nf) note(r.name, `non-finite ${nf.replace(/\[\d+\]/g, '[]')}`, ctx);
            else if (baseline.has(r.name)) { const t1 = performance.now(); const d = drift(baseline.get(r.name), out); driftMs += performance.now() - t1; if (d) note(r.name, `type drift ${d}`, ctx); }
            const use = CONSUMERS[r.name];
            if (use) {
              try { const used = await use(out); const bad = findNonFinite(used); if (bad) note(`${r.name} -> consumer`, `non-finite ${bad.replace(/\[\d+\]/g, '[]')}`, ctx); }
              catch (e: any) { note(`${r.name} -> consumer`, `THROWS ${e?.name}: ${String(e?.message ?? e).slice(0, 80)}`, ctx); }
            }
          } catch (e: any) { note(r.name, `THROWS ${e?.name}: ${String(e?.message ?? e).slice(0, 80)}`, ctx); }
          for (const wr of world.writes) if (wr.value != null && /(^|[^a-z])(NaN|Infinity|undefined)([^a-z]|$)/.test(wr.value) && !/^[a-z _-]*$/i.test(wr.value)) note(r.name, `wrote garbage to ${wr.key}`, ctx);
        }
      }
    }
  }
  world.useKeyed = false;
  const lines = [...symptoms.entries()].map(([k, ctx]) => `${k}\n      e.g. ${ctx.join(' | ')}`);
  console.log(`mutation layer: ${runs} heavy-reader slots, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${lines.length} distinct symptoms`);
  assert.equal(lines.length, 0, `\n${lines.slice(0, Number(process.env.FUZZ_MAX ?? 60)).join('\n')}${lines.length > 60 ? `\n...and ${lines.length - 60} more` : ''}`);
});

// ── 3. pure normalisers and backend-response parsers: any value in, no throw, no NaN / Infinity out ───────────────────────────────
// [module, function, extra arguments after the damaged one]. Damaged value is always the FIRST argument.
/** marks where the damaged value goes when it is not the first argument */
const HOLE_AT_1 = Symbol('hole-as-second-argument');
const LENIENT = new Set(['statementImport.undoBatch', 'statementImport.mergeLedger']);   // foreign ledger records are carried through untouched on purpose
const NORMALISERS: [string, string, unknown[]?][] = [
  ['alerts', 'normaliseState'], ['appLock', 'normaliseMeta'], ['appLock', 'normaliseFail'], ['aryaMemoryStorage', 'normalisePrefs'],
  ['aryaMemory', 'normaliseStore'], ['couple', 'normaliseState'], ['diagnostics', 'parseCrashes'], ['diagnostics', 'sanitizeError'], ['dna', 'normalise'],
  ['consents', 'parseConsents'], ['financialCalendar', 'normaliseCustom'], ['feedback', 'parseLog'], ['feedback', 'sanitizeEvent', [NOW]],
  ['funds', 'normaliseRecent'], ['funds', 'normaliseFund'], ['funds', 'parseNavDate'], ['insuranceHub', 'normaliseAnswers'],
  ['learn', 'parseLearned'], ['learn', 'parseOpened'], ['learn', 'learnedCount'], ['lifeEvents', 'normaliseEvents', [Date.now()]], ['lifeEvents', 'cleanDate'],
  ['marketData', 'normaliseQuote'], ['marketData', 'normaliseQuotes', [['TCS', 'INFY']]], ['marketData', 'normaliseFundamentals'], ['marketData', 'normaliseOverview'],
  ['marketData', 'normaliseNews'], ['marketData', 'normaliseCommodities'], ['marketData', 'normaliseFx'], ['marketData', 'normaliseCrypto'], ['marketData', 'normaliseChart'],
  ['marketData', 'normaliseFundNav'], ['marketData', 'normaliseFundSearch'], ['marketData', 'normaliseFundHistory'], ['fundsHistory', 'parseHistory'],
  ['onboarding', 'normalise'], ['passive', 'normalise'], ['nudges', 'normaliseDismissed'], ['subscriptions', 'normalize'], ['subscriptions', 'normalizeAll'],
  ['subscriptions', 'parseISO'], ['subscriptions', 'summarize', ['2026-10-15']], ['budget', 'normalize'], ['budget', 'normalizeAll'], ['reminders', 'normalisePrefs'],
  ['taxHarvest', 'normalisePositions'], ['usage', 'normaliseUsage'], ['usage', 'cleanScreen'], ['watchlist', 'normalise'], ['pulseStorage', 'normaliseSnapshot'],
  ['holdings', 'fromRemote'], ['holdings', 'normaliseHoldings'], ['holdings', 'planSync', [HOLE_AT_1]], ['offerCompare', 'normalize'],
  ['prepayInvest', 'normalize'], ['sipStepup', 'normalise'], ['backup', 'summarise'], ['trackerSync', 'planSync', [{}, {}]],
  ['trackerSync', 'isSyncKey'], ['trackerSyncEngine', 'normaliseMeta'], ['moneyScoreStorage', 'normaliseSaved'], ['moneyScoreStorage', 'normaliseHistory'],
  ['vaultCrypto', 'isEncryptedBackup'], ['safeStore', 'flatRecord'], ['keyShapes', 'shapeProblem', ['{}']],
  ['statementImport', 'parseStatement'], ['statementImport', 'fromAA'], ['statementImport', 'undoBatch', ['b1']], ['statementImport', 'mergeLedger', [[]]],
];

for (const [mod, fn, extra] of NORMALISERS) {
  test(`normaliser ${mod}.${fn} survives every wrong value and returns nothing non-finite`, async () => {
    reset(null);
    let m: any;
    try { m = await importMod(mod); } catch (e: any) { return assert.fail(`cannot import ${mod}: ${e?.message}`); }
    if (typeof m[fn] !== 'function') return assert.fail(`${mod} has no export ${fn}`);
    const failures: string[] = [];
    for (const c of valueCorpus()) {
      try {
        const args = extra?.[0] === HOLE_AT_1 ? [[], c.value, [], '2026-10-15T00:00:00Z'] : [c.value, ...(extra ?? [])];
        const out = await m[fn](...args);
        const bad = LENIENT.has(`${mod}.${fn}`) ? null : findNonFinite(out);
        if (bad) failures.push(`  [${c.label}] non-finite ${bad}`);
      } catch (e: any) { failures.push(`  [${c.label}] THROWS ${e?.name}: ${String(e?.message ?? e).slice(0, 100)}`); }
    }
    const uniq = [...new Set(failures)];
    assert.equal(uniq.length, 0, `\n${mod}.${fn}:\n${uniq.slice(0, 10).join('\n')}${uniq.length > 10 ? `\n  ...and ${uniq.length - 10} more` : ''}`);
  });
}

test('decryptBackup rejects every wrong file with an error, never hangs or returns garbage', async () => {
  const { decryptBackup } = await importMod('vaultCrypto');
  const base = { app: 'FIN-OS', encrypted: 1, kdf: 'PBKDF2-SHA256', iter: 1000, salt: 'AAAA', iv: 'AAAA', ct: 'AAAA', exportedAt: 'x' };
  const files: unknown[] = [null, undefined, 5, 'x', [], {}, { ...base, iter: 1e12 }, { ...base, iter: -1 }, { ...base, iter: NaN }, { ...base, salt: 5 }, { ...base, ct: '!!not base64!!' }, { ...base, iv: '' }, { ...base, kdf: 'md5' }];
  for (const f of files) {
    let r: unknown = 'resolved';
    try { r = await decryptBackup(f, 'a-passphrase'); } catch { r = 'rejected'; }
    assert.equal(r, 'rejected', `file ${JSON.stringify(f)?.slice(0, 80)} was not rejected`);
  }
});

// ── 4. restoring a hostile or damaged backup: refused with a message, nothing changed ───────────────────────────────────────────
function kv(init: Record<string, string> = {}, failSet = false) {
  const m = new Map(Object.entries(init));
  const calls = { set: 0 };
  return { m, calls, getAllKeys: async () => [...m.keys()], multiGet: async (ks: readonly string[]) => ks.map(k => [k, m.get(k) ?? null] as const),
    multiSet: async (p: [string, string][]) => { calls.set++; if (failSet && calls.set === 1) { p.slice(0, 1).forEach(([k, v]) => m.set(k, v)); throw new Error('disk full'); } p.forEach(([k, v]) => m.set(k, v)); },
    multiRemove: async (ks: string[]) => { ks.forEach(k => m.delete(k)); } };
}
const BIG = 'z'.repeat(5_100_000);
const good = { app: 'FIN-OS', schema: 1, exportedAt: '2026-10-01', data: { finos_goals: [{ id: 'g', name: 'Car', target: 1 }], finos_age: 33 } };
const HOSTILE: [string, any][] = [
  ['a list under a key that must be an object', { ...good, data: { ...good.data, finos_budgets: [1, 2] } }],
  ['an object under a key that must be a list', { ...good, data: { ...good.data, finos_transactions: { a: 1 } } }],
  ['text that is not JSON under a list key', { ...good, data: { ...good.data, finos_goals: '{not json' } }],
  ['a number under a list key', { ...good, data: { ...good.data, finos_fd_portfolio: 42 } }],
  ['a value over the size limit', { ...good, data: { ...good.data, finos_notes_blob: BIG } }],
  ['a list over the size limit', { ...good, data: { ...good.data, finos_transactions: [BIG] } }],
  ['an unusable key name', { ...good, data: { ...good.data, ['finos_' + 'x'.repeat(300)]: 'a' } }],
  ['a key with a newline', { ...good, data: { ...good.data, 'finos_a\nb': 'a' } }],
  ['more keys than the app ever writes', { ...good, data: Object.fromEntries(Array.from({ length: 3500 }, (_, i) => [`finos_k${i}`, '1'])) }],
  ['data as a list', { ...good, data: [1, 2] }],
  ['data null', { ...good, data: null }],
  ['not the app', { app: 'other', data: {} }],
  ['a number', 42], ['null', null], ['a string', 'FIN-OS'], ['a list', []],
];
for (const [label, file] of HOSTILE) {
  test(`restore refuses a backup with ${label} and changes nothing`, async () => {
    const store = kv({ finos_age: '30', finos_goals: '[{"id":"mine"}]' });
    const before = JSON.stringify([...store.m]);
    await assert.rejects(restoreBackupFn(file, store, { replace: true }), (e: any) => typeof e?.message === 'string' && /backup|FIN/i.test(e.message));
    assert.equal(JSON.stringify([...store.m]), before, 'storage changed');
    assert.equal(store.calls.set, 0, 'a write was attempted');
  });
}
async function restoreBackupFn(file: unknown, store: any, opts: { replace: boolean }) { return (await importMod('backup')).restoreBackup(file, store, opts); }

test('a restore that fails half-way puts back what was there', async () => {
  const store = kv({ finos_age: '30', finos_goals: '[{"id":"mine"}]' }, true);
  await assert.rejects(restoreBackupFn(good, store, { replace: true }), /undone|could not save/i);
  assert.equal(store.m.get('finos_age'), '30');
  assert.equal(store.m.get('finos_goals'), '[{"id":"mine"}]');
});

test('a good backup still restores', async () => {
  const store = kv({});
  const r = await restoreBackupFn(good, store, { replace: false });
  assert.deepEqual([r.imported, store.m.get('finos_age')], [2, '33']);
});

// ── 5. the cloud sync's received data and its own bookkeeping ──────────────────────────────────────────────────────────────────
test('sync: a cloud value of the wrong kind is not taken, and damaged bookkeeping does not stop sync', async () => {
  const { runSync } = await importMod('trackerSyncEngine');
  for (const meta of ['{"base":"x","conflicts":{"a":1}}', '[1,2]', '"text"', '123', 'null', '{"base":{"finos_goals":5},"conflicts":[null,5,{"key":3}],"lastSyncAt":"x","owner":7}', '{not json']) {
    const local = new Map<string, string>([['finos_tracker_sync_meta', meta], ['finos_goals', '[{"id":"mine","name":"Car","target":5}]']]);
    let stored: Record<string, unknown> | null = { finos_goals: '{"id":"cloud-object-not-list"}', finos_transactions: 'oops', finos_age: '41' };
    const store = { readAll: async () => Object.fromEntries(local), get: async (k: string) => local.get(k) ?? null, set: async (e: Record<string, string>) => { Object.entries(e).forEach(([k, v]) => local.set(k, v)); }, remove: async (ks: string[]) => { ks.forEach(k => local.delete(k)); } };
    const cloud = { fetch: async () => ({ data: stored!, updatedAt: 't1' }), store: async (_u: string, d: Record<string, unknown>) => { stored = d; return 'ok' as const; } };
    const res = await runSync(store, cloud, 'user-1');
    assert.equal(res.ok, true, `meta ${meta}: ${res.error}`);
    assert.equal(local.get('finos_goals'), '[{"id":"mine","name":"Car","target":5}]', 'the local list was replaced by a bad cloud value');
    assert.equal(local.get('finos_age'), '41');
    assert.equal(local.has('finos_transactions'), false);
  }
});

// ── 6. a writer must not replace data it could not read without keeping a copy ──────────────────────────────────────────────────
interface Mutator { name: string; key: string; expect: 'array' | 'object'; run: () => Promise<unknown> }
const fdEntry = () => ({ id: 'fd_n', type: 'fd', label: 'x', bank: '', principal: 1000, rate: 7, startDate: '2026-01-01', termMonths: 12, nominee: '' });
const MUTATORS: Mutator[] = [
  { name: 'addTransaction', key: 'finos_transactions', expect: 'array', run: async () => (await importMod('txnStorage')).addTransaction({ date: '2026-10-01', amount: 5, kind: 'expense', category: 'Other', label: 'x' }) },
  { name: 'importStatementRows', key: 'finos_transactions', expect: 'array', run: async () => (await importMod('txnStorage')).importStatementRows([{ date: '2026-10-01', desc: 'X', type: 'debit', amount: 5 }]) },
  { name: 'addFD', key: 'finos_fd_portfolio', expect: 'array', run: async () => (await importMod('fixedIncomeStorage')).addFD(fdEntry(), NOW) },
  { name: 'addHolding (crypto)', key: 'finos_crypto_portfolio', expect: 'array', run: async () => (await importMod('cryptoStorage')).addHolding({ id: 'c', symbol: 'BTC', name: 'Bitcoin', quantity: 1, avgBuyPrice: 1 }) },
  { name: 'addHolding (gold)', key: 'finos_gold_portfolio', expect: 'array', run: async () => (await importMod('goldStorage')).addHolding({ id: 'g', type: 'physical', name: 'x', grams: 1 }) },
  { name: 'addSubscription', key: 'finos_subscriptions', expect: 'array', run: async () => (await importMod('subscriptionsStorage')).addSubscription({ name: 'Netflix', category: 'video', amount: 100, cycle: 'monthly', nextDate: '2026-11-01', split: 1, status: 'active', usefulness: null, pay: '', note: '' }) },
  { name: 'addRecurring', key: 'finos_recurring_v1', expect: 'array', run: async () => (await importMod('recurringStorage')).addRecurring({ kind: 'expense', amount: 5, category: 'Other', label: 'x', day: 1, startDate: '2026-10-01' }) },
  { name: 'addCustomEvent', key: 'finos_calendar_custom_events', expect: 'array', run: async () => (await importMod('financialCalendarStorage')).addCustomEvent({ title: 'x', date: '2026-11-01', amount: null, repeat: 'none', note: '' }) },
  { name: 'saveAnswer', key: 'finos_insurance_checks_v1', expect: 'object', run: async () => (await importMod('insuranceHubStorage')).saveAnswer('p1', 'c1', 'yes') },
  { name: 'declareLifeEvent', key: 'finos_session_arya_life_v1', expect: 'array', run: async () => (await importMod('lifeEventsStorage')).declareLifeEvent('marriage', '2026-12-01') },
  { name: 'addMemoryNote', key: 'finos_session_arya_memory_v1', expect: 'array', run: async () => (await importMod('aryaMemoryStorage')).addMemoryNote({ text: 'Prefers index funds', kind: 'preference' }) },
  { name: 'rememberFund', key: 'finos_funds_recent_v1', expect: 'array', run: async () => (await importMod('fundsStorage')).rememberFund({ code: '120503', name: 'Axis', house: '', nav: 10, date: '2026-10-01', plan: '', option: '' }, NOW) },
  { name: 'saveTracker (goals)', key: 'finos_goals', expect: 'array', run: async () => (await importMod('trackerStorage')).saveTracker({ goals: [{ id: 'g', name: 'Car', target: 1, current: 0, target_date: null }] }) },
  { name: 'saveTracker (budgets)', key: 'finos_budgets', expect: 'object', run: async () => (await importMod('trackerStorage')).saveTracker({ budgetLimits: { Food: 100 } }) },
];
const UNREADABLE = ['{"id":"mine","amount":5', '"just text"', '123', '{not json at all', '<html>oops</html>'];
for (const m of MUTATORS) {
  test(`writer ${m.name}: an unreadable stored value is kept aside before it is replaced`, async () => {
    const failures: string[] = [];
    for (const raw of UNREADABLE) {
      const shapeOk = m.expect === 'object' ? false : false;     // every sample above is the wrong kind for both list and object keys
      void shapeOk;
      world.raw = null; world.useKeyed = true; world.keyed = new Map([[m.key, raw]]); world.writes = []; world.failReads = false;
      try { await m.run(); } catch (e: any) { failures.push(`  [${raw.slice(0, 20)}] THROWS ${e?.message}`); continue; }
      const kept = [...world.keyed.values()].includes(raw) || [...world.keyed].some(([k, v]) => k.startsWith('finos_sync_never_corrupt_') && v === raw);
      if (!kept) failures.push(`  [${raw.slice(0, 20)}] the unreadable text was overwritten and not kept`);
    }
    world.useKeyed = false;
    assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
  });
}

test('a writer does nothing when storage cannot be read (it must not replace what it could not see)', async () => {
  // saveTracker replaces a list with the value the caller holds (an explicit edit of the whole list), it does not merge into what is stored
  for (const m of MUTATORS.filter(x => !x.name.startsWith('saveTracker'))) {
    world.raw = null; world.useKeyed = true; world.keyed = new Map([[m.key, '[{"id":"mine"}]']]); world.writes = []; world.failReads = true;
    try { await m.run(); } catch { /* a rejection is fine */ }
    const wrote = world.writes.filter(w => w.key === m.key);
    assert.equal(wrote.length, 0, `${m.name} wrote ${m.key} although it could not read it`);
  }
  world.failReads = false; world.useKeyed = false;
});

test('a stored value that IS readable is not copied aside (no leftovers on the normal path)', async () => {
  world.raw = null; world.useKeyed = true; world.keyed = new Map([['finos_goals', '[{"id":"g","name":"Car","target":5}]']]); world.writes = [];
  await (await importMod('trackerStorage')).saveTracker({ goals: [{ id: 'g', name: 'Car', target: 6, current: 0, target_date: null }] });
  assert.equal([...world.keyed.keys()].some(k => k.startsWith('finos_sync_never_corrupt_')), false);
  world.useKeyed = false;
});
