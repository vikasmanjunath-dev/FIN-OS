import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { formatAsOf, staleness, relativeTime } from '@/lib/marketData';

/** Screen shell for the market screens: back link, title, pull to refresh. */
export function MarketScreen({ title, subtitle, children, refreshing, onRefresh }: {
  title: string; subtitle?: string; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void;
}) {
  return (
    <ScrollView
      style={{ flexGrow: 1, flexShrink: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} /> : undefined}
    >
      <View style={{ marginBottom: Spacing.md }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/markets'))}>
          <Text style={{ color: Colors.cyan, fontSize: 14, fontWeight: '600' }}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={Typography.h1}>{title}</Text>
      {subtitle ? <Text style={[Typography.caption, { marginTop: 4, marginBottom: Spacing.lg, lineHeight: 17 }]}>{subtitle}</Text> : <View style={{ height: Spacing.lg }} />}
      {children}
    </ScrollView>
  );
}

/** One line saying how current the figures are: live, or the last saved answer with its time and why. */
export function Freshness({ savedAt, fromCache, error, freshMs, loading }: {
  savedAt: number | null; fromCache: boolean; error: string | null; freshMs: number; loading?: boolean;
}) {
  const now = Date.now();
  if (loading && savedAt === null) return <Text style={s.fresh}>Loading…</Text>;
  const st = staleness(savedAt, now, freshMs);
  if (!st) return error ? <Text style={[s.fresh, { color: Colors.gold }]} accessibilityRole="alert">{error}</Text> : null;
  if (fromCache) {
    return (
      <View style={s.banner} accessibilityRole="alert">
        <Text style={s.bannerTxt}>{`Offline. Showing the last saved answer, ${st.label}.`}</Text>
        {error ? <Text style={s.bannerSub}>{error}</Text> : null}
      </View>
    );
  }
  return <Text style={s.fresh}>{`Live from your Arya backend, ${st.label}`}</Text>;
}

export function KV({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={s.kv}>
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={Typography.body}>{label}</Text>
        {sub ? <Text style={Typography.caption}>{sub}</Text> : null}
      </View>
      <Text style={[s.kvVal, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, accessibilityLabel }: { label: string; active?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: !!active }} onPress={onPress}
      style={[s.chip, active && { backgroundColor: Colors.cyan, borderColor: Colors.cyan }]}>
      <Text style={[s.chipTxt, active && { color: '#000' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A low-to-high bar with a marker where the price sits. */
export function RangeBar({ pos, lowLabel, highLabel, caption }: { pos: number | null; lowLabel: string; highLabel: string; caption: string }) {
  return (
    <View style={{ marginVertical: Spacing.sm }}>
      <Text style={Typography.caption}>{caption}</Text>
      <View style={s.track}>
        {pos !== null ? <View style={[s.marker, { left: `${Math.round(pos * 100)}%` as any }]} /> : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={Typography.caption}>{lowLabel}</Text>
        <Text style={Typography.caption}>{highLabel}</Text>
      </View>
    </View>
  );
}

export const changeColor = (n: number | null) => (n === null || n === 0 ? Colors.textMuted : n > 0 ? Colors.teal : Colors.red);
export { formatAsOf, relativeTime };

const s = StyleSheet.create({
  fresh: { ...Typography.caption, marginBottom: Spacing.md },
  banner: { backgroundColor: 'rgba(240,165,0,0.08)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', borderRadius: Radii.md, padding: Spacing.sm, marginBottom: Spacing.md },
  bannerTxt: { ...Typography.caption, color: Colors.gold, fontWeight: '700' },
  bannerSub: { ...Typography.caption, color: Colors.gold, marginTop: 2 },
  kv: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  kvVal: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  chipTxt: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  track: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginVertical: 8, justifyContent: 'center' },
  marker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.cyan, marginLeft: -6 },
});
