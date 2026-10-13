import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar } from '@/components/TrackerUI';
import { Collapsible, Bullet } from '@/components/CalcUI';
import { STEPS, DIMENSIONS, DESCRIBE, behaviourPoints, isComplete, nextIndex, scoresFor } from '@/lib/dna';
import { loadDna, resetDna, saveDna } from '@/lib/dnaStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const COLORS = [Colors.cyan, Colors.teal, Colors.gold, Colors.purple, Colors.red];

export default function DnaScreen() {
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [idx, setIdx] = useState(0);          // the question being shown (can be moved back to change an answer)

  useFocusEffect(useCallback(() => {
    loadDna().then(s => { const r = s?.responses ?? {}; setAnswers(r); setIdx(isComplete(r) ? STEPS.length : Math.max(0, nextIndex(r))); });
  }, []));

  if (!answers) return <TrackerScreen title="Financial DNA" subtitle="Nine questions about how you think about money."><Card><Text style={Typography.body}>Loading…</Text></Card></TrackerScreen>;

  const done = isComplete(answers);
  const choose = async (text: string) => {
    const next = { ...answers, [STEPS[idx].lvl]: text };
    setAnswers(next);
    await saveDna(next);
    if (idx + 1 < STEPS.length) setIdx(idx + 1);
    else setIdx(isComplete(next) ? STEPS.length : Math.max(0, nextIndex(next)));   // last question: result, or back to a skipped one
  };
  const retake = () => {
    const go = async () => { await resetDna(); setAnswers({}); setIdx(0); };
    if (Platform.OS === 'web') { if (window.confirm('Clear your answers and start again?')) go(); return; }
    Alert.alert('Start again', 'Clear your answers and start again?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Start again', style: 'destructive', onPress: go }]);
  };

  if (done && idx >= STEPS.length) return <Result answers={answers} onRetake={retake} onEdit={() => setIdx(0)} />;

  const step = STEPS[Math.min(idx, STEPS.length - 1)];
  const answered = Object.keys(answers).length;
  return (
    <TrackerScreen title="Financial DNA" subtitle="Nine questions about how you think about money. There are no right answers.">
      <Card accent={Colors.cyan}>
        <Text style={Typography.label}>{`QUESTION ${Math.min(idx, STEPS.length - 1) + 1} OF ${STEPS.length}`}</Text>
        <Bar pct={(answered / STEPS.length) * 100} color={Colors.cyan} height={6} />
        <Text style={s.q}>{step.q}</Text>
        {step.options.map(o => {
          const picked = answers[step.lvl] === o.text;
          return (
            <TouchableOpacity key={o.text} accessibilityRole="button" accessibilityState={{ selected: picked }} accessibilityLabel={o.text}
              style={[s.opt, picked && { borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.12)' }]} onPress={() => choose(o.text)}>
              <Text style={[Typography.body, picked && { color: Colors.cyan }]}>{o.text}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={s.nav}>
          <TouchableOpacity accessibilityRole="button" disabled={idx === 0} onPress={() => setIdx(Math.max(0, idx - 1))}>
            <Text style={[s.navTxt, idx === 0 && { opacity: 0.3 }]}>← Previous</Text>
          </TouchableOpacity>
          {done ? <TouchableOpacity accessibilityRole="button" onPress={() => setIdx(STEPS.length)}><Text style={s.navTxt}>See result →</Text></TouchableOpacity> : null}
        </View>
      </Card>
      <Disclaimer />
    </TrackerScreen>
  );
}

function Result({ answers, onRetake, onEdit }: { answers: Record<string, string>; onRetake: () => void; onEdit: () => void }) {
  const scores = scoresFor(answers);
  const pts = behaviourPoints(scores[3]);
  const top = scores.indexOf(Math.max(...scores));
  return (
    <TrackerScreen title="Your Financial DNA" subtitle="Five scores from your nine answers.">
      <Card accent={COLORS[top]}>
        <Text style={Typography.label}>STRONGEST TRAIT</Text>
        <Text style={s.big}>{DIMENSIONS[top]}</Text>
        <Text style={Typography.body}>{scores[top] >= 50 ? DESCRIBE[DIMENSIONS[top]].high : DESCRIBE[DIMENSIONS[top]].low}</Text>
      </Card>
      <SectionLabel>YOUR FIVE SCORES</SectionLabel>
      <Card>
        {DIMENSIONS.map((d, i) => (
          <View key={d} style={{ marginBottom: Spacing.md }}>
            <View style={s.rowTop}><Text style={s.name}>{d}</Text><Text style={[s.name, { color: COLORS[i] }]}>{`${Math.round(scores[i])}/100`}</Text></View>
            <Bar pct={scores[i]} color={COLORS[i]} height={8} />
            <Text style={[Typography.caption, { marginTop: 4 }]}>{scores[i] >= 50 ? DESCRIBE[d].high : DESCRIBE[d].low}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={Typography.label}>WHAT IT CHANGES</Text>
        <Text style={[Typography.body, { marginTop: 4 }]}>{`Your Discipline score gives ${pts} of the 15 points in the Behaviour part of your Health Score.`}</Text>
      </Card>
      <View style={s.nav}>
        <TouchableOpacity accessibilityRole="button" onPress={onEdit}><Text style={s.navTxt}>Change an answer</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onRetake}><Text style={[s.navTxt, { color: Colors.red }]}>Start again</Text></TouchableOpacity>
      </View>
      <Disclaimer />
    </TrackerScreen>
  );
}

function Disclaimer() {
  return (
    <Collapsible title="What this is, and is not">
      <Bullet>A reflective exercise with hand-set weights. It is not a validated psychological test and not financial advice.</Bullet>
      <Bullet>Your answers stay on this phone, in the same place the website keeps its quiz, so a quiz taken on either is read by the other.</Bullet>
      <Bullet>Only the Discipline score is used elsewhere: it sets the Behaviour points of your Health Score.</Bullet>
    </Collapsible>
  );
}

const s = StyleSheet.create({
  q: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginVertical: Spacing.md, lineHeight: 25 },
  opt: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, paddingHorizontal: 4 },
  navTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 13, paddingVertical: 8 },
  big: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
});
