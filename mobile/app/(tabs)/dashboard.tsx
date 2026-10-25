import { Nudges } from '@/components/Nudges';
import { AlertBell } from '@/components/AlertBell';
import React, { useCallback } from 'react';
import {
  ScrollView, View, Text, StyleSheet, RefreshControl,
  TouchableOpacity, Pressable,
} from 'react-native';
import { LinearGradient } from '@/components/Gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFinosContext } from '@/hooks/useFinosContext';
import { useMarketData } from '@/hooks/useMarketData';
import { useTrackers } from '@/hooks/useTrackers';
import { nextBestStep } from '@/lib/trackers';
import { inrShort, tierColor, NavCard } from '@/components/TrackerUI';
import { useQuickLog } from '@/hooks/useQuickLog';
import { useMoneyScore } from '@/hooks/useMoneyScore';
import { useReelsJourney } from '@/hooks/useReelsJourney';
import { ReelsHomeCard } from '@/components/ReelsHomeCard';
import { QuickLogChips } from '@/components/QuickLogChips';
import { ToolRow, StatRow } from '@/components/ToolRow';
import { PersonaStrip } from '@/components/PersonaStrip';
import { GREETING, buildStrip, dayPart, firstName, streakLine, type PersonaPrefs } from '@/lib/persona';
import { loadPersonaPrefs, savePersonaPrefs } from '@/lib/personaStorage';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

