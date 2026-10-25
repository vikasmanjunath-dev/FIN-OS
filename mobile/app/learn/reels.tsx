import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ViewToken } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ReelPlayer } from '@/components/reels/ReelPlayer';
import { EpisodeEnd } from '@/components/reels/EpisodeEnd';
import { Banner } from '@/components/reels/Banner';
import { Mitra } from '@/components/reels/Mitra';
import { announce } from '@/components/reels/announce';
import { TogetherSheet } from '@/components/reels/TogetherSheet';
import { NudgeSheet, WhenSheet } from '@/components/reels/ReminderSheets';
import { useMoveReminder } from '@/hooks/useMoveReminder';
import { ACT_ALL, LIBRARY } from '@/lib/reels/library';
import { finishedToday, type Episode } from '@/lib/reels/episode';
import { blindSpot } from '@/lib/reels/ranker';
import { Welcome, useLangUnset } from '@/components/reels/Welcome';
import { changeLabel, needsWelcome, todaysEpisode } from '@/lib/reels/coldstart';
import { isPledged, isSaved, showTip, weekKey } from '@/lib/reels/reelsProfile';
import { seasonOf } from '@/lib/reels/seasons';
import { factFor } from '@/lib/reels/facts';
import type { L, Reel, Topic } from '@/lib/reels/types';
import { recordWatched } from '@/lib/reelsStorage';
import { loadStats, recordStat } from '@/lib/reelsStatsStorage';
import { weekLine, weekOf } from '@/lib/reels/weekly';
import { countAnswer } from '@/lib/reels/stats';
import { isGrowthMilestone } from '@/lib/reels/milestones';
import { isGrowthReceipt } from '@/lib/reels/moves';
import type { Ranked } from '@/lib/reels/journey';
import { ShareSheet } from '@/components/reels/ShareSheet';
import { useReelsJourney } from '@/hooks/useReelsJourney';
import { stopSpeaking } from '@/lib/reels/speech';
import { suggestChallenge, type ChallengeState } from '@/lib/reels/challenges';
import { challengeLine, FEED_LOADING, headInset } from '@/lib/reels/calmstop';
import { loadChallenges } from '@/lib/reelsChallengesStorage';
import { setLang, useLang } from '@/lib/i18n';
import { Colors, Spacing } from '@/constants/theme';

type Tab = Topic | 'all' | 'foryou' | 'saved';
const TOPICS: { key: Tab; en: string; hi: string }[] = [
  { key: 'foryou', en: 'For you', hi: 'आपके लिए' }, { key: 'saved', en: '🔖 Saved', hi: '🔖 सेव' }, { key: 'all', en: 'All', hi: 'सभी' }, { key: 'invest', en: 'Investing', hi: 'निवेश' }, { key: 'loans', en: 'Loans', hi: 'लोन' },
  { key: 'protect', en: 'Protection', hi: 'सुरक्षा' }, { key: 'tax', en: 'Tax', hi: 'टैक्स' }, { key: 'retire', en: 'Retirement', hi: 'रिटायरमेंट' },
  { key: 'credit', en: 'Credit', hi: 'क्रेडिट' }, { key: 'safety', en: 'Scams', hi: 'धोखाधड़ी' }, { key: 'goals', en: 'Goals', hi: 'लक्ष्य' }, { key: 'basics', en: 'Basics', hi: 'बुनियादी' },
];
const CHIPS_H = 44;
/** The room the top bar and the chips take at normal text, until the real bar has been measured (it grows with large text). */
const HEAD_FALLBACK = 64 + CHIPS_H;

