import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useMarketData, IndexQuote } from '@/hooks/useMarketData';
import { useSectors } from '@/hooks/useSectors';
import { router } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { LinearGradient } from '@/components/Gradient';

const SECTOR_EMOJI: Record<string, string> = {
  IT: '💻', BANK: '🏦', FMCG: '🛒', PHARMA: '💊', AUTO: '🚗', METAL: '⚙️', ENERGY: '⚡', REALTY: '🏢',
};

function IndexCard({ quote, accent = Colors.cyan }: { quote: IndexQuote; accent?: string }) {
  const known = quote.changePct !== null;
  const up = (quote.changePct ?? 0) >= 0;
  const color = !known ? Colors.textMuted : up ? Colors.teal : Colors.red;
  return (
    <LinearGradient colors={['#0D1117', '#111827']} style={[styles.indexCard, { borderColor: color + '30' }]}>
      <View style={[styles.indexBar, { backgroundColor: color }]} />
      <Text style={styles.indexName}>{quote.name}</Text>
      <Text style={[styles.indexPrice, { color: accent }]}>
        {quote.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </Text>
      <View style={styles.indexChangeRow}>
        {known ? (
          <>
            <Text style={[styles.indexChange, { color }]}>
              {up ? '▲' : '▼'} {quote.change !== null ? Math.abs(quote.change).toFixed(2) : ''}
            </Text>
            <Text style={[styles.indexChangePct, { color }]}>
              {up ? '+' : ''}{quote.changePct!.toFixed(2)}%
            </Text>
          </>
        ) : <Text style={[styles.indexChange, { color }]}>Change not available</Text>}
      </View>
      {quote.pe !== null ? <Text style={styles.indexMeta}>{`P/E ${quote.pe.toFixed(1)}${quote.pb !== null ? ` · P/B ${quote.pb.toFixed(2)}` : ''} (NSE)`}</Text> : null}
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
  const sec = useSectors();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), sec.refresh()]);
    setRefreshing(false);
  };

  const now = data.lastUpdated
    ? data.lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'offline';
  const stale = data.stale && data.lastUpdated !== null;

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
        <Text style={styles.updated}>{stale ? `Last saved ${now}, not live` : `Updated ${now}`}</Text>
      </View>

      {/* ── Main indices ── */}
      <View style={styles.indexGrid}>
        {data.nifty50 && <IndexCard quote={data.nifty50} accent={Colors.cyan} />}
        {data.sensex  && <IndexCard quote={data.sensex}  accent={Colors.gold} />}
      </View>

      {/* ── Research: news, screener, prices, lookups ── */}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open market research: news, screener, prices, funds" style={styles.researchBtn} onPress={() => router.push('/market' as any)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.researchTitle}>Market research</Text>
          <Text style={Typography.caption}>News, share and fund look-up, screener, gold, currency, crypto</Text>
        </View>
        <Text style={{ color: Colors.cyan, fontSize: 18 }}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open mutual fund search: find a fund, Direct vs Regular, compare" style={styles.researchBtn} onPress={() => router.push('/funds' as any)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.researchTitle}>Mutual fund search</Text>
          <Text style={Typography.caption}>Find a fund, see its NAV with the date, Direct vs Regular, compare</Text>
        </View>
        <Text style={{ color: Colors.cyan, fontSize: 18 }}>›</Text>
      </TouchableOpacity>

      {/* ── Sector heatmap ── */}
      <Text style={styles.sectionLabel}>SECTORS</Text>
      <View style={styles.sectorCard}>
        {sec.sectors.map(x => (
          <SectorRow key={x.name} name={x.label} emoji={SECTOR_EMOJI[x.label] ?? '📊'} changePct={x.changePct} />
        ))}
        {sec.sectors.length === 0 && (
          <Text style={styles.flowNote}>{sec.loading ? 'Loading sector moves…' : sec.error ?? 'No sector data.'}</Text>
        )}
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
  indexMeta: { ...Typography.caption, marginTop: 4 },
  researchBtn: { marginHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  researchTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

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
