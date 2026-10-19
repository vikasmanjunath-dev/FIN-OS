import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AUTO_CONTINUE_MS, IDLE_MS, orderDeck, posToValue, scoreGuess, scoreMyth, scoreOrder, scoreSort, scoreSpot, sliderBars, sliderLine, valueToPos, xText } from '@/lib/reels/beats';
import { money } from '@/lib/reels/figures';
import type { Beat } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** What the viewer did with the beat. `engaged` is false when they skipped or the beat revealed itself. */
export interface PokeResult { engaged: boolean }

const tick = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => { Haptics.impactAsync(style).catch(() => {}); };
const ok = (good: boolean) => { Haptics.notificationAsync(good ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {}); };
const hi = (lang: Lang, en: string, h: string) => (lang === 'hi' ? h : en);

/** The beat in the middle of a reel. It replaces the picture while it is on screen, and calls `onDone` when the reel should play on. */
export function Poke({ beat, lang, onDone }: { beat: Beat; lang: Lang; onDone: (r: PokeResult) => void }) {
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.wrap} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={s.tag}>{hi(lang, 'YOUR TURN', 'आपकी बारी')}</Text>
      {beat.kind === 'guess' ? <GuessBeat beat={beat} lang={lang} onDone={onDone} /> : beat.kind === 'slider' ? <SliderBeat beat={beat} lang={lang} onDone={onDone} /> : beat.kind === 'spot' ? <SpotBeat beat={beat} lang={lang} onDone={onDone} /> : beat.kind === 'path' ? <PathBeat beat={beat} lang={lang} onDone={onDone} /> : beat.kind === 'sort' ? <SortBeat beat={beat} lang={lang} onDone={onDone} /> : beat.kind === 'order' ? <OrderBeat beat={beat} lang={lang} onDone={onDone} /> : <MythBeat beat={beat} lang={lang} onDone={onDone} />}
    </ScrollView>
  );
}

// ── a draggable track, with steppers for anyone who prefers taps, keys or a screen reader ─────────────────────────

function TrackSlider({ pos, onPos, marks, label, valueText, stepBy = 0.02, locked }: {
  pos: number; onPos: (p: number) => void; marks?: { pos: number; color: string; label: string }[]; label: string; valueText: string; stepBy?: number; locked?: boolean;
}) {
  const w = useRef(1);
  const [, force] = useState(0);
  const at = useRef(onPos); at.current = onPos;
  const lockedRef = useRef(!!locked); lockedRef.current = !!locked;
  const set = (x: number) => { if (lockedRef.current) return; at.current(Math.min(1, Math.max(0, x / Math.max(1, w.current)))); };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !lockedRef.current,
    onMoveShouldSetPanResponder: () => !lockedRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => set(e.nativeEvent.locationX),
    onPanResponderMove: e => set(e.nativeEvent.locationX),
  }), []);
  const nudge = (d: number) => { if (!locked) onPos(Math.min(1, Math.max(0, pos + d))); };
  return (
    <View style={s.trackRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: less`} disabled={locked} onPress={() => nudge(-stepBy)} style={s.step}><Text style={s.stepTxt}>−</Text></TouchableOpacity>
      <View
        style={s.trackHit} {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => nudge(e.nativeEvent.actionName === 'increment' ? stepBy : -stepBy)}
        onLayout={e => { w.current = e.nativeEvent.layout.width; force(n => n + 1); }}>
        <View style={s.track} pointerEvents="none"><View style={[s.fill, { width: `${pos * 100}%` }]} /></View>
        {marks?.map((m, i) => <View key={i} pointerEvents="none" style={[s.mark, { left: `${m.pos * 100}%`, backgroundColor: m.color }]} />)}
        <View pointerEvents="none" style={[s.thumb, { left: `${pos * 100}%` }]} />
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: more`} disabled={locked} onPress={() => nudge(stepBy)} style={s.step}><Text style={s.stepTxt}>+</Text></TouchableOpacity>
    </View>
  );
}

