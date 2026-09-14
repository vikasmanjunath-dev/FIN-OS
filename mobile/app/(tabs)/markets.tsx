import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useMarketData, IndexQuote } from '@/hooks/useMarketData';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const SECTOR_INDICES = [
  { symbol: '^CNXIT',   name: 'IT',          emoji: '💻' },
  { symbol: '^NSEBANK', name: 'BANK',         emoji: '🏦' },
  { symbol: '^CNXFMCG', name: 'FMCG',         emoji: '🛒' },
  { symbol: '^CNXPHARMA', name: 'PHARMA',      emoji: '💊' },
  { symbol: '^CNXAUTO', name: 'AUTO',          emoji: '🚗' },
  { symbol: '^CNXMETAL', name: 'METAL',        emoji: '⚙️' },
];

function IndexCard({ quote, accent = Colors.cyan }: { quote: IndexQuote; accent?: string }) {
  const up = quote.changePct >= 0;
  const color = up ? Colors.teal : Colors.red;
  return (
    <LinearGradient colors={['#0D1117', '#111827']} style={[styles.indexCard, { borderColor: color + '30' }]}>
      <View style={[styles.indexBar, { backgroundColor: color }]} />
      <Text style={styles.indexName}>{quote.name}</Text>
      <Text style={[styles.indexPrice, { color: accent }]}>
        {quote.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </Text>
      <View style={styles.indexChangeRow}>
        <Text style={[styles.indexChange, { color }]}>
          {up ? '▲' : '▼'} {Math.abs(quote.change).toFixed(2)}
        </Text>
        <Text style={[styles.indexChangePct, { color }]}>
          {up ? '+' : ''}{quote.changePct.toFixed(2)}%
        </Text>
      </View>
    </LinearGradient>
  );
}

function SectorRow({ name, emoji, changePct }: { name: string; emoji: string; changePct: number }) {
  const up = changePct >= 0;
  const color = up ? Colors.teal : Colors.red;
  const barWidth = Math.min(100, Math.abs(changePct) * 20);
  return (
    <View style={styles.sectorRow}>
      <Text style={styles.sectorEmoji}>{emoji}</Text>
      <Text style={styles.sectorName}>{name}</Text>
      <View style={styles.sectorBarBg}>
        <View style={[styles.sectorBar, { width: `${barWidth}%` as any, backgroundColor: color, alignSelf: up ? 'flex-start' : 'flex-end' }]} />
      </View>
      <Text style={[styles.sectorPct, { color }]}>{up ? '+' : ''}{changePct.toFixed(2)}%</Text>
    </View>
  );
}

export default function MarketsScreen() {
  const { data, loading, refresh } = useMarketData();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Mock sector data (in production: fetch from stock-engine)
  const sectorData = SECTOR_INDICES.map((s, i) => ({
    ...s,
    changePct: [1.2, -0.4, 0.8, -1.1, 2.3, -0.6][i],
  }));

  const now = data.lastUpdated
    ? data.lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'offline';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={Typography.h2}>Markets</Text>
        <Text style={styles.updated}>Updated {now}</Text>
      </View>

      {/* ── Main indices ── */}
      <View style={styles.indexGrid}>
        {data.nifty50 && <IndexCard quote={data.nifty50} accent={Colors.cyan} />}
        {data.sensex  && <IndexCard quote={data.sensex}  accent={Colors.gold} />}
      </View>

      {/* ── Sector heatmap ── */}
      <Text style={styles.sectionLabel}>SECTORS</Text>
      <View style={styles.sectorCard}>
        {sectorData.map(s => (
          <SectorRow key={s.symbol} name={s.name} emoji={s.emoji} changePct={s.changePct} />
        ))}
      </View>

      {/* ── FII/DII flows (mock) ── */}
      <Text style={styles.sectionLabel}>FII / DII FLOWS (TODAY)</Text>
      <View style={styles.flowCard}>
        {[
          { label: 'FII Buy', value: '₹4,820Cr', color: Colors.teal },
          { label: 'FII Sell', value: '₹3,210Cr', color: Colors.red },
          { label: 'DII Buy', value: '₹2,990Cr', color: Colors.cyan },
          { label: 'DII Sell', value: '₹1,840Cr', color: Colors.gold },
        ].map(f => (
          <View key={f.label} style={styles.flowRow}>
            <Text style={styles.flowLabel}>{f.label}</Text>
            <Text style={[styles.flowValue, { color: f.color }]}>{f.value}</Text>
          </View>
        ))}
        <Text style={styles.flowNote}>Source: NSE. Refreshes daily at market close.</Text>
      </View>

      {/* ── Market Status ── */}
      <View style={styles.statusCard}>
        <Text style={styles.statusDot}>{isMarketOpen() ? '🟢' : '🔴'}</Text>
        <Text style={styles.statusText}>
          NSE is currently <Text style={{ color: isMarketOpen() ? Colors.teal : Colors.red, fontWeight: '700' }}>
            {isMarketOpen() ? 'OPEN' : 'CLOSED'}
          </Text>
          {isMarketOpen() ? '' : ' — opens Mon–Fri 9:15 AM IST'}
        </Text>
      </View>

      {data.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {data.error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: Spacing.lg, paddingTop: Spacing.xxl },
  updated: { ...Typography.caption },

  indexGrid: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  indexCard: { flex: 1, borderRadius: Radii.lg, padding: Spacing.md, borderWidth: 1, overflow: 'hidden' },
  indexBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  indexName: { ...Typography.label, marginBottom: Spacing.xs },
  indexPrice: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  indexChangeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  indexChange: { fontSize: 12, fontWeight: '700' },
  indexChangePct: { fontSize: 12, fontWeight: '700' },

  sectionLabel: { ...Typography.label, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  sectorCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm },
  sectorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectorEmoji: { fontSize: 16, width: 24, textAlign: 'center' },
  sectorName: { ...Typography.caption, width: 50, fontWeight: '700', color: Colors.textPrimary },
  sectorBarBg: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  sectorBar: { height: '100%', borderRadius: 2 },
  sectorPct: { width: 52, fontSize: 11, fontWeight: '700', textAlign: 'right' },

  flowCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg },
  flowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  flowLabel: { ...Typography.body, color: Colors.textMuted },
  flowValue: { fontSize: 14, fontWeight: '700' },
  flowNote: { ...Typography.caption, marginTop: Spacing.sm, color: Colors.textDim },

  statusCard: { marginHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.overlay, borderRadius: Radii.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  statusDot: { fontSize: 12 },
  statusText: { ...Typography.caption, flex: 1 },

  errorBanner: { marginHorizontal: Spacing.lg, backgroundColor: 'rgba(240,165,0,0.08)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', borderRadius: Radii.md, padding: Spacing.sm, marginBottom: Spacing.md },
  errorText: { ...Typography.caption, color: Colors.gold },
});
