import React, { useCallback } from 'react';
import {
  ScrollView, View, Text, StyleSheet, RefreshControl,
  TouchableOpacity, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFinosContext } from '@/hooks/useFinosContext';
import { useMarketData } from '@/hooks/useMarketData';
import { MetricCard } from '@/components/MetricCard';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

function formatINR(n: number, compact = false): string {
  if (compact) {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
    if (n >= 1000)       return `₹${(n / 1000).toFixed(1)}K`;
  }
  return '₹' + n.toLocaleString('en-IN');
}

function IndexPill({ symbol, price, changePct }: { symbol: string; price: number; changePct: number }) {
  const up = changePct >= 0;
  return (
    <View style={[styles.pill, { borderColor: up ? 'rgba(34,211,166,0.3)' : 'rgba(255,68,68,0.3)' }]}>
      <Text style={styles.pillSymbol}>{symbol}</Text>
      <Text style={[styles.pillPrice]}>{price.toLocaleString('en-IN')}</Text>
      <Text style={[styles.pillChange, { color: up ? Colors.teal : Colors.red }]}>
        {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { ctx, loading: ctxLoading, refresh } = useFinosContext();
  const { data: market } = useMarketData();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const hsColor = ctx.healthScore >= 70 ? Colors.teal : ctx.healthScore >= 40 ? Colors.gold : Colors.red;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good {getTimeOfDay()}, {ctx.name.split(' ')[0]} 👋</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <View style={styles.settingsBtn}>
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </View>
        </Pressable>
      </View>

      {/* ── Market Strip ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={styles.pillContent}>
        {market.nifty50  && <IndexPill symbol="NIFTY" price={market.nifty50.price}  changePct={market.nifty50.changePct} />}
        {market.sensex   && <IndexPill symbol="SENSEX" price={market.sensex.price}   changePct={market.sensex.changePct} />}
        {market.niftyBank&& <IndexPill symbol="BANK"  price={market.niftyBank.price} changePct={market.niftyBank.changePct} />}
        {market.niftyIT  && <IndexPill symbol="IT"    price={market.niftyIT.price}   changePct={market.niftyIT.changePct} />}
      </ScrollView>

      {/* ── Net Worth Hero ── */}
      <LinearGradient colors={['#0D1117', '#111827']} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.heroTopBar, { backgroundColor: Colors.cyan }]} />
        <Text style={styles.heroLabel}>NET WORTH</Text>
        <Text style={styles.heroValue}>{formatINR(ctx.netWorth, true)}</Text>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroSub}>Portfolio</Text>
            <Text style={[styles.heroSubValue, { color: Colors.teal }]}>{formatINR(ctx.portfolioValue, true)}</Text>
          </View>
          <View>
            <Text style={styles.heroSub}>Monthly SIP</Text>
            <Text style={[styles.heroSubValue, { color: Colors.purple }]}>{formatINR(ctx.sipTotal, true)}</Text>
          </View>
          <View>
            <Text style={styles.heroSub}>Savings Rate</Text>
            <Text style={[styles.heroSubValue, { color: ctx.savingsRate >= 20 ? Colors.teal : Colors.gold }]}>
              {ctx.savingsRate}%
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Metric Grid ── */}
      <View style={styles.grid}>
        <MetricCard
          label="Health Score"
          value={`${ctx.healthScore}/100`}
          sub={ctx.healthScore >= 70 ? 'Good shape' : ctx.healthScore >= 40 ? 'Room to improve' : 'Needs attention'}
          accent={hsColor}
          icon="🏥"
          style={styles.gridHalf}
        />
        <MetricCard
          label="Monthly Income"
          value={formatINR(ctx.monthlyIncome, true)}
          sub={ctx.aaIncome > 0 ? 'via Account Aggregator' : 'set in profile'}
          accent={Colors.teal}
          icon="💰"
          style={styles.gridHalf}
        />
        <MetricCard
          label="Monthly Spend"
          value={formatINR(ctx.monthlyExpense, true)}
          sub={ctx.savingsRate > 0 ? `saving ${ctx.savingsRate}%` : undefined}
          accent={Colors.gold}
          icon="💳"
          style={styles.gridHalf}
        />
        <MetricCard
          label="FIRE Progress"
          value={ctx.netWorth > 0 ? `${Math.min(100, Math.round((ctx.netWorth / 30_000_000) * 100))}%` : '—'}
          sub="of ₹3Cr target"
          accent={Colors.purple}
          icon="🔥"
          style={styles.gridHalf}
        />
      </View>

      {/* ── Quick Actions ── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionRow}>
        {[
          { icon: '✦', label: 'Ask Arya', color: Colors.purple, onPress: () => router.navigate('/(tabs)/arya') },
          { icon: '📊', label: 'Portfolio', color: Colors.cyan,   onPress: () => router.navigate('/(tabs)/portfolio') },
          { icon: '📈', label: 'Markets',   color: Colors.teal,   onPress: () => router.navigate('/(tabs)/markets') },
          { icon: '🔗', label: 'AA Sync',   color: Colors.gold,   onPress: () => router.navigate('/(tabs)/track') },
        ].map(a => (
          <TouchableOpacity
            key={a.label}
            style={[styles.actionBtn, { borderColor: a.color + '40' }]}
            onPress={() => { Haptics.selectionAsync(); a.onPress(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionIcon, { color: a.color }]}>{a.icon}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── AA Nudge (if no account linked) ── */}
      {!ctx.hasActiveAA && (
        <TouchableOpacity
          style={styles.nudge}
          onPress={() => { Haptics.selectionAsync(); router.navigate('/(tabs)/track'); }}
          activeOpacity={0.8}
        >
          <Text style={styles.nudgeIcon}>🔗</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nudgeTitle}>Link your bank account</Text>
            <Text style={styles.nudgeSub}>Connect via Account Aggregator for auto-sync of transactions and MF portfolio.</Text>
          </View>
          <Text style={{ color: Colors.cyan, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.lg, paddingTop: Spacing.xxl },
  greeting: { ...Typography.h2, fontSize: 20 },
  date: { ...Typography.caption, marginTop: 2 },
  settingsBtn: { width: 36, height: 36, borderRadius: Radii.full, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  pillRow: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  pillContent: { gap: Spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.full, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1 },
  pillSymbol: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  pillPrice: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  pillChange: { fontSize: 10, fontWeight: '700' },

  heroCard: { marginHorizontal: Spacing.lg, borderRadius: Radii.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  heroTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  heroLabel: { ...Typography.label, marginBottom: Spacing.xs },
  heroValue: { fontSize: 36, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1, marginBottom: Spacing.md },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroSub: { ...Typography.caption, marginBottom: 2 },
  heroSubValue: { fontSize: 15, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  gridHalf: { width: '48%' },

  sectionTitle: { ...Typography.label, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  actionRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radii.lg, backgroundColor: Colors.overlay, borderWidth: 1 },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },

  nudge: { marginHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(0,212,255,0.05)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: Radii.lg, padding: Spacing.md },
  nudgeIcon: { fontSize: 24 },
  nudgeTitle: { ...Typography.body, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  nudgeSub: { ...Typography.caption, lineHeight: 16 },
});
