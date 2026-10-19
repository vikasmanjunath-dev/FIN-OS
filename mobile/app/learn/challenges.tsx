import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, TrackerScreen } from '@/components/TrackerUI';
import { loadChallenges, saveChallenges } from '@/lib/reelsChallengesStorage';
import { CHALLENGES, EMPTY_CHALLENGES, completeToday, isFinished, runOf, startChallenge, todayOf, type ChallengeState } from '@/lib/reels/challenges';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/** Seven-day challenges: one small task a day, ticked by you. No scores, no comparing, and a missed day costs nothing. */
export default function Challenges() {
  const lang = useLang(), hi = lang === 'hi';
  const [state, setState] = useState<ChallengeState>(EMPTY_CHALLENGES);
  useFocusEffect(useCallback(() => { let live = true; loadChallenges().then(s => { if (live) setState(s); }); return () => { live = false; }; }, []));
  const update = (next: ChallengeState) => { setState(next); saveChallenges(next); };

  return (
    <TrackerScreen title={hi ? '7 दिन की चुनौतियाँ' : '7-day challenges'} subtitle={hi ? 'हर दिन एक छोटा काम, जो आप ख़ुद पूरा मानते हैं। कोई अंक नहीं, कोई तुलना नहीं; छूटा दिन कुछ नहीं बिगाड़ता।' : 'One small task a day, ticked by you. No scores, no comparing, and a missed day costs nothing.'}>
      {CHALLENGES.map(c => {
        const run = runOf(state, c.id);
        const finished = run ? isFinished(run) : false;
        const t = run && !finished ? todayOf(run, new Date()) : null;
        const day = t ? c.days[t.index] : null;
        return (
          <Card key={c.id} accent={Colors.cyan}>
            <Text style={s.title}>{c.title[lang]}</Text>
            <Text style={Typography.caption}>{c.blurb[lang]}</Text>
            {run ? (
              <View style={s.dots} accessible accessibilityLabel={hi ? `${run.done.length} में से ${c.days.length} दिन पूरे` : `${run.done.length} of ${c.days.length} days done`}>
                {c.days.map((_, i) => <View key={i} style={[s.dot, i < run.done.length && s.dotOn, !finished && t && i === t.index && s.dotNow]} />)}
              </View>
            ) : null}
            {finished ? (
              <>
                <Text style={s.done}>{`✓ ${c.end[lang]}`}</Text>
                <TouchableOpacity accessibilityRole="button" style={s.ghost} onPress={() => update(startChallenge(state, c.id, new Date()))}><Text style={s.ghostTxt}>{hi ? 'फिर से करें' : 'Do it again'}</Text></TouchableOpacity>
              </>
            ) : day && t ? (
              <View style={s.task}>
                <Text style={s.taskTag}>{hi ? `दिन ${t.index + 1} / ${c.days.length}` : `DAY ${t.index + 1} OF ${c.days.length}`}</Text>
                <Text style={s.taskTitle}>{day.title[lang]}</Text>
                <Text style={s.taskBody}>{day.body[lang]}</Text>
                {day.href ? <TouchableOpacity accessibilityRole="button" style={s.ghost} onPress={() => router.push(day.href as never)}><Text style={s.ghostTxt}>{`${day.hrefLabel?.[lang] ?? (hi ? 'खोलें' : 'Open')} →`}</Text></TouchableOpacity> : null}
                {t.available ? (
                  <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); update(completeToday(state, c.id, new Date())); }}><Text style={s.primaryTxt}>{hi ? 'आज यह कर लिया' : 'Done for today'}</Text></TouchableOpacity>
                ) : <Text style={s.wait}>{hi ? 'आज का काम हो गया। अगला कल।' : 'Today’s task is done. The next one is tomorrow.'}</Text>}
              </View>
            ) : (
              <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => update(startChallenge(state, c.id, new Date()))}><Text style={s.primaryTxt}>{hi ? 'शुरू करें' : 'Start'}</Text></TouchableOpacity>
            )}
          </Card>
        );
      })}
      <Text style={[Typography.caption, { marginTop: Spacing.md }]}>{hi ? 'सिर्फ़ इसी फ़ोन पर। असली क़दम आप ख़ुद उठाते हैं; ऐप सिर्फ़ याद रखता है।' : 'Kept on this phone only. You take the real step; the app only remembers it.'}</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  title: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 2 },
  dots: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  dot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)' },
  dotOn: { backgroundColor: Colors.teal },
  dotNow: { backgroundColor: Colors.cyan },
  task: { marginTop: Spacing.md },
  taskTag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  taskTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2 },
  taskBody: { color: '#D8DEEC', fontSize: 14, lineHeight: 20, marginTop: 4 },
  primary: { minHeight: 48, borderRadius: Radii.md, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md, paddingHorizontal: Spacing.md },
  primaryTxt: { color: '#000', fontWeight: '900', fontSize: 15 },
  ghost: { minHeight: 44, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.cyan + '66', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.md },
  ghostTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  done: { color: Colors.teal, fontSize: 14, fontWeight: '700', marginTop: Spacing.md, lineHeight: 20 },
  wait: { color: Colors.textMuted, fontSize: 14, marginTop: Spacing.md },
});
