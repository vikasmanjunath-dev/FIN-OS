import React, { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Card, SectionLabel, TrackerScreen } from '@/components/TrackerUI';
import { LIBRARY } from '@/lib/reels/library';
import { rankReelsV2 } from '@/lib/reels/ranker';
import { startedReelIds } from '@/lib/reels/followup';
import { loadSignals } from '@/lib/reels/signals';
import { todaysEpisode } from '@/lib/reels/coldstart';
import { loadWatched } from '@/lib/reelsStorage';
import { loadMoves, loadReelsProfile } from '@/lib/reelsProfileStorage';
import { EMPTY_PROFILE } from '@/lib/reels/reelsProfile';
import { EMPTY_MOVES } from '@/lib/reels/moves';
import { EMPTY_STATS } from '@/lib/reels/stats';
import { EMPTY_CHALLENGES } from '@/lib/reels/challenges';
import { DEFAULT_NOTIFY, DEFAULT_NUDGE } from '@/lib/reels/reminders';
import { DEFAULT_VOICE_PREFS } from '@/lib/reels/voicePrefs';
import { KEPT_NOTE, TEXT, figuresUsed, summariseReels, whyThisReel, type Part, type PartId, type ReelsKnowledge } from '@/lib/reels/transparency';
import { loadKnowledge, resetAllReels, resetPart } from '@/lib/reels/transparencyStorage';
import { useLang } from '@/lib/i18n';
import type { L, Reel } from '@/lib/reels/types';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const EMPTY: ReelsKnowledge = {
  profile: EMPTY_PROFILE, moves: EMPTY_MOVES, stats: EMPTY_STATS, challenges: EMPTY_CHALLENGES, watched: {}, days: [],
  nudge: DEFAULT_NUDGE, notify: DEFAULT_NOTIFY, moveReminders: [], voice: DEFAULT_VOICE_PREFS, mine: {},
};

/** Yes/no that works on the web (window.confirm) and on a phone (Alert). True only when the destructive button is pressed. */
function confirm(title: string, message: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise(res => Alert.alert(title, message, [{ text: cancel, style: 'cancel', onPress: () => res(false) }, { text: ok, style: 'destructive', onPress: () => res(true) }], { cancelable: true, onDismiss: () => res(false) }));
}

