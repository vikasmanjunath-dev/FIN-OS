import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/** One tool or tracker as a quiet list row: icon, name, one line of what it does or shows, a chevron. Replaces the loud two-column colour tiles
 *  for the long lists (the Home screen used to show about thirty of them in a row). The accent only tints the icon, never the text. */
export function ToolRow({ label, value, sub, accent = Colors.cyan, icon, onPress }: {
  label: string; value?: string; sub?: string; accent?: string; icon?: string; onPress?: () => void; style?: unknown; gradient?: unknown;
}) {
  const line = [value && value !== '—' ? value : null, sub].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={line ? `${label}. ${line}` : label} style={s.row}>
      <View style={[s.icon, { backgroundColor: accent + '22' }]}><Text style={s.iconTxt}>{icon ?? '•'}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label}>{label}</Text>
        {line ? <Text style={s.sub} numberOfLines={2}>{line}</Text> : null}
      </View>
      <Text style={s.chev} accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </TouchableOpacity>
  );
}

/** A figure with its name: label and a short caption on the left, the value on the right. For the handful of numbers worth seeing on Home. */
export function StatRow({ label, value, sub, accent = Colors.cyan, icon, onPress }: {
  label: string; value: string; sub?: string; accent?: string; icon?: string; onPress?: () => void; style?: unknown; gradient?: unknown;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}${sub ? `. ${sub}` : ''}`} style={s.row}>
      <View style={[s.icon, { backgroundColor: accent + '22' }]}><Text style={s.iconTxt}>{icon ?? '•'}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label}>{label}</Text>
        {sub ? <Text style={s.sub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <Text style={[s.stat, value.length > 9 && s.statLong, { color: value.length > 9 || value === '—' ? Colors.textMuted : accent }]} numberOfLines={2}>{value}</Text>
      <Text style={s.chev} accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  stat: { maxWidth: '38%', textAlign: 'right', fontSize: 16, fontWeight: '800' },
  statLong: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 64, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  icon: { width: 40, height: 40, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { fontSize: 20 },
  label: { ...Typography.body, fontWeight: '700' },
  sub: { ...Typography.caption, marginTop: 2, lineHeight: 17 },
  chev: { color: Colors.textMuted, fontSize: 24, lineHeight: 26 },
});
