// The reels health counters on the phone. The key starts with `finos_session_`, so tracker sync never uploads it; it is in the person's own
// export and backup and listed in lib/privacy.ts. Writes are queued so two counters bumped at once are both kept.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText } from '@/lib/safeStore';
import { EMPTY_STATS, bump, parseStats, type StatField, type StatsState } from '@/lib/reels/stats';

export const STATS_KEY = 'finos_session_reels_stats';
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadStats(): Promise<StatsState> { try { return parseStats(await getText(STATS_KEY)); } catch { return { ...EMPTY_STATS, days: {} }; } }
export async function clearStats(): Promise<void> { try { await AsyncStorage.removeItem(STATS_KEY); } catch { /* ignore */ } }

let queue: Promise<unknown> = Promise.resolve();
/** Counts one more of `field` today. Never throws and never blocks the screen. */
export function recordStat(field: StatField, n = 1, now: Date = new Date()): Promise<void> {
  const run = queue.then(async () => {
    try { await AsyncStorage.setItem(STATS_KEY, JSON.stringify(bump(await loadStats(), dayKey(now), field, n))); } catch { /* a missed count is only a missed count */ }
  });
  queue = run.catch(() => undefined);
  return run as Promise<void>;
}
