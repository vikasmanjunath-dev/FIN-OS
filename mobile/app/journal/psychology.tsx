import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { Chips, Notice, Tile, profitColor, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  DISCIPLINE, EMOTIONS, PLAN_ADHERENCE, PRE_EMOTIONS, byBand, cohortLine, compare, holdTimes, pnlText, psychologyComparisons, rate, tableBy, type Cohort, type Comparison,
} from '@/lib/tradeJournal';

function Pair({ c }: { c: Comparison }) {
  return (
    <Card>
      <Text style={Typography.h3}>{c.title}</Text>
      <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{c.basis}</Text>
      {[c.a, c.b].map(x => <Text key={x.label} style={[Typography.body, { marginTop: Spacing.sm, lineHeight: 20 }]}>{cohortLine(x.label, x.cohort)}</Text>)}
    </Card>
  );
}
function Table({ rows, empty }: { rows: { value: string; cohort: Cohort }[]; empty: string }) {
  if (!rows.length) return <Text style={Typography.caption}>{empty}</Text>;
  return <>{rows.map(r => (
    <View key={r.value} style={s.row} accessible accessibilityLabel={cohortLine(r.value, r.cohort)}>
      <View style={{ flex: 1 }}><Text style={Typography.body}>{r.value}</Text><Text style={Typography.caption}>{r.cohort.count} {r.cohort.count === 1 ? 'trade' : 'trades'} · {Math.round((r.cohort.winRate ?? 0) * 100)}% won{r.cohort.count < 5 ? ' · very few trades' : ''}</Text></View>
      <View style={{ alignItems: 'flex-end' }}><Text style={[Typography.body, { fontWeight: '800', color: profitColor(r.cohort.net) }]}>{pnlText(r.cohort.net, { sign: true })}</Text><Text style={Typography.caption}>avg {pnlText(r.cohort.avg, { sign: true })}</Text></View>
    </View>
  ))}</>;
}

export default function PsychologyScreen() {
  const { data } = useJournal();
  const [field, setField] = useState<'emotion' | 'preEmotion'>('emotion');
  const [pick, setPick] = useState('FOMO');
  const v = useMemo(() => {
    if (!data) return null;
    const { rated } = rate(data.trades);
    const emo = tableBy(rated, r => r.t[field], field === 'emotion' ? EMOTIONS : PRE_EMOTIONS);
    return {
      rated, emo, comps: psychologyComparisons(rated), hold: holdTimes(rated),
      one: compare(rated, 'emo', `${pick} against the other feelings you recorded`, `Trades where you recorded a feeling ${field === 'emotion' ? 'during' : 'before'} the trade. Trades with none recorded are left out of both sides.`, [`Feeling ${pick}`, 'Any other feeling'], r => (r.t[field] ? r.t[field] === pick : null)),
      disc: tableBy(rated, r => r.t.discipline, DISCIPLINE.map(d => d.id)), plan: tableBy(rated, r => r.t.planAdherence, PLAN_ADHERENCE.map(d => d.id)),
    };
  }, [data, field, pick]);
  const names = field === 'emotion' ? EMOTIONS : PRE_EMOTIONS;
  return (
    <TrackerScreen title="Psychology" subtitle="Counts and comparisons from the feelings and answers you logged with your trades.">
      <Notice>These are counts from your own entries, set side by side. They do not say why a trade went the way it did, a handful of trades says little, and none of it is advice.</Notice>
      {!data || !v ? <Card><Text style={Typography.body}>Reading your journal…</Text></Card> : v.rated.length === 0 ? (
        <Card><Text style={Typography.h3}>Nothing to compare yet</Text><Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>Log trades with a known profit and, when you can, how you felt. Nothing is assumed for trades where you left it blank.</Text>
          <TouchableOpacity style={s.secondary} onPress={() => router.push('/journal/trade' as any)} accessibilityRole="button"><Text style={s.secondaryTxt}>Add a trade</Text></TouchableOpacity></Card>
      ) : (
        <>
          <SectionLabel>FEELINGS</SectionLabel>
          <Chips label="Which feeling" options={[{ id: 'emotion', label: 'During the trade' }, { id: 'preEmotion', label: 'Before the trade' }]} value={field} allowClear={false} onChange={(x: any) => { setField(x || 'emotion'); setPick('FOMO'); }} />
          <Card><Table rows={v.emo} empty="No feeling recorded on any trade yet." /></Card>
          <Chips label="Compare one feeling with the rest" options={names.map(x => ({ id: x, label: x }))} value={pick} allowClear={false} onChange={(x: string) => setPick(x || 'FOMO')} />
          <Pair c={v.one} />
          <SectionLabel>HABITS IN YOUR LOG</SectionLabel>
          {v.comps.map(c => <Pair key={c.id} c={c} />)}
          <SectionLabel>YOUR RULES AND THE PLAN</SectionLabel>
          <Card><Table rows={v.disc.map(r => ({ ...r, value: DISCIPLINE.find(d => d.id === r.value)?.label ?? r.value }))} empty="You have not recorded how well you kept your rules." /></Card>
          <Card><Table rows={v.plan.map(r => ({ ...r, value: PLAN_ADHERENCE.find(d => d.id === r.value)?.label ?? r.value }))} empty="You have not recorded how closely you kept the plan." /></Card>
          <SectionLabel>CONFIDENCE, STRESS, TIME IN A TRADE</SectionLabel>
          <Card>
            {(['confidence', 'stress'] as const).map(k => { const rows = byBand(v.rated, k); return (
              <View key={k} style={{ marginBottom: Spacing.sm }}>
                <Text style={Typography.label}>{k === 'confidence' ? 'CONFIDENCE (1 TO 10)' : 'STRESS (1 TO 10)'}</Text>
                <Table rows={rows.map(r => ({ value: r.band, cohort: r.cohort }))} empty={`No ${k} recorded.`} />
              </View>); })}
            <Text style={Typography.label}>AVERAGE TIME IN A TRADE</Text>
            <View style={s.tiles}>
              <Tile label="WINNERS" value={v.hold.winners.avgMinutes === null ? '—' : `${Math.round(v.hold.winners.avgMinutes)} min`} sub={`${v.hold.winners.count} with both times`} />
              <Tile label="LOSERS" value={v.hold.losers.avgMinutes === null ? '—' : `${Math.round(v.hold.losers.avgMinutes)} min`} sub={`${v.hold.losers.count} with both times`} />
            </View>
          </Card>
          <Text style={[Typography.caption, { color: Colors.textMuted, lineHeight: 17 }]}>Trades whose profit is not recorded are not in any of these. Where a box was left empty the trade is simply not counted for that question.</Text>
        </>
      )}
    </TrackerScreen>
  );
}
