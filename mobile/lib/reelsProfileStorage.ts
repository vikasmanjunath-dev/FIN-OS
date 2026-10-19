// On-phone storage for what the reels ranker learns about the person: "I know this" and "less of this" (the reels profile), and the moves they
// started with the reels' tools (with any receipts). Both keys start with `finos_session_`, so tracker sync never uploads them; they are in
// the person's own export and backup, listed in lib/privacy.ts, and removed by erase.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getText } from '@/lib/safeStore';
import { EMPTY_PROFILE, parseReelsProfile, type ReelsProfile } from '@/lib/reels/reelsProfile';
import { EMPTY_MOVES, parseMoves, type MovesState } from '@/lib/reels/moves';

export const REELS_PROFILE_KEY = 'finos_session_reels_profile';
export const REELS_MOVES_KEY = 'finos_session_reels_moves';

export async function loadReelsProfile(): Promise<ReelsProfile> { try { return parseReelsProfile(await getText(REELS_PROFILE_KEY)); } catch { return { ...EMPTY_PROFILE, known: [], less: {} }; } }
export async function saveReelsProfile(p: ReelsProfile): Promise<void> { try { await AsyncStorage.setItem(REELS_PROFILE_KEY, JSON.stringify(p)); } catch { /* the ranker just forgets */ } }
export async function resetReelsProfile(): Promise<void> { try { await AsyncStorage.removeItem(REELS_PROFILE_KEY); } catch { /* ignore */ } }

export async function loadMoves(): Promise<MovesState> { try { return parseMoves(await getText(REELS_MOVES_KEY)); } catch { return { ...EMPTY_MOVES, open: [], receipts: [] }; } }
export async function saveMoves(s: MovesState): Promise<void> { try { await AsyncStorage.setItem(REELS_MOVES_KEY, JSON.stringify(s)); } catch { /* a receipt not kept is only a missed congratulation */ } }
