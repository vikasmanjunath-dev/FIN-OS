import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useLang } from '@/lib/i18n';
import { loadReelsProfile } from '@/lib/reelsProfileStorage';
import { loadWatched } from '@/lib/reelsStorage';
import { chipLabels, reelFor, reelRoute } from '@/lib/reels/aryaLink';
import { loadSignals, type Signals } from '@/lib/reels/signals';
import type { ReelsProfile } from '@/lib/reels/reelsProfile';
import type { Watched } from '@/lib/reels/journey';
import type { Reel } from '@/lib/reels/types';
import { Colors } from '@/constants/theme';

interface Snapshot { at: number; signals: Signals; profile: ReelsProfile; watched: Watched }
let cached: Snapshot | null = null;
const FRESH_MS = 15_000;

/** What the reels know about the person, read from this phone and kept for a few seconds so a long chat does not read storage for every answer. */
async function snapshot(): Promise<Snapshot> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached;
  const [signals, profile, watched] = await Promise.all([loadSignals(new Date()), loadReelsProfile(), loadWatched()]);
  cached = { at: Date.now(), signals, profile, watched };
  return cached;
}

/**
 * One small chip under an Arya answer: "Watch a 30-second reel on this". It appears only when lib/reels/aryaLink.ts finds a reel that clearly
 * explains the question and the answer was not flagged; otherwise it renders nothing. Everything is decided on the phone.
 */
export function AryaReelChip({ question, answer }: { question: string; answer: string }) {
  const lang = useLang();
  const [reel, setReel] = useState<Reel | null>(null);
  useEffect(() => {
    let live = true;
    snapshot().then(s => { if (live) setReel(reelFor(question, s.signals, s.profile, { watched: s.watched, answer })); }).catch(() => {});
    return () => { live = false; };
  }, [question, answer]);
  const route = reel ? reelRoute(reel.id) : null;
  if (!reel || !route) return null;
  const { text, a11y } = chipLabels(reel, lang === 'hi' ? 'hi' : 'en');
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} style={s.chip} onPress={() => router.push(route as never)}>
      <Text style={s.txt}>{`🎬 ${text} ›`}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(123,47,247,0.4)', borderRadius: 999, paddingHorizontal: 12 },
  txt: { color: Colors.purpleInk, fontSize: 12, fontWeight: '700' },
});
