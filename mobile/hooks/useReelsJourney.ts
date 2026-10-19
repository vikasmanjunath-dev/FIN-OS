import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { LIBRARY } from '@/lib/reels/library';
import { dayKey, type Ranked, type Watched } from '@/lib/reels/journey';
import { forgivingStreak } from '@/lib/reels/streak';
import { loadDays, loadWatched } from '@/lib/reelsStorage';
import { loadMoves, loadReelsProfile, saveMoves, saveReelsProfile } from '@/lib/reelsProfileStorage';
import { loadSignals, deriveSignals, type Signals } from '@/lib/reels/signals';
import { personaliseReels } from '@/lib/reels/personal';
import { recordStat } from '@/lib/reelsStatsStorage';
import { personalisePlay } from '@/lib/reels/personal-play';
import { rankReelsV2 } from '@/lib/reels/ranker';
import { EMPTY_PROFILE, addKnown, addLess, noteBlind, notePoke, type ReelsProfile } from '@/lib/reels/reelsProfile';
import { EMPTY_MOVES, markSeen, receiptText, settleMoves, startMove, unseenReceipts, type MovesState, type StoredReceipt } from '@/lib/reels/moves';
import type { L, Topic } from '@/lib/reels/types';

export interface ReceiptView { receipt: StoredReceipt; title: L; body: L }

/** What the reels feed and the Home card need: the personalised order, today's reel, the streak, the person's own steering ("I know this",
 *  "less of this") and any receipts for moves they started. Reloads whenever the screen is focused. */
export function useReelsJourney() {
  const [watched, setWatched] = useState<Watched>({});
  const [days, setDays] = useState<string[]>([]);
  const [signals, setSignals] = useState<Signals>(() => deriveSignals({ now: new Date() }));
  const [profile, setProfile] = useState<ReelsProfile>(EMPTY_PROFILE);
  const [moves, setMoves] = useState<MovesState>(EMPTY_MOVES);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const now = new Date();
    const [w, d, s, p, mv] = await Promise.all([loadWatched(), loadDays(), loadSignals(now), loadReelsProfile(), loadMoves()]);
    const settled = settleMoves(mv, s.mine, now);              // a move whose figure improved becomes a receipt
    if (JSON.stringify(settled) !== JSON.stringify(mv)) saveMoves(settled);
    const earned = settled.receipts.length - mv.receipts.length;
    if (earned > 0) recordStat('receipts', earned);
    setWatched(w); setDays(d); setSignals(s); setProfile(p); setMoves(settled);
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const today = dayKey(new Date());
  const mine = signals.mine;
  const library = useMemo(() => personalisePlay(personaliseReels(LIBRARY, mine), mine), [mine]);
  const ranked: Ranked[] = useMemo(() => rankReelsV2(library, { watched, signals, profile, now: new Date() }), [library, watched, signals, profile]);
  const streak = useMemo(() => forgivingStreak(days, today), [days, today]);
  const todays = ranked.find(r => r.why !== 'done') ?? ranked[0];
  const receipts: ReceiptView[] = useMemo(() => unseenReceipts(moves).map(r => ({ receipt: r, ...receiptText(r, mine) })), [moves, mine]);

  /** "I already know this": the reel stops coming up in the episode. */
  const know = useCallback((id: string) => { const next = addKnown(profile, id); setProfile(next); saveReelsProfile(next); }, [profile]);
  /** "Less of this topic": it ranks lower from now on. */
  const less = useCallback((topic: Topic) => { const next = addLess(profile, topic); setProfile(next); saveReelsProfile(next); }, [profile]);
  /** An interactive beat was shown: did the person play with it or skip it? Feeds the ranker's format fit. */
  const pokeDone = useCallback((engaged: boolean) => { const next = notePoke(profile, engaged); setProfile(next); saveReelsProfile(next); }, [profile]);
  /** The weekly blind-spot reel went into today's episode: do not offer another until next week. */
  const markBlind = useCallback((week: string) => { const next = noteBlind(profile, week); setProfile(next); saveReelsProfile(next); }, [profile]);
  /** The person tapped a reel's tool: remember the figure it is about so a later improvement can be recognised. */
  const beginMove = useCallback((reelId: string) => { const next = startMove(moves, reelId, mine, new Date()); if (next !== moves) { setMoves(next); saveMoves(next); recordStat('moves'); } }, [moves, mine]);
  const dismissReceipt = useCallback((r: StoredReceipt) => { const next = markSeen(moves, r.id, r.at); setMoves(next); saveMoves(next); }, [moves]);

  return { loaded, library, watched, setWatched, setDays, ranked, todays, signals, profile, receipts, know, less, pokeDone, markBlind, beginMove, dismissReceipt, ...streak, reload };
}