/** Calls `fire` once after `ms` with no change to `dep`; the way a beat reveals itself when nobody touches it. */
function useIdle(ms: number, active: boolean, dep: unknown, fire: () => void) {
  const f = useRef(fire); f.current = fire;
  useEffect(() => { if (!active) return; const id = setTimeout(() => f.current(), ms); return () => clearTimeout(id); }, [ms, active, dep]);
}

// ── guess first ──────────────────────────────────────────────────────────────────────────────────────────────

function GuessBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'guess' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const [pos, setPos] = useState(0.3);
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState<null | { guess: number | null }>(null);
  const guess = posToValue(pos, beat.min, beat.max);
  const result = shown && shown.guess !== null ? scoreGuess(shown.guess, beat.answer) : null;
  const reveal = useCallback((g: number | null) => { setShown({ guess: g }); if (g !== null) ok(scoreGuess(g, beat.answer).verdict !== 'far'); }, [beat.answer]);

  useIdle(IDLE_MS, !shown, pos, () => reveal(null));                                       // nobody touched it: show the answer
  useIdle(AUTO_CONTINUE_MS, !!shown && !touched, shown, () => onDone({ engaged: false }));   // and play on after the viewer has had time to read
  const onPos = (p: number) => { setPos(p); setTouched(true); };

  const answerPos = valueToPos(beat.answer, beat.min, beat.max);
  const verdict = result ? (result.verdict === 'spot' ? hi(lang, 'Spot on!', 'बिल्कुल सही!') : result.verdict === 'close' ? hi(lang, 'Close!', 'क़रीब!') : result.side === 'low' ? hi(lang, `About ${result.times.toFixed(0)}× too low`, `लगभग ${result.times.toFixed(0)} गुना कम`) : hi(lang, `About ${result.times.toFixed(0)}× too high`, `लगभग ${result.times.toFixed(0)} गुना ज़्यादा`)) : null;

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      {!shown ? (
        <>
          <Text style={s.readout} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.2}>{money(guess)[lang]}</Text>
          <TrackSlider pos={pos} onPos={onPos} label={hi(lang, 'Your guess', 'आपका अंदाज़ा')} valueText={money(guess)[lang]} />
          <View style={s.ends}><Text style={s.endTxt}>{money(beat.min)[lang]}</Text><Text style={s.endTxt}>{money(beat.max)[lang]}</Text></View>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { tick(Haptics.ImpactFeedbackStyle.Medium); reveal(guess); setTouched(true); }}><Text style={s.primaryTxt}>{hi(lang, 'Lock in my guess', 'मेरा अंदाज़ा पक्का करें')}</Text></TouchableOpacity>
        </>
      ) : (
        <View accessibilityLiveRegion="polite">
          <TrackSlider pos={shown.guess !== null ? valueToPos(shown.guess, beat.min, beat.max) : answerPos} onPos={() => {}} locked label={hi(lang, 'Guess and answer', 'अंदाज़ा और जवाब')} valueText={money(beat.answer)[lang]}
            marks={[...(shown.guess !== null ? [{ pos: valueToPos(shown.guess, beat.min, beat.max), color: Colors.gold, label: 'guess' }] : []), { pos: answerPos, color: Colors.teal, label: 'answer' }]} />
          <View style={s.legend}>
            {shown.guess !== null ? <Text style={[s.legendTxt, { color: Colors.gold }]}>{`● ${hi(lang, 'You', 'आप')}: ${money(shown.guess)[lang]}`}</Text> : null}
            <Text style={[s.legendTxt, { color: Colors.teal }]}>{`● ${hi(lang, 'Answer', 'जवाब')}: ${money(beat.answer)[lang]}`}</Text>
          </View>
          {verdict ? <Text style={s.verdict}>{verdict}</Text> : null}
          <Text style={s.why} maxFontSizeMultiplier={1.3}>{beat.reveal[lang]}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => onDone({ engaged: touched })}><Text style={s.primaryTxt}>{hi(lang, 'Continue', 'आगे बढ़ें')}</Text></TouchableOpacity>
        </View>
      )}
      {!shown ? <SkipLink lang={lang} onPress={() => onDone({ engaged: false })} /> : null}
    </View>
  );
}