/** Shown from the first frame until the first reel is ready: Mitra and one calm line. The owl only moves when the phone allows motion. */
function FeedLoading({ lang }: { lang: 'en' | 'hi' }) {
  const [calm, setCalm] = useState(true);
  const [t, setT] = useState(0);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(v => setCalm(v)).catch(() => setCalm(false)); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm); return () => sub.remove(); }, []);
  useEffect(() => { announce(FEED_LOADING[lang]); }, [lang]);                       // the feed has no live regions; a screen reader is told once
  useEffect(() => { if (calm) return; const id = setInterval(() => setT(v => v + 120), 120); return () => clearInterval(id); }, [calm]);
  return (
    <View style={s.loading}>
      <View accessibilityElementsHidden importantForAccessibility="no"><Mitra mood="think" t={calm ? 0 : t} size={110} /></View>
      <Text style={s.loadingTxt} maxFontSizeMultiplier={1.3}>{FEED_LOADING[lang]}</Text>
    </View>
  );
}

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
  const [headH, setHeadH] = useState(0);                                 // the real height of the top bar and chips: they grow with large text, and the reel below makes room
  const head = headInset(headH, HEAD_FALLBACK);
  const j = useReelsJourney();
  const reloadJourney = j.reload;
  const markBlind = j.markBlind;
  const markResurfaced = j.markResurfaced;
  const [order, setOrder] = useState<Ranked[] | null>(null);               // the personalised order is fixed for this visit, so a finished reel never jumps
  const [episode, setEpisode] = useState<Episode | null>(null);          // today's episode is fixed for this visit too
  // Cold start: a new person (nothing answered, no reel finished) sees the welcome once, before the first episode is composed. A link to one reel skips it.
  const langUnset = useLangUnset();
  const [editStart, setEditStart] = useState(false);                     // "Change my answers"
  const welcomePending = !id && (langUnset === null || needsWelcome(j.profile, j.watched));
  const welcomeOpen = editStart || (j.loaded && welcomePending && langUnset !== null);
  useEffect(() => { if (j.loaded && !order && !welcomePending) { setOrder(j.ranked); const now = new Date(); const ep = todaysEpisode(j.ranked, j.watched, now, { start: j.profile.start, strain: j.signals.strain, blind: blindSpot(j.ranked, j.signals, j.profile, now) }); setEpisode(ep); if (ep.picks.length > 0) recordStat('eps'); if (ep.blind) markBlind(weekKey(now)); for (const pk of ep.picks) if (pk.why === 'pledge') markResurfaced(pk.reel.id); } }, [j.loaded, j.ranked, j.watched, j.signals, j.profile, markBlind, markResurfaced, order, welcomePending]);
  const [topic, setTopic] = useState<Tab>(id ? 'all' : 'foryou');
  const library = useMemo(() => { const by = Object.fromEntries((order ?? []).map(o => [o.reel.id, o.reel])); return LIBRARY.map(r => by[r.id] ?? r); }, [order]);   // fixed with the order, so nothing changes under the person's thumb
  const [savedSnap, setSavedSnap] = useState<string[]>([]);              // the saved list as it was when the tab was opened, so un-saving a reel does not pull it from under the thumb
  const reels: Item[] = useMemo(() => (topic === 'foryou' ? [...(episode?.picks ?? []).map(r => r.reel), END] : topic === 'all' ? library : topic === 'saved' ? library.filter(r => savedSnap.includes(r.id)) : library.filter(r => r.topic === topic)), [topic, episode, library, savedSnap]);
  // The one challenge that fits this person, if any: shown as a quiet line on the calm stop. `suggestChallenge` keeps its own strain rule.
  const [chal, setChal] = useState<ChallengeState | null>(null);
  useFocusEffect(useCallback(() => { let live = true; loadChallenges().then(c => { if (live) setChal(c); }).catch(() => {}); return () => { live = false; }; }, []));
  const suggestion = useMemo(() => (chal && j.loaded ? challengeLine(suggestChallenge(j.profile, j.signals, chal), lang) : null), [chal, j.loaded, j.profile, j.signals, lang]);
  const reelCount = reels.filter(x => !isEnd(x)).length;
  const reasons = useMemo(() => Object.fromEntries((order ?? []).filter(r => r.reason).map(r => [r.reel.id, r.reason as L])), [order]);
  const [startAt] = useState(() => (id ? Math.max(0, LIBRARY.findIndex(r => r.id === id)) : 0));      // the reel the link asked for, fixed at mount
  const [active, setActive] = useState(startAt);
  const startDone = useRef(!id);                  // once the person picks a topic or scrolls away, the link's start no longer applies
  const [sharing, setSharing] = useState<string | null>(null);
  const [together, setTogether] = useState<string | null>(null);        // Money date on one phone, for this reel
  const season = useMemo(() => seasonOf(new Date()), []);
  const fact = useMemo(() => factFor(new Date()), []);
  const [week, setWeek] = useState<string | null>(null);                // the last seven days, said gently, refreshed whenever a reel is finished
  useEffect(() => { let live = true; loadStats().then(st => { if (live) setWeek(weekLine(weekOf(st, new Date()))?.[lang] ?? null); }); return () => { live = false; }; }, [j.watched, lang]);
  const [tipFor, setTipFor] = useState<string | null>(null);            // the gesture tips ride on the first reel, on the first few visits only
  const tipDone = useRef(false);
  const tipShown = j.tipShown, profile = j.profile;
  useEffect(() => {
    if (!episode || tipDone.current) return;
    tipDone.current = true;
    const first = episode.picks[0]?.reel.id;
    if (first && showTip(profile)) { setTipFor(first); tipShown(); }
  }, [episode, profile, tipShown]);
  const [sound, setSound] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
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
  const answered = useCallback((rid: string, correct: boolean) => { Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {}); for (const f of countAnswer(answeredIds.current, rid, correct)) recordStat(f); noteEpisodeProgress(rid); recordWatched(rid, correct).then(() => reloadJourney()); }, [reloadJourney, noteEpisodeProgress]);
  const next = useCallback(() => { if (active < reels.length - 1) list.current?.scrollToIndex({ index: active + 1, animated: true }); else router.back(); }, [active, reels.length]);
  const pick = useCallback((k: Tab) => { stopSpeaking(); startDone.current = true; if (k === 'saved') setSavedSnap(j.profile.saved ?? []); setTopic(k); setActive(0); list.current?.scrollToOffset({ offset: 0, animated: false }); }, [j.profile.saved]);
  const actFor = (rid: string) => { const a = ACT_ALL[rid]; return a ? { label: a.label[lang], onPress: () => { j.beginMove(rid); router.push(a.href as any); } } : null; };
  const streakLine = j.streak > 0 ? (lang === 'hi' ? `🔥 ${j.streak} दिन की लकीर` : `🔥 ${j.streak}-day streak`) : null;
  const seen = Object.keys(watched).filter(k => LIBRARY.some(r => r.id === k)).length;
  const anchorId = episode?.picks[0]?.reel.id;
  const reminder = useMoveReminder(lang, j.beginMove);
  // A person under money strain is not shown a "you raised your SIP" celebration (Home hides the same two): it stays unseen until the strain lifts.
  const receipt = j.receipts.find(r => !(j.signals.strain && isGrowthReceipt(r.receipt)));
  const milestone = j.milestones.find(m => !(j.signals.strain && isGrowthMilestone(m.id)));

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
              <View style={{ flex: 1, minHeight: 0 }}>
              <EpisodeEnd lang={lang} count={finishedToday(watched, new Date())} streakLine={streakLine} move={anchorId ? actFor(anchorId) : null} tomorrow={episode?.tomorrow?.title[lang] ?? null} topInset={head} week={week} fact={fact.text[lang]} pledges={j.profile.pledges?.length ?? 0} onMoves={() => router.push('/learn/moves' as never)}
                onMore={() => pick('all')} onChallenges={() => router.push('/learn/challenges' as never)} suggestion={suggestion} onClose={() => (router.canGoBack() ? router.back() : router.replace('/learn' as any))} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={changeLabel(j.profile.start)[lang]} style={s.change} onPress={() => setEditStart(true)}><Text style={s.changeTxt} maxFontSizeMultiplier={1.4}>{changeLabel(j.profile.start)[lang]}</Text></Pressable>
            </View>
          ) : (
            <View style={{ height: h }}>
              <ReelPlayer reel={item} active={index === active} lang={lang} sound={sound} width={width} height={h} topInset={head} reason={item.mine ? [reasons[item.id]?.[lang], lang === 'hi' ? 'आपके अपने आँकड़े, इसी ऐप से। वे फ़ोन पर ही रहते हैं।' : 'Your own numbers, from this app. They stay on this phone.'].filter(Boolean).join(' ') : reasons[item.id]?.[lang] ?? null} onShare={() => setSharing(item.id)} onKnow={id => { recordStat('know'); j.know(id); }} onLess={t => { recordStat('less'); j.less(t); }} onPoke={(_, engaged) => { recordStat('poke'); if (engaged) recordStat('engaged'); j.pokeDone(engaged); }} onRemind={ACT_ALL[item.id] ? () => reminder.open(item.id) : null} act={actFor(item.id)} streakLine={streakLine} shelf={{ saved: isSaved(j.profile, item.id), pledged: isPledged(j.profile, item.id), tip: item.id === tipFor, season, onSave: () => j.toggleSave(item.id), onPledge: () => j.pledge(item.id), onTogether: () => setTogether(item.id) }} onAnswered={answered} onNext={next} />
            </View>
          )}
        />
      ) : null}
      {!order && !welcomePending ? <View style={[s.loadingBox, { top: head }]} pointerEvents="none"><FeedLoading lang={lang} /></View> : null}
      {/* One bar in normal flow (the round buttons, the title, then the chips), so that large text pushes the chips down instead of running into them */}
      <View style={s.head} pointerEvents="box-none" onLayout={e => setHeadH(e.nativeEvent.layout.height)}>
      <View style={s.top} pointerEvents="box-none">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'रील बंद करें' : 'Close reels'} style={s.round} onPress={() => (router.canGoBack() ? router.back() : router.replace('/learn' as any))}><Text style={s.roundTxt}>✕</Text></TouchableOpacity>
        <View style={s.titles}><Text style={s.headTxt} maxFontSizeMultiplier={1.3}>{lang === 'hi' ? 'मनी रील्स' : 'Money reels'}</Text><Text style={s.sub} maxFontSizeMultiplier={1.3}>{`${Math.min(active + 1, Math.max(1, reelCount))} / ${reelCount}${seen ? ` · ${seen} ${lang === 'hi' ? 'देखी' : 'watched'}` : ''}${j.streak > 0 ? ` · 🔥 ${j.streak}` : ''}`}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'रोज़ का रिमाइंडर' : 'Daily reminder'} style={[s.round, { marginRight: 8 }]} onPress={() => setNudgeOpen(true)}><Text style={s.roundTxt}>🔔</Text></TouchableOpacity>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: sound }} accessibilityLabel={lang === 'hi' ? 'आवाज़' : 'Voice'} accessibilityHint={lang === 'hi' ? 'देर तक दबाएँ: आवाज़ की सेटिंग' : 'Long press for voice settings'}
          accessibilityActions={[{ name: 'settings', label: lang === 'hi' ? 'आवाज़ की सेटिंग' : 'Voice settings' }]} onAccessibilityAction={() => router.push('/learn/voice' as never)}
          style={s.round} delayLongPress={450} onLongPress={() => { stopSpeaking(); router.push('/learn/voice' as never); }} onPress={() => { setSound(v => { if (v) stopSpeaking(); return !v; }); }}><Text style={s.roundTxt}>{sound ? '🔊' : '🔇'}</Text></Pressable>
      </View>
      <View style={s.chips} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8, alignItems: 'center' }}>
          {TOPICS.map(c => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: topic === c.key }} accessibilityLabel={lang === 'hi' ? c.hi : c.en} onPress={() => pick(c.key)} style={[s.chip, topic === c.key && s.chipOn]}>
              <Text style={[s.chipTxt, topic === c.key && s.chipTxtOn]}>{lang === 'hi' ? c.hi : c.en}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      </View>
      <Welcome visible={welcomeOpen} lang={lang} askLang={langUnset === true && !editStart} initial={editStart ? j.profile.start : null}
        onDone={start => { j.chooseStart(start); setEditStart(false); }} onSkip={start => { if (!editStart) j.chooseStart(start); setEditStart(false); }} onPickLang={setLang} />
      <WhenSheet lang={lang} visible={reminder.visible} options={reminder.options} status={reminder.status} onPick={reminder.pick} onClose={reminder.close} />
      <NudgeSheet lang={lang} visible={nudgeOpen} onClose={() => setNudgeOpen(false)} />
      {together ? <TogetherSheet reelId={together} lang={lang} visible onClose={() => setTogether(null)} onPlayed={() => recordStat('together')} /> : null}
      {topic === 'saved' && order && reels.length === 0 ? (
        <View style={s.empty} pointerEvents="none"><Text style={s.emptyTitle}>{lang === 'hi' ? 'अभी कुछ सेव नहीं है' : 'Nothing saved yet'}</Text><Text style={s.emptyBody}>{lang === 'hi' ? 'किसी रील को दाएँ स्वाइप करें, या जवाब के बाद 🔖 दबाएँ। वह यहाँ मिलेगी।' : 'Swipe a reel to the right, or tap 🔖 after its question. It will wait for you here.'}</Text></View>
      ) : null}
      <Modal visible={sharing !== null} transparent animationType="slide" onRequestClose={() => setSharing(null)}>
        <View style={s.modalBack}><View style={s.modalCard}>
          {sharing ? <ShareSheet reelId={sharing} lang={lang} onClose={() => setSharing(null)} /> : null}
        </View></View>
      </Modal>
      {receipt ? (
        <Banner tone="teal" tag={lang === 'hi' ? '🎉 आपने जो किया, उसका नतीजा' : '🎉 YOU DID IT'} title={receipt.title[lang]} body={receipt.body[lang]}
          okLabel={lang === 'hi' ? 'ठीक है' : 'Got it'} okText={lang === 'hi' ? 'ठीक' : 'OK'} onOk={() => j.dismissReceipt(receipt.receipt)} />
      ) : milestone ? (
        <Banner tone="gold" tag={lang === 'hi' ? '🦉 आपकी ज़िंदगी की एक असली उपलब्धि' : '🦉 A REAL MILESTONE'} title={milestone.title[lang]} body={milestone.body[lang]}
          okLabel={lang === 'hi' ? 'ठीक है' : 'Got it'} okText={lang === 'hi' ? 'ठीक' : 'OK'} onOk={() => j.dismissMilestone(milestone.id)} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A1A' },
  head: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  titles: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: Spacing.xs },
  loadingBox: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  loading: { alignItems: 'center', paddingHorizontal: Spacing.lg },
  loadingTxt: { color: Colors.textMuted, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: Spacing.md },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  roundTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalBack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: { padding: Spacing.md, paddingBottom: Spacing.lg },
  change: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  changeTxt: { color: '#B8C2DA', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  empty: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: Spacing.sm },
  chips: { height: CHIPS_H, marginTop: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#fff' },
  chipTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chipTxtOn: { color: '#070A1A' },
  headTxt: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  sub: { color: Colors.textMuted, fontSize: 11, marginTop: 1, textAlign: 'center' },
});
