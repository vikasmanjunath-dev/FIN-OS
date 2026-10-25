// The person's reel-reminder choices on the phone, and the one function that brings the OS schedule in line with them. Both keys start with
// `finos_session_`, so tracker sync never uploads them; they are in the person's own export and backup and listed in lib/privacy.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText, parseJSON } from '@/lib/safeStore';
import { getLang } from '@/lib/i18n';
import { getPermission } from '@/lib/remindersNative';
import { loadDays, loadWatched } from '@/lib/reelsStorage';
import { loadStats } from '@/lib/reelsStatsStorage';
import { dayKey } from '@/lib/reels/journey';
import { forgivingStreak } from '@/lib/reels/streak';
import { ACT_ALL, LIBRARY, libraryById } from '@/lib/reels/library';
import { loadMoves, loadReelsProfile } from '@/lib/reelsProfileStorage';
import { startedReelIds } from '@/lib/reels/followup';
import { DEFAULT_NOTIFY, FOLLOW_PREFIX, DEFAULT_NUDGE, addMove, followupsOn, normaliseMoves, normaliseNotify, normaliseNudge, pendingMoves, planAll, toLocalIso, type MoveReminder, type NotifyPrefs, type NudgePrefs, type PledgeInput } from '@/lib/reels/reminders';
import { cancelReelNotices, scheduleReelNotices } from '@/lib/reels/reminders-native';
import { rankReelsV2 } from '@/lib/reels/ranker';
import { composeEpisode } from '@/lib/reels/episode';
import { loadSignals } from '@/lib/reels/signals';
import type { L } from '@/lib/reels/types';

export const NUDGE_KEY = 'finos_session_reels_nudge';
export const MOVE_REMINDERS_KEY = 'finos_session_reels_reminders';
export const NOTIFY_KEY = 'finos_session_reels_notify';

export async function loadNudge(): Promise<NudgePrefs> {
  try { const p = parseJSON((await getText(NUDGE_KEY)) ?? null); return p.ok ? normaliseNudge(p.value) : { ...DEFAULT_NUDGE }; } catch { return { ...DEFAULT_NUDGE }; }
}
export async function saveNudge(p: NudgePrefs): Promise<void> { try { await AsyncStorage.setItem(NUDGE_KEY, JSON.stringify(p)); } catch { /* the choice is just not kept */ } }

export async function loadMoveReminders(): Promise<MoveReminder[]> {
  try { const p = parseJSON((await getText(MOVE_REMINDERS_KEY)) ?? null); return p.ok ? normaliseMoves(p.value) : []; } catch { return []; }
}
export async function saveMoveReminders(l: MoveReminder[]): Promise<void> { try { await AsyncStorage.setItem(MOVE_REMINDERS_KEY, JSON.stringify(l)); } catch { /* ignore */ } }


export async function loadNotify(): Promise<NotifyPrefs> {
  try { const p = parseJSON((await getText(NOTIFY_KEY)) ?? null); return p.ok ? normaliseNotify(p.value) : { ...DEFAULT_NOTIFY, fu: {} }; } catch { return { ...DEFAULT_NOTIFY, fu: {} }; }
}
export async function saveNotify(n: NotifyPrefs): Promise<void> { try { await AsyncStorage.setItem(NOTIFY_KEY, JSON.stringify(n)); } catch { /* the choice is just not kept */ } }

/** One at a time. A re-plan reads the choices, thinks, then writes them back; run beside "turn all off" or another re-plan it could write the older choices over the newer, or
 *  schedule notices after they were cancelled. Every function below that reads and then writes the reminder keys goes through this queue. */
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };

/** Keeps one reminder per reel (asking again replaces it). Queued with the re-plan, which also rewrites this list when it forgets reminders that have passed. */
export const addMoveReminder = (m: MoveReminder): Promise<MoveReminder[]> => serial(async () => { const next = addMove(await loadMoveReminders(), m); await saveMoveReminders(next); return next; });

