import React, { useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFinosContext } from '@/hooks/useFinosContext';
import { MetricCard } from '@/components/MetricCard';
import { TrackerStorageNotice } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

export default function TrackScreen() {
  const { ctx, loading, loadError, refresh } = useFinosContext();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const formatINR = (n: number) => {
    if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return '₹' + n.toLocaleString('en-IN');
  };

  const spendPct = ctx.monthlyIncome > 0
    ? Math.min(100, Math.round((ctx.monthlyExpense / ctx.monthlyIncome) * 100))
    : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
      showsVerticalScrollIndicator={false}
    >
      {loading ? <Text style={[Typography.caption, { padding: Spacing.lg }]}>Loading your saved tracker data…</Text>
        : loadError ? <View style={{ padding: Spacing.lg }}><TrackerStorageNotice /></View>
        : <>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={Typography.h2}>Track Finances</Text>
        <Text style={Typography.caption}>{new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</Text>
      </View>

      {/* ── Income vs Expense ── */}
      <View style={styles.ieRow}>
        <MetricCard label="Income" value={formatINR(ctx.monthlyIncome)} accent={Colors.teal} icon="💰" style={{ flex: 1 }} sub={ctx.aaIncome > 0 ? 'from imported data' : 'from profile'} />
        <MetricCard label="Expense" value={formatINR(ctx.monthlyExpense)} accent={Colors.gold} icon="💸" style={{ flex: 1 }} sub={`${spendPct}% of income`} />
      </View>

      {/* ── Spend Bar ── */}
      {ctx.monthlyIncome > 0 && (
        <View style={styles.spendBarCard}>
          <View style={styles.spendBarRow}>
            <Text style={styles.spendBarLabel}>Spending {spendPct}% of income</Text>
            <Text style={[styles.spendBarStatus, { color: spendPct > 80 ? Colors.red : spendPct > 60 ? Colors.gold : Colors.teal }]}>
              {spendPct > 80 ? 'High ⚠️' : spendPct > 60 ? 'Moderate' : 'Healthy ✓'}
            </Text>
          </View>
          <View style={styles.spendBarBg}>
            <View style={[styles.spendBarFill, {
              width: `${spendPct}%` as any,
              backgroundColor: spendPct > 80 ? Colors.red : spendPct > 60 ? Colors.gold : Colors.teal,
            }]} />
          </View>
          <Text style={styles.savingsNote}>
            Saving <Text style={{ color: Colors.teal, fontWeight: '700' }}>{formatINR(ctx.monthlyIncome - ctx.monthlyExpense)}/month</Text>
          </Text>
        </View>
      )}
      </>}

      {/* ── Getting your transactions in (honest about what exists) ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bring in your transactions</Text>
        <Text style={styles.sectionSub}>Nothing leaves your device unless you sign in to sync</Text>
      </View>

      <TouchableOpacity style={styles.manualCard} activeOpacity={0.8}
        onPress={() => { Haptics.selectionAsync(); router.push('/tracker/transactions' as any); }} accessibilityRole="button">
        <Text style={styles.manualTitle}>✍️ Log them here</Text>
        <Text style={styles.manualSub}>Add a transaction in a few taps, repeat a recent one, or set up monthly entries for rent and SIPs. Tap to open.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.manualCard} activeOpacity={0.8}
        onPress={() => { Haptics.selectionAsync(); router.push('/tracker/import' as any); }} accessibilityRole="button">
        <Text style={styles.manualTitle}>📄 Import a bank statement</Text>
        <Text style={styles.manualSub}>Pick your bank's CSV (or paste it). It is read on this phone — nothing is uploaded — with a preview first and a one-tap undo. Tap to open.</Text>
      </TouchableOpacity>

      <View style={styles.aaInfoBox}>
        <Text style={styles.aaInfoText}>
          🔗 Account Aggregator (automatic bank sync) is not connected yet — FIN·OS has no live provider integration, so there is nothing to link here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 80 },
  header: { padding: Spacing.lg, paddingTop: Spacing.xxl },

  ieRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },

  spendBarCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg },
  spendBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  spendBarLabel: { ...Typography.caption },
  spendBarStatus: { fontSize: 11, fontWeight: '700' },
  spendBarBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: Spacing.sm },
  spendBarFill: { height: '100%', borderRadius: 3 },
  savingsNote: { ...Typography.caption },

  sectionHeader: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.h3 },
  sectionSub: { ...Typography.caption, marginTop: 2 },

  aaInfoBox: { marginHorizontal: Spacing.lg, backgroundColor: 'rgba(123,47,247,0.06)', borderWidth: 1, borderColor: 'rgba(123,47,247,0.2)', borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.md },
  aaInfoText: { ...Typography.caption, lineHeight: 18 },

  providerCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm },
  providerTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  providerLogo: { fontSize: 28 },
  providerName: { ...Typography.body, fontWeight: '700' },
  providerBanks: { ...Typography.caption, marginTop: 2 },
  popularBadge: { backgroundColor: 'rgba(240,165,0,0.1)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 3 },
  popularText: { fontSize: 10, color: Colors.gold, fontWeight: '700' },
  connectBtn: { borderWidth: 1, borderRadius: Radii.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  connectBtnText: { fontSize: 13, fontWeight: '700' },

  manualCard: { margin: Spacing.lg, backgroundColor: Colors.overlay, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  manualTitle: { ...Typography.body, fontWeight: '700', marginBottom: Spacing.xs },
  manualSub: { ...Typography.caption, lineHeight: 18 },
});
