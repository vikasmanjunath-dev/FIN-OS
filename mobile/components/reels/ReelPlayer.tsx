import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '@/components/Gradient';
import { Cast } from '@/components/reels/Cast';
import { Mitra } from '@/components/reels/Mitra';
import { AREA, Scenery } from '@/components/reels/Scenery';
import { Poke } from '@/components/reels/Poke';
import { AskSheet } from '@/components/reels/AskSheet';
import { TrustSheet } from '@/components/reels/TrustSheet';
import { BeatBoundary } from '@/components/reels/BeatBoundary';
import { isBeatUsable, pokeStart } from '@/lib/reels/beats';
import { momentAt, sceneStarts, totalMs } from '@/lib/reels/engine';
import { trustFor } from '@/lib/reels/trust';
import { quizText, quizVerdictText } from '@/lib/reels/narration';
import { speak, stopSpeaking } from '@/lib/reels/speech';
import type { Reel, Topic } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

const TICK = 40;

/** One reel: progress segments, the big words, the stage (Mitra and the scene's picture), the caption, and a one-question quiz at the end.
 *  It plays only while `active` (the feed marks one reel active), pauses on tap, and stops its timer and voice when it leaves the screen. */
export function ReelPlayer({ reel, active, lang, sound, width, height, topInset = 64, reason, act, streakLine, onShare, onKnow, onLess, onRemind, onPoke, onAnswered, onNext }: {
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
  const insets = useSafeAreaInsets();
  const [calm, setCalm] = useState(false);                                // the phone asks for less motion
  const last = useRef(0);
  const segW = useRef(1);
  const total = totalMs(reel);
  const m = momentAt(reel, t);
  const done = m.done;
  const pokeAt = useMemo(() => (isBeatUsable(reel) ? pokeStart(reel) : null), [reel]);        // a broken beat is skipped, not shown
  const trust = trustFor(reel.id, !!reel.mine);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); }, []);
  // Leaving the app pauses the reel and silences the voice; coming back, the person taps to play on.
  useEffect(() => { const sub = AppState.addEventListener('change', st => { if (st !== 'active') { setPlaying(false); stopSpeaking(); } }); return () => sub.remove(); }, []);

  // Each time the reel comes on screen it starts again from the beginning.
  useEffect(() => { if (active) { setT(0); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(false); setTrustOpen(false); setAskOpen(false); setSteered(null); last.current = Date.now(); } else stopSpeaking(); }, [active]);

  // A reel with a beat stops at the end of its beat scene and waits for the person (or for the beat to reveal itself).
  useEffect(() => { if (active && pokeAt !== null && !pokeDone && !poking && t >= pokeAt) { setT(pokeAt); setPoking(true); } }, [active, pokeAt, pokeDone, poking, t]);

  useEffect(() => {
    if (!active || !playing || done || poking || sheetOpen) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now(); const dt = Math.min(120, now - last.current); last.current = now;      // a stalled frame never skips a scene
      setT(v => Math.min(total, v + dt));
    }, TICK);
    return () => clearInterval(id);
  }, [active, playing, done, total, poking, sheetOpen]);

  // The voice follows the scenes, and is silent while paused, finished or off screen.
  const idx = m.index;
  useEffect(() => {
    if (!active || !sound || !playing || done || poking || sheetOpen) { stopSpeaking(); return; }
    speak(reel.scenes[idx].say[lang], lang);
    return () => stopSpeaking();
  }, [active, sound, playing, done, poking, sheetOpen, idx, lang, reel]);
  useEffect(() => stopSpeaking, []);
  // On the question screen the voice reads the question and its options, then, once answered, whether it was right and why.
  useEffect(() => {
    if (!active || !sound || !done || sheetOpen) return;
    const id = setTimeout(() => speak(picked === null ? quizText(reel, lang) : quizVerdictText(reel, picked, lang), lang), 250);
    return () => { clearTimeout(id); stopSpeaking(); };
  }, [active, sound, done, picked, sheetOpen, lang, reel]);

  const jump = useCallback((i: number) => { setT(sceneStarts(reel)[i]); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(reel.poke ? i > reel.poke.after : false); }, [reel]);
  const finishPoke = useCallback((r: { engaged: boolean }) => { onPoke?.(reel.id, r.engaged); setPoking(false); setPokeDone(true); setT(t0 => t0 + 1); setPlaying(true); }, [onPoke, reel.id]);
  // The stage takes the height that is left after the header, the big words, the caption and the bottom safe area, within a sensible shape.
  const stageW = width - Spacing.lg * 2;
  const fs = Math.min(PixelRatio.getFontScale(), 1.35);                 // the caption and big words grow with the phone's text size (capped), and the picture gives up the room
  const [slotH, setSlotH] = useState(0);                                  // the room the layout really gives the picture: whatever is left after the header, big words, caption and hint at this text size
  const minStage = Math.round(stageW * 0.3), maxStage = Math.round(stageW * 1.2);
  const stageH = Math.max(minStage, Math.min(maxStage, slotH > 0 ? Math.floor(slotH) : Math.round(height - topInset - 72 - 50 * fs - 120 * fs - 28 - insets.bottom - 16)));
  const sceneryW = stageW * 0.58, sceneryH = (sceneryW * AREA.h) / AREA.w;
  const pickOption = (i: number) => { if (picked !== null) return; setPicked(i); onAnswered(reel.id, i === reel.quiz.answer); };
  const sc = m.scene, bigText = sc.big?.[lang];
  const motionT = calm ? 0 : t, motionP = calm ? 1 : m.p;

  return (
    <View style={[s.page, { width, paddingTop: topInset }]}>
      {/* One tall, full-width control instead of a button per segment: a tap jumps to the scene under the finger, and a screen reader steps scenes with
          increment and decrement. A reel with seven scenes would otherwise have buttons too narrow to hit. */}
      <Pressable
        style={s.segments} accessibilityRole="adjustable" accessibilityLabel={lang === 'hi' ? 'दृश्य' : 'Scene'} accessibilityValue={{ text: lang === 'hi' ? `${reel.scenes.length} में से ${idx + 1}` : `${idx + 1} of ${reel.scenes.length}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => jump(Math.min(reel.scenes.length - 1, Math.max(0, idx + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        onLayout={e => { segW.current = e.nativeEvent.layout.width; }}
        onPress={e => { const i = Math.floor((e.nativeEvent.locationX / Math.max(1, segW.current)) * reel.scenes.length); jump(Math.min(reel.scenes.length - 1, Math.max(0, i))); }}>
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
        <Pressable onPress={() => setPlaying(p => !p)} style={s.body} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
          <View style={s.bigWrap}>{bigText ? <Text style={[s.big, bigText.length > 12 && { fontSize: 28 }]} maxFontSizeMultiplier={1.2}>{bigText}</Text> : null}</View>
          <View style={[s.slot, { minHeight: minStage, maxHeight: maxStage }]} onLayout={e => { const h = e.nativeEvent.layout.height; setSlotH(v => (Math.abs(v - h) > 1 ? h : v)); }}>
          <LinearGradient colors={['#0B1233', '#1B0F45']} style={[s.stage, { width: stageW, height: stageH }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {/* beside a picture Mitra stands to the left; with no picture Mitra takes the middle of the stage */}
            {(() => { const sz = sc.prop ? stageW * 0.4 : Math.min(stageW * 0.62, stageH * 0.62 / 1.25); return <View style={{ position: 'absolute', left: sc.prop ? 0 : (stageW - sz) / 2, bottom: sc.prop ? 0 : (stageH - sz * 1.25) / 2 }}>{sc.who ? <Cast who={sc.who} mood={sc.mood} t={motionT} size={sz} /> : <Mitra mood={sc.mood} t={motionT} size={sz} />}</View>; })()}
            {sc.prop ? (
              <Svg style={{ position: 'absolute', right: 0, top: Math.max(0, (stageH - sceneryH) / 2 - 8) }} width={sceneryW} height={sceneryH} viewBox={`0 0 ${AREA.w} ${AREA.h}`}>
                <Scenery prop={sc.prop} p={motionP} lang={lang} t={motionT} />
              </Svg>
            ) : null}
            {!playing ? <View style={s.pauseVeil}><Text style={s.pauseGlyph}>▶</Text></View> : null}
          </LinearGradient>
          </View>
          <Text style={s.caption} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.35}>{sc.say[lang]}</Text>
        </Pressable>
        <PillRow lang={lang} onTrust={trust ? () => setTrustOpen(true) : null} onAsk={() => setAskOpen(true)} />
        </>
      ) : (
        <ScrollView style={s.quizScroll} contentContainerStyle={s.quiz} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Text style={s.quizTag}>{lang === 'hi' ? 'एक छोटा सवाल' : 'ONE QUICK QUESTION'}</Text>
          <Text style={s.quizQ} maxFontSizeMultiplier={1.3}>{reel.quiz.q[lang]}</Text>
          {reel.quiz.options.map((o, i) => {
            const right = picked !== null && i === reel.quiz.answer, wrong = picked === i && i !== reel.quiz.answer;
            return (
              <TouchableOpacity key={i} disabled={picked !== null} onPress={() => pickOption(i)} accessibilityRole="button" accessibilityState={{ selected: picked === i, disabled: picked !== null }}
                style={[s.opt, right && s.optRight, wrong && s.optWrong]}>
                <Text style={s.optTxt} maxFontSizeMultiplier={1.3}>{o[lang]}</Text>
                {right ? <Text style={s.optMark}>✓</Text> : wrong ? <Text style={s.optMark}>✕</Text> : null}
              </TouchableOpacity>
            );
          })}
          {picked !== null ? (
            <View accessibilityLiveRegion="polite">
              <Text style={s.why} maxFontSizeMultiplier={1.3}>{(picked === reel.quiz.answer ? (lang === 'hi' ? 'सही! ' : 'Right! ') : (lang === 'hi' ? 'लगभग! ' : 'Not quite. ')) + reel.quiz.why[lang]}</Text>
              {streakLine ? <Text style={s.streak}>{streakLine}</Text> : null}
              {act ? <TouchableOpacity accessibilityRole="button" style={s.act} onPress={act.onPress}><Text style={s.actTxt}>{`${act.label} →`}</Text></TouchableOpacity> : null}
              {act && onRemind ? <TouchableOpacity accessibilityRole="button" style={s.remind} onPress={onRemind}><Text style={s.remindTxt}>{lang === 'hi' ? '⏰ बाद में याद दिलाएँ' : '⏰ Remind me when I’ll do it'}</Text></TouchableOpacity> : null}
              {onShare || onKnow || onLess ? (
                <>
                  <View style={s.steer}>
                    {onShare ? <TouchableOpacity accessibilityRole="button" style={s.steerBtn} onPress={onShare}><Text style={[s.steerTxt, { color: '#C4B5FD' }]}>{lang === 'hi' ? '↗ साझा करें' : '↗ Share'}</Text></TouchableOpacity> : null}
                    {onKnow && !steered ? <TouchableOpacity accessibilityRole="button" style={s.steerBtn} onPress={() => { onKnow(reel.id); setSteered('known'); }}><Text style={s.steerTxt}>{lang === 'hi' ? '✓ पता है' : '✓ I know this'}</Text></TouchableOpacity> : null}
                    {onLess && !steered ? <TouchableOpacity accessibilityRole="button" style={s.steerBtn} onPress={() => { onLess(reel.topic); setSteered('less'); }}><Text style={s.steerTxt}>{lang === 'hi' ? '− कम दिखाएँ' : '− Less of this'}</Text></TouchableOpacity> : null}
                  </View>
                  {steered ? <Text style={s.steered} accessibilityLiveRegion="polite">{steered === 'known' ? (lang === 'hi' ? 'ठीक है, यह अब नहीं आएगी।' : 'Got it. This one will not come up again.') : (lang === 'hi' ? 'ठीक है, इस विषय की रीलें कम आएँगी।' : 'Got it. Fewer reels on this topic.')}</Text> : null}
                </>
              ) : null}
              <View style={s.actions}>
                <TouchableOpacity accessibilityRole="button" style={s.again} onPress={() => { setT(0); setPlaying(true); setPicked(null); setPoking(false); setPokeDone(false); }}><Text style={s.againTxt}>{lang === 'hi' ? '↺ फिर देखें' : '↺ Watch again'}</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={s.next} onPress={onNext}><Text style={s.nextTxt}>{lang === 'hi' ? 'अगला ↑' : 'Next ↑'}</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}
          <PillRow lang={lang} onTrust={trust ? () => setTrustOpen(true) : null} onAsk={() => setAskOpen(true)} />
          <Text style={s.disclaimer}>{lang === 'hi' ? 'शिक्षा के लिए, सलाह नहीं। संख्याएँ उदाहरण या अनुमान हैं।' : 'For education, not advice. The numbers are illustrations or assumptions.'}</Text>
        </ScrollView>
      )}
      <TrustSheet trust={trust} lang={lang} visible={trustOpen} onClose={() => setTrustOpen(false)} />
      <AskSheet reel={reel} lang={lang} visible={askOpen} onClose={() => setAskOpen(false)} />
    </View>
  );
}

/** Two small, quiet buttons under a reel: how its figures are worked out (when it quotes any), and Ask Mitra a what-if. */
function PillRow({ lang, onTrust, onAsk }: { lang: Lang; onTrust: (() => void) | null; onAsk: () => void }) {
  return (
    <View style={s.pills}>
      {onTrust ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'hi' ? 'यह कैसे निकाला गया' : 'How this is worked out'} onPress={onTrust} style={s.trust} hitSlop={{ top: 6, bottom: 6 }}>
          <Text style={s.trustTxt}>{`ⓘ  ${lang === 'hi' ? 'यह कैसे निकाला' : 'How this is worked out'}`}</Text>
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
  body: { flex: 1, justifyContent: 'flex-start' },
  bigWrap: { minHeight: 46, justifyContent: 'center', marginBottom: Spacing.xs },
  big: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  slot: { flex: 1, flexBasis: 0, justifyContent: 'flex-start', alignItems: 'center' },
  stage: { borderRadius: Radii.xl, overflow: 'hidden', alignSelf: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pauseVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  pauseGlyph: { color: '#fff', fontSize: 54 },
  caption: { color: '#fff', fontSize: 22, lineHeight: 31, fontWeight: '800', textAlign: 'center', marginTop: Spacing.md, minHeight: 66 },
  hint: { color: Colors.textDim, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm },
  quizScroll: { flex: 1, minHeight: 0 },
  quiz: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  quizTag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: Spacing.sm },
  quizQ: { color: '#fff', fontSize: 22, lineHeight: 30, fontWeight: '800', marginBottom: Spacing.lg },
  opt: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: Spacing.sm },
  optRight: { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.14)' },
  optWrong: { borderColor: Colors.red, backgroundColor: 'rgba(255,68,68,0.12)' },
  optTxt: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  optMark: { color: '#fff', fontSize: 18, fontWeight: '900' },
  why: { color: '#D8DEEC', fontSize: 15, lineHeight: 22, marginTop: Spacing.xs, marginBottom: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  again: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  againTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  next: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: Colors.cyan },
  nextTxt: { color: '#000', fontWeight: '900', fontSize: 15 },
  steer: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  steerBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: Spacing.sm },
  steerTxt: { color: '#D8DEEC', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  steered: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm },
  pills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  remind: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  remindTxt: { color: '#C4B5FD', fontSize: 13, fontWeight: '800' },
  trust: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  trustTxt: { color: '#C4B5FD', fontSize: 12, fontWeight: '700' },
  disclaimer: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.lg },
});
