// On-phone storage for the weekly money review. The key starts with `finos_session_`, so it is never synced; it is in the person's own export and is
// removed by erase (listed in lib/privacy.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText } from '@/lib/safeStore';
import { parseWeekly, type WeeklyNotes } from '@/lib/reels/weeklyReview';

export const REELS_WEEKLY_KEY = 'finos_session_reels_weekly';
export async function loadWeekly(): Promise<WeeklyNotes> { try { return parseWeekly(await getText(REELS_WEEKLY_KEY)); } catch { return {}; } }
export async function saveWeekly(n: WeeklyNotes): Promise<void> { try { await AsyncStorage.setItem(REELS_WEEKLY_KEY, JSON.stringify(n)); } catch { /* a note not kept is only a note */ } }
export async function resetWeekly(): Promise<void> { try { await AsyncStorage.removeItem(REELS_WEEKLY_KEY); } catch { /* ignore */ } }
