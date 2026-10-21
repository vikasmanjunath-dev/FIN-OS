import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Modal, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '@/components/Gradient';
import { Cast } from '@/components/reels/Cast';
import { Mitra } from '@/components/reels/Mitra';
import { AREA, Scenery } from '@/components/reels/Scenery';
import { Poke } from '@/components/reels/Poke';
import { announce } from '@/components/reels/announce';
import { AskSheet } from '@/components/reels/AskSheet';
import { TrustSheet } from '@/components/reels/TrustSheet';
import { BeatBoundary } from '@/components/reels/BeatBoundary';
import { isBeatUsable, pokeStart } from '@/lib/reels/beats';
import { momentAt, sceneStarts, totalMs } from '@/lib/reels/engine';
import { trustFor } from '@/lib/reels/trust';
import { togetherBeat } from '@/lib/reels/together';
import type { Season } from '@/lib/reels/seasons';
import { quizText, quizVerdictText } from '@/lib/reels/narration';
import { speak, stopSpeaking } from '@/lib/reels/speech';
import { useVoice } from '@/hooks/useVoice';
import { Caption } from '@/components/reels/Caption';
import { holdAtSceneEnd, withVoiceTiming } from '@/lib/reels/voice';
import type { Reel, Topic } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

const TICK = 40;
/** The words of a toast without its leading emoji, for a screen reader (the emoji is only decoration). */
const plain = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, '');

/** One reel: progress segments, the big words, the stage (Mitra and the scene's picture), the caption, and a one-question quiz at the end.
 *  It plays only while `active` (the feed marks one reel active), pauses on tap, and stops its timer and voice when it leaves the screen. */
/** What the person can do with a reel beyond watching it: keep it for later, put its move on My moves, play it together, and the season's look. */
export interface Shelf { saved: boolean; pledged: boolean; tip: boolean; season: Season | null; onSave: () => boolean; onPledge: () => boolean; onTogether?: (() => void) | null }

