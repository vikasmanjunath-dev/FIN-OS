import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { formatAsOf, staleness, relativeTime, fmtPct } from '@/lib/marketData';
import { PriceChart } from '@/components/PriceChart';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadYahooChart } from '@/lib/marketDataApi';
import { DETAIL_RANGES, periodsFor, summariseSeries, type DetailAsset, type DetailRangeId } from '@/lib/marketDataDetail';

/** Screen shell for the market screens: back link, title, pull to refresh. */
export function MarketScreen({ title, subtitle, children, refreshing, onRefresh }: {
  title: string; subtitle?: string; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();       // the home indicator / gesture bar (the top inset is applied once by the root layout)
  return (
    <ScrollView
      style={{ flexGrow: 1, flexShrink: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 80 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} /> : undefined}
    >
      <View style={{ marginBottom: Spacing.xs }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
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
  chip: { maxWidth: '100%', borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  chipTxt: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  track: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginVertical: 8, justifyContent: 'center' },
  marker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.cyan, marginLeft: -6 },
});

// ── price history block shared by the crypto, commodity and currency detail screens ───────────────────────────────────

const fmtP = (n: number, prefix: string, digits: number) => prefix + n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Range chips, chart, and figures computed from the closes (change, range, worst fall, volatility), with the unit and the source said. */
export function HistoryBlock({ asset }: { asset: DetailAsset }) {
  const [range, setRange] = useState<DetailRangeId>('3M');
  const def = DETAIL_RANGES.find(r => r.id === range)!;
  const r = useMarketResource(() => (asset.yahoo ? loadYahooChart(asset.yahoo, def.range, def.interval) : Promise.resolve({ data: null, savedAt: null, fromCache: false, error: asset.noChartReason ?? null })), [asset.yahoo, range]);
  const sum = r.data ? summariseSeries(r.data, periodsFor(asset, def.interval)) : null;
  const digits = sum && sum.low < 5 ? 4 : 2;
  const weekly = def.interval === '1wk';
  return (
    <Card>
      <Text style={Typography.label}>PRICE HISTORY</Text>
      {!asset.yahoo ? <Text style={[Typography.body, { marginTop: 6 }]}>{asset.noChartReason ?? 'No price history is available.'}</Text> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginVertical: Spacing.sm }}>
            {DETAIL_RANGES.map(x => <Chip key={x.id} label={x.label} active={range === x.id} onPress={() => setRange(x.id)} accessibilityLabel={`Chart range ${x.label}`} />)}
          </View>
          <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={15 * 60_000} loading={r.loading} />
          {r.data && sum ? (
            <>
              <PriceChart chart={r.data} prefix={asset.chartPrefix} digits={digits} />
              <Text style={[Typography.caption, { marginVertical: 4 }]}>{`In ${asset.chartUnit}. ${weekly ? 'Weekly' : 'Daily'} closes, ${sum.startDate} to ${sum.endDate}. Source: Yahoo Finance via your Arya backend.`}</Text>
              <KV label={`Change over ${range}`} value={fmtPct(sum.changePct)} color={changeColor(sum.changePct)} sub="First close to last close in the range" />
              <KV label="Highest and lowest close" value={`${fmtP(sum.high, asset.chartPrefix, digits)} / ${fmtP(sum.low, asset.chartPrefix, digits)}`} />
              <KV label="Latest vs highest close" value={fmtPct(sum.fromHighPct, 1)} color={changeColor(sum.fromHighPct)} />
              <KV label="Worst fall from a peak in this range" value={fmtPct(sum.maxDrawdownPct, 1)} color={changeColor(sum.maxDrawdownPct)} sub="Largest drop from a running high to a later low" />
              <KV label={`Typical ${weekly ? 'weekly' : 'daily'} swing, per year`} value={sum.volatilityPct === null ? 'Not enough data' : `${sum.volatilityPct.toFixed(1)}%`}
                sub={`Standard deviation of ${weekly ? 'weekly' : 'daily'} moves scaled to a year. Computed from these closes. A past measure, not a forecast.`} />
              {sum.coarse ? <Text style={[Typography.caption, { color: Colors.gold }]}>Prices under 5 are rounded by the backend to 2 decimals, so small moves look like steps and the figures above are approximate.</Text> : null}
            </>
          ) : null}
          {!r.loading && !r.data ? <Text style={Typography.caption}>{`No history to show right now. ${r.error ?? ''}`}</Text> : null}
        </>
      )}
    </Card>
  );
}
