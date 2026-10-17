import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { useAryaFacts } from '@/components/AryaFacts';
import { planSteps, nextStep, goalsWithReturn, type StepStatus } from '@/lib/aryaPlan';
import { inr } from '@/lib/aryaFacts';
import { Colors, Spacing, Radii } from '@/constants/theme';

const TONE: Record<StepStatus, string> = { done: Colors.teal, progress: Colors.cyan, todo: Colors.gold, unknown: Colors.textMuted, na: Colors.textMuted };
const WORD: Record<StepStatus, string> = { done: 'In place', progress: 'In progress', todo: 'Not yet', unknown: 'Needs a figure', na: 'May not apply' };
const num = (t: string) => { const n = parseFloat(t.replace(/[,%\s]/g, '')); return Number.isFinite(n) ? n : null; };

export default function AryaPlan() {
  const { facts, failed } = useAryaFacts();
  const [rate, setRate] = useState('');
  const [infl, setInfl] = useState('');
  const steps = useMemo(() => (facts ? planSteps(facts) : []), [facts]);
  const next = nextStep(steps);
  const withRet = useMemo(() => (facts ? goalsWithReturn(facts, num(rate), num(infl)) : []), [facts, rate, infl]);
  return (
    <TrackerScreen title="Plan" subtitle="Your money steps, with a status worked out only from what you recorded. A step that needs a figure you have not recorded says so; nothing is assumed. Estimates for planning, not advice.">
      <AryaTabs current="plan" />
      {!facts && !failed ? <ActivityIndicator color={Colors.cyan} /> : null}
      {failed ? <Card><Text style={s.body}>I could not read your records just now. Open this screen again.</Text></Card> : null}
      {next ? <Card accent={Colors.purple}><Text style={s.k}>START HERE</Text><Text style={s.t}>{next.icon} {next.title}</Text><Text style={s.body}>{next.stat}. {next.detail}</Text></Card> : null}
      {steps.map(st => (
        <Card key={st.id} accent={TONE[st.status]}>
          <View style={s.top}><Text style={s.t}>{st.icon} {st.title}</Text><Text style={[s.pill, { color: TONE[st.status] }]}>{WORD[st.status]}</Text></View>
          <Text style={s.stat}>{st.stat}</Text>
          {st.progress !== null ? <Bar pct={st.progress} color={TONE[st.status]} /> : null}
          <Text style={s.body}>{st.detail}</Text>
          <Text style={s.src}>From: {st.basis}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${st.routeLabel}: ${st.title}`} onPress={() => router.push(st.route as any)} style={s.btn}><Text style={s.btnT}>{st.routeLabel} ›</Text></TouchableOpacity>
        </Card>
      ))}
      <SectionLabel>GOALS WITH A RETURN YOU CHOOSE</SectionLabel>
      <Card>
        <Text style={s.body}>The goal amounts above ignore any return. To see the monthly saving if your savings grow, enter the yearly return you expect. I do not fill one in for you.</Text>
        <View style={s.fields}>
          <TextInput accessibilityLabel="Expected yearly return in percent" style={s.input} value={rate} onChangeText={setRate} placeholder="Return % a year" placeholderTextColor={Colors.textDim} keyboardType="decimal-pad" />
          <TextInput accessibilityLabel="Yearly rise in cost in percent (optional)" style={s.input} value={infl} onChangeText={setInfl} placeholder="Cost rise % (optional)" placeholderTextColor={Colors.textDim} keyboardType="decimal-pad" />
        </View>
        {num(rate) === null ? null : withRet.length === 0 ? <Text style={s.body}>No goal has a future date, so there is nothing to work out.</Text> : withRet.map(g => (
          <Text key={g.name} style={s.body}>{g.name}: {inr(g.withReturn)} a month at {num(rate)}% (against {inr(g.noReturn)} with no return). Rounded up to ₹500; a scenario, not a forecast.</Text>
        ))}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the Life goals planner" onPress={() => router.push('/plan/lifegoals' as any)} style={s.btn}><Text style={s.btnT}>Full goals planner ›</Text></TouchableOpacity>
      </Card>
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  k: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  t: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
  pill: { fontSize: 11, fontWeight: '800' },
  stat: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginVertical: 6 },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  src: { color: Colors.textDim, fontSize: 11, marginTop: 6 },
  btn: { marginTop: Spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnT: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  fields: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
});
