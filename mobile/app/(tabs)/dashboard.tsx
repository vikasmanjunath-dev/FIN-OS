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
import { useTrackers } from '@/hooks/useTrackers';
import { nextBestStep } from '@/lib/trackers';
import { inrShort, tierColor } from '@/components/TrackerUI';
import { useQuickLog } from '@/hooks/useQuickLog';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { QuickLogChips } from '@/components/QuickLogChips';
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
  const { data: td, computed: tc, reload: reloadTrackers } = useTrackers();
  const quick = useQuickLog(3);
  const { summary: subs } = useSubscriptions();
  const { data: market } = useMarketData();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), reloadTrackers()]);
    setRefreshing(false);
  }, [refresh, reloadTrackers]);

  const health = tc.health;
  const step = nextBestStep(health);
  const hasBudget = tc.budget.income > 0;
  const sp = tc.spending;
  const rt = tc.retirement;
  const urgentGaps = rt.coverage.gaps.filter(g => g.severity === 'critical' || g.severity === 'high').length;
  const atRisk = sp.budget.rows.filter(r => r.limit > 0 && r.state !== 'ok').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const open = (path: string) => { Haptics.selectionAsync(); router.push(path as any); };

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
      <TouchableOpacity activeOpacity={0.85} onPress={() => open('/tracker/networth')} accessibilityRole="button" accessibilityLabel={`Net worth ${inrShort(tc.netWorth.netWorth)}. Open net worth tracker`}>
        <LinearGradient colors={['#0D1117', '#111827']} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={[styles.heroTopBar, { backgroundColor: tc.netWorth.netWorth < 0 ? Colors.red : Colors.cyan }]} />
          <Text style={styles.heroLabel}>NET WORTH  ›</Text>
          <Text style={[styles.heroValue, tc.netWorth.netWorth < 0 && { color: Colors.red }]}>{inrShort(tc.netWorth.netWorth)}</Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroSub}>Portfolio</Text>
              <Text style={[styles.heroSubValue, { color: Colors.teal }]}>{inrShort(td.portfolio)}</Text>
            </View>
            <View>
              <Text style={styles.heroSub}>Monthly SIP</Text>
              <Text style={[styles.heroSubValue, { color: Colors.purple }]}>{inrShort(td.monthlySip)}</Text>
            </View>
            <View>
              <Text style={styles.heroSub}>Savings Rate</Text>
              <Text style={[styles.heroSubValue, { color: !tc.budget.known ? Colors.textMuted : tc.budget.savingsRate >= 20 ? Colors.teal : Colors.gold }]}>
                {tc.budget.known ? `${tc.budget.savingsRate}%` : '—'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Next best step ── */}
      {step && (
        <TouchableOpacity style={styles.step} activeOpacity={0.8} onPress={() => open(step.route)} accessibilityRole="button">
          <Text style={styles.stepIcon}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepLabel}>NEXT BEST STEP</Text>
            <Text style={styles.stepText}>{step.tip}</Text>
          </View>
          <Text style={{ color: Colors.cyan, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── Spending this month ── */}
      <View style={styles.spendCard}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => open('/tracker/transactions')} accessibilityRole="button"
          accessibilityLabel={`Spent ${inrShort(sp.totals.spent)} this month. Open transactions`}>
          <Text style={styles.spendLabel}>SPENT THIS MONTH</Text>
          <Text style={styles.spendValue}>{inrShort(sp.totals.spent)}</Text>
          <Text style={styles.spendSub}>
            {sp.totals.count > 0 ? `${sp.totals.count} entr${sp.totals.count === 1 ? 'y' : 'ies'} logged` : 'Nothing logged yet'}
            {sp.budget.total.limit > 0 ? ` · ${sp.budget.total.pct}% of budget` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logBtn} onPress={() => open('/tracker/transactions')} accessibilityRole="button" accessibilityLabel="Log a transaction">
          <Text style={styles.logBtnTxt}>＋ Log</Text>
        </TouchableOpacity>
      </View>
      {(quick.chips.length > 0 || quick.undo) && (
        <View style={styles.quickWrap}>
          <Text style={styles.quickLabel}>QUICK LOG</Text>
          <QuickLogChips chips={quick.chips} onLog={async c => { await quick.log(c); reloadTrackers(); }} onEdit={() => open('/tracker/transactions')} undo={quick.undo} onUndo={async () => { await quick.undoLast(); reloadTrackers(); }} />
        </View>
      )}
      {atRisk && (
        <TouchableOpacity style={[styles.alert, atRisk.state === 'over' && { borderColor: 'rgba(255,68,68,0.4)', backgroundColor: 'rgba(255,68,68,0.07)' }]}
          onPress={() => open('/tracker/budget')} activeOpacity={0.8} accessibilityRole="button">
          <Text style={styles.alertIcon}>{atRisk.state === 'over' ? '🚨' : '⚠️'}</Text>
          <Text style={styles.alertTxt}>
            {atRisk.state === 'over' ? `${atRisk.category} is over budget` : atRisk.pct! >= 80 ? `${atRisk.category} is ${atRisk.pct}% of budget` : `${atRisk.category} is on pace to overshoot`}
            {` — ${inrShort(atRisk.spent)} of ${inrShort(atRisk.limit)}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Metric Grid (each card opens its tracker) ── */}
      <View style={styles.grid}>
        <MetricCard
          label="Health Score"
          value={`${health.total}/100`}
          sub={`${health.tierEmoji} ${health.tier[0] + health.tier.slice(1).toLowerCase()}`}
          accent={tierColor(health.tier)}
          icon="🏥"
          style={styles.gridHalf}
          onPress={() => open('/tracker/health')}
        />
        <MetricCard
          label="Emergency Fund"
          value={tc.emergency.monthlyExpense > 0 ? `${tc.emergency.covered.toFixed(1)} mo` : '—'}
          sub={tc.emergency.monthlyExpense > 0 ? `of ${tc.emergency.target} months · ${tc.emergency.status.label.toLowerCase()}` : 'add monthly spend'}
          accent={tc.emergency.status.level === 'full' ? Colors.teal : tc.emergency.status.level === 'critical' ? Colors.red : Colors.gold}
          icon="🛡️"
          style={styles.gridHalf}
          onPress={() => open('/tracker/emergency')}
        />
        <MetricCard
          label="Monthly Income"
          value={hasBudget ? inrShort(tc.budget.income) : '—'}
          sub={td.aaIncome > 0 && !td.income ? 'via Account Aggregator' : hasBudget ? 'tap to edit' : 'set in Budget'}
          accent={Colors.teal}
          icon="💰"
          style={styles.gridHalf}
          onPress={() => open('/tracker/budget')}
        />
        <MetricCard
          label="Monthly Spend"
          value={tc.budget.expense > 0 ? inrShort(tc.budget.expense) : '—'}
          sub={tc.budget.known ? (tc.budget.saving >= 0 ? `saving ${tc.budget.savingsRate}%` : 'spending more than you earn') : 'set in Budget'}
          accent={Colors.gold}
          icon="💳"
          style={styles.gridHalf}
          onPress={() => open('/tracker/budget')}
        />
        <MetricCard
          label="FIRE Progress"
          value={`${tc.netWorth.firePercent.toFixed(tc.netWorth.firePercent >= 10 ? 0 : 1)}%`}
          sub={`of ${inrShort(tc.netWorth.fireCorpus)} target`}
          accent={Colors.purple}
          icon="🔥"
          style={styles.gridHalf}
          onPress={() => open('/tracker/networth')}
        />
        <MetricCard
          label="Goals"
          value={tc.goals.items.length ? `${Math.round(tc.goals.avgProgress)}%` : '—'}
          sub={tc.goals.items.length ? `${tc.goals.items.length} goal${tc.goals.items.length === 1 ? '' : 's'} on track` : 'add your first goal'}
          accent={Colors.cyan}
          icon="🎯"
          style={styles.gridHalf}
          onPress={() => open('/tracker/goals')}
        />
      </View>

      {/* ── Retirement & protection ── */}
      <Text style={styles.sectionTitle}>Retirement & Protection</Text>
      <View style={styles.grid}>
        <MetricCard
          label="EPF"
          value={td.epf > 0 ? inrShort(td.epf) : '—'}
          sub={rt.epf.complete ? `→ ${inrShort(rt.epf.projected)} at retirement` : 'tap to set up'}
          accent={Colors.teal}
          icon="🏢"
          style={styles.gridHalf}
          onPress={() => open('/tracker/epf')}
        />
        <MetricCard
          label="NPS"
          value={rt.nps.total > 0 ? inrShort(rt.nps.total) : '—'}
          sub={rt.nps.projected > 0 ? `→ ${inrShort(rt.nps.projected)} at 60` : 'tap to set up'}
          accent={Colors.cyan}
          icon="🏛️"
          style={styles.gridHalf}
          onPress={() => open('/tracker/nps')}
        />
        <MetricCard
          label="PPF & Small Savings"
          value={rt.savings.total > 0 ? inrShort(rt.savings.total) : '—'}
          sub={td.ppfAccounts.length ? `${td.ppfAccounts.length} account${td.ppfAccounts.length === 1 ? '' : 's'} · ${inrShort(Math.min(rt.savings.c80c, 150000))} 80C` : 'tap to set up'}
          accent={Colors.gold}
          icon="📮"
          style={styles.gridHalf}
          onPress={() => open('/tracker/ppf')}
        />
        <MetricCard
          label="Insurance"
          value={td.policies.length ? `${td.policies.length} polic${td.policies.length === 1 ? 'y' : 'ies'}` : '—'}
          sub={td.policies.length ? (urgentGaps > 0 ? `${urgentGaps} gap${urgentGaps === 1 ? '' : 's'} to fix` : 'cover looks solid') : 'add your policies'}
          accent={urgentGaps > 0 || !td.policies.length ? Colors.orange : Colors.teal}
          icon="🛡️"
          style={styles.gridHalf}
          onPress={() => open('/tracker/insurance')}
        />
      </View>

      {/* ── Recurring costs ── */}
      <Text style={styles.sectionTitle}>Recurring Costs</Text>
      <View style={styles.grid}>
      <MetricCard
        label="Subscriptions"
        value={subs.activeCount ? `${formatINR(Math.round(subs.monthly))}/mo` : '—'}
        sub={
          subs.activeCount
            ? subs.review.length
              ? `${subs.review.length} worth a second look · save up to ${inrShort(subs.reviewSavings)}/yr`
              : subs.upcoming[0]
                ? `next: ${subs.upcoming[0].name} ${subs.upcoming[0].daysAway === 0 ? 'today' : `in ${subs.upcoming[0].daysAway}d`}`
                : `${inrShort(subs.annual)} a year`
            : 'tap to add your plans'
        }
        accent={subs.review.length ? Colors.orange : Colors.purple}
        icon="🔁"
        style={{ width: '100%' }}
        onPress={() => open('/tracker/subscriptions')}
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

  spendCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, padding: Spacing.md },
  spendLabel: { ...Typography.label, marginBottom: 2 },
  spendValue: { fontSize: 22, fontWeight: '900', color: Colors.gold },
  spendSub: { ...Typography.caption, marginTop: 2 },
  logBtn: { backgroundColor: Colors.gold, borderRadius: Radii.full, paddingHorizontal: 18, paddingVertical: 10 },
  logBtnTxt: { color: Colors.bg, fontWeight: '800', fontSize: 13 },
  quickWrap: { marginHorizontal: Spacing.lg, marginTop: -Spacing.xs, marginBottom: Spacing.md },
  quickLabel: { ...Typography.label, marginBottom: 6 },
  alert: { marginHorizontal: Spacing.lg, marginTop: -Spacing.sm, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(240,165,0,0.07)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)', borderRadius: Radii.md, padding: Spacing.sm + 2 },
  alertIcon: { fontSize: 16 },
  alertTxt: { ...Typography.caption, color: Colors.textPrimary, flex: 1, lineHeight: 17 },

  step: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(240,165,0,0.06)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', borderRadius: Radii.lg, padding: Spacing.md },
  stepIcon: { fontSize: 22 },
  stepLabel: { ...Typography.label, color: Colors.gold, marginBottom: 2 },
  stepText: { ...Typography.body, lineHeight: 19 },

  nudge: { marginHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(0,212,255,0.05)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: Radii.lg, padding: Spacing.md },
  nudgeIcon: { fontSize: 24 },
  nudgeTitle: { ...Typography.body, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  nudgeSub: { ...Typography.caption, lineHeight: 16 },
});
