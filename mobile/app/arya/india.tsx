import React from 'react';
import { Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { useAryaFacts } from '@/components/AryaFacts';
import { RULES, RULES_AS_OF, staleness, currentDates, bothRegimes } from '@/lib/aryaIndia';
import { taxAnnualIncome, inr } from '@/lib/aryaFacts';
import { Colors } from '@/constants/theme';

export default function AryaIndia() {
  const { facts } = useAryaFacts();
  const now = facts?.now ?? new Date();
  const stale = staleness(now);
  const income = facts ? taxAnnualIncome(facts) : null;
  const r = income ? bothRegimes(income) : null;
  const groups = Array.from(new Set(RULES.map(x => x.group)));
  return (
    <TrackerScreen title="India" subtitle={`India's income-tax rules the app uses, each with its source and the year it is for (${RULES_AS_OF}). Rules, not advice. Verify on incometax.gov.in.`}>
      <AryaTabs current="india" />
      {!facts ? <ActivityIndicator color={Colors.cyan} /> : null}
      {stale ? <Card accent={Colors.gold}><Text style={s.warn}>{stale}</Text></Card> : null}
      <SectionLabel>YOUR INCOME UNDER BOTH REGIMES</SectionLabel>
      <Card>
        {r ? (
          <>
            <Text style={s.t}>On {inr(r.income)} a year (from your Tax planner)</Text>
            <Text style={s.body}>New regime: {inr(r.taxNew)}. Old regime: {inr(r.taxOld)}. The {r.lower} regime is lower on these figures.</Text>
            <Text style={s.body}>After only the standard deduction, the highest slab reached is {r.newTop}% (new) and {r.oldTop}% (old). Other deductions would lower the old-regime figure.</Text>
            <Text style={s.body}>I do not know which regime you file under, and I do not assume one.</Text>
          </>
        ) : <Text style={s.body}>Enter your annual income on the Tax planner to see both regimes side by side. Nothing is assumed in the meantime.</Text>}
      </Card>
      {groups.map(g => (
        <View key={g}>
          <SectionLabel>{g.toUpperCase()}</SectionLabel>
          {RULES.filter(x => x.group === g).map(x => (
            <Card key={x.id}>
              <Text style={s.t}>{x.title} <Text style={s.tag}>({x.applies})</Text></Text>
              <Text style={s.body}>{x.statement}</Text>
              <Text style={s.src}>Source: {x.source}. For: {x.asOf}.</Text>
            </Card>
          ))}
        </View>
      ))}
      <SectionLabel>NEXT TAX DATES</SectionLabel>
      <Card>
        {currentDates(now).map(e => <Text key={e.date + e.title} style={s.body}>{e.date.slice(8)}/{e.date.slice(5, 7)}/{e.date.slice(0, 4)}  {e.title}</Text>)}
        <Text style={s.src}>Source: statutory defaults in the app's financial calendar; deadlines are sometimes extended.</Text>
      </Card>
      <Text style={s.src}>Not built: the website's state-by-state "cost of life" map, whose figures have no source.</Text>
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  warn: { color: Colors.gold, fontSize: 13, lineHeight: 19 },
  t: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  tag: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  src: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 6 },
});
