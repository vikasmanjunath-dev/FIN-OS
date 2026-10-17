import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { useAryaFacts } from '@/components/AryaFacts';
import { upcomingWindows, heatmap } from '@/lib/aryaCal';
import { inr } from '@/lib/aryaFacts';
import { Colors, Spacing, Radii } from '@/constants/theme';

const LEVEL = ['rgba(255,255,255,0.07)', '#22D3A688', '#00D4FF88', '#F0A50088', '#FF6B3588', '#FF444488'];
const BASIS = { recorded: 'Each day is compared with your recorded monthly spending divided by 30.', 'own-average': 'You have not recorded monthly spending, so each day is compared with your own average over the days you logged.', none: 'Nothing is logged yet.' } as const;

export default function AryaCal() {
  const { facts, failed } = useAryaFacts();
  const wins = facts ? upcomingWindows(facts) : [];
  const heat = facts ? heatmap(facts) : null;
  return (
    <TrackerScreen title="Cal" subtitle="What falls due, and how your logged spending looked over the last 26 weeks.">
      <AryaTabs current="cal" />
      {!facts && !failed ? <ActivityIndicator color={Colors.cyan} /> : null}
      {failed ? <Card><Text style={s.body}>I could not read your records just now.</Text></Card> : null}
      {facts ? (
        <>
          <SectionLabel>COMING UP</SectionLabel>
          {wins.length === 0 ? <Card><Text style={s.body}>Nothing dated is recorded in the next year: no SIP, policy renewal, maturity, goal date, subscription or tax date.</Text></Card> : wins.map(w => (
            <Card key={w.id}>
              <Text style={s.k}>{w.label.toUpperCase()}</Text>
              {w.items.slice(0, 8).map((e, i) => <Text key={i} style={s.item}>{e.date.slice(5).split('-').reverse().join('/')}  {e.title}{e.amount ? `  ${inr(e.amount)}` : ''}</Text>)}
              {w.items.length > 8 ? <Text style={s.body}>and {w.items.length - 8} more</Text> : null}
              {w.outflow > 0 ? <Text style={s.body}>Going out in this window from dated items (SIPs, premiums, subscriptions): {inr(w.outflow)}.</Text> : null}
            </Card>
          ))}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the full financial calendar" onPress={() => router.push('/tools/calendar' as any)} style={s.btn}><Text style={s.btnT}>Full calendar ›</Text></TouchableOpacity>
          <Text style={s.src}>From: Financial calendar (your trackers plus the statutory tax dates, which can be extended: verify on incometax.gov.in).</Text>

          <SectionLabel>SPENDING HEATMAP</SectionLabel>
          <Card>
            {heat && heat.basis === 'none' ? <Text style={s.body}>No spending is logged. Log expenses in Transactions and each day appears here.</Text> : heat ? (
              <>
                <View style={s.grid} accessibilityLabel={`Spending heatmap, ${heat.daysTracked} days with spending`}>
                  {heat.weeks.map((col, i) => <View key={i} style={s.col}>{col.map(c => <View key={c.date} style={[s.cell, { backgroundColor: c.future ? 'transparent' : LEVEL[c.level] }]} />)}</View>)}
                </View>
                <Text style={s.body}>{BASIS[heat.basis]} Darker means more.</Text>
                <Text style={s.body}>{heat.daysTracked} days logged, {inr(heat.total)} in all, about {inr(heat.avgDay)} on a day with spending, {heat.over} days above 120% of the reference.</Text>
                {heat.top.length ? <Text style={s.body}>Biggest days: {heat.top.map(t => `${t.date.slice(5).split('-').reverse().join('/')} ${inr(t.spend)}`).join(', ')}.</Text> : null}
                <Text style={s.src}>From: transactions you logged. Days you did not log show as empty, not as zero spending. Festival days are not marked: their dates move every year.</Text>
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  k: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  item: { color: Colors.textPrimary, fontSize: 13, lineHeight: 20 },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  src: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 8 },
  btn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnT: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  grid: { flexDirection: 'row', gap: 2, marginBottom: Spacing.sm },
  col: { gap: 2 },
  cell: { width: 9, height: 9, borderRadius: 2 },
});
