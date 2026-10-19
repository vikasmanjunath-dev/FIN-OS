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

/** Records a finished reel. A right answer is never turned back into a wrong one by watching again. */
export async function recordWatched(id: string, correct: boolean, now: Date = new Date()): Promise<Watched> {
  const all = await loadWatched();
  all[id] = { at: now.toISOString(), correct: correct || all[id]?.correct === true };
  try { await AsyncStorage.setItem(REELS_KEY, JSON.stringify(all)); } catch { /* the tick is only a convenience */ }
  await recordDay(now);
  return all;
}

/** The days a reel was finished, for the streak. Only dates are kept. */
export const REELS_DAYS_KEY = 'finos_reels_days';
export function parseDays(raw: string | null | undefined): string[] { const p = parseJSON(raw ?? null); return p.ok ? cleanDays(p.value) : []; }
export async function loadDays(): Promise<string[]> { try { return parseDays(await getText(REELS_DAYS_KEY)); } catch { return []; } }
export async function recordDay(now: Date = new Date()): Promise<string[]> {
  const days = cleanDays([...(await loadDays()), dayKey(now)]);
  try { await AsyncStorage.setItem(REELS_DAYS_KEY, JSON.stringify(days)); } catch { /* the streak is only a convenience */ }
  return days;
}
