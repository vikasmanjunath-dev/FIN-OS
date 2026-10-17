import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Radii, Spacing } from '@/constants/theme';
import type { StripItem, StripTone } from '@/lib/persona';

const TONE: Record<StripTone, string> = { good: Colors.teal, warn: Colors.gold, info: Colors.cyan };

/**
 * A slim row of facts the person has recorded (see lib/persona.ts). Each chip opens the screen the figure comes from.
 * "Hide" is remembered on this phone; Settings brings the strip back.
 */
export function PersonaStrip({ items, onHide }: { items: StripItem[]; onHide: () => void }) {
  if (items.length === 0) return null;
  return (
    <View style={s.row}>
      <View style={s.chips}>
        {items.map(it => (
          <TouchableOpacity key={it.id} style={s.chip} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={it.a11y} onPress={() => router.push(it.route as any)}>
            <View style={[s.dot, { backgroundColor: TONE[it.tone] }]} />
            <Text style={s.value}>{it.value}</Text>
            <Text style={s.label}>{it.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.hide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide this strip. You can show it again in Settings" onPress={onHide}>
        <Text style={s.hideTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md, gap: Spacing.sm },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 9, paddingRight: 12, borderRadius: Radii.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  label: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  hide: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  hideTxt: { color: Colors.textDim, fontSize: 14, fontWeight: '700' },
});
