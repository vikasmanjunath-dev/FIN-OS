// Money Score on the device: what to prefill from, and where the saved result goes.
// Same keys and entry shape as the website (finos_money_score, finos_money_score_history), so a score worked out on the phone
// shows up on the website after a tracker sync, and the other way round.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEY, HKEY, appendHistory, trend } from '@/lib/moneyScore';
import { loadTransactions } from '@/lib/txnStorage';
import { loadTrackerData } from '@/lib/trackerStorage';
import { computeCoverage } from '@/lib/retirement';
import { ymd } from '@/lib/budget';
import { parseJSON, isPlainObject, finite, text, getMany, keepIfUnreadable } from '@/lib/safeStore';

const VERSION = 1;

export interface SavedScore {
  inputs: Record<string, any>;
  score: number;
  band: string;
  pillars: { id: string; score: number }[];
  weakest: { id: string; label: string; score: number } | null;
  top: { id: string; title: string; titleT?: unknown; gain: number; href: string; cta: string } | null;
  at: string;
  v: number;
}
export interface HistoryPoint { date: string; score: number }

/** A stored score made safe to show: a finite score, text where text is shown, nothing taken on trust from the rest. */
/** Score inputs are numbers (plus the one yes/no answer): anything else is dropped, a numeric string becomes a number. */
function numericInputs(o: Record<string, unknown>): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const k of Object.keys(o)) {
    if (k === '__proto__') continue;
    const v = o[k];
    if (k === 'highInterestDebt') { out[k] = v === true; continue; }       // the one yes/no answer
    if (typeof v === 'boolean') continue;
    const n = finite(v, NaN);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function normaliseSaved(raw: unknown): SavedScore | null {
  if (!isPlainObject(raw)) return null;
  const score = finite(raw.score, NaN);
  if (!Number.isFinite(score) || !isPlainObject(raw.inputs)) return null;
  const w = isPlainObject(raw.weakest) ? raw.weakest : null;
  const t = isPlainObject(raw.top) ? raw.top : null;
  return {
    inputs: numericInputs(raw.inputs), score, band: text(raw.band),
    pillars: (Array.isArray(raw.pillars) ? raw.pillars : []).filter(isPlainObject).map(p => ({ id: text(p.id), score: finite(p.score) })),
    weakest: w ? { id: text(w.id), label: text(w.label), score: finite(w.score) } : null,
    top: t ? { id: text(t.id), title: text(t.title), titleT: t.titleT, gain: finite(t.gain), href: text(t.href), cta: text(t.cta) } : null,
    at: text(raw.at), v: finite(raw.v, 1),
  };
}
export function normaliseHistory(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObject).filter(p => typeof p.date === 'string' && Number.isFinite(finite(p.score, NaN))).map(p => ({ date: p.date as string, score: finite(p.score) }));
}

async function readJSON<T>(key: string, fallback: T, shape: (v: unknown) => T): Promise<T> {
  try {
    const p = parseJSON(await AsyncStorage.getItem(key));
    return p.ok ? shape(p.value) : fallback;
  } catch {
    return fallback;
  }
}

export const loadSavedScore = () => readJSON<SavedScore | null>(KEY, null, normaliseSaved);
export const loadScoreHistory = () => readJSON<HistoryPoint[]>(HKEY, [], normaliseHistory);

/** Everything the scorer can prefill from, read from what the person already tracks. */
export async function gatherScoreData() {
  const keys = ['finos_monthly_income', 'finos_age', 'finos_dependents', 'finos_term_insurance', 'finos_emergency_fund',
    'finos_sip_monthly', 'finos_sip_total', 'finos_portfolio_value', 'finos_mf_import_value', 'finos_sip_value',
    'finos_epf_value', 'finos_ppf_value', 'finos_nps_value', 'finos_gold_value', 'finos_leak_monthly', 'finos_monthly_expense'];
  const got = await getMany(keys);
  const n: Record<string, number> = {};
  keys.forEach(k => { const x = Number(got[k] ?? ''); n[k] = got[k] != null && got[k] !== '' && Number.isFinite(x) ? x : 0; });

  const [txns, tracked] = await Promise.all([loadTransactions(), loadTrackerData()]);
  // Cover the person has written down in the insurance tracker; the website only has a single "term insurance" number.
  const cov = computeCoverage(tracked.policies, n.finos_monthly_income || 0, n.finos_age);

  return {
    data: {
      income: n.finos_monthly_income, age: n.finos_age, dependents: n.finos_dependents,
      termCover: n.finos_term_insurance || cov.totalLife,
      emergencyFund: n.finos_emergency_fund,
      sipMonthly: n.finos_sip_monthly || n.finos_sip_total,
      txns, now: new Date(),
      values: {
        portfolio: n.finos_portfolio_value, mfImport: n.finos_mf_import_value, sip: n.finos_sip_value,
        epf: n.finos_epf_value, ppf: n.finos_ppf_value, nps: n.finos_nps_value, gold: n.finos_gold_value,
      },
    },
    healthCover: cov.totalHealth,
    budgetExpense: n.finos_monthly_expense,
    leakMonthly: n.finos_leak_monthly,
  };
}

/** Save a computed result (compute() output with ok === true) and extend the history. Returns the saved entry. */
export async function saveScoreResult(result: any, now = new Date()): Promise<{ entry: SavedScore; history: HistoryPoint[] }> {
  const weakest = result.pillars.slice().sort((a: any, b: any) => a.score - b.score)[0];
  const top = result.actions[0];
  const entry: SavedScore = {
    inputs: result.inputs, score: result.score, band: result.band.id,
    pillars: result.pillars.map((p: any) => ({ id: p.id, score: p.score })),
    weakest: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score } : null,
    top: top ? { id: top.id, title: top.title, titleT: top.titleT ?? null, gain: top.gain, href: top.href, cta: top.cta } : null,
    at: now.toISOString(), v: VERSION,
  };
  const history = appendHistory(await loadScoreHistory(), { date: ymd(now), score: result.score });
  await keepIfUnreadable(KEY, 'object');
  await keepIfUnreadable(HKEY, 'array');
  await AsyncStorage.multiSet([[KEY, JSON.stringify(entry)], [HKEY, JSON.stringify(history)]]);

  // Seed keys other screens read, but never overwrite what the person entered there (same rule as the website).
  const i = result.inputs;
  const seed: [string, number][] = [
    ['finos_monthly_income', i.monthlyIncome], ['finos_monthly_expense', i.monthlyExpenses],
    ['finos_emergency_fund', i.liquidSavings], ['finos_sip_monthly', i.monthlyInvesting],
  ];
  const have = await AsyncStorage.multiGet(seed.map(s => s[0]));
  const toWrite = seed.filter(([k, v], idx) => !(Number(have[idx][1]) > 0) && v > 0).map(([k, v]) => [k, String(v)] as [string, string]);
  if (toWrite.length) await AsyncStorage.multiSet(toWrite);
  return { entry, history };
}

export { trend };