// ── what-if slider ───────────────────────────────────────────────────────────────────────────────────────────

function SliderBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'slider' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const span = beat.max - beat.min;
  const snap = (p: number) => Math.min(beat.max, Math.max(beat.min, Math.round((beat.min + p * span) / beat.step) * beat.step));
  const [x, setX] = useState(beat.start);
  const [touched, setTouched] = useState(false);
  const bars = sliderBars(beat, x);
  const onPos = (p: number) => { const nx = snap(p); if (nx !== x) tick(); setX(nx); setTouched(true); };
  useIdle(IDLE_MS, !touched, x, () => onDone({ engaged: false }));                            // untouched: the takeaway has been on screen, play on
  const line = sliderLine(beat, x)[lang];

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      <Text style={s.sliderLabel}>{`${beat.label[lang]}: `}<Text style={s.sliderX}>{xText(beat, x, lang)}</Text></Text>
      <TrackSlider pos={(x - beat.min) / span} onPos={onPos} stepBy={beat.step / span} label={beat.label[lang]} valueText={xText(beat, x, lang)} />
      <View style={s.ends}><Text style={s.endTxt}>{xText(beat, beat.min, lang)}</Text><Text style={s.endTxt}>{xText(beat, beat.max, lang)}</Text></View>
      <View style={s.bars} accessible accessibilityLabel={bars.map(b => `${b.label[lang]}: ${b.text[lang]}`).join('. ')}>
        {bars.map((b, i) => (
          <View key={i} style={s.barRow}>
            <Text style={s.barLabel} numberOfLines={2} maxFontSizeMultiplier={1.2}>{b.label[lang]}</Text>
            <View style={s.barBack}><View style={[s.barFill, { width: `${Math.max(2, b.frac * 100)}%`, backgroundColor: b.tone === 'a' ? Colors.teal : Colors.gold }]} /></View>
            <Text style={s.barVal} maxFontSizeMultiplier={1.2}>{b.text[lang]}</Text>
          </View>
        ))}
      </View>
      <Text style={s.why} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>{line}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => onDone({ engaged: touched })}><Text style={s.primaryTxt}>{hi(lang, 'Continue', 'आगे बढ़ें')}</Text></TouchableOpacity>
    </View>
  );
}

// ── myth or fact ─────────────────────────────────────────────────────────────────────────────────────────────

function MythBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'myth' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(boolean | null)[]>([]);
  const [shown, setShown] = useState(false);          // the card's reason is on screen
  const [touched, setTouched] = useState(false);
  const card = beat.cards[i], last = i === beat.cards.length - 1;
  const mine = answers[i];
  const answer = (said: boolean | null) => { setAnswers(a => { const n = [...a]; n[i] = said; return n; }); setShown(true); if (said !== null) { setTouched(true); ok(said === card.fact); } };

  useIdle(IDLE_MS, !shown, i, () => answer(null));                                        // nobody answered: show the reason
  useIdle(AUTO_CONTINUE_MS, shown && !touched, i, () => onDone({ engaged: false }));       // and, for a passive viewer, play on rather than sit through every card
  const score = scoreMyth(beat.cards, answers);
  const verdict = mine === null || mine === undefined ? null : mine === card.fact ? hi(lang, 'Right!', 'सही!') : hi(lang, 'Not quite.', 'लगभग!');

  return (
    <View>
      <Text style={s.cardCount}>{`${i + 1} / ${beat.cards.length}`}</Text>
      <View style={s.card} accessible accessibilityLabel={card.s[lang]}><Text style={s.cardTxt} maxFontSizeMultiplier={1.3}>{card.s[lang]}</Text></View>
      {!shown ? (
        <View style={s.pair}>
          <TouchableOpacity accessibilityRole="button" style={[s.pick, s.pickMyth]} onPress={() => answer(false)}><Text style={s.pickTxt}>{hi(lang, 'Myth', 'मिथक')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={[s.pick, s.pickFact]} onPress={() => answer(true)}><Text style={s.pickTxt}>{hi(lang, 'Fact', 'सच')}</Text></TouchableOpacity>
        </View>
      ) : (
        <View accessibilityLiveRegion="polite">
          <Text style={[s.verdict, mine === card.fact && { color: Colors.teal }]}>{`${verdict ? verdict + ' ' : ''}${card.fact ? hi(lang, 'It is a fact.', 'यह सच है।') : hi(lang, 'It is a myth.', 'यह मिथक है।')}`}</Text>
          <Text style={s.why} maxFontSizeMultiplier={1.3}>{card.why[lang]}</Text>
          {last ? <Text style={s.score}>{hi(lang, `You got ${score.right} of ${score.total}`, `आपके ${score.total} में से ${score.right} सही`)}</Text> : null}
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { if (last) onDone({ engaged: touched }); else { setI(i + 1); setShown(false); } }}>
            <Text style={s.primaryTxt}>{last ? hi(lang, 'Continue', 'आगे बढ़ें') : hi(lang, 'Next card', 'अगली बात')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!shown ? <SkipLink lang={lang} onPress={() => onDone({ engaged: touched })} /> : null}
    </View>
  );
}

// ── spot the scam ────────────────────────────────────────────────────────────────────────────────────────────

function SpotBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'spot' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const [picked, setPicked] = useState<boolean[]>(() => beat.parts.map(() => false));
  const [shown, setShown] = useState(false);
  const [touched, setTouched] = useState(false);
  const toggle = (i: number) => { if (shown) return; tick(); setTouched(true); setPicked(p => p.map((v, k) => (k === i ? !v : v))); };
  const check = useCallback(() => { setShown(true); ok(true); }, []);
  useIdle(IDLE_MS, !shown, picked, check);                                                  // nobody touched it: show every red flag
  useIdle(AUTO_CONTINUE_MS, shown && !touched, shown, () => onDone({ engaged: false }));
  const r = scoreSpot(beat.parts, shown && !touched ? beat.parts.map(p => !!p.flag) : picked);
  const flagged = beat.parts.map((p, i) => ({ p, i })).filter(x => x.p.flag);

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      <View style={s.bubble} accessible={false}>
        <Text style={s.from}>{beat.from[lang]}</Text>
        <View style={s.msg}>
          {beat.parts.map((p, i) => {
            const on = picked[i], isFlag = !!p.flag;
            const state = !shown ? (on ? s.partOn : null) : isFlag ? (on || !touched ? s.partGood : s.partMissed) : on ? s.partWrong : null;
            return (
              <Pressable key={i} onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${p.t[lang]}${shown && isFlag ? hi(lang, '. red flag', '. लाल झंडा') : ''}`} style={[s.part, state]}>
                <Text style={s.partTxt} maxFontSizeMultiplier={1.3}>{p.t[lang]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {!shown ? (
        <>
          <Text style={s.hint}>{hi(lang, 'Tap the parts that look suspicious.', 'जो हिस्से शक वाले लगें, उन्हें छुएँ।')}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { setTouched(true); check(); }}><Text style={s.primaryTxt}>{hi(lang, 'Check', 'जाँचें')}</Text></TouchableOpacity>
          <SkipLink lang={lang} onPress={() => onDone({ engaged: false })} />
        </>
      ) : (
        <View accessibilityLiveRegion="polite">
          <Text style={s.verdict}>{touched ? (hi(lang, `You spotted ${r.found} of ${r.flags} red flags`, `आपने ${r.found} में से ${r.flags} लाल झंडे पकड़े`)) : hi(lang, `There were ${r.flags} red flags`, `इसमें ${r.flags} लाल झंडे थे`)}</Text>
          {touched ? <Text style={s.hint}>{hi(lang, 'Green: caught · Red: missed · Struck through: normal part', 'हरा: पकड़ा · लाल: छूटा · कटा हुआ: सामान्य हिस्सा')}</Text> : null}
          {flagged.map(x => <Text key={x.i} style={s.flagLine} maxFontSizeMultiplier={1.3}>{`⚑ ${x.p.flag![lang]}`}</Text>)}
          <Text style={s.why} maxFontSizeMultiplier={1.3}>{beat.todo[lang]}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => onDone({ engaged: touched })}><Text style={s.primaryTxt}>{hi(lang, 'Continue', 'आगे बढ़ें')}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── choose your path ─────────────────────────────────────────────────────────────────────────────────────────

function PathBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'path' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [all, setAll] = useState(false);                // every path is on screen (after a pick, or after waiting)
  const [touched, setTouched] = useState(false);
  useIdle(IDLE_MS, !all, pick, () => setAll(true));
  useIdle(AUTO_CONTINUE_MS, all && !touched, all, () => onDone({ engaged: false }));
  const choose = (i: number) => { tick(Haptics.ImpactFeedbackStyle.Medium); setPick(i); setAll(true); setTouched(true); };

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      <Text style={s.why} maxFontSizeMultiplier={1.3}>{beat.setup[lang]}</Text>
      {!all ? (
        <>
          {beat.options.map((o, i) => <TouchableOpacity key={i} accessibilityRole="button" style={s.pathBtn} onPress={() => choose(i)}><Text style={s.pathTxt}>{o.label[lang]}</Text></TouchableOpacity>)}
          <SkipLink lang={lang} onPress={() => onDone({ engaged: false })} />
        </>
      ) : (
        <View accessibilityLiveRegion="polite">
          {beat.options.map((o, i) => (
            <View key={i} style={[s.pathCard, pick === i && s.pathCardOn]}>
              <Text style={s.pathHead}>{`${pick === i ? '▶ ' : ''}${o.label[lang]}`}</Text>
              <Text style={s.pathRes} maxFontSizeMultiplier={1.3}>{o.result[lang]}</Text>
            </View>
          ))}
          <Text style={s.verdict} maxFontSizeMultiplier={1.3}>{beat.verdict[lang]}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => onDone({ engaged: touched })}><Text style={s.primaryTxt}>{hi(lang, 'Continue', 'आगे बढ़ें')}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── sort it ──────────────────────────────────────────────────────────────────────────────────────────────────

function SortBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'sort' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [shown, setShown] = useState(false);
  const [touched, setTouched] = useState(false);
  const card = beat.cards[i], last = i === beat.cards.length - 1, mine = answers[i];
  const answer = (bin: number | null) => { setAnswers(a => { const n = [...a]; n[i] = bin; return n; }); setShown(true); if (bin !== null) { setTouched(true); ok(bin === card.bin); } };
  useIdle(IDLE_MS, !shown, i, () => answer(null));
  useIdle(AUTO_CONTINUE_MS, shown && !touched, i, () => onDone({ engaged: false }));
  const score = scoreSort(beat.cards, answers);
  const verdict = mine === null || mine === undefined ? null : mine === card.bin ? hi(lang, 'Right!', 'सही!') : hi(lang, 'Not quite.', 'लगभग!');

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      <Text style={s.cardCount}>{`${i + 1} / ${beat.cards.length}`}</Text>
      <View style={s.card} accessible accessibilityLabel={card.t[lang]}><Text style={s.cardTxt} maxFontSizeMultiplier={1.3}>{card.t[lang]}</Text></View>
      {!shown ? (
        <>
          <View style={s.binRow}>
            {beat.bins.map((b, k) => <TouchableOpacity key={k} accessibilityRole="button" style={s.bin} onPress={() => answer(k)}><Text style={s.binTxt}>{b[lang]}</Text></TouchableOpacity>)}
          </View>
          <SkipLink lang={lang} onPress={() => onDone({ engaged: touched })} />
        </>
      ) : (
        <View accessibilityLiveRegion="polite">
          <Text style={[s.verdict, mine === card.bin && { color: Colors.teal }]}>{`${verdict ? verdict + ' ' : ''}${hi(lang, 'It belongs in: ', 'यह यहाँ आता है: ')}${beat.bins[card.bin][lang]}`}</Text>
          <Text style={s.why} maxFontSizeMultiplier={1.3}>{card.why[lang]}</Text>
          {last ? <Text style={s.score}>{hi(lang, `You got ${score.right} of ${score.total}`, `आपके ${score.total} में से ${score.right} सही`)}</Text> : null}
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { if (last) onDone({ engaged: touched }); else { setI(i + 1); setShown(false); } }}><Text style={s.primaryTxt}>{last ? hi(lang, 'Continue', 'आगे बढ़ें') : hi(lang, 'Next card', 'अगला कार्ड')}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── put it in order ──────────────────────────────────────────────────────────────────────────────────────────

function OrderBeat({ beat, lang, onDone }: { beat: Extract<Beat, { kind: 'order' }>; lang: Lang; onDone: (r: PokeResult) => void }) {
  const deck = useMemo(() => orderDeck(beat.items.length), [beat.items.length]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [shown, setShown] = useState(false);
  const [touched, setTouched] = useState(false);
  const full = chosen.length === beat.items.length;
  const pickItem = (idx: number) => { if (shown || chosen.includes(idx)) return; tick(); setTouched(true); setChosen(c => [...c, idx]); };
  const reveal = useCallback(() => { setShown(true); ok(true); }, []);
  useEffect(() => { if (full && !shown) reveal(); }, [full, shown, reveal]);
  useIdle(IDLE_MS, !shown, chosen.length, reveal);
  useIdle(AUTO_CONTINUE_MS, shown && !touched, shown, () => onDone({ engaged: false }));
  const score = scoreOrder(chosen, beat.items.length);

  return (
    <View>
      <Text style={s.q} maxFontSizeMultiplier={1.3}>{beat.q[lang]}</Text>
      {!shown ? (
        <>
          <Text style={s.hint}>{hi(lang, 'Tap them in order, first to last.', 'पहले से आख़िरी तक, क्रम से छुएँ।')}</Text>
          {deck.map(idx => {
            const pos = chosen.indexOf(idx);
            return (
              <TouchableOpacity key={idx} accessibilityRole="button" accessibilityState={{ selected: pos >= 0, disabled: pos >= 0 }} style={[s.orderItem, pos >= 0 && s.orderItemOn]} onPress={() => pickItem(idx)}>
                <Text style={s.orderNum}>{pos >= 0 ? String(pos + 1) : '·'}</Text>
                <Text style={s.orderTxt} maxFontSizeMultiplier={1.3}>{beat.items[idx].t[lang]}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={s.pair}>
            <TouchableOpacity accessibilityRole="button" style={[s.pick, { borderColor: 'rgba(255,255,255,0.25)' }]} onPress={() => setChosen([])}><Text style={s.pickTxt}>{hi(lang, 'Start over', 'फिर से')}</Text></TouchableOpacity>
          </View>
          <SkipLink lang={lang} onPress={() => onDone({ engaged: touched })} />
        </>
      ) : (
        <View accessibilityLiveRegion="polite">
          {touched ? <Text style={s.verdict}>{hi(lang, `${score.right} of ${score.total} in the right place`, `${score.total} में से ${score.right} सही जगह पर`)}</Text> : null}
          {beat.items.map((it, k) => (
            <View key={k} style={s.pathCard}>
              <Text style={s.pathHead}>{`${k + 1}. ${it.t[lang]}`}</Text>
              <Text style={s.pathRes} maxFontSizeMultiplier={1.3}>{it.why[lang]}</Text>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => onDone({ engaged: touched })}><Text style={s.primaryTxt}>{hi(lang, 'Continue', 'आगे बढ़ें')}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SkipLink({ lang, onPress }: { lang: Lang; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.skip}><Text style={s.skipTxt}>{hi(lang, 'Skip', 'छोड़ें')}</Text></Pressable>;
}

const THUMB = 28;
const HOLD = 'rgba(251,191,36,0.28)';
const s = StyleSheet.create({
  scroll: { flex: 1 },
  wrap: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  tag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: Spacing.sm },
  q: { color: '#fff', fontSize: 22, lineHeight: 30, fontWeight: '800', marginBottom: Spacing.md },
  readout: { color: '#fff', fontSize: 40, fontWeight: '900', textAlign: 'center', marginBottom: Spacing.xs },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  trackHit: { flex: 1, height: 56, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 8, backgroundColor: 'rgba(0,212,255,0.55)' },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, marginLeft: -THUMB / 2, borderRadius: THUMB / 2, backgroundColor: '#fff', top: (56 - THUMB) / 2, borderWidth: 3, borderColor: Colors.cyan },
  mark: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, top: (56 - 14) / 2, borderWidth: 2, borderColor: '#070A1A' },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  stepTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 52, marginTop: -2, marginBottom: Spacing.md },
  endTxt: { color: Colors.textDim, fontSize: 11 },
  primary: { minHeight: 52, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  primaryTxt: { color: '#000', fontSize: 16, fontWeight: '900' },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  skipTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.md, flexWrap: 'wrap', marginTop: Spacing.xs },
  legendTxt: { fontSize: 14, fontWeight: '800' },
  verdict: { color: Colors.gold, fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: Spacing.md },
  why: { color: '#D8DEEC', fontSize: 15, lineHeight: 22, marginTop: Spacing.sm },
  sliderLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.xs },
  sliderX: { color: '#fff', fontSize: 18, fontWeight: '900' },
  bars: { gap: Spacing.xs, marginTop: Spacing.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barLabel: { width: 96, color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  barBack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 14, borderRadius: 7 },
  barVal: { width: 84, color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  cardCount: { color: Colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: Spacing.xs },
  card: { minHeight: 120, borderRadius: Radii.xl, padding: Spacing.lg, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  cardTxt: { color: '#fff', fontSize: 20, lineHeight: 28, fontWeight: '800' },
  pair: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  pick: { flex: 1, minHeight: 56, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  pickMyth: { borderColor: Colors.red, backgroundColor: 'rgba(255,68,68,0.12)' },
  pickFact: { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.14)' },
  pickTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  bubble: { borderRadius: Radii.xl, padding: Spacing.md, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  from: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: Spacing.xs },
  msg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  part: { maxWidth: '100%', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  partTxt: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  partOn: { backgroundColor: HOLD, borderColor: '#FBBF24' },
  partGood: { backgroundColor: 'rgba(34,211,166,0.3)' },
  partMissed: { backgroundColor: 'rgba(255,68,68,0.3)' },
  partWrong: { backgroundColor: 'rgba(255,255,255,0.14)', opacity: 0.6 },
  hint: { color: Colors.textMuted, fontSize: 13, marginTop: Spacing.sm, textAlign: 'center' },
  flagLine: { color: '#FCD9A8', fontSize: 14, lineHeight: 20, marginTop: Spacing.xs },
  pathBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', marginTop: Spacing.sm },
  pathTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  pathCard: { padding: Spacing.sm, borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: Spacing.xs },
  pathCardOn: { borderWidth: 1.5, borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.08)' },
  pathHead: { color: '#fff', fontSize: 14, fontWeight: '900' },
  pathRes: { color: '#D8DEEC', fontSize: 13, lineHeight: 19, marginTop: 2 },
  binRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  bin: { flexGrow: 1, minHeight: 52, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.10)' },
  binTxt: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  orderItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 52, paddingHorizontal: Spacing.md, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', marginTop: Spacing.xs },
  orderItemOn: { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.12)' },
  orderNum: { color: Colors.cyan, fontSize: 18, fontWeight: '900', width: 22, textAlign: 'center' },
  orderTxt: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  score: { color: Colors.gold, fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: Spacing.sm },
});
