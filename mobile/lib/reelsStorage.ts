// Which reels have been watched and whether the quiz was answered right. Treated like the lesson ticks it sits beside: kept on the phone, and
// synced with the other tracker data only if the person signs in (listed in lib/privacy.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText, parseJSON, isPlainObject } from '@/lib/safeStore';
import { cleanDays, dayKey, type Watched } from '@/lib/reels/journey';
export type { Watched };

export const REELS_KEY = 'finos_reels_watched';

export function parseWatched(raw: string | null | undefined): Watched {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value)) return {};
  const out: Watched = {};
  for (const [id, v] of Object.entries(p.value as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !isPlainObject(v)) continue;
    const r = v as { at?: unknown; correct?: unknown };
    if (typeof r.at === 'string' && r.at.length <= 40) out[id] = { at: r.at, correct: r.correct === true };
  }
  return out;
}

export async function loadWatched(): Promise<Watched> { try { return parseWatched(await getText(REELS_KEY)); } catch { return {}; } }

/** One write at a time. Both records are read, changed and written back, so two finishing at once (or a reel and its day) would otherwise keep only the later write. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const run = queue.then(fn, fn); queue = run.catch(() => undefined); return run; };

/** Records a finished reel. A right answer is never turned back into a wrong one by watching again. */
export const recordWatched = (id: string, correct: boolean, now: Date = new Date()): Promise<Watched> => serial(async () => {
  const all = await loadWatched();
  all[id] = { at: now.toISOString(), correct: correct || all[id]?.correct === true };
  try { await AsyncStorage.setItem(REELS_KEY, JSON.stringify(all)); } catch { /* the tick is only a convenience */ }
  await addDay(now);
  return all;
});

/** The days a reel was finished, for the streak. Only dates are kept. */
export const REELS_DAYS_KEY = 'finos_reels_days';
export function parseDays(raw: string | null | undefined): string[] { const p = parseJSON(raw ?? null); return p.ok ? cleanDays(p.value) : []; }
export async function loadDays(): Promise<string[]> { try { return parseDays(await getText(REELS_DAYS_KEY)); } catch { return []; } }
export const recordDay = (now: Date = new Date()): Promise<string[]> => serial(() => addDay(now));
/** The unqueued step: always called from inside `serial`, so `recordWatched` can add its day without waiting behind itself. */
async function addDay(now: Date): Promise<string[]> {
  const days = cleanDays([...(await loadDays()), dayKey(now)]);
  try { await AsyncStorage.setItem(REELS_DAYS_KEY, JSON.stringify(days)); } catch { /* the streak is only a convenience */ }
  return days;
}

/** Forgets which reels were watched and the days they were finished (so the streak starts again). */
export const resetWatched = (): Promise<void> => serial(async () => { try { await AsyncStorage.multiRemove([REELS_KEY, REELS_DAYS_KEY]); } catch { /* ignore */ } });
