// Gathers the facts the nudge rules need from the device, and remembers what was dismissed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { summarize } from '@/lib/subscriptions';
import { collectEvents } from '@/lib/calendar';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { loadPrefs } from '@/lib/remindersStorage';
import { loadDnaScores } from '@/lib/dnaStorage';
import { loadProfile } from '@/lib/profileStorage';
import { completeness } from '@/lib/profile';
import { getText } from '@/lib/safeStore';
import { normaliseDismissed, type Dismissed, type NudgeFacts } from '@/lib/nudges';

const DISMISS_KEY = 'finos_nudges_dismissed';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadFacts(input: { incomeMonthly: number; savingsRate: number | null; topCategory: NudgeFacts['topCategory']; spentThisMonth: number; monthlySip: number }, now = new Date()): Promise<NudgeFacts> {
  const [subsRaw, scoreRaw, prefs, dna, cal, profile] = await Promise.all([
    getText('finos_subscriptions'), getText('finos_money_score'), loadPrefs(), loadDnaScores(), loadCalendarSources().catch(() => null), loadProfile(),
  ]);
  let subs = { monthly: 0, activeCount: 0 };
  try { const s = summarize(JSON.parse(subsRaw ?? '[]'), ymd(now), { income: input.incomeMonthly }); subs = { monthly: s.monthly, activeCount: s.activeCount }; } catch { /* none */ }
  let score: number | null = null;
  try { const m = JSON.parse(scoreRaw ?? 'null'); if (m && m.inputs && typeof m.score === 'number' && Number.isFinite(m.score)) score = m.score; } catch { /* none */ }
  let dueIn7 = 0;
  if (cal) {
    const today = ymd(now), to = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
    dueIn7 = collectEvents(cal.sources, now, 1).filter(e => e.date >= today && e.date <= to).length;
  }
  return {
    moneyScore: score, incomeMonthly: input.incomeMonthly, savingsRate: input.savingsRate, topCategory: input.topCategory, spentThisMonth: input.spentThisMonth,
    subscriptionsMonthly: subs.monthly, subscriptionsCount: subs.activeCount, hasSip: input.monthlySip > 0, remindersEnabled: prefs.enabled, dueIn7, dnaDone: !!dna, profileFilled: completeness(profile),
  };
}

export async function loadDismissed(): Promise<Dismissed> {
  try { return normaliseDismissed(JSON.parse((await AsyncStorage.getItem(DISMISS_KEY)) ?? '{}')); } catch { return {}; }
}
export const saveDismissed = (d: Dismissed) => AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(d));
