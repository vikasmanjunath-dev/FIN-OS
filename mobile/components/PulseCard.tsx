import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/TrackerUI';
import type { PulseCard } from '@/lib/pulseCards';
import { Colors, Spacing, Radii } from '@/constants/theme';

const TONE: Record<PulseCard['tone'], string> = { good: Colors.teal, warn: Colors.gold, bad: Colors.red, neutral: Colors.cyan };

/** One PULSE card: the headline figure, the rows behind it, any caveat, and where every number came from. */
export function PulseCardView({ card, reason }: { card: PulseCard & { reason?: string | null }; reason?: string | null }) {
  const why = reason ?? card.reason ?? null;
  return (
    <View>
      {why ? <Text style={s.reason}>⭐ Recommended for you: {why}</Text> : null}
      <Card accent={TONE[card.tone]}>
        <Text style={s.title}>{card.icon} {card.title}</Text>
        <Text style={s.headline}>{card.headline}</Text>
        {card.rows.map((r, i) => (
          <View key={i} style={s.row}>
            <Text style={s.label}>{r.label}</Text>
            <Text style={s.value}>{r.value}</Text>
          </View>
        ))}
        {card.note ? <Text style={s.note}>{card.note}</Text> : null}
        <Text style={s.source}>From: {card.source}</Text>
        {card.route && card.routeLabel ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${card.routeLabel}: ${card.title}`} onPress={() => router.push(card.route as any)} style={s.btn}>
            <Text style={s.btnTxt}>{card.routeLabel} ›</Text>
          </TouchableOpacity>
        ) : null}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  reason: { color: Colors.gold, fontSize: 12, lineHeight: 17, marginBottom: 6, marginTop: 4 },
  title: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  headline: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: Spacing.sm, lineHeight: 23 },
  row: { paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
  label: { color: Colors.textMuted, fontSize: 12 },
  value: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 1, lineHeight: 18 },
  note: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: Spacing.sm },
  source: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: Spacing.sm },
  btn: { marginTop: Spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
});
