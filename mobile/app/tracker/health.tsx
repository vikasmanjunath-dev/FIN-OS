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
  const color = h.tier ? tierColor(h.tier) : Colors.cyan;
  const step = nextBestStep(h);
  const tracked = h.pillars.filter(p => p.hasData);

  return (
    <TrackerScreen title="Health score" subtitle="Seven areas of your financial life, scored out of 100 using the same method as the FIN·OS website.">
      <Card accent={color}>
        <View style={s.heroRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={Typography.label}>YOUR SCORE</Text>
            {h.total == null || !h.tier
              ? <Text style={[s.noScore, { color }]} accessibilityLabel="Health score: not enough data recorded">Not enough data</Text>
              : <Text style={[s.score, { color }]} accessibilityLabel={`Health score ${h.total} out of 100`}>{h.total}<Text style={s.outOf}>/100</Text></Text>}
          </View>
          {h.tier ? <Text style={[s.tier, { color, borderColor: color + '55', backgroundColor: color + '14' }]}>{h.tierEmoji} {h.tier}</Text> : null}
        </View>
        <Text style={[Typography.caption, { lineHeight: 17, marginTop: 4 }]}>{h.headline}</Text>
        {h.total != null && h.missing.length > 0 && (
          <Text accessibilityRole="alert" style={[Typography.caption, { lineHeight: 17, marginTop: 6, color: Colors.gold }]}>
            Based on {h.measured.length} of {h.pillars.length} areas. Left out because nothing is recorded: {h.missing.join(', ')}.
          </Text>
        )}
        {h.total == null && h.missing.length > 0 && (
          <Text style={[Typography.caption, { lineHeight: 17, marginTop: 6 }]}>
            A score needs at least 2 of the {h.pillars.length} areas to have recorded data. {h.measured.length === 1 ? `Recorded: ${h.measured[0]}. ` : ''}Not recorded: {h.missing.join(', ')}.
          </Text>
        )}
      </Card>

      {step && (
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push(step.route as any)} style={s.next}>
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
            <Text style={[s.grade, { color: p.hasData ? pillarColor(p.pct) : Colors.textDim }]}>{p.hasData ? p.grade : '—'}</Text>
            <Text style={s.pScore}>{p.hasData ? `${p.score}/${p.max}` : 'Not recorded'}</Text>
          </View>
          <Bar pct={p.hasData ? p.pct : 0} color={pillarColor(p.pct)} />
          <Text style={s.pHeadline}>{p.headline}</Text>
          {p.tips[0] && <Text style={s.pTip}>💡 {p.tips[0]}</Text>}
          {!p.hasData && p.name === 'Behaviour' ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/tools/dna' as any)} style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: Colors.cyan, fontWeight: '700', fontSize: 13 }}>Take the 9-question Financial DNA quiz →</Text>
            </TouchableOpacity>
          ) : !p.hasData && <Text style={s.untracked}>Not recorded: left out of your score</Text>}
          {p.name === 'Behaviour' && p.hasData && (
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/tools/dna' as any)} style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: Colors.cyan, fontWeight: '700', fontSize: 13 }}>See or retake your Financial DNA →</Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}
      <Text style={[Typography.caption, { lineHeight: 17, textAlign: 'center', marginTop: Spacing.sm }]}>
        {tracked.length} of {h.pillars.length} areas have recorded data. An area with nothing recorded adds no points and is left out of the total, so this score can differ from the website's, which fills gaps with neutral defaults.
      </Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noScore: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  score: { fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  outOf: { fontSize: 18, fontWeight: '700', color: Colors.textMuted },
  tier: { borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  next: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  nextLabel: { ...Typography.label, color: Colors.cyan, marginBottom: 3 },
  nextTip: { ...Typography.body, lineHeight: 19 },
  pHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: Spacing.sm },
  pEmoji: { fontSize: 16, marginRight: 8 },
  pName: { ...Typography.body, fontWeight: '700', flex: 1 },
  grade: { fontSize: 13, fontWeight: '900', marginRight: 10 },
  pScore: { ...Typography.caption, minWidth: 40, textAlign: 'right' },
  pHeadline: { ...Typography.caption, marginTop: 8, lineHeight: 17, color: Colors.textPrimary },
  pTip: { ...Typography.caption, marginTop: 6, lineHeight: 17, color: Colors.gold },
  untracked: { ...Typography.label, marginTop: 8, color: Colors.textDim },
});
