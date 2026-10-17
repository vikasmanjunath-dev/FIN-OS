// Reads everything the PULSE feed, Arya's local tools and the life-event rules need, from the phone, into one ArFacts bundle.
// Read-only apart from what loadAlerts already does (it remembers the net worth for the next milestone check, exactly as the
// alerts screen does). Every source is optional: a missing or corrupt one leaves its fact empty, never defaulted.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTrackerData } from '@/lib/trackerStorage';
import { computeAll } from '@/lib/trackers';
import { loadProfile } from '@/lib/profileStorage';
import { loadSavedScore, loadScoreHistory } from '@/lib/moneyScoreStorage';
import { summarize } from '@/lib/subscriptions';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { collectEvents, isoDate } from '@/lib/calendar';
import { loadDebtInputs } from '@/lib/debtStorage';
import { LOAN_TYPES } from '@/lib/debt';
import { PLANNER_KEY } from '@/lib/taxPlannerStorage';
import { RETIRE_KEYS } from '@/lib/retirementPlan';
import { loadAlerts } from '@/lib/alertsStorage';
import { visibleAlerts } from '@/lib/alerts';
import { computeNudges, visible } from '@/lib/nudges';
import { loadFacts as loadNudgeFacts, loadDismissed } from '@/lib/nudgesStorage';
import { loadNwHistory } from '@/lib/pulseHistoryStorage';
import { makeFacts, type ArFacts, type LoanFact, type MoneyScoreLite } from '@/lib/aryaFacts';

const digits = (s: string) => { const t = String(s ?? '').replace(/[^\d]/g, '').slice(0, 9); return t === '' ? null : Number(t); };

async function safe<T>(p: () => Promise<T>, fallback: T): Promise<T> { try { return await p(); } catch { return fallback; } }

export async function loadArFacts(now: Date = new Date()): Promise<ArFacts> {
  const data = await loadTrackerData();
  const computed = computeAll(data, now);
  const today = isoDate(now);

  const [profile, saved, history, subsRaw, cal, debt, plannerRaw, retireRaw, alertPack, dismissed, nwHistory] = await Promise.all([
    safe(loadProfile, { name: '', age: '', income: '', dependents: '' }),
    safe(loadSavedScore, null),
    safe(loadScoreHistory, []),
    safe(() => AsyncStorage.getItem('finos_subscriptions'), null),
    safe(loadCalendarSources, null),
    safe(loadDebtInputs, null),
    safe(() => AsyncStorage.getItem(PLANNER_KEY), null),
    safe(() => AsyncStorage.multiGet([...RETIRE_KEYS]), [] as readonly [string, string | null][]),
    safe(() => loadAlerts(data, computed, now), null),
    safe(loadDismissed, {}),
    safe(loadNwHistory, []),
  ]);

  let moneyScore: MoneyScoreLite | null = null;
  if (saved && typeof saved.score === 'number' && saved.inputs) {
    moneyScore = {
      score: saved.score, band: String(saved.band ?? ''),
      weakestLabel: saved.weakest?.label ?? null, weakestScore: saved.weakest?.score ?? null,
      topTitle: saved.top?.title ?? null, topHref: saved.top?.href ?? null, at: saved.at ?? null,
    };
  }

  let subs = null;
  try { subs = summarize(JSON.parse(subsRaw ?? '[]'), today, { income: computed.budget.income }); } catch { /* none */ }

  let events: ArFacts['events'] = [];
  try { if (cal) events = collectEvents(cal.sources, now, 12); } catch { /* none */ }

  const loans: LoanFact[] = [];
  if (debt) {
    for (const t of LOAN_TYPES) {
      const l = debt[t.key];
      const balance = parseFloat(l.balance), rate = parseFloat(l.rate), emi = parseFloat(l.emi);
      if (balance > 0 || emi > 0) loans.push({ key: t.key, label: t.label, balance: balance > 0 ? balance : 0, rate: rate > 0 ? rate : 0, emi: emi > 0 ? emi : 0 });
    }
  }

  let taxInputs = { income: '', used80c: '', usedHealth: '', usedNps: '' };
  try {
    const p = JSON.parse(plannerRaw ?? 'null');
    if (p && typeof p === 'object') taxInputs = { income: String(p.income ?? ''), used80c: String(p.inv_80c ?? ''), usedHealth: String(p.health_self ?? ''), usedNps: String(p.nps_self ?? '') };
  } catch { /* none */ }

  const retirementStore: Record<string, string> = {};
  for (const [k, v] of retireRaw) if (v != null && v !== '') retirementStore[k] = v;

  const alerts = alertPack ? visibleAlerts(alertPack.alerts, alertPack.state) : [];

  const base = makeFacts({
    now, data, dependents: digits(profile.dependents), moneyScore, scoreHistory: history, subs, events, taxInputs, loans, alerts, retirementStore, nwHistory,
  });

  // Nudges are worked out from the same facts the home screen uses.
  let nudges = base.nudges;
  try {
    const month = base.computed.spending.month;
    const byCat: Record<string, number> = {};
    for (const t of data.transactions) if (t.kind === 'expense' && t.date.slice(0, 7) === month) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    const best = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const nf = await loadNudgeFacts({
      incomeMonthly: base.computed.budget.income, savingsRate: base.computed.budget.known ? base.computed.budget.savingsRate : null,
      topCategory: best ? { name: best[0], spent: best[1] } : null, spentThisMonth: base.computed.spending.totals.spent, monthlySip: data.monthlySip,
    }, now);
    nudges = visible(computeNudges(nf), dismissed, today, 5);
  } catch { /* none */ }

  return { ...base, nudges };
}
