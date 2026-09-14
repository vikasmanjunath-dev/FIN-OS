import React, { useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFinosContext } from '@/hooks/useFinosContext';
import { MetricCard } from '@/components/MetricCard';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const AA_PROVIDERS = [
  { id: 'finvu',    name: 'Finvu',    logo: '🏦', color: Colors.cyan,   banks: 'HDFC · ICICI · SBI · 60+ banks' },
  { id: 'onemoney', name: 'OneMoney', logo: '🔗', color: Colors.teal,   banks: 'Axis · Kotak · BOB · 40+ banks', popular: true },
  { id: 'perfios',  name: 'Perfios',  logo: '📊', color: Colors.purple, banks: 'All banks + MF portfolio' },
  { id: 'cams_mf',  name: 'MF Central', logo: '📈', color: Colors.gold, banks: 'CAMS · KFintech MF holdings' },
];

function AAProviderCard({ provider }: { provider: typeof AA_PROVIDERS[0] }) {
  return (
    <TouchableOpacity
      style={[styles.providerCard, { borderColor: provider.color + '30' }]}
      onPress={() => {
        Haptics.selectionAsync();
        Alert.alert(
          `Connect ${provider.name}`,
          `To connect ${provider.name}, you need to register as a Financial Information User (FIU) at their portal.\n\nDemo mode is available — tap Demo to see simulated data.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Demo Mode', onPress: () => Alert.alert('Demo', 'Demo sync would populate 6 months of transactions and 3 MF holdings.') },
          ]
        );
      }}
      activeOpacity={0.8}
    >
      <View style={styles.providerTop}>
        <Text style={styles.providerLogo}>{provider.logo}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{provider.name}</Text>
          <Text style={styles.providerBanks}>{provider.banks}</Text>
        </View>
        {provider.popular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>⭐ Popular</Text>
          </View>
        )}
      </View>
      <View style={[styles.connectBtn, { borderColor: provider.color + '50', backgroundColor: provider.color + '12' }]}>
        <Text style={[styles.connectBtnText, { color: provider.color }]}>Connect {provider.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TrackScreen() {
  const { ctx, loading, refresh } = useFinosContext();
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
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={Typography.h2}>Track Finances</Text>
        <Text style={Typography.caption}>{new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</Text>
      </View>

      {/* ── Income vs Expense ── */}
      <View style={styles.ieRow}>
        <MetricCard label="Income" value={formatINR(ctx.monthlyIncome)} accent={Colors.teal} icon="💰" style={{ flex: 1 }} sub={ctx.aaIncome > 0 ? 'from AA' : 'from profile'} />
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

      {/* ── Account Aggregator ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Account Aggregator</Text>
        <Text style={styles.sectionSub}>RBI-regulated · End-to-end encrypted</Text>
      </View>

      <View style={styles.aaInfoBox}>
        <Text style={styles.aaInfoText}>
          🔒 Connect your bank accounts for automatic transaction sync. FIN·OS runs locally — your data never leaves your device.
        </Text>
      </View>

      {AA_PROVIDERS.map(p => <AAProviderCard key={p.id} provider={p} />)}

      {/* ── Manual Entry Prompt ── */}
      <View style={styles.manualCard}>
        <Text style={styles.manualTitle}>📱 Manual Entry</Text>
        <Text style={styles.manualSub}>Don't have an AA account yet? Open FIN·OS on the web to use the Document AI feature — upload your bank statement and it auto-fills your data.</Text>
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