/** "Turn all off": the daily nudge, the follow-ups, the Sunday look-back and every reminder set after a reel; then nothing of the reels' is scheduled. */
export const turnAllReelNoticesOff = (): Promise<void> => serial(turnAllOff);
async function turnAllOff(): Promise<void> {
  const [prefs, n] = await Promise.all([loadNudge(), loadNotify()]);
  await Promise.all([saveNudge({ ...prefs, enabled: false }), saveNotify({ ...n, followups: false, weekly: false }), saveMoveReminders([])]);
  await cancelReelNotices();
}

/** Re-plans from today's data and tells the OS. Cheap; called at start, on returning to the app, and after a choice changes. Idempotent: it cancels
 *  and re-adds only `finosreel-` notices. */
export const syncReelReminders = (now: Date = new Date()): Promise<{ scheduled: number; reason?: string }> => serial(() => syncNow(now));
async function syncNow(now: Date): Promise<{ scheduled: number; reason?: string }> {
  const [prefs, stored, notify0] = await Promise.all([loadNudge(), loadMoveReminders(), loadNotify()]);
  const moves = pendingMoves(stored, now);
  if (moves.length !== stored.length) await saveMoveReminders(moves);       // reminders whose time has passed are forgotten
  // A first nudge or reminder is what turns follow-ups on by default; the choice is remembered even if the nudge is later turned off.
  let notify: NotifyPrefs = notify0.armed || !(prefs.enabled || moves.length > 0) ? notify0 : { ...notify0, armed: true };
  if (notify !== notify0) await saveNotify(notify);
  if (!prefs.enabled && moves.length === 0 && !followupsOn(notify, prefs, moves) && !notify.weekly) { await cancelReelNotices(); return { scheduled: 0, reason: 'off' }; }
  if ((await getPermission()) !== 'granted') return { scheduled: 0, reason: 'no-permission' };
  // The titles the nudge will quote: the lessons the next episode would offer, by their public title (never a personalised one).
  const [watched, days, signals, profile, movesState, stats] = await Promise.all([loadWatched(), loadDays(), loadSignals(now), loadReelsProfile(), loadMoves(), loadStats()]);
  const ranked = rankReelsV2(LIBRARY, { watched, signals, profile, now });
  const titles: L[] = composeEpisode(ranked, 3).picks.map(p => libraryById(p.reel.id)?.title ?? p.reel.title);
  const doneToday = forgivingStreak(days, dayKey(now)).doneToday;
  // Pledges still waiting: tool not started, no reminder set for them, not marked "I know this". Titles are the library's public ones.
  const started = new Set(startedReelIds(movesState)), reminded = new Set(stored.map(m => m.reelId));
  const pledges: PledgeInput[] = [];
  for (const p of profile.pledges ?? []) {
    const reel = libraryById(p.id);
    if (!reel || started.has(p.id) || reminded.has(p.id) || profile.known.includes(p.id)) continue;
    pledges.push({ id: p.id, at: p.at, title: reel.title, href: ACT_ALL[p.id]?.href ?? '/learn/reels' });
  }
  const plan = planAll({ nudge: prefs, notify, moves, pledges, stats, doneToday, strain: signals.strain, titles, lang: getLang() }, now);
  // Remember where each follow-up was placed (so it is sent once, and a moved one stays moved); forget pledges that were removed.
  const live = new Set((profile.pledges ?? []).map(p => p.id));
  const fu: Record<string, string> = {};
  for (const [k, v] of Object.entries(notify.fu)) if (live.has(k)) fu[k] = v;
  for (const n of plan) if (n.kind === 'followup') fu[n.id.slice(FOLLOW_PREFIX.length)] = toLocalIso(n.at);
  if (JSON.stringify(fu) !== JSON.stringify(notify.fu)) { notify = { ...notify, fu }; await saveNotify(notify); }
  return { scheduled: await scheduleReelNotices(plan) };
}

/** "Forget": removes every reel reminder choice (the daily nudge, the follow-ups and Sunday look-back, the reminders set after a reel) and cancels what is scheduled for them (only the reels' own: ids start `finosreel-`). */
export const resetReelReminders = (): Promise<void> => serial(resetNow);
async function resetNow(): Promise<void> {
  try { await AsyncStorage.multiRemove([NUDGE_KEY, MOVE_REMINDERS_KEY, NOTIFY_KEY]); } catch { /* ignore */ }
  await cancelReelNotices();
}
