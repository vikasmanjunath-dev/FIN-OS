import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar } from '@/components/TrackerUI';
import { Collapsible, Bullet } from '@/components/CalcUI';
import { benchmark, tally, NO_PEER_DATA, type BenchRow, type BenchStatus } from '@/lib/benchmark';
import { loadBenchInput } from '@/lib/benchmarkStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const TONE: Record<BenchStatus, { label: string; color: string }> = {
  meets: { label: 'Meets the target', color: Colors.teal },
  close: { label: 'Close to the target', color: Colors.gold },
  below: { label: 'Below the target', color: Colors.red },
  unknown: { label: 'Not recorded', color: Colors.textMuted },
  na: { label: 'Does not apply', color: Colors.textMuted },
};

function fmt(r: BenchRow): string {
  if (r.value === null) return 'Not recorded';
  if (r.unit === 'pct') return `${Math.round(r.value * 100)}%`;
  if (r.unit === 'months') return `${r.value.toFixed(1)} months`;
  return `${r.value.toFixed(1)}×`;
}

export default function BenchmarkScreen() {
  const [rows, setRows] = useState<BenchRow[] | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});
  useFocusEffect(useCallback(() => { loadBenchInput().then(r => { setRows(benchmark(r.input)); setSources(r.sources); }); }, []));

  const sub = 'Your own figures against common rules of thumb. Not a comparison with other people.';
  if (!rows) return <TrackerScreen title="Benchmarks" subtitle={sub}><Card><Text style={Typography.body}>Reading your figures…</Text></Card></TrackerScreen>;
  const t = tally(rows);
  const judged = t.meets + t.close + t.below;

  return (
    <TrackerScreen title="Benchmarks" subtitle={sub}>
      <Card accent={Colors.cyan}>
        <Text style={[Typography.body, { fontWeight: '800' }]}>
          {judged === 0 ? 'Nothing to judge yet' : `${t.meets} of ${judged} measured figures meet their target`}
        </Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 18 }]}>
          {judged === 0
            ? 'Record your income, spending and savings (Profile, Budget, Emergency fund) and each line below fills in. Nothing is assumed.'
            : `${t.close} close, ${t.below} below${t.unknown ? `, ${t.unknown} not recorded yet` : ''}.`}
        </Text>
      </Card>

      {rows.map(r => {
        const tone = TONE[r.status];
        const pct = r.value !== null && r.target ? Math.min(100, (r.direction === 'higher' ? r.value / r.target : r.target / Math.max(r.value, r.target)) * 100) : 0;
        return (
          <Card key={r.id}>
            <View style={s.head}>
              <Text style={s.label}>{r.label}</Text>
              <Text style={[s.badge, { color: tone.color, borderColor: tone.color }]}>{tone.label}</Text>
            </View>
            <Text style={s.value}>{fmt(r)}</Text>
            <Text style={Typography.caption}>{`Target: ${r.targetText}`}</Text>
            {r.value !== null && r.status !== 'na' ? <View style={{ marginTop: Spacing.sm }}><Bar pct={pct} color={tone.color} /></View> : null}
            <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>{r.note}</Text>
            <Text style={[Typography.caption, { marginTop: 2, lineHeight: 17, color: Colors.textDim }]}>{r.basis}</Text>
          </Card>
        );
      })}

      <SectionLabel>WHY THERE IS NO PEER COMPARISON</SectionLabel>
      <Card><Text style={[Typography.caption, { lineHeight: 18 }]}>{NO_PEER_DATA}</Text></Card>

      <Text style={s.link} accessibilityRole="button" onPress={() => router.push('/tools/score')}>Open the Money Score for ranked next steps</Text>
      {Object.keys(sources).length > 0 ? (
        <Collapsible title="Where the figures came from">
          {Object.entries(sources).map(([k, v]) => <Bullet key={k}>{`${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: from ${v}`}</Bullet>)}
        </Collapsible>
      ) : null}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  badge: { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  value: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  link: { color: Colors.cyan, fontWeight: '800', marginVertical: Spacing.md },
});
