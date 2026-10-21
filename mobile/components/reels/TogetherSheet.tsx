import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { announce } from '@/components/reels/announce';
import { TrackSlider } from '@/components/reels/Poke';
import { posToValue, valueToPos } from '@/lib/reels/beats';
import { money } from '@/lib/reels/figures';
import { judgeTogether, togetherBeat } from '@/lib/reels/together';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

type Phase = 'intro' | 'first' | 'pass' | 'second' | 'reveal';

/** Money date on one phone: two people each guess the reel's example question, the guesses stay hidden until both are in, then both are shown
 *  against the answer. It uses only the reel's example figures, never anyone's own, and keeps nothing once it closes. */
export function TogetherSheet({ reelId, lang, visible, onClose, onPlayed }: { reelId: string; lang: Lang; visible: boolean; onClose: () => void; onPlayed?: () => void }) {
  const hi = lang === 'hi';
  const tb = useMemo(() => togetherBeat(reelId), [reelId]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [pos, setPos] = useState(0.3);
  const [g1, setG1] = useState<number | null>(null);
  const [g2, setG2] = useState<number | null>(null);
  useEffect(() => { if (visible) { setPhase('intro'); setPos(0.3); setG1(null); setG2(null); } }, [visible, reelId]);
  const guess = tb ? posToValue(pos, tb.beat.min, tb.beat.max) : 0;
  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const res = tb && g1 !== null && g2 !== null ? judgeTogether(g1, g2, tb.beat.answer) : null;
  const who = (i: 0 | 1) => (i === 0 ? (hi ? 'पहला' : 'First') : (hi ? 'दूसरा' : 'Second'));
  const turn = (i: 0 | 1) => (hi ? `${who(i)} खिलाड़ी की बारी` : `${who(i)} player's turn`);
  const verdict = res ? (res.closer === null ? (hi ? 'लगभग बराबर! दोनों बराबर क़रीब थे।' : 'A tie! You were about equally close.') : (hi ? `${who(res.closer)} खिलाड़ी जवाब के ज़्यादा क़रीब था।` : `${who(res.closer)} player was closer.`)) : '';
  const passNote = hi ? 'अंदाज़ा छिपा लिया गया है। फ़ोन दूसरे खिलाड़ी को दें।' : 'Guess hidden. Pass the phone to the second player.';
  // each step is said once: by the live text it contains on Android and the web, and by announce() on iPhone (which ignores live regions)
  useEffect(() => { if (!visible) return; if (phase === 'first') announce(turn(0)); else if (phase === 'second') announce(turn(1)); else if (phase === 'pass') announce(passNote); else if (phase === 'reveal' && verdict) announce(verdict); }, [phase, visible]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!tb) return null;
  const { beat } = tb;

  const lock = () => {
    tick();
    if (phase === 'first') { setG1(guess); setPhase('pass'); }
    else if (phase === 'second') { setG2(guess); setPhase('reveal'); onPlayed?.(); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.title} accessibilityRole="header">{hi ? '👫 साथ में खेलें' : '👫 Play together'}</Text>
            {phase === 'intro' ? (
              <>
                <Text style={s.body}>{hi ? 'दो लोग, एक फ़ोन। दोनों एक ही उदाहरण का अंदाज़ा लगाएँ, एक-दूसरे को दिखाए बिना। फिर दोनों जवाब के साथ दिखेंगे।' : 'Two people, one phone. Each of you guesses the same example, without seeing the other\'s guess. Then both guesses are shown against the answer.'}</Text>
                <Text style={s.note}>{hi ? 'सिर्फ़ रील के उदाहरण वाली रकमें इस्तेमाल होती हैं, किसी की अपनी नहीं। कुछ भी सेव या भेजा नहीं जाता।' : 'Only the reel\'s example figures are used, never anyone\'s own. Nothing is saved or sent.'}</Text>
                <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => setPhase('first')}><Text style={s.primaryTxt}>{hi ? 'शुरू करें' : 'Start'}</Text></TouchableOpacity>
              </>
            ) : null}
            {phase === 'first' || phase === 'second' ? (
              <>
                <Text style={s.who} accessibilityLiveRegion="polite" accessibilityRole="header">{turn(phase === 'first' ? 0 : 1)}</Text>
                <Text style={s.q}>{beat.q[lang]}</Text>
                <Text style={s.readout} maxFontSizeMultiplier={1.2}>{money(guess)[lang]}</Text>
                <TrackSlider pos={pos} onPos={setPos} lang={lang} label={hi ? 'आपका अंदाज़ा' : 'Your guess'} valueText={money(guess)[lang]} />
                <View style={s.ends}><Text style={s.endTxt}>{money(beat.min)[lang]}</Text><Text style={s.endTxt}>{money(beat.max)[lang]}</Text></View>
                <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={lock}><Text style={s.primaryTxt}>{phase === 'first' ? (hi ? 'अंदाज़ा पक्का करें और छिपाएँ' : 'Lock in and hide my guess') : (hi ? 'अंदाज़ा पक्का करें' : 'Lock in my guess')}</Text></TouchableOpacity>
              </>
            ) : null}
            {phase === 'pass' ? (
              <>
                <View accessibilityLiveRegion="polite">
                  <Text style={s.pass} accessibilityRole="header">{hi ? 'अंदाज़ा छिपा लिया गया है।' : 'Guess hidden.'}</Text>
                  <Text style={s.body}>{hi ? 'फ़ोन दूसरे खिलाड़ी को दें।' : 'Pass the phone to the second player.'}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { setPos(0.3); setPhase('second'); }}><Text style={s.primaryTxt}>{hi ? 'मैं दूसरा खिलाड़ी हूँ' : 'I am the second player'}</Text></TouchableOpacity>
              </>
            ) : null}
            {phase === 'reveal' && res && g1 !== null && g2 !== null ? (
              <>
                <Text style={s.q}>{beat.q[lang]}</Text>
                <TrackSlider pos={valueToPos(beat.answer, beat.min, beat.max)} onPos={() => {}} locked lang={lang} label={hi ? 'दोनों अंदाज़े और जवाब' : 'Both guesses and the answer'} valueText={money(beat.answer)[lang]}
                  marks={[{ pos: valueToPos(g1, beat.min, beat.max), color: Colors.gold, label: 'first' }, { pos: valueToPos(g2, beat.min, beat.max), color: Colors.purpleInk, label: 'second' }, { pos: valueToPos(beat.answer, beat.min, beat.max), color: Colors.teal, label: 'answer' }]} />
                <Text style={[s.legend, { color: Colors.gold }]}>{`● ${who(0)}: ${money(g1)[lang]}`}</Text>
                <Text style={[s.legend, { color: Colors.purpleInk }]}>{`● ${who(1)}: ${money(g2)[lang]}`}</Text>
                <Text style={[s.legend, { color: Colors.teal }]}>{`● ${hi ? 'जवाब' : 'Answer'}: ${money(beat.answer)[lang]}`}</Text>
                <Text style={s.verdict} accessibilityLiveRegion="polite" accessibilityRole="header">{verdict}</Text>
                <Text style={s.body}>{beat.reveal[lang]}</Text>
                <Text style={s.note}>{hi ? 'अब साथ बैठकर अपने असली आँकड़ों पर बात करें, अपनी मर्ज़ी से।' : 'Now, if you like, talk about your real numbers together. That is up to you.'}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={hi ? 'फिर से खेलें' : 'Play again'} style={s.ghost} onPress={() => { setG1(null); setG2(null); setPos(0.3); setPhase('first'); }}><Text style={s.ghostTxt}>{hi ? '↺ फिर से खेलें' : '↺ Play again'}</Text></TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{hi ? 'बंद करें' : 'Close'}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { maxHeight: '88%', backgroundColor: '#0F1530', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.lg, paddingBottom: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: Spacing.sm },
  body: { color: '#E6EAF5', fontSize: 15, lineHeight: 22, marginTop: Spacing.xs },
  note: { color: Colors.textDim, fontSize: 12, lineHeight: 18, marginTop: Spacing.md },
  who: { color: Colors.cyan, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: Spacing.xs },
  q: { color: '#fff', fontSize: 18, lineHeight: 26, fontWeight: '800', marginTop: Spacing.sm },
  readout: { color: Colors.gold, fontSize: 32, fontWeight: '900', textAlign: 'center', marginVertical: Spacing.sm },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  endTxt: { color: Colors.textMuted, fontSize: 12 },
  primary: { minHeight: 52, borderRadius: Radii.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: Spacing.md },
  primaryTxt: { color: '#070A1A', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pass: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: Spacing.md },
  legend: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  verdict: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: Spacing.md },
  ghost: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', marginTop: Spacing.md },
  ghostTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  close: { minHeight: 48, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  closeTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
