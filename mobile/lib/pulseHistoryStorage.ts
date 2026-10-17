// Storage for the net-worth history (see lib/pulseHistory.ts). Same key and shape as the website.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HISTORY_KEY, normaliseHistory, record, toMap, type NwPoint } from '@/lib/pulseHistory';
import { keepIfUnreadable } from '@/lib/safeStore';

export async function loadNwHistory(): Promise<NwPoint[]> {
  try { return normaliseHistory(await AsyncStorage.getItem(HISTORY_KEY)); } catch { return []; }
}

/** Records today's net worth (when one is known). Returns the history after the write. Never throws. */
export async function recordNetWorth(today: string, value: number | null): Promise<NwPoint[]> {
  const cur = await loadNwHistory();
  const r = record(cur, today, value);
  if (r.changed) {
    try { await keepIfUnreadable(HISTORY_KEY, 'object'); await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(toMap(r.points))); } catch { /* not kept */ }
  }
  return r.points;
}
