// The person's seven-day challenge progress, on the phone. The key starts with `finos_session_`, so tracker sync never uploads it; it is in
// their own export and backup and listed in lib/privacy.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText } from '@/lib/safeStore';
import { EMPTY_CHALLENGES, parseChallenges, pruneStale, type ChallengeState } from '@/lib/reels/challenges';

export const CHALLENGES_KEY = 'finos_session_reels_challenges';

export async function loadChallenges(now: Date = new Date()): Promise<ChallengeState> {
  try { return pruneStale(parseChallenges(await getText(CHALLENGES_KEY)), now); } catch { return { ...EMPTY_CHALLENGES, runs: [] }; }
}
export async function saveChallenges(s: ChallengeState): Promise<void> { try { await AsyncStorage.setItem(CHALLENGES_KEY, JSON.stringify(s)); } catch { /* the progress is just not kept */ } }
/** Forgets every challenge run. Whatever the person did for a task (a subscription cancelled, a limit set) is theirs and stays. */
export async function resetChallenges(): Promise<void> { try { await AsyncStorage.removeItem(CHALLENGES_KEY); } catch { /* ignore */ } }