function IndexPill({ symbol, price, changePct }: { symbol: string; price: number; changePct: number | null }) {
  const known = changePct != null;
  const up = known && changePct >= 0;
  const tone = !known ? Colors.textMuted : up ? Colors.teal : Colors.red;
  return (
    <View style={[styles.pill, { borderColor: !known ? 'rgba(128,128,128,0.3)' : up ? 'rgba(34,211,166,0.3)' : 'rgba(255,68,68,0.3)' }]}>
      <Text style={styles.pillSymbol}>{symbol}</Text>
      <Text style={[styles.pillPrice]}>{price.toLocaleString('en-IN')}</Text>
      <Text style={[styles.pillChange, { color: tone }]}>
        {known ? `${up ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%` : '—'}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { refresh } = useFinosContext();
  const { data: td, computed: tc, reload: reloadTrackers } = useTrackers();
  const quick = useQuickLog(3);
  const { saved: moneyScore } = useMoneyScore();
  const rj = useReelsJourney();
  const { data: market } = useMarketData();
  const [refreshing, setRefreshing] = React.useState(false);
  // Greeting and status strip: recorded facts only (lib/persona.ts). Hiding the strip is remembered on this phone; Settings brings it back.
  const [persona, setPersona] = React.useState<PersonaPrefs>({ stripHidden: true });
  useFocusEffect(useCallback(() => { let live = true; loadPersonaPrefs().then(p => { if (live) setPersona(p); }).catch(() => {}); return () => { live = false; }; }, []));
  const hideStrip = () => { const next = { stripHidden: true }; setPersona(next); savePersonaPrefs(next); };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), reloadTrackers()]);
    setRefreshing(false);
  }, [refresh, reloadTrackers]);

  const health = tc.health;
  const step = nextBestStep(health);
  const sp = tc.spending;
  const atRisk = sp.budget.rows.filter(r => r.limit > 0 && r.state !== 'ok').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const myName = firstName(td.name);
  const streak = streakLine(td.streak);
  const strip = buildStrip({
    savingsRate: tc.budget.known ? tc.budget.savingsRate : null,
    netWorth: tc.netWorth.totalAssets > 0 || tc.netWorth.totalLiabilities > 0 ? tc.netWorth.netWorth : null,
    moneyScore: moneyScore ? { score: moneyScore.score, at: moneyScore.at } : null,
  });
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
        <View style={{ flexShrink: 1, paddingRight: Spacing.sm }}>
          <Text style={styles.greeting}><Text>{GREETING[dayPart(new Date().getHours())]}</Text><Text>{myName ? `, ${myName} 👋` : ' 👋'}</Text></Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          {streak ? <Text style={styles.streak}>{streak}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AlertBell data={td} computed={tc} style={styles.settingsBtn} />
          <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search' as any)} hitSlop={12}>
            <View style={styles.settingsBtn}>
              <Text style={{ fontSize: 18 }}>🔍</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={12}>
            <View style={styles.settingsBtn}>
              <Text style={{ fontSize: 18 }}>⚙️</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {!persona.stripHidden && <View style={{ paddingHorizontal: Spacing.lg }}><PersonaStrip items={strip} onHide={hideStrip} /></View>}

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
              <Text style={[styles.heroSubValue, { color: Colors.purpleInk }]}>{inrShort(td.monthlySip)}</Text>
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

      {/* ── The one thing to do next ── */}
      {td.transactions.length === 0 && (
        <TouchableOpacity accessibilityRole="button"
          style={styles.nudge}
          onPress={() => { Haptics.selectionAsync(); open('/tracker/import'); }}
          activeOpacity={0.8}
        >
          <Text style={styles.nudgeIcon}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nudgeTitle}>Add your first transactions</Text>
            <Text style={styles.nudgeSub}>Spending, savings and your health score get real once you add what you spend. Or import your bank statement in one go.</Text>
          </View>
          <Text style={{ color: Colors.cyan, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      )}
      {td.transactions.length > 0 && step && (
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
      <Text style={styles.sectionTitle}>Your numbers</Text>
      <View style={styles.exploreCard}>
        <StatRow
          label="Health Score"
          value={health.total == null || !health.tier ? 'Not enough data' : `${health.total}/100`}
          sub={health.total == null || !health.tier ? 'record income and spending' : `${health.tierEmoji} ${health.tier[0] + health.tier.slice(1).toLowerCase()} · ${health.measured.length} of 7 areas`}
          accent={health.tier ? tierColor(health.tier) : Colors.cyan}
          icon="🏥"
          onPress={() => open('/tracker/health')}
        />
        <StatRow
          label="Emergency Fund"
          value={tc.emergency.monthlyExpense > 0 ? `${tc.emergency.covered.toFixed(1)} mo` : '—'}
          sub={tc.emergency.monthlyExpense > 0 ? `of ${tc.emergency.target} months · ${tc.emergency.status.label.toLowerCase()}` : 'add monthly spend'}
          accent={tc.emergency.status.level === 'full' ? Colors.teal : tc.emergency.status.level === 'critical' ? Colors.red : Colors.gold}
          icon="🛡️"
          onPress={() => open('/tracker/emergency')}
        />
        <StatRow
          label="FIRE Progress"
          value={`${tc.netWorth.firePercent.toFixed(tc.netWorth.firePercent >= 10 ? 0 : 1)}%`}
          sub={`of ${inrShort(tc.netWorth.fireCorpus)} target`}
          accent={Colors.purple}
          icon="🔥"
          onPress={() => open('/tracker/networth')}
        />
        <StatRow
          label="Goals"
          value={tc.goals.items.length ? `${Math.round(tc.goals.avgProgress)}%` : '—'}
          sub={tc.goals.items.length ? `${tc.goals.items.length} goal${tc.goals.items.length === 1 ? '' : 's'} on track` : 'add your first goal'}
          accent={Colors.cyan}
          icon="🎯"
          onPress={() => open('/tracker/goals')}
        />
      </View>

      {/* ── Explore: a few things worth opening, then the rest in one place ── */}
      <Text style={styles.sectionTitle}>Explore</Text>
      <View style={styles.exploreCard}>
        {moneyScore ? (
          <ToolRow
          label="Money Score"
          value={moneyScore ? `${moneyScore.score}/100` : '60 seconds'}
          sub={moneyScore ? (moneyScore.top ? `next: ${moneyScore.top.title}` : 'your whole picture, scored') : 'one number and your next 3 moves'}
          accent={Colors.teal} icon="🎯" onPress={() => open('/tools/score')}
        />
        ) : null}
        <ToolRow label="Financial calendar" sub="SIPs, renewals and tax dates that are due" accent={Colors.gold} icon="🗓️" onPress={() => open('/tools/calendar')} />
        <ToolRow label="Retirement odds" sub="will what you hold last? a simulation on your own numbers" accent={Colors.purple} icon="🏖️" onPress={() => open('/tools/retirement')} />
        <ReelsHomeCard j={rj} open={open} />
        <ToolRow label="Learn" sub="money, markets and insurance, on this phone" accent={Colors.cyan} icon="📚" onPress={() => open('/learn')} />
      </View>
      <NavCard style={styles.allToolsCard} title="All trackers, calculators and guides" sub="EPF, NPS, insurance, loans, tax, planning and more, in one place" onPress={() => open('/tools/all')} />

      <Nudges incomeMonthly={tc.budget.income} savingsRate={tc.budget.known ? tc.budget.savingsRate : null}
        topCategory={(() => { const r = [...sp.budget.rows].sort((a, b) => b.spent - a.spent)[0]; return r && r.spent > 0 ? { name: r.category, spent: r.spent } : null; })()}
        spentThisMonth={sp.totals.spent} monthlySip={td.monthlySip} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  exploreCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  allToolsCard: { marginHorizontal: Spacing.lg },
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.lg, paddingTop: Spacing.md },
  greeting: { ...Typography.h2, fontSize: 20 },
  date: { ...Typography.caption, marginTop: 2 },
  streak: { color: Colors.gold, fontSize: 12, fontWeight: '700', marginTop: 4 },
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
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.md, rowGap: Spacing.sm },   // three figures drop to a second line at large text instead of running off the card
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

  nudge: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(0,212,255,0.05)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: Radii.lg, padding: Spacing.md },
  nudgeIcon: { fontSize: 24 },
  nudgeTitle: { ...Typography.body, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  nudgeSub: { ...Typography.caption, lineHeight: 16 },
});
