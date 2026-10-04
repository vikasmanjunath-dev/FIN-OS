import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { nextBestStep } from '@/lib/trackers';
import { TrackerScreen, Card, SectionLabel, Bar, tierColor } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const pillarColor = (pct: number) => (pct >= 65 ? Colors.teal : pct >= 35 ? Colors.gold : Colors.red);

export default function HealthScreen() {
  const { computed } = useTrackers();
  const h = computed.health;
  const color = tierColor(h.tier);
  const step = nextBestStep(h);
  const tracked = h.pillars.filter(p => !p.untracked);

  return (
    <TrackerScreen title="Health score" subtitle="Seven areas of your financial life, scored out of 100 using the same method as the FIN·OS website.">
      <Card accent={color}>
        <View style={s.heroRow}>
          <View>
            <Text style={Typography.label}>YOUR SCORE</Text>
            <Text style={[s.score, { color }]} accessibilityLabel={`Health score ${h.total} out of 100`}>{h.total}<Text style={s.outOf}>/100</Text></Text>
          </View>
          <Text style={[s.tier, { color, borderColor: color + '55', backgroundColor: color + '14' }]}>{h.tierEmoji} {h.tier}</Text>
        </View>
        <Text style={[Typography.caption, { lineHeight: 17, marginTop: 4 }]}>{h.headline}</Text>
      </Card>

      {step && (
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(step.route as any)} style={s.next}>
          <View style={{ flex: 1 }}>
            <Text style={s.nextLabel}>BEST NEXT STEP · {step.pillar.toUpperCase()}</Text>
            <Text style={s.nextTip}>{step.tip}</Text>
          </View>
          <Text style={{ color: Colors.cyan, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      )}

      <SectionLabel>BREAKDOWN</SectionLabel>
      {h.pillars.map(p => (
        <Card key={p.name}>
          <View style={s.pHead}>
            <Text style={s.pEmoji}>{p.emoji}</Text>
            <Text style={s.pName}>{p.name}</Text>
            <Text style={[s.grade, { color: pillarColor(p.pct) }]}>{p.grade}</Text>
            <Text style={s.pScore}>{p.score}/{p.max}</Text>
          </View>
          <Bar pct={p.pct} color={pillarColor(p.pct)} />
          <Text style={s.pHeadline}>{p.headline}</Text>
          {p.tips[0] && <Text style={s.pTip}>💡 {p.tips[0]}</Text>}
          {p.untracked && <Text style={s.untracked}>Not recorded in the app yet</Text>}
        </Card>
      ))}
      <Text style={[Typography.caption, { lineHeight: 17, textAlign: 'center', marginTop: Spacing.sm }]}>
        {tracked.length} of {h.pillars.length} areas are measured in the app. The rest use neutral defaults, so your score here can differ from the website's.
      </Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  score: { fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  outOf: { fontSize: 18, fontWeight: '700', color: Colors.textMuted },
  tier: { borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  next: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  nextLabel: { ...Typography.label, color: Colors.cyan, marginBottom: 3 },
  nextTip: { ...Typography.body, lineHeight: 19 },
  pHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  pEmoji: { fontSize: 16, marginRight: 8 },
  pName: { ...Typography.body, fontWeight: '700', flex: 1 },
  grade: { fontSize: 13, fontWeight: '900', marginRight: 10 },
  pScore: { ...Typography.caption, minWidth: 40, textAlign: 'right' },
  pHeadline: { ...Typography.caption, marginTop: 8, lineHeight: 17, color: Colors.textPrimary },
  pTip: { ...Typography.caption, marginTop: 6, lineHeight: 17, color: Colors.gold },
  untracked: { ...Typography.label, marginTop: 8, color: Colors.textDim },
});
