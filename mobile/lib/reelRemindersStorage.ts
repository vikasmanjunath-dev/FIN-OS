// The person's reel-reminder choices on the phone, and the one function that brings the OS schedule in line with them. Both keys start with
// `finos_session_`, so tracker sync never uploads them; they are in the person's own export and backup and listed in lib/privacy.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText, parseJSON } from '@/lib/safeStore';
import { getLang } from '@/lib/i18n';
import { getPermission } from '@/lib/remindersNative';
import { loadDays, loadWatched } from '@/lib/reelsStorage';
import { dayKey } from '@/lib/reels/journey';
import { forgivingStreak } from '@/lib/reels/streak';
import { LIBRARY, libraryById } from '@/lib/reels/library';
import { loadReelsProfile } from '@/lib/reelsProfileStorage';
import { DEFAULT_NUDGE, addMove, normaliseMoves, normaliseNudge, pendingMoves, planAll, type MoveReminder, type NudgePrefs } from '@/lib/reels/reminders';
import { cancelReelNotices, scheduleReelNotices } from '@/lib/reels/reminders-native';
import { rankReelsV2 } from '@/lib/reels/ranker';
import { composeEpisode } from '@/lib/reels/episode';
import { loadSignals } from '@/lib/reels/signals';
import type { L } from '@/lib/reels/types';

export const NUDGE_KEY = 'finos_session_reels_nudge';
export const MOVE_REMINDERS_KEY = 'finos_session_reels_reminders';

export async function loadNudge(): Promise<NudgePrefs> {
  try { const p = parseJSON((await getText(NUDGE_KEY)) ?? null); return p.ok ? normaliseNudge(p.value) : { ...DEFAULT_NUDGE }; } catch { return { ...DEFAULT_NUDGE }; }
}
export async function saveNudge(p: NudgePrefs): Promise<void> { try { await AsyncStorage.setItem(NUDGE_KEY, JSON.stringify(p)); } catch { /* the choice is just not kept */ } }

export async function loadMoveReminders(): Promise<MoveReminder[]> {
  try { const p = parseJSON((await getText(MOVE_REMINDERS_KEY)) ?? null); return p.ok ? normaliseMoves(p.value) : []; } catch { return []; }
}
export async function saveMoveReminders(l: MoveReminder[]): Promise<void> { try { await AsyncStorage.setItem(MOVE_REMINDERS_KEY, JSON.stringify(l)); } catch { /* ignore */ } }
export async function addMoveReminder(m: MoveReminder): Promise<MoveReminder[]> { const next = addMove(await loadMoveReminders(), m); await saveMoveReminders(next); return next; }

/** Re-plans from today's data and tells the OS. Cheap; called at start, on returning to the app, and after a choice changes. */
export async function syncReelReminders(now: Date = new Date()): Promise<{ scheduled: number; reason?: string }> {
  const [prefs, stored] = await Promise.all([loadNudge(), loadMoveReminders()]);
  const moves = pendingMoves(stored, now);
  if (moves.length !== stored.length) await saveMoveReminders(moves);       // reminders whose time has passed are forgotten
  if (!prefs.enabled && moves.length === 0) { await cancelReelNotices(); return { scheduled: 0, reason: 'off' }; }
  if ((await getPermission()) !== 'granted') return { scheduled: 0, reason: 'no-permission' };
  // The titles the nudge will quote: the lessons the next episode would offer, by their public title (never a personalised one).
  const [watched, days, signals, profile] = await Promise.all([loadWatched(), loadDays(), loadSignals(now), loadReelsProfile()]);
  const ranked = rankReelsV2(LIBRARY, { watched, signals, profile, now });
  const titles: L[] = composeEpisode(ranked, 3).picks.map(p => libraryById(p.reel.id)?.title ?? p.reel.title);
  const doneToday = forgivingStreak(days, dayKey(now)).doneToday;
  return { scheduled: await scheduleReelNotices(planAll(prefs, moves, now, doneToday, titles, getLang())) };
}