/** What the reels know about you: everything they keep on this phone, in plain words, why a reel was picked, and a reset for each part. */
export default function ReelsData() {
  const lang = useLang(), hi = lang === 'hi';
  const t = (x: L) => x[lang];
  const [k, setK] = useState<ReelsKnowledge>(EMPTY);
  const [first, setFirst] = useState<{ reel: Reel; why: L } | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const [know, signals, watched, profile, moves] = await Promise.all([loadKnowledge(now), loadSignals(now), loadWatched(), loadReelsProfile(), loadMoves()]);
    const ranked = rankReelsV2(LIBRARY, { watched, signals, profile, now, started: startedReelIds(moves) });
    const todays = todaysEpisode(ranked, watched, now, { start: profile.start, strain: signals.strain }).picks[0] ?? ranked.find(r => r.why !== 'done') ?? ranked[0];
    setK(know);
    setFirst(todays ? { reel: todays.reel, why: whyThisReel(todays.reel, ranked) } : null);
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const parts = summariseReels(k, new Date());
  const figures = figuresUsed(k.mine);

  const forget = async (p: Part) => {
    if (busy || !(await confirm(t(p.reset.confirmTitle), `${t(p.reset.does)} ${t(TEXT.forgetOnly)}`, t(p.reset.label), t(TEXT.cancel)))) return;
    setBusy(true);
    try { await resetPart(p.id as PartId); await load(); setStatus(`${t(p.title)}: ${t(TEXT.done)}`); } finally { setBusy(false); }
  };
  const forgetAll = async () => {
    if (busy || !(await confirm(t(TEXT.resetAllConfirm), t(TEXT.resetAllDoes), t(TEXT.resetAllLabel), t(TEXT.cancel)))) return;
    setBusy(true);
    try { await resetAllReels(); await load(); setStatus(t(TEXT.doneAll)); } finally { setBusy(false); }
  };

  return (
    <TrackerScreen title={t(TEXT.title)} subtitle={t(TEXT.subtitle)}>
      <Card accent={Colors.teal}>
        <Text style={s.head} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{t(TEXT.keptTitle)}</Text>
        <Text style={s.body}>{t(KEPT_NOTE)}</Text>
      </Card>

      <SectionLabel>{hi ? 'आज की पहली रील क्यों' : 'WHY TODAY’S FIRST REEL'}</SectionLabel>
      <Card accent={Colors.cyan}>
        <Text style={s.head} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{first ? first.reel.title[lang] : t(TEXT.whyNone)}</Text>
        {first ? <Text style={s.body} accessibilityLabel={`${t(TEXT.whyTitle)}: ${first.why[lang]}`}>{first.why[lang]}</Text> : null}
      </Card>

      <SectionLabel>{hi ? 'रील्स ने क्या सीखा' : 'WHAT THE REELS HAVE LEARNED'}</SectionLabel>
      {parts.map(p => (
        <Card key={p.id} accent={p.empty ? undefined : Colors.purple} style={{ marginBottom: Spacing.sm }}>
          <Text style={s.head} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{t(p.title)}</Text>
          <Text style={s.body}>{t(p.summary)}</Text>
          {p.lines.map((ln, i) => <Text key={i} style={s.line}>{`• ${t(ln)}`}</Text>)}
          {p.more > 0 ? <Text style={s.line}>{t(TEXT.more(p.more))}</Text> : null}
          <Text style={s.tag}>{p.synced ? t(TEXT.syncs) : t(TEXT.neverSynced)}</Text>
          <Text style={s.help}>{`${t(TEXT.whatResetDoes)}: ${t(p.reset.does)}`}</Text>
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={`${t(p.reset.label)}: ${t(p.title)}`} accessibilityState={{ disabled: p.empty || busy }}
            disabled={p.empty || busy} onPress={() => forget(p)} style={[s.reset, (p.empty || busy) && s.off]}>
            <Text style={s.resetTxt} maxFontSizeMultiplier={1.3}>{p.empty ? t(TEXT.nothing) : t(p.reset.label)}</Text>
          </TouchableOpacity>
        </Card>
      ))}

      <SectionLabel>{hi ? 'आपके ट्रैकर से' : 'FROM YOUR TRACKERS'}</SectionLabel>
      <Card>
        <Text style={s.head} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{t(figures.title)}</Text>
        {figures.lines.length === 0 ? <Text style={s.body}>{hi ? 'अभी ट्रैकर में इनमें से कोई आँकड़ा नहीं है।' : 'None of these figures are in your trackers yet.'}</Text> : figures.lines.map((ln, i) => <Text key={i} style={s.line}>{`• ${t(ln)}`}</Text>)}
        <Text style={[s.help, { marginTop: Spacing.sm }]}>{t(figures.note)}</Text>
      </Card>

      <SectionLabel>{hi ? 'सब कुछ' : 'EVERYTHING'}</SectionLabel>
      <Card>
        <Text style={s.help}>{t(TEXT.resetAllDoes)}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(TEXT.resetAllLabel)} accessibilityState={{ disabled: busy }} disabled={busy} onPress={forgetAll} style={[s.reset, busy && s.off, { marginTop: Spacing.sm }]}>
          <Text style={s.resetTxt} maxFontSizeMultiplier={1.3}>{t(TEXT.resetAllLabel)}</Text>
        </TouchableOpacity>
      </Card>
      <View accessibilityLiveRegion="polite"><Text style={status ? s.status : undefined}>{status}</Text></View>

      <TouchableOpacity accessibilityRole="button" style={s.link} onPress={() => router.push('/privacy' as never)}><Text style={s.linkTxt} maxFontSizeMultiplier={1.3}>{`${t(TEXT.openPrivacy)} →`}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.link} onPress={() => router.push('/learn/reels' as never)}><Text style={s.linkTxt} maxFontSizeMultiplier={1.3}>{`${t(TEXT.back)} →`}</Text></TouchableOpacity>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  head: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  body: { ...Typography.body, lineHeight: 20 },
  line: { ...Typography.body, lineHeight: 20, marginTop: 4, color: Colors.textMuted },
  tag: { ...Typography.caption, marginTop: Spacing.sm, color: Colors.teal },
  help: { ...Typography.caption, lineHeight: 17, marginTop: 4 },
  reset: { minHeight: 44, borderWidth: 1, borderColor: Colors.red + '66', borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  off: { opacity: 0.45, borderColor: Colors.borderMed },
  resetTxt: { color: Colors.red, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  status: { color: Colors.teal, fontWeight: '700', fontSize: 13, marginVertical: Spacing.sm },
  link: { minHeight: 44, justifyContent: 'center', marginTop: Spacing.xs },
  linkTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
});
