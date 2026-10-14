import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeAlerts, normaliseState, pruneState, type Alert, type AlertState } from '@/lib/alerts';
import type { TrackerData, computeAll } from '@/lib/trackers';
import { summarize } from '@/lib/subscriptions';
import { taxDates } from '@/lib/calendar';

const STATE_KEY = 'finos_alerts_state';
const NW_KEY = 'finos_alerts_last_networth';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadAlertState(): Promise<AlertState> {
  try { return normaliseState(JSON.parse((await AsyncStorage.getItem(STATE_KEY)) ?? '{}')); } catch { return {}; }
}
export const saveAlertState = (s: AlertState) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));

/** Works out today's alerts and remembers this net worth for next time's milestone check. */
export async function loadAlerts(data: TrackerData, computed: ReturnType<typeof computeAll>, now = new Date()): Promise<{ alerts: Alert[]; state: AlertState }> {
  const [subsRaw, prevRaw, state] = await Promise.all([AsyncStorage.getItem('finos_subscriptions'), AsyncStorage.getItem(NW_KEY), loadAlertState()]);
  let subscriptions: { name: string; date: string; daysAway: number; cost: number; trial: boolean }[] = [];
  try { subscriptions = summarize(JSON.parse(subsRaw ?? '[]'), ymd(now)).upcoming.map(u => ({ name: u.name, date: u.date, daysAway: u.daysAway, cost: u.cost, trial: u.trial })); } catch { /* none */ }
  const to = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const tax = taxDates(ymd(now), to).map(t => ({ date: t.date, title: t.title }));
  const prev = Number(prevRaw);
  const alerts = computeAlerts({ data, computed, prevNetWorth: prevRaw !== null && Number.isFinite(prev) && prev > 0 ? prev : null, subscriptions, taxDates: tax }, now);
  const nw = computed.netWorth.netWorth;
  if (nw > 0) AsyncStorage.setItem(NW_KEY, String(Math.round(nw))).catch(() => {});
  const pruned = pruneState(state, alerts);
  if (Object.keys(pruned).length !== Object.keys(state).length) saveAlertState(pruned).catch(() => {});
  return { alerts, state: pruned };
}
