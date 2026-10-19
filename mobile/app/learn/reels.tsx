import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ViewToken } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ReelPlayer } from '@/components/reels/ReelPlayer';
import { EpisodeEnd } from '@/components/reels/EpisodeEnd';
import { NudgeSheet, WhenSheet, type WhenStatus } from '@/components/reels/ReminderSheets';
import { addMoveReminder, syncReelReminders } from '@/lib/reelRemindersStorage';
import { getPermission, requestPermission } from '@/lib/remindersNative';
import { toLocalIso, whenOptions, type WhenOption } from '@/lib/reels/reminders';
import { ACT_ALL, LIBRARY } from '@/lib/reels/library';
import { EPISODE_SIZE, composeEpisode, finishedToday, type Episode } from '@/lib/reels/episode';
import { blindSpot } from '@/lib/reels/ranker';
import { weekKey } from '@/lib/reels/reelsProfile';
import type { L, Reel, Topic } from '@/lib/reels/types';
import { recordWatched } from '@/lib/reelsStorage';
import { recordStat } from '@/lib/reelsStatsStorage';
import type { Ranked } from '@/lib/reels/journey';
import { SharePreview } from '@/components/SharePreview';
import { shareText } from '@/lib/reels/share';
import { useReelsJourney } from '@/hooks/useReelsJourney';
import { stopSpeaking } from '@/lib/reels/speech';
import { useLang } from '@/lib/i18n';
import { Colors, Spacing } from '@/constants/theme';

type Tab = Topic | 'all' | 'foryou';
const TOPICS: { key: Tab; en: string; hi: string }[] = [
  { key: 'foryou', en: 'For you', hi: 'आपके लिए' }, { key: 'all', en: 'All', hi: 'सभी' }, { key: 'invest', en: 'Investing', hi: 'निवेश' }, { key: 'loans', en: 'Loans', hi: 'लोन' },
  { key: 'protect', en: 'Protection', hi: 'सुरक्षा' }, { key: 'tax', en: 'Tax', hi: 'टैक्स' }, { key: 'retire', en: 'Retirement', hi: 'रिटायरमेंट' },
  { key: 'credit', en: 'Credit', hi: 'क्रेडिट' }, { key: 'safety', en: 'Scams', hi: 'धोखाधड़ी' }, { key: 'goals', en: 'Goals', hi: 'लक्ष्य' }, { key: 'basics', en: 'Basics', hi: 'बुनियादी' },
];
const CHIPS_H = 44;

/** The calm stop after today's episode. It is a page in the feed, not a reel. */
type EndCard = { id: string; end: true };
type Item = Reel | EndCard;
const END: EndCard = { id: '__end', end: true };
const isEnd = (x: Item): x is EndCard => 'end' in x;

