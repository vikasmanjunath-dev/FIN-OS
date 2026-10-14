import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { Card } from '@/components/TrackerUI';
import { type Fact, type Source, sourcesLabel } from '@/lib/insuranceHub';

/** One figure the website states, with where it is, when it is as of, and whether anyone checked it. Never shown without those. */
export function FactCard({ fact }: { fact: Fact }) {
  return (
    <View style={s.fact}>
      <Text style={s.factText}>{fact.statement}</Text>
      <Text style={s.meta}>
        {fact.asOf ? `As of ${fact.asOf}` : fact.asOfNote} · {fact.verified ? 'Verified' : 'Not verified by FIN·OS'}
      </Text>
      {fact.note ? <Text style={s.note}>{fact.note}</Text> : null}
      <Text style={s.src}>Website: {sourcesLabel(fact.sources)}</Text>
    </View>
  );
}

export function SourceLine({ sources }: { sources: Source[] }) {
  return <Text style={s.src}>Website: {sourcesLabel(sources)}</Text>;
}

/** A small tick-style choice used for the checklist and for filters. */
export function Chip({ label, on, onPress, color = Colors.cyan, a11y }: { label: string; on: boolean; onPress: () => void; color?: string; a11y?: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: on }}
      style={[s.chip, on && { borderColor: color, backgroundColor: 'rgba(0,212,255,0.10)' }]}>
      <Text style={[s.chipTxt, on && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Pill({ text, color = Colors.textMuted }: { text: string; color?: string }) {
  return <Text style={[s.pill, { color, borderColor: color }]}>{text}</Text>;
}

export function Notice({ title, children, accent = Colors.gold }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <Card accent={accent}>
      <Text style={Typography.label}>{title}</Text>
      <View style={{ marginTop: Spacing.sm }}>{children}</View>
    </Card>
  );
}

const s = StyleSheet.create({
  fact: { paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  factText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  meta: { color: Colors.gold, fontSize: 11, marginTop: 4, fontWeight: '600' },
  note: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  src: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  pill: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', overflow: 'hidden' },
});
