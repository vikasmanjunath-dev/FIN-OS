import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/Tap';
import { router, useFocusEffect } from 'expo-router';
import { Card, SectionLabel, TrackerScreen } from '@/components/TrackerUI';
import { LIBRARY } from '@/lib/reels/library';
import { buildSession, SESSION_SIZE } from '@/lib/reels/recall';
import { withScrambledQuiz } from '@/lib/reels/quizorder';
import { loadReelsProfile } from '@/lib/reelsProfileStorage';
import { loadWatched, recordWatched } from '@/lib/reelsStorage';
import { recordStat } from '@/lib/reelsStatsStorage';
import type { Reel } from '@/lib/reels/types';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/** Quick review: a few questions from reels you have already answered and that are due again, from different topics in turn. Only the question comes back,
 *  not the whole reel; a right answer pushes the next review further away, a miss brings it back tomorrow. */
export default function QuickReview() {
  const lang = useLang(), hi = lang === 'hi';
  const [session, setSession] = useState<Reel[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [mine, setMine] = useState('');                 // the person's own words for why (teach it back); never saved
  const [shown, setShown] = useState(false);            // the reel's reason, shown after they have tried or skipped
  useFocusEffect(useCallback(() => {
    let live = true;
    Promise.all([loadWatched(), loadReelsProfile()]).then(([w, p]) => { if (live) { setSession(buildSession(w, LIBRARY, new Date(), SESSION_SIZE, p.known).map(withScrambledQuiz)); setI(0); setPicked(null); setRight(0); setMine(''); setShown(false); } });
    return () => { live = false; };
  }, []));

  const r = session?.[i];
  const answer = (k: number) => {
    if (!r || picked !== null) return;
    setPicked(k);
    const ok = k === r.quiz.answer;
    if (ok) setRight(n => n + 1);
    recordStat('fin'); if (ok) recordStat('right');
    void recordWatched(r.id, ok);
  };
  const next = () => { setPicked(null); setMine(''); setShown(false); setI(n => n + 1); };
  const done = !!session && i >= session.length;

  return (
    <TrackerScreen title={hi ? 'झटपट दोहराव' : 'Quick review'} subtitle={hi ? 'उन रीलों के कुछ सवाल जो आप देख चुके हैं और जिन्हें दोहराने का समय है। नतीजा सिर्फ़ इसी फ़ोन पर।' : 'A few questions from reels you have already answered and that are due again. The result stays on this phone.'}>
      {session === null ? null : session.length === 0 ? (
        <Card><Text style={Typography.body}>{hi ? 'अभी कुछ दोहराने को नहीं है। जैसे-जैसे आप रीलें देखेंगे, पुराने सवाल सही समय पर यहाँ लौटेंगे।' : 'Nothing is due right now. As you watch reels, older questions come back here at the right time.'}</Text></Card>
      ) : done ? (
        <Card accent={Colors.teal}>
          <Text style={s.q}>{hi ? `${session.length} में से ${right} सही` : `${right} of ${session.length} right`}</Text>
          <Text style={Typography.body}>{hi ? 'सही जवाबों का अगला दोहराव दूर हो गया; छूटे हुए कल लौटेंगे।' : 'Right answers will come back later; missed ones return tomorrow.'}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => router.back()}><Text style={s.primaryTxt}>{hi ? 'ठीक है' : 'Done'}</Text></TouchableOpacity>
        </Card>
      ) : r ? (
        <>
          <SectionLabel>{hi ? `सवाल ${i + 1} / ${session.length} · ${r.title.hi}` : `QUESTION ${i + 1} OF ${session.length} · ${r.title.en}`}</SectionLabel>
          <Card>
            <Text style={s.q} maxFontSizeMultiplier={1.3}>{r.quiz.q[lang]}</Text>
            {r.quiz.options.map((o, k) => {
              const ok = picked !== null && k === r.quiz.answer, bad = picked === k && k !== r.quiz.answer;
              return (
                <TouchableOpacity key={k} accessibilityRole="button" accessibilityState={{ selected: picked === k, disabled: picked !== null }} disabled={picked !== null} onPress={() => answer(k)}
                  style={[s.opt, ok && { borderColor: Colors.teal }, bad && { borderColor: Colors.red }]}>
                  <Text style={s.optTxt} maxFontSizeMultiplier={1.3}>{o[lang]}{ok ? '  ✓' : bad ? '  ✕' : ''}</Text>
                </TouchableOpacity>
              );
            })}
            {picked !== null ? (
              <View accessibilityLiveRegion="polite">
                <Text style={[Typography.body, { marginTop: Spacing.sm }]}>{picked === r.quiz.answer ? (hi ? 'सही!' : 'Right!') : (hi ? 'लगभग!' : 'Not quite.')}</Text>
                {!shown ? (
                  <>
                    <Text style={[Typography.label, { marginTop: Spacing.sm }]}>{hi ? 'अपने शब्दों में, एक पंक्ति में: ऐसा क्यों?' : 'IN YOUR OWN WORDS, ONE LINE: WHY?'}</Text>
                    <TextInput style={s.input} value={mine} onChangeText={setMine} multiline maxLength={200} accessibilityLabel={hi ? 'अपने शब्दों में कारण' : 'Your reason in your own words'} placeholder={hi ? 'जैसे: क्योंकि ब्याज पर भी ब्याज लगता है' : 'For example: because interest earns interest'} placeholderTextColor={Colors.textDim} />
                    <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => setShown(true)}><Text style={s.primaryTxt}>{mine.trim() ? (hi ? 'रील का कारण देखें' : 'Compare with the reel') : (hi ? 'छोड़ें और कारण देखें' : 'Skip and see the reason')}</Text></TouchableOpacity>
                  </>
                ) : (
                  <>
                    {mine.trim() ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>{`${hi ? 'आपने लिखा' : 'You wrote'}: ${mine.trim()}`}</Text> : null}
                    <Text style={[Typography.label, { marginTop: Spacing.sm }]}>{hi ? 'रील का कारण' : 'THE REEL SAYS'}</Text>
                    <Text style={Typography.body}>{r.quiz.why[lang]}</Text>
                  </>
                )}
                {shown ? <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={next}><Text style={s.primaryTxt}>{i + 1 >= session.length ? (hi ? 'नतीजा देखें' : 'See the result') : (hi ? 'अगला' : 'Next')}</Text></TouchableOpacity> : null}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
      <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>{hi ? 'शिक्षा के लिए, सलाह नहीं।' : 'For education, not advice.'}</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  q: { color: Colors.textPrimary, fontSize: 18, lineHeight: 26, fontWeight: '800', marginBottom: Spacing.sm },
  opt: { minHeight: 52, borderRadius: Radii.md, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 10, justifyContent: 'center', marginTop: Spacing.sm },
  input: { minHeight: 48, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: 6, fontSize: 15 },
  optTxt: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  primary: { minHeight: 48, borderRadius: Radii.md, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  primaryTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