/** Money reels: a full-screen, swipe-up feed of short animated lessons with Mitra the owl. One reel plays at a time. */
export default function ReelsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const lang = useLang();
  const { width } = useWindowDimensions();
  const [h, setH] = useState(0);
  const j = useReelsJourney();
  const reloadJourney = j.reload;
  const markBlind = j.markBlind;
  const [order, setOrder] = useState<Ranked[] | null>(null);               // the personalised order is fixed for this visit, so a finished reel never jumps
  const [episode, setEpisode] = useState<Episode | null>(null);          // today's episode is fixed for this visit too
  useEffect(() => { if (j.loaded && !order) { setOrder(j.ranked); const now = new Date(); const ep = composeEpisode(j.ranked, Math.max(0, EPISODE_SIZE - finishedToday(j.watched, now)), blindSpot(j.ranked, j.signals, j.profile, now)); setEpisode(ep); if (ep.picks.length > 0) recordStat('eps'); if (ep.blind) markBlind(weekKey(now)); } }, [j.loaded, j.ranked, j.watched, j.signals, j.profile, markBlind, order]);
  const [topic, setTopic] = useState<Tab>(id ? 'all' : 'foryou');
  const library = useMemo(() => { const by = Object.fromEntries((order ?? []).map(o => [o.reel.id, o.reel])); return LIBRARY.map(r => by[r.id] ?? r); }, [order]);   // fixed with the order, so nothing changes under the person's thumb
  const reels: Item[] = useMemo(() => (topic === 'foryou' ? [...(episode?.picks ?? []).map(r => r.reel), END] : topic === 'all' ? library : library.filter(r => r.topic === topic)), [topic, episode, library]);
  const reelCount = reels.filter(x => !isEnd(x)).length;
  const reasons = useMemo(() => Object.fromEntries((order ?? []).filter(r => r.reason).map(r => [r.reel.id, r.reason as L])), [order]);
  const [startAt] = useState(() => (id ? Math.max(0, LIBRARY.findIndex(r => r.id === id)) : 0));      // the reel the link asked for, fixed at mount
  const [active, setActive] = useState(startAt);
  const startDone = useRef(!id);                  // once the person picks a topic or scrolls away, the link's start no longer applies
  const [sharing, setSharing] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [when, setWhen] = useState<null | { reelId: string; status: WhenStatus }>(null);       // "when will you do it?" for a reel's tool
  const watched = j.watched;
  const list = useRef<FlatList>(null);
  useEffect(() => () => stopSpeaking(), []);
  // Time with the reels on screen, counted on the phone for Reels health: from opening to leaving, or to the app going to the background.
  useEffect(() => {
    let start = Date.now();
    const flush = () => { const ms = Date.now() - start; start = Date.now(); if (ms > 1000) recordStat('ms', Math.min(ms, 30 * 60_000)); };
    const sub = AppState.addEventListener('change', st => { if (st === 'active') start = Date.now(); else flush(); });
    return () => { sub.remove(); flush(); };
  }, []);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems.find(x => x.isViewable && typeof x.index === 'number');
    if (v && typeof v.index === 'number') setActive(v.index);
  }).current;

  // An episode counts as finished once every reel in it has been answered in this visit.
  const answeredIds = useRef(new Set<string>());
  const episodeDone = useRef(false);
  const noteEpisodeProgress = useCallback((rid: string) => {
    answeredIds.current.add(rid);
    if (!episodeDone.current && episode && episode.picks.length > 0 && episode.picks.every(p => answeredIds.current.has(p.reel.id))) { episodeDone.current = true; recordStat('epfin'); }
  }, [episode]);
  const answered = useCallback((rid: string, correct: boolean) => { Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {}); recordStat('fin'); if (correct) recordStat('right'); noteEpisodeProgress(rid); recordWatched(rid, correct).then(() => reloadJourney()); }, [reloadJourney, noteEpisodeProgress]);
  const next = useCallback(() => { if (active < reels.length - 1) list.current?.scrollToIndex({ index: active + 1, animated: true }); else router.back(); }, [active, reels.length]);
  const pick = useCallback((k: Tab) => { stopSpeaking(); startDone.current = true; setTopic(k); setActive(0); list.current?.scrollToOffset({ offset: 0, animated: false }); }, []);
  const actFor = (rid: string) => { const a = ACT_ALL[rid]; return a ? { label: a.label[lang], onPress: () => { j.beginMove(rid); router.push(a.href as any); } } : null; };
  const streakLine = j.streak > 0 ? (lang === 'hi' ? `🔥 ${j.streak} दिन की लकीर` : `🔥 ${j.streak}-day streak`) : null;
  const seen = Object.keys(watched).filter(k => LIBRARY.some(r => r.id === k)).length;
  const anchorId = episode?.picks[0]?.reel.id;
  /** The person picked a moment for a reel's tool: ask the phone once for permission, keep one reminder, and start watching the figure for a receipt. */
  const remind = useCallback(async (reelId: string, o: WhenOption) => {
    const a = ACT_ALL[reelId];
    if (!a) return;
    let perm = await getPermission();
    if (perm === 'undetermined') perm = await requestPermission();
    if (perm !== 'granted') { setWhen({ reelId, status: perm === 'unsupported' ? 'unsupported' : 'denied' }); return; }
    await addMoveReminder({ reelId, at: toLocalIso(o.at), href: a.href, label: a.label });
    j.beginMove(reelId);
    await syncReelReminders().catch(() => {});
    setWhen({ reelId, status: { done: o.label[lang] } });
  }, [j, lang]);

  return (
    <View style={s.root} onLayout={e => setH(e.nativeEvent.layout.height)}>
      {h > 0 && order ? (
        <FlatList
          key={topic} ref={list} data={reels} keyExtractor={r => r.id} pagingEnabled showsVerticalScrollIndicator={false} decelerationRate="fast"
          initialScrollIndex={topic === 'all' && !startDone.current ? Math.max(0, Math.min(startAt, reels.length - 1)) : 0} getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })}
          onLayout={() => { if (!startDone.current && topic === 'all') { startDone.current = true; const i = Math.max(0, Math.min(startAt, reels.length - 1)); requestAnimationFrame(() => { list.current?.scrollToIndex({ index: i, animated: false }); setActive(i); }); } }} onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.index * h, animated: false }); }}
          onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 70 }} windowSize={3} initialNumToRender={1} maxToRenderPerBatch={1}
          renderItem={({ item, index }) => isEnd(item) ? (
            <View style={{ height: h }}>
              <EpisodeEnd lang={lang} count={finishedToday(watched, new Date())} streakLine={streakLine} move={anchorId ? actFor(anchorId) : null} tomorrow={episode?.tomorrow?.title[lang] ?? null} topInset={64 + CHIPS_H}
                onMore={() => pick('all')} onChallenges={() => router.push('/learn/challenges' as never)} onClose={() => (router.canGoBack() ? router.back() : router.replace('/learn' as any))} />
            </View>
          ) : (
            <View style={{ height: h }}>
              <ReelPlayer reel={item} active={index === active} lang={lang} sound={sound} width={width} height={h} topInset={64 + CHIPS_H} reason={item.mine ? [reasons[item.id]?.[lang], lang === 'hi' ? 'आपके अपने आँकड़े, इसी ऐप से। वे फ़ोन पर ही रहते हैं।' : 'Your own numbers, from this app. They stay on this phone.'].filter(Boolean).join(' ') : reasons[item.id]?.[lang] ?? null} onShare={() => setSharing(item.id)} onKnow={id => { recordStat('know'); j.know(id); }} onLess={t => { recordStat('less'); j.less(t); }} onPoke={(_, engaged) => { recordStat('poke'); if (engaged) recordStat('engaged'); j.pokeDone(engaged); }} onRemind={ACT_ALL[item.id] ? () => setWhen({ reelId: item.id, status: null }) : null} act={actFor(item.id)} streakLine={streakLine} onAnswered={answered} onNext={next} />
            </View>
          )}
        />
      ) : null}
      <View style={s.top} pointerEvents="box-none">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close reels" style={s.round} onPress={() => (router.canGoBack() ? router.back() : router.replace('/learn' as any))}><Text style={s.roundTxt}>✕</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}><Text style={s.head}>{lang === 'hi' ? 'मनी रील्स' : 'Money reels'}</Text><Text style={s.sub}>{`${Math.min(active + 1, Math.max(1, reelCount))} / ${reelCount}${seen ? ` · ${seen} ${lang === 'hi' ? 'देखी' : 'watched'}` : ''}${j.streak > 0 ? ` · 🔥 ${j.streak}` : ''}`}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'रोज़ का रिमाइंडर' : 'Daily reminder'} style={[s.round, { marginRight: 8 }]} onPress={() => setNudgeOpen(true)}><Text style={s.roundTxt}>🔔</Text></TouchableOpacity>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: sound }} accessibilityLabel={sound ? 'Voice on' : 'Voice off'} style={s.round} onPress={() => { setSound(v => { if (v) stopSpeaking(); return !v; }); }}><Text style={s.roundTxt}>{sound ? '🔊' : '🔇'}</Text></Pressable>
      </View>
      <WhenSheet lang={lang} visible={when !== null} options={whenOptions(new Date())} status={when?.status ?? null} onPick={o => { if (when) remind(when.reelId, o); }} onClose={() => setWhen(null)} />
      <NudgeSheet lang={lang} visible={nudgeOpen} onClose={() => setNudgeOpen(false)} />
      <Modal visible={sharing !== null} transparent animationType="slide" onRequestClose={() => setSharing(null)}>
        <View style={s.modalBack}><View style={s.modalCard}>
          {sharing ? <SharePreview title={lang === 'hi' ? 'यह पाठ साझा करें' : 'Share this lesson'} text={shareText(sharing, lang)} onClose={() => setSharing(null)} /> : null}
        </View></View>
      </Modal>
      {j.receipts[0] ? (
        <View style={s.receipt} accessibilityLiveRegion="polite">
          <View style={{ flex: 1 }}>
            <Text style={s.receiptTag}>{lang === 'hi' ? '🎉 आपने जो किया, उसका नतीजा' : '🎉 YOU DID IT'}</Text>
            <Text style={s.receiptTitle} maxFontSizeMultiplier={1.3}>{j.receipts[0].title[lang]}</Text>
            <Text style={s.receiptBody} maxFontSizeMultiplier={1.3}>{j.receipts[0].body[lang]}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'ठीक है' : 'Got it'} style={s.receiptOk} onPress={() => j.dismissReceipt(j.receipts[0].receipt)}><Text style={s.receiptOkTxt}>{lang === 'hi' ? 'ठीक' : 'OK'}</Text></TouchableOpacity>
        </View>
      ) : null}
      <View style={s.chips} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8, alignItems: 'center' }}>
          {TOPICS.map(c => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: topic === c.key }} accessibilityLabel={`${lang === 'hi' ? c.hi : c.en}${topic === c.key ? ', selected' : ''}`} onPress={() => pick(c.key)} style={[s.chip, topic === c.key && s.chipOn]}>
              <Text style={[s.chipTxt, topic === c.key && s.chipTxtOn]}>{lang === 'hi' ? c.hi : c.en}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A1A' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  roundTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalBack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: { padding: Spacing.md, paddingBottom: Spacing.lg },
  receipt: { position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: 18, backgroundColor: '#12304A', borderWidth: 1, borderColor: 'rgba(34,211,166,0.5)' },
  receiptTag: { color: Colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  receiptTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 },
  receiptBody: { color: '#D8DEEC', fontSize: 13, lineHeight: 18, marginTop: 2 },
  receiptOk: { minWidth: 48, minHeight: 44, borderRadius: 22, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  receiptOkTxt: { color: '#000', fontSize: 14, fontWeight: '900' },
  chips: { position: 'absolute', top: 56, left: 0, right: 0, height: CHIPS_H },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#fff' },
  chipTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chipTxtOn: { color: '#070A1A' },
  head: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sub: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
});
