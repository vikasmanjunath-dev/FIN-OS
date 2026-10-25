// The storage side of the Control and transparency screen: load everything the reels keep, and forget one part (or all of it). Every reset only
// removes the reels' own memory, in the keys listed in lib/reels/transparency.ts (PART_KEYS); the person's trackers are never written to.
import { loadReelsProfile, loadMoves, resetMoves, resetReelsProfile, updateReelsProfile } from '@/lib/reelsProfileStorage';
import { clearStats, loadStats } from '@/lib/reelsStatsStorage';
import { loadChallenges, resetChallenges } from '@/lib/reelsChallengesStorage';
import { loadMoveReminders, loadNotify, loadNudge, resetReelReminders, syncReelReminders } from '@/lib/reelRemindersStorage';
import { loadDays, loadWatched, resetWatched } from '@/lib/reelsStorage';
import { loadVoicePrefs, resetVoicePrefs } from '@/lib/reels/voicePrefsStorage';
import { loadMine } from '@/lib/reels/mine';
import { forgetHousekeeping, forgetKnown, forgetLess, forgetMilestones, forgetPlay, forgetPledges, forgetSaved, forgetStart } from '@/lib/reels/reelsProfile';
import { PART_IDS, type PartId, type ReelsKnowledge } from '@/lib/reels/transparency';

export async function loadKnowledge(now: Date = new Date()): Promise<ReelsKnowledge> {
  const [profile, moves, stats, challenges, watched, days, nudge, notify, moveReminders, voice, mine] = await Promise.all([
    loadReelsProfile(), loadMoves(), loadStats(), loadChallenges(now), loadWatched(), loadDays(), loadNudge(), loadNotify(), loadMoveReminders(), loadVoicePrefs(), loadMine(),
  ]);
  return { profile, moves, stats, challenges, watched, days, nudge, notify, moveReminders, voice, mine };
}

const RESET: Record<PartId, () => Promise<unknown>> = {
  known: () => updateReelsProfile(forgetKnown),
  less: () => updateReelsProfile(forgetLess),
  saved: () => updateReelsProfile(forgetSaved),
  pledges: () => updateReelsProfile(forgetPledges),
  milestones: () => updateReelsProfile(forgetMilestones),
  play: () => updateReelsProfile(forgetPlay),
  housekeeping: () => updateReelsProfile(forgetHousekeeping),
  welcome: () => updateReelsProfile(forgetStart),
  moves: resetMoves,
  watched: resetWatched,
  stats: clearStats,
  challenges: resetChallenges,
  reminders: resetReelReminders,
  voice: resetVoicePrefs,
};

const REPLAN_AFTER: PartId[] = ['pledges', 'known', 'moves'];

/** Forgets one part. Never throws; the other parts are left as they were. */
export async function resetPart(id: PartId): Promise<void> {
  try { await RESET[id](); } catch { /* the storage helpers already swallow their own failures */ }
  // What a scheduled follow-up depends on just went: re-plan, so a notice for a forgotten pledge or a move no longer being watched is not delivered.
  if (REPLAN_AFTER.includes(id)) await syncReelReminders().catch(() => {});
}

/** Forgets every part, including the whole profile record, so nothing of it is left behind. */
export async function resetAllReels(): Promise<void> {
  for (const id of PART_IDS) await resetPart(id);
  await resetReelsProfile();
}