export function ReelPlayer({ reel, active, lang, sound, width, height, topInset = 64, reason, act, streakLine, shelf, onShare, onKnow, onLess, onRemind, onPoke, onAnswered, onNext }: {
  shelf?: Shelf | null;
  reel: Reel; active: boolean; lang: Lang; sound: boolean; width: number; height: number; topInset?: number; reason?: string | null; act?: { label: string; onPress: () => void } | null; streakLine?: string | null; onShare?: (() => void) | null; onKnow?: ((reelId: string) => void) | null; onLess?: ((topic: Topic) => void) | null; onRemind?: (() => void) | null; onPoke?: ((reelId: string, engaged: boolean) => void) | null;
  onAnswered: (reelId: string, correct: boolean) => void; onNext: () => void;
}) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [poking, setPoking] = useState(false);                           // the reel is paused on its guess, slider or myth cards
  const [pokeDone, setPokeDone] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const sheetOpen = trustOpen || askOpen;                                   // a sheet over the reel pauses it
  const [steered, setSteered] = useState<null | 'known' | 'less'>(null);   // what the person told the reels about this one
  const [steerOpen, setSteerOpen] = useState(false);                         // swiped left: "I know this" or "less of this topic"?
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const insets = useSafeAreaInsets();
  const [calm, setCalm] = useState(false);                                // the phone asks for less motion
  const last = useRef(0);
  const segW = useRef(1), segX = useRef(0);
  const quizRef = useRef<ScrollView>(null);
  const quizH = useRef(0), whyY = useRef(0), mainEnd = useRef(0);        // where the verdict and the main buttons sit in the question screen, to scroll them into view after the answer
  // With the voice on, the reel plays as a copy whose scenes are as long as the voice needs; the clock, the beat's pause point, the progress
  // segments and the jumps all follow that copy, so the caption, the picture and the voice change scene together. Content stays on `reel`.
  const played = useMemo(() => (sound ? withVoiceTiming(reel, lang) : reel), [reel, lang, sound]);
  const total = totalMs(played);
  const m = momentAt(played, t);
  const done = m.done;
  const startsOf = useMemo(() => sceneStarts(played), [played]);
  const pokeAt = useMemo(() => (isBeatUsable(reel) ? pokeStart(played) : null), [reel, played]);        // a broken beat is skipped, not shown
  // Turning the voice on or off changes scene lengths: keep the person at the same place in the same scene.
  const prevPlayed = useRef(played);
  useEffect(() => {
    if (prevPlayed.current === played) return;
    const old = prevPlayed.current; prevPlayed.current = played;
    setT(v => { const mo = momentAt(old, v); return mo.done ? totalMs(played) : sceneStarts(played)[mo.index] + mo.p * played.scenes[mo.index].ms; });
  }, [played]);
  const trust = trustFor(reel.id, !!reel.mine);
  const steerNote = (k: 'known' | 'less') => (k === 'known' ? (lang === 'hi' ? 'ठीक है, यह अब नहीं आएगी।' : 'Got it. This one will not come up again.') : (lang === 'hi' ? 'ठीक है, इस विषय की रीलें कम आएँगी।' : 'Got it. Fewer reels on this topic.'));
  const canTogether = !!shelf?.onTogether && togetherBeat(reel.id) !== null;
  const hiL = lang === 'hi';

  const say = useCallback((text: string) => { setToast(text); announce(plain(text)); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2200); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const buzz = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
  /** Keep this reel for later, or let it go. */
  const doSave = useCallback(() => { if (!shelf) return; const kept = shelf.onSave(); buzz(); say(kept ? (hiL ? '🔖 बाद के लिए रखी' : '🔖 Saved for later') : (hiL ? 'सेव से हटाई' : 'Removed from saved')); }, [shelf, say, hiL]);
  /** "I'll do this": the reel's move goes on My moves; a reel with no tool is simply kept for later. */
  const doPledge = useCallback(() => {
    if (!shelf) return;
    buzz();
    if (!act) { if (!shelf.saved) doSave(); else say(hiL ? '🔖 पहले से सेव है' : '🔖 Already saved'); return; }
    say(shelf.onPledge() ? (hiL ? '📌 मेरे काम में जुड़ा' : '📌 Added to My moves') : (hiL ? '📌 पहले से मेरे काम में है' : '📌 Already on My moves'));
  }, [shelf, act, say, doSave, hiL]);
  const handlers = useRef({ doSave, doPledge, openSteer: () => setSteerOpen(true) });
  handlers.current = { doSave, doPledge, openSteer: () => setSteerOpen(true) };
  // A sideways swipe on the picture: right keeps the reel, left asks what to tell the reels. Only clearly sideways moves count, so scrolling the feed is untouched.
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 70 && Math.abs(g.dx) > 2 * Math.abs(g.dy)) { if (g.dx > 0) handlers.current.doSave(); else handlers.current.openSteer(); } },
  }), []);
  const bodyPress = () => { const now = Date.now(); const dbl = now - lastTap.current < 320; lastTap.current = dbl ? 0 : now; setPlaying(p => !p); if (dbl) handlers.current.doPledge(); };   // a double tap toggles twice, so play or pause is unchanged

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm); return () => sub.remove(); }, []);   // and while the app is open
  // Leaving the app pauses the reel and silences the voice; coming back, the person taps to play on.
  useEffect(() => { const sub = AppState.addEventListener('change', st => { if (st !== 'active') { setPlaying(false); stopSpeaking(); } }); return () => sub.remove(); }, []);

  // Each time the reel comes on screen it starts again from the beginning.
  useEffect(() => { if (active) { setT(0); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(false); setTrustOpen(false); setAskOpen(false); setSteerOpen(false); setToast(null); setSteered(null); heldRef.current = 0; last.current = Date.now(); } else stopSpeaking(); }, [active]);

  const idx = m.index;
  const sc = m.scene, bigText = sc.big?.[lang];
  const voice = useVoice({ key: `${reel.id}:${idx}:${lang}`, text: sc.say[lang], big: bigText, mood: sc.mood, lang, budgetMs: sc.ms, enabled: active && sound && playing && !done && !poking && !sheetOpen });
  const voiceBusy = sound && voice.busy;
  const tRef = useRef(0); tRef.current = t;
  const heldRef = useRef(0);                                              // how long the clock has been held at a scene's end for the voice
  const busyRef = useRef(false); busyRef.current = voiceBusy;
  const endOfScene = startsOf[idx] + played.scenes[idx].ms;
  const endRef = useRef(0); endRef.current = endOfScene;

  // A reel with a beat stops at the end of its beat scene (once the voice has finished its sentence) and waits for the person (or for the beat to reveal itself).
  useEffect(() => { if (active && pokeAt !== null && !pokeDone && !poking && t >= pokeAt && !(voiceBusy && t <= pokeAt)) { setT(pokeAt); setPoking(true); } }, [active, pokeAt, pokeDone, poking, t, voiceBusy]);

  useEffect(() => {
    if (!active || !playing || done || poking || sheetOpen) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now(); const dt = Math.min(120, now - last.current); last.current = now;      // a stalled frame never skips a scene
      const r = holdAtSceneEnd(tRef.current, dt, endRef.current, busyRef.current, heldRef.current);       // a slow voice is never cut off by the next scene
      heldRef.current = r.heldMs; tRef.current = Math.min(total, r.t); setT(tRef.current);
    }, TICK);
    return () => clearInterval(id);
  }, [active, playing, done, total, poking, sheetOpen]);

  // The voice (useVoice, above) follows the scenes, and is silent while paused, finished or off screen.
  useEffect(() => stopSpeaking, []);
  // On the question screen the voice reads the question and its options, then, once answered, whether it was right and why.
  useEffect(() => {
    if (!active || !sound || !done || sheetOpen) return;
    const id = setTimeout(() => speak(picked === null ? quizText(reel, lang) : quizVerdictText(reel, picked, lang), lang), 250);
    return () => { clearTimeout(id); stopSpeaking(); };
  }, [active, sound, done, picked, sheetOpen, lang, reel]);

  const jump = useCallback((i0: number) => { const i = Number.isFinite(i0) ? Math.min(reel.scenes.length - 1, Math.max(0, Math.floor(i0))) : 0; heldRef.current = 0; setT(startsOf[i]); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(reel.poke ? i > reel.poke.after : false); }, [reel, startsOf]);
  const finishPoke = useCallback((r: { engaged: boolean }) => { onPoke?.(reel.id, r.engaged); setPoking(false); setPokeDone(true); setT(t0 => t0 + 1); setPlaying(true); }, [onPoke, reel.id]);
  // The stage takes the height that is left after the header, the big words, the caption and the bottom safe area, within a sensible shape.
  const stageW = width - Spacing.lg * 2;
  const fs = Math.min(PixelRatio.getFontScale(), 1.35);                 // the caption and big words grow with the phone's text size (capped), and the picture gives up the room
  const [slotH, setSlotH] = useState(0);                                  // the room the layout really gives the picture: whatever is left after the header, big words, caption and hint at this text size
  const minStage = Math.round(stageW * 0.3), maxStage = Math.round(stageW * 1.2);
  const stageH = Math.max(minStage, Math.min(maxStage, slotH > 0 ? Math.floor(slotH) : Math.round(height - topInset - 72 - 50 * fs - 120 * fs - 28 - insets.bottom - 16)));
  const sceneryW = stageW * 0.58, sceneryH = (sceneryW * AREA.h) / AREA.w;
  const pickOption = (i: number) => { if (picked !== null) return; setPicked(i); onAnswered(reel.id, i === reel.quiz.answer); };
  const motionT = calm ? 0 : t, motionP = calm ? 1 : m.p;
  const verdict = picked === null ? '' : (picked === reel.quiz.answer ? (hiL ? 'सही! ' : 'Right! ') : (hiL ? 'लगभग! ' : 'Not quite. ')) + reel.quiz.why[lang];
  useEffect(() => { if (verdict) announce(verdict); }, [verdict]);     // iPhone ignores live regions; elsewhere the verdict text below is the live region
  // After an answer the verdict and the main buttons come into view (as little scrolling as it takes), so Next is never a long scroll away at large text.
  useEffect(() => {
    if (picked === null) return;
    const id = setTimeout(() => { const y = Math.max(0, Math.min(whyY.current - 8, mainEnd.current + 12 - quizH.current)); quizRef.current?.scrollTo({ y, animated: !calm }); }, 80);
    return () => clearTimeout(id);
  }, [picked, calm]);
  const holdPress = trust ? () => { buzz(); setTrustOpen(true); } : undefined;

  return (
    <View style={[s.page, { width, paddingTop: topInset }]} aria-hidden={!active} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      {/* One tall, full-width control instead of a button per segment: a tap jumps to the scene under the finger, and a screen reader steps scenes with
          increment and decrement. A reel with seven scenes would otherwise have buttons too narrow to hit. */}
      <Pressable
        style={s.segments} accessibilityRole="adjustable" accessibilityLabel={lang === 'hi' ? 'दृश्य' : 'Scene'} accessibilityValue={{ min: 1, max: reel.scenes.length, now: idx + 1, text: lang === 'hi' ? `${reel.scenes.length} में से ${idx + 1}` : `${idx + 1} of ${reel.scenes.length}` }}
        aria-valuemin={1} aria-valuemax={reel.scenes.length} aria-valuenow={idx + 1} aria-valuetext={lang === 'hi' ? `${reel.scenes.length} में से ${idx + 1}` : `${idx + 1} of ${reel.scenes.length}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => jump(Math.min(reel.scenes.length - 1, Math.max(0, idx + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        onLayout={e => { segW.current = e.nativeEvent.layout.width; segX.current = e.nativeEvent.layout.x; }}
        onPress={e => { const ne = e.nativeEvent as { locationX?: number; pageX?: number }; const x = Number.isFinite(ne.locationX) ? (ne.locationX as number) : (ne.pageX ?? 0) - segX.current;   // a web click has no locationX
          const i = Math.floor((x / Math.max(1, segW.current)) * reel.scenes.length); jump(Math.min(reel.scenes.length - 1, Math.max(0, i))); }}>
        {reel.scenes.map((x, i) => (
          <View key={i} style={s.seg} pointerEvents="none"><View style={[s.segFill, { width: `${i < idx || done ? 100 : i === idx ? m.p * 100 : 0}%` }]} /></View>
        ))}
      </Pressable>
      {/* while a beat is on, the reel's title is hidden: the beat needs the room, most of all at large text */}
      {poking ? null : <Text style={s.title} maxFontSizeMultiplier={1.3}>{reel.title[lang]}</Text>}
      {reason && !done && !poking ? <Text style={s.reason} numberOfLines={3} maxFontSizeMultiplier={1.2}>{`✨ ${reason}`}</Text> : null}

      {poking && reel.poke ? (
        <BeatBoundary onFail={() => finishPoke({ engaged: false })}><Poke beat={reel.poke.beat} lang={lang} sound={sound} onDone={finishPoke} /></BeatBoundary>
      ) : !done ? (
        <>
        <View style={s.swipeZone} {...swipe.panHandlers}>
        <Pressable onPress={bodyPress} onLongPress={holdPress} delayLongPress={450} style={s.body} accessible={false} accessibilityRole="none">
          <View style={s.bigWrap}>{bigText ? <Text style={[s.big, bigText.length > 12 && { fontSize: 28 }]} maxFontSizeMultiplier={1.2}>{bigText}</Text> : null}</View>
          <View style={[s.slot, { minHeight: minStage, maxHeight: maxStage }]} onLayout={e => { const h = e.nativeEvent.layout.height; setSlotH(v => (Math.abs(v - h) > 1 ? h : v)); }}>
          {/* The picture is the one pause/play control. The caption, the big words and the season badge sit beside it, not inside it: a button's own label would
              otherwise hide them from a screen reader. A tap anywhere else on the page still pauses (the outer Pressable), a swipe still reaches the swipe zone. */}
          <Pressable onPress={bodyPress} onLongPress={holdPress} delayLongPress={450} style={s.stageTap} accessibilityRole="button" accessibilityLabel={playing ? (hiL ? 'रोकें' : 'Pause') : (hiL ? 'चलाएँ' : 'Play')}
            accessibilityActions={shelf ? [{ name: 'save', label: hiL ? 'बाद के लिए रखें' : 'Save for later' }, { name: 'pledge', label: hiL ? 'मैं यह करूँगा' : 'I will do this' }, { name: 'steer', label: hiL ? 'कम दिखाएँ या पता है' : 'Less like this or I know this' }] : undefined}
            onAccessibilityAction={e => { const n = e.nativeEvent.actionName; if (n === 'save') doSave(); else if (n === 'pledge') doPledge(); else if (n === 'steer') setSteerOpen(true); }}>
          <LinearGradient colors={shelf?.season?.tint ?? ['#0B1233', '#1B0F45']} style={[s.stage, { width: stageW, height: stageH }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {/* beside a picture Mitra stands to the left; with no picture Mitra takes the middle of the stage */}
            {(() => { const sz = sc.prop ? stageW * 0.4 : Math.min(stageW * 0.62, stageH * 0.62 / 1.25); return <View style={{ position: 'absolute', left: sc.prop ? 0 : (stageW - sz) / 2, bottom: sc.prop ? 0 : (stageH - sz * 1.25) / 2 }}>{sc.who ? <Cast who={sc.who} mood={sc.mood} t={motionT} size={sz} /> : <Mitra mood={sc.mood} t={motionT} size={sz} />}</View>; })()}
            {sc.prop ? (
              <Svg style={{ position: 'absolute', right: 0, top: Math.max(0, (stageH - sceneryH) / 2 - 8) }} width={sceneryW} height={sceneryH} viewBox={`0 0 ${AREA.w} ${AREA.h}`}>
                <Scenery prop={sc.prop} p={motionP} lang={lang} t={motionT} />
              </Svg>
            ) : null}
            {!playing ? <View style={s.pauseVeil}><Text style={s.pauseGlyph} accessibilityElementsHidden importantForAccessibility="no">▶</Text></View> : null}
          </LinearGradient>
          </Pressable>
          {shelf?.season ? <Text style={[s.season, { maxWidth: stageW - 24 }]} pointerEvents="none" accessibilityLabel={shelf.season.label[lang]} maxFontSizeMultiplier={1.2}>{`${shelf.season.badge} ${shelf.season.label[lang]}`}</Text> : null}
          </View>
          <Caption text={sc.say[lang]} progress={voiceBusy ? voice.progress : null} elapsedMs={t - startsOf[idx]} sceneMs={sc.ms} style={s.caption} reduceMotion={calm} />
          {shelf?.tip && idx === 0 ? <Text style={s.hint} maxFontSizeMultiplier={1.2}>{hiL ? 'दो बार टैप: मैं यह करूँगा · दाएँ स्वाइप: सेव · बाएँ: कम दिखाएँ' : 'Double-tap: I’ll do this · swipe right: save · swipe left: less like this'}</Text> : null}
        </Pressable>
        </View>
        <PillRow lang={lang} onTrust={trust ? () => setTrustOpen(true) : null} onAsk={() => setAskOpen(true)} onReplay={sound && playing ? voice.replay : null} />
        </>
      ) : (
        <ScrollView ref={quizRef} style={s.quizScroll} contentContainerStyle={s.quiz} nestedScrollEnabled showsVerticalScrollIndicator={false} onLayout={e => { quizH.current = e.nativeEvent.layout.height; }}>
          <Text style={s.quizTag}>{lang === 'hi' ? 'एक छोटा सवाल' : 'ONE QUICK QUESTION'}</Text>
          <Text style={s.quizQ} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{reel.quiz.q[lang]}</Text>
          {reel.quiz.options.map((o, i) => {
            const right = picked !== null && i === reel.quiz.answer, wrong = picked === i && i !== reel.quiz.answer;
            return (
              <TouchableOpacity key={i} disabled={picked !== null} onPress={() => pickOption(i)} accessibilityRole="button" accessibilityState={{ selected: picked === i, disabled: picked !== null }}
                accessibilityLabel={`${o[lang]}${right ? (hiL ? ', सही जवाब' : ', correct answer') : wrong ? (hiL ? ', आपका जवाब, सही नहीं' : ', your answer, not correct') : ''}`}
                style={[s.opt, right && s.optRight, wrong && s.optWrong]}>
                <Text style={s.optTxt} maxFontSizeMultiplier={1.3}>{o[lang]}</Text>
                {right ? <Text style={s.optMark}>✓</Text> : wrong ? <Text style={s.optMark}>✕</Text> : null}
              </TouchableOpacity>
            );
          })}
          {/* The verdict is the one live region of the answer: it stays mounted (empty until the answer), so a screen reader says it once. */}
          <Text style={[s.why, picked === null && s.whyNone]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} onLayout={e => { whyY.current = e.nativeEvent.layout.y; }}>{verdict}</Text>
          {picked !== null ? (
            <>
              {streakLine ? <Text style={s.streak} maxFontSizeMultiplier={1.3}>{streakLine}</Text> : null}
              {/* the main moves first: this reel's move, then Next (and watching again) */}
              <View style={s.main} onLayout={e => { mainEnd.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
                {act ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={act.label} style={s.act} onPress={act.onPress}><Text style={s.actTxt}>{`${act.label} →`}</Text></TouchableOpacity> : null}
                <View style={s.actions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'अगली रील' : 'Next reel'} style={s.next} onPress={onNext}><Text style={s.nextTxt}>{hiL ? 'अगला ↑' : 'Next ↑'}</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'यह रील फिर देखें' : 'Watch this reel again'} style={s.again} onPress={() => { setT(0); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(false); }}><Text style={s.againTxt}>{hiL ? '↺ फिर देखें' : '↺ Watch again'}</Text></TouchableOpacity>
                </View>
              </View>
              {shelf || onShare || (act && onRemind) ? (
                <View style={s.group}>
                  <Text style={s.groupTag} accessibilityRole="header" maxFontSizeMultiplier={1.2}>{hiL ? 'रखें या साझा करें' : 'KEEP OR SHARE'}</Text>
                  <View style={s.chipsRow}>
                    {shelf ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: shelf.saved }} accessibilityLabel={shelf.saved ? (hiL ? 'बाद के लिए सेव है। हटाने के लिए दबाएँ' : 'Saved for later. Press to remove') : (hiL ? 'बाद के लिए सेव करें' : 'Save for later')} style={s.chip} onPress={doSave}><Text style={s.chipTxt}>{shelf.saved ? (hiL ? '🔖 सेव है ✓' : '🔖 Saved ✓') : (hiL ? '🔖 बाद के लिए' : '🔖 Save')}</Text></TouchableOpacity> : null}
                    {shelf && act ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: shelf.pledged }} accessibilityLabel={shelf.pledged ? (hiL ? 'मेरे काम की सूची में है' : 'On My moves') : (hiL ? 'मैं यह करूँगा, मेरे काम में जोड़ें' : 'I will do this, add to My moves')} style={s.chip} onPress={doPledge}><Text style={s.chipTxt}>{shelf.pledged ? (hiL ? '📌 जुड़ा ✓' : '📌 On My moves ✓') : (hiL ? '📌 मैं यह करूँगा' : '📌 I’ll do this')}</Text></TouchableOpacity> : null}
                    {act && onRemind ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'याद दिलाएँ कि मैं यह कब करूँगा' : 'Remind me when I will do it'} style={s.chip} onPress={onRemind}><Text style={s.chipTxt}>{hiL ? '⏰ बाद में याद दिलाएँ' : '⏰ Remind me'}</Text></TouchableOpacity> : null}
                    {shelf && canTogether ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'साथ खेलें, दो लोग, एक फ़ोन' : 'Play together, two people on one phone'} style={s.chip} onPress={() => shelf.onTogether?.()}><Text style={s.chipTxt}>{hiL ? '👫 साथ खेलें' : '👫 Play together'}</Text></TouchableOpacity> : null}
                    {onShare ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'यह पाठ साझा करें' : 'Share this lesson'} style={s.chip} onPress={onShare}><Text style={[s.chipTxt, { color: '#C4B5FD' }]}>{hiL ? '↗ साझा करें' : '↗ Share'}</Text></TouchableOpacity> : null}
                  </View>
                </View>
              ) : null}
              {onKnow || onLess ? (
                <View style={s.group}>
                  <Text style={s.groupTag} accessibilityRole="header" maxFontSizeMultiplier={1.2}>{hiL ? 'रीलें अपने हिसाब से' : 'TUNE YOUR REELS'}</Text>
                  {!steered ? (
                    <View style={s.chipsRow}>
                      {onKnow ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'मुझे यह पहले से पता है' : 'I know this already'} style={s.chip} onPress={() => { onKnow(reel.id); setSteered('known'); announce(steerNote('known')); }}><Text style={s.chipTxt}>{hiL ? '✓ पता है' : '✓ I know this'}</Text></TouchableOpacity> : null}
                      {onLess ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'इस विषय की रीलें कम दिखाएँ' : 'Show fewer reels on this topic'} style={s.chip} onPress={() => { onLess(reel.topic); setSteered('less'); announce(steerNote('less')); }}><Text style={s.chipTxt}>{hiL ? '− कम दिखाएँ' : '− Less of this'}</Text></TouchableOpacity> : null}
                    </View>
                  ) : null}
                  <Text style={[s.steered, !steered && s.whyNone]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>{steered ? steerNote(steered) : ''}</Text>
                </View>
              ) : null}
            </>
          ) : null}
          <PillRow lang={lang} onTrust={trust ? () => setTrustOpen(true) : null} onAsk={() => setAskOpen(true)} />
          <Text style={s.disclaimer}>{lang === 'hi' ? 'शिक्षा के लिए, सलाह नहीं। संख्याएँ उदाहरण या अनुमान हैं।' : 'For education, not advice. The numbers are illustrations or assumptions.'}</Text>
        </ScrollView>
      )}
      {/* sits over the scene bar (it is only the scene control, and the toast does not take touches), so it covers neither the verdict nor the buttons; one live region that stays mounted: its words change, so a screen reader says them once (iPhone gets announce() in say) */}
      <View style={[s.toast, { top: topInset + 2 }]} pointerEvents="none" accessibilityLiveRegion="polite">{toast ? <Text style={s.toastTxt} accessibilityLabel={plain(toast)}>{toast}</Text> : null}</View>
      <Modal visible={steerOpen} transparent animationType="fade" onRequestClose={() => setSteerOpen(false)}>
        <View style={s.steerBack}>
          {/* tapping outside closes it; a screen reader has "Never mind" instead, so this backdrop is hidden from it and does not wrap the card */}
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={hiL ? 'बंद करें' : 'Close'} accessibilityElementsHidden importantForAccessibility="no" onPress={() => setSteerOpen(false)} />
          <View style={s.steerCard} accessibilityViewIsModal>
            <Text style={s.steerTitle} accessibilityRole="header">{hiL ? 'इस रील के बारे में क्या बताएँ?' : 'What should the reels know about this one?'}</Text>
            {onKnow ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'मुझे यह पहले से पता है' : 'I know this already'} style={s.steerOpt} onPress={() => { onKnow(reel.id); setSteered('known'); setSteerOpen(false); say(steerNote('known')); }}><Text style={s.steerOptTxt}>{hiL ? '✓ मुझे यह पता है' : '✓ I know this already'}</Text></TouchableOpacity> : null}
            {onLess ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hiL ? 'इस विषय की रीलें कम दिखाएँ' : 'Show fewer reels on this topic'} style={s.steerOpt} onPress={() => { onLess(reel.topic); setSteered('less'); setSteerOpen(false); say(steerNote('less')); }}><Text style={s.steerOptTxt}>{hiL ? '− इस विषय की रीलें कम दिखाएँ' : '− Fewer reels on this topic'}</Text></TouchableOpacity> : null}
            <TouchableOpacity accessibilityRole="button" style={s.steerCancel} onPress={() => setSteerOpen(false)}><Text style={s.steerCancelTxt}>{hiL ? 'रहने दें' : 'Never mind'}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <TrustSheet trust={trust} lang={lang} visible={trustOpen} onClose={() => setTrustOpen(false)} />
      <AskSheet reel={reel} lang={lang} visible={askOpen} onClose={() => setAskOpen(false)} />
    </View>
  );
}

/** Two small, quiet buttons under a reel: how its figures are worked out (when it quotes any), and Ask Mitra a what-if. */
function PillRow({ lang, onTrust, onAsk, onReplay }: { lang: Lang; onTrust: (() => void) | null; onAsk: () => void; onReplay?: (() => void) | null }) {
  return (
    <View style={s.pills}>
      {onTrust ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'यह कैसे निकाला गया' : 'How this is worked out'} onPress={onTrust} style={s.trust} hitSlop={{ top: 6, bottom: 6 }}>
          <Text style={s.trustTxt}>{`ⓘ  ${lang === 'hi' ? 'यह कैसे निकाला' : 'How this is worked out'}`}</Text>
        </TouchableOpacity>
      ) : null}
      {onReplay ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'यह पंक्ति फिर सुनें' : 'Hear this line again'} onPress={onReplay} style={s.trust} hitSlop={{ top: 6, bottom: 6 }}>
          <Text style={s.trustTxt}>{`🔁  ${lang === 'hi' ? 'फिर सुनें' : 'Hear again'}`}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'मित्रा से पूछें' : 'Ask Mitra'} onPress={onAsk} style={s.trust} hitSlop={{ top: 6, bottom: 6 }}>
        <Text style={s.trustTxt}>{`🦉  ${lang === 'hi' ? 'मित्रा से पूछें' : 'Ask Mitra'}`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: Spacing.lg, overflow: 'hidden' },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  segFill: { height: 4, backgroundColor: '#fff' },
  title: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginTop: 4, marginBottom: Spacing.sm },
  reason: { color: '#C4B5FD', fontSize: 12, fontWeight: '700', marginBottom: Spacing.xs },
  streak: { color: '#FBBF24', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: Spacing.md },
  act: { minHeight: 48, borderRadius: Radii.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: Spacing.md },
  shareBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  shareTxt: { color: '#C4B5FD', fontSize: 14, fontWeight: '700' },
  actTxt: { color: '#070A1A', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  swipeZone: { flex: 1, minHeight: 0 },
  body: { flex: 1, justifyContent: 'flex-start' },
  season: { position: 'absolute', top: 10, left: 12, color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  toast: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '800', backgroundColor: 'rgba(15,21,48,0.96)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', textAlign: 'center' },
  steerBack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  steerCard: { backgroundColor: '#0F1530', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
  steerTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: Spacing.xs },
  steerOpt: { minHeight: 52, borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8 },
  steerOptTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  steerCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  steerCancelTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
  bigWrap: { minHeight: 46, justifyContent: 'center', marginBottom: Spacing.xs },
  big: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  stageTap: { minHeight: 44 },
  slot: { flex: 1, flexBasis: 0, justifyContent: 'flex-start', alignItems: 'center' },
  stage: { borderRadius: Radii.xl, overflow: 'hidden', alignSelf: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pauseVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  pauseGlyph: { color: '#fff', fontSize: 54 },
  caption: { color: '#fff', fontSize: 22, lineHeight: 31, fontWeight: '800', textAlign: 'center', marginTop: Spacing.md, minHeight: 66 },
  hint: { color: Colors.textDim, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm },
  quizScroll: { flex: 1, minHeight: 0 },
  quiz: { flexGrow: 1, justifyContent: 'center', paddingTop: Spacing.sm, paddingBottom: 40 },
  quizTag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: Spacing.sm },
  quizQ: { color: '#fff', fontSize: 22, lineHeight: 30, fontWeight: '800', marginBottom: Spacing.lg },
  opt: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: Spacing.sm },
  optRight: { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.14)' },
  optWrong: { borderColor: Colors.red, backgroundColor: 'rgba(255,68,68,0.12)' },
  optTxt: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  optMark: { color: '#fff', fontSize: 18, fontWeight: '900' },
  why: { color: '#D8DEEC', fontSize: 15, lineHeight: 22, marginTop: Spacing.xs, marginBottom: Spacing.md },
  whyNone: { height: 0, marginTop: 0, marginBottom: 0 },
  main: { marginTop: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  again: { flexGrow: 1, flexBasis: 120, minHeight: 48, paddingVertical: 8, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  againTxt: { color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  next: { flexGrow: 1.4, flexBasis: 130, minHeight: 48, paddingVertical: 8, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: Colors.cyan },
  nextTxt: { color: '#000', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  group: { marginTop: Spacing.md },
  groupTag: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  chip: { flexGrow: 1, flexBasis: '45%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  chipTxt: { color: '#D8DEEC', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  steered: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm },
  pills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  trust: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  trustTxt: { color: '#C4B5FD', fontSize: 12, fontWeight: '700' },
  disclaimer: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.lg },
});
