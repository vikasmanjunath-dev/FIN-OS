import { useCallback, useMemo, useRef, useState } from 'react';
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
import { startedReelIds } from '@/lib/reels/followup';
import { rankReelsV2 } from '@/lib/reels/ranker';
import { withScrambledQuiz } from '@/lib/reels/quizorder';
import { EMPTY_PROFILE, addKnown, addLess, addPledge, noteBlind, notePoke, noteResurfaced, noteTip, removePledge, toggleSaved, type ReelsProfile } from '@/lib/reels/reelsProfile';
import { checkMilestones, markMilestoneSeen, unseenMilestones } from '@/lib/reels/milestones';
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
  const profRef = useRef<ReelsProfile>(EMPTY_PROFILE);                 // the latest profile, so two quick taps never overwrite each other
  const commit = useCallback((next: ReelsProfile) => { profRef.current = next; setProfile(next); saveReelsProfile(next); }, []);
  const [moves, setMoves] = useState<MovesState>(EMPTY_MOVES);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const now = new Date();
    const [w, d, s, p, mv] = await Promise.all([loadWatched(), loadDays(), loadSignals(now), loadReelsProfile(), loadMoves()]);
    const settled = settleMoves(mv, s.mine, now);              // a move whose figure improved becomes a receipt
    if (JSON.stringify(settled) !== JSON.stringify(mv)) saveMoves(settled);
    const earned = settled.receipts.length - mv.receipts.length;
    if (earned > 0) recordStat('receipts', earned);
    const checked = checkMilestones(p, s.mine);                  // a milestone the figures now show is noticed once and kept
    if (checked !== p) saveReelsProfile(checked);
    profRef.current = checked;
    setWatched(w); setDays(d); setSignals(s); setProfile(checked); setMoves(settled);
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const today = dayKey(new Date());
  const mine = signals.mine;
  const strain = signals.strain, income = signals.income;
  const library = useMemo(() => personalisePlay(personaliseReels(LIBRARY, mine), mine, { strain, income }).map(withScrambledQuiz), [mine, strain, income]);
  const ranked: Ranked[] = useMemo(() => rankReelsV2(library, { watched, signals, profile, now: new Date(), started: startedReelIds(moves) }), [library, watched, signals, profile, moves]);
  const streak = useMemo(() => forgivingStreak(days, today), [days, today]);
  const todays = ranked.find(r => r.why !== 'done') ?? ranked[0];
  const milestones = useMemo(() => unseenMilestones(profile), [profile]);
  const receipts: ReceiptView[] = useMemo(() => unseenReceipts(moves).map(r => ({ receipt: r, ...receiptText(r, mine) })), [moves, mine]);

  /** "I already know this": the reel stops coming up in the episode. */
  const know = useCallback((id: string) => commit(addKnown(profRef.current, id)), [commit]);
  /** "Less of this topic": it ranks lower from now on. */
  const less = useCallback((topic: Topic) => commit(addLess(profRef.current, topic)), [commit]);
  /** An interactive beat was shown: did the person play with it or skip it? Feeds the ranker's format fit. */
  const pokeDone = useCallback((engaged: boolean) => commit(notePoke(profRef.current, engaged)), [commit]);
  /** The weekly blind-spot reel went into today's episode: do not offer another until next week. */
  const markBlind = useCallback((week: string) => commit(noteBlind(profRef.current, week)), [commit]);
  /** A pledged reel was brought back as "Still on your list" in today's episode (`episode.resurfaced`): it is not brought back again for a few days. */
  const markResurfaced = useCallback((id: string) => commit(noteResurfaced(profRef.current, id, new Date())), [commit]);
  /** Keeps a reel to watch later, or lets it go; returns whether it is now kept. */
  const toggleSave = useCallback((id: string): boolean => { const r = toggleSaved(profRef.current, id); commit(r.profile); if (r.kept) recordStat('saves'); return r.kept; }, [commit]);
  /** "I'll do this": the reel's move goes on My moves. Returns false when it was already there. */
  const pledge = useCallback((id: string): boolean => { const next = addPledge(profRef.current, id, new Date()); if (next === profRef.current) return false; commit(next); recordStat('pledges'); return true; }, [commit]);
  const unpledge = useCallback((id: string) => commit(removePledge(profRef.current, id)), [commit]);
  /** A milestone was shown; it will not be shown again. */
  const dismissMilestone = useCallback((id: string) => commit(markMilestoneSeen(profRef.current, id)), [commit]);
  /** The gesture tips were shown once more. */
  const tipShown = useCallback(() => commit(noteTip(profRef.current)), [commit]);
  /** The person tapped a reel's tool: remember the figure it is about so a later improvement can be recognised. */
  const beginMove = useCallback((reelId: string) => { const next = startMove(moves, reelId, mine, new Date()); if (next !== moves) { setMoves(next); saveMoves(next); recordStat('moves'); } }, [moves, mine]);
  const dismissReceipt = useCallback((r: StoredReceipt) => { const next = markSeen(moves, r.id, r.at); setMoves(next); saveMoves(next); }, [moves]);

  return { loaded, library, watched, setWatched, setDays, ranked, todays, signals, profile, receipts, moves, milestones, know, less, pokeDone, markBlind, markResurfaced, toggleSave, pledge, unpledge, dismissMilestone, tipShown, beginMove, dismissReceipt, ...streak, reload };
}
