import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFinosContext } from '@/hooks/useFinosContext';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

// Demo holdings — in production these come from AsyncStorage / AA sync
const DEMO_HOLDINGS = [
  { name: 'Axis Bluechip Fund - Direct Growth',         type: 'MF',     invested: 120000, current: 153370, units: 245.8, nav: 624 },
  { name: 'Parag Parikh Flexi Cap - Direct Growth',     type: 'MF',     invested: 80000,  current: 101280, units: 128.4, nav: 789 },
  { name: 'Mirae Asset Tax Saver (ELSS) - Direct',      type: 'ELSS',   invested: 120000, current: 150620, units: 389.2, nav: 387 },
  { name: 'HDFC Bank',                                  type: 'Stock',  invested: 50000,  current: 62400,  units: 40,   nav: 1560 },
  { name: 'Infosys',                                    type: 'Stock',  invested: 40000,  current: 36800,  units: 25,   nav: 1472 },
];

function HoldingRow({ h }: { h: typeof DEMO_HOLDINGS[0] }) {
  const gain = h.current - h.invested;
  const gainPct = (gain / h.invested) * 100;
  const up = gain >= 0;
  const typeColor = h.type === 'ELSS' ? Colors.purple : h.type === 'MF' ? Colors.cyan : Colors.gold;

  return (
    <View style={styles.holdingRow}>
      <View style={styles.holdingLeft}>
        <View style={[styles.holdingType, { backgroundColor: typeColor + '18', borderColor: typeColor + '40' }]}>
          <Text style={[styles.holdingTypeTxt, { color: typeColor }]}>{h.type}</Text>
        </View>
        <Text style={styles.holdingName} numberOfLines={2}>{h.name}</Text>
        <Text style={styles.holdingUnits}>{h.units} units · NAV ₹{h.nav}</Text>
      </View>
      <View style={styles.holdingRight}>
        <Text style={styles.holdingCurrent}>₹{h.current.toLocaleString('en-IN')}</Text>
        <Text style={[styles.holdingGain, { color: up ? Colors.teal : Colors.red }]}>
          {up ? '+' : ''}₹{Math.abs(gain).toLocaleString('en-IN')} ({up ? '+' : ''}{gainPct.toFixed(1)}%)
        </Text>
      </View>
    </View>
  );
}

type Tab = 'holdings' | 'sip' | 'analysis';

export default function PortfolioScreen() {
  const { ctx, refresh } = useFinosContext();
  const [tab, setTab] = useState<Tab>('holdings');
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const totalInvested = DEMO_HOLDINGS.reduce((s, h) => s + h.invested, 0);
  const totalCurrent  = DEMO_HOLDINGS.reduce((s, h) => s + h.current, 0);
  const totalGain     = totalCurrent - totalInvested;
  const gainPct       = (totalGain / totalInvested) * 100;

  const allocMF    = DEMO_HOLDINGS.filter(h => h.type === 'MF' || h.type === 'ELSS').reduce((s, h) => s + h.current, 0);
  const allocStock = DEMO_HOLDINGS.filter(h => h.type === 'Stock').reduce((s, h) => s + h.current, 0);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={Typography.h2}>Portfolio</Text>
        <Text style={Typography.caption}>Demo data — connect AA for live holdings</Text>
      </View>

      {/* ── Summary Card ── */}
      <LinearGradient colors={['#0D1117', '#111827']} style={styles.summaryCard}>
        <View style={[styles.summaryBar, { backgroundColor: totalGain >= 0 ? Colors.teal : Colors.red }]} />
        <Text style={styles.summaryLabel}>CURRENT VALUE</Text>
        <Text style={styles.summaryValue}>₹{totalCurrent.toLocaleString('en-IN')}</Text>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summarySub}>Invested</Text>
            <Text style={styles.summarySubValue}>₹{totalInvested.toLocaleString('en-IN')}</Text>
          </View>
          <View>
            <Text style={styles.summarySub}>P & L</Text>
            <Text style={[styles.summarySubValue, { color: totalGain >= 0 ? Colors.teal : Colors.red }]}>
              {totalGain >= 0 ? '+' : ''}₹{Math.abs(totalGain).toLocaleString('en-IN')}
            </Text>
          </View>
          <View>
            <Text style={styles.summarySub}>Returns</Text>
            <Text style={[styles.summarySubValue, { color: totalGain >= 0 ? Colors.teal : Colors.red }]}>
              {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Allocation ── */}
      <View style={styles.allocCard}>
        <Text style={styles.allocTitle}>ALLOCATION</Text>
        <View style={styles.allocBar}>
          <View style={[styles.allocFill, { flex: allocMF / totalCurrent, backgroundColor: Colors.cyan }]} />
          <View style={[styles.allocFill, { flex: allocStock / totalCurrent, backgroundColor: Colors.gold }]} />
        </View>
        <View style={styles.allocLegend}>
          <Text style={[styles.allocLegendDot, { color: Colors.cyan }]}>■ </Text>
          <Text style={styles.allocLegendLabel}>MF / ELSS</Text>
          <Text style={styles.allocLegendPct}>{Math.round((allocMF / totalCurrent) * 100)}%</Text>
          <Text style={[styles.allocLegendDot, { color: Colors.gold, marginLeft: 12 }]}>■ </Text>
          <Text style={styles.allocLegendLabel}>Stocks</Text>
          <Text style={styles.allocLegendPct}>{Math.round((allocStock / totalCurrent) * 100)}%</Text>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabRow}>
        {(['holdings', 'sip', 'analysis'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Holdings Tab ── */}
      {tab === 'holdings' && (
        <View style={styles.holdingsList}>
          {DEMO_HOLDINGS.map(h => <HoldingRow key={h.name} h={h} />)}
        </View>
      )}

      {/* ── SIP Tab ── */}
      {tab === 'sip' && (
        <View style={styles.sipCard}>
          <Text style={styles.sipTitle}>Monthly SIP Summary</Text>
          {[
            { name: 'Axis Bluechip', amount: 5000, nextDate: '5 Aug 2026' },
            { name: 'PPFAS Flexi Cap', amount: 3000, nextDate: '5 Aug 2026' },
            { name: 'Mirae ELSS', amount: 2000, nextDate: '5 Aug 2026' },
          ].map(s => (
            <View key={s.name} style={styles.sipRow}>
              <View>
                <Text style={styles.sipFundName}>{s.name}</Text>
                <Text style={styles.sipDate}>Next: {s.nextDate}</Text>
              </View>
              <Text style={styles.sipAmount}>₹{s.amount.toLocaleString('en-IN')}/mo</Text>
            </View>
          ))}
          <View style={styles.sipTotal}>
            <Text style={styles.sipTotalLabel}>TOTAL MONTHLY SIP</Text>
            <Text style={[styles.sipTotalValue, { color: Colors.purple }]}>₹10,000/mo</Text>
          </View>
        </View>
      )}

      {/* ── Analysis Tab ── */}
      {tab === 'analysis' && (
        <View style={styles.analysisCard}>
          <Text style={styles.analysisTitle}>Portfolio Insights</Text>
          {[
            { icon: '✓', text: 'Good diversification across large-cap MF + ELSS + direct stocks', color: Colors.teal },
            { icon: '✓', text: 'ELSS allocation ensures ₹1.5L/year tax deduction under 80C', color: Colors.teal },
            { icon: '⚠️', text: 'No debt / fixed-income allocation — consider adding 20% for stability', color: Colors.gold },
            { icon: '⚠️', text: 'Infosys is negative (-8%) — review if thesis still holds', color: Colors.gold },
            { icon: '✓', text: 'All MF selections are direct plans — saving ~0.5-1% in expense ratio annually', color: Colors.teal },
          ].map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={[styles.insightIcon, { color: insight.color }]}>{insight.icon}</Text>
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.deepDiveBtn}>
            <Text style={styles.deepDiveBtnText}>Open full analysis in Arya AI →</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 80 },
  header: { padding: Spacing.lg, paddingTop: Spacing.xxl },

  summaryCard: { marginHorizontal: Spacing.lg, borderRadius: Radii.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  summaryBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  summaryLabel: { ...Typography.label, marginBottom: Spacing.xs },
  summaryValue: { fontSize: 32, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summarySub: { ...Typography.caption, marginBottom: 2 },
  summarySubValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  allocCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  allocTitle: { ...Typography.label, marginBottom: Spacing.sm },
  allocBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.sm },
  allocFill: { height: '100%' },
  allocLegend: { flexDirection: 'row', alignItems: 'center' },
  allocLegendDot: { fontSize: 12 },
  allocLegendLabel: { ...Typography.caption, flex: 1 },
  allocLegendPct: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },

  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: 4, marginBottom: Spacing.md },
  tabBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radii.md },
  tabBtnActive: { backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.borderMed },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.textPrimary, fontWeight: '700' },

  holdingsList: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  holdingRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  holdingLeft: { flex: 1 },
  holdingType: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  holdingTypeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  holdingName: { ...Typography.body, fontWeight: '600', lineHeight: 18, marginBottom: 4 },
  holdingUnits: { ...Typography.caption },
  holdingRight: { alignItems: 'flex-end', justifyContent: 'center' },
  holdingCurrent: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  holdingGain: { fontSize: 11, fontWeight: '700' },

  sipCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  sipTitle: { ...Typography.body, fontWeight: '700', marginBottom: Spacing.md },
  sipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sipFundName: { ...Typography.body, fontWeight: '600' },
  sipDate: { ...Typography.caption },
  sipAmount: { fontSize: 13, fontWeight: '700', color: Colors.purple },
  sipTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md },
  sipTotalLabel: { ...Typography.label },
  sipTotalValue: { fontSize: 16, fontWeight: '800' },

  analysisCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  analysisTitle: { ...Typography.body, fontWeight: '700', marginBottom: Spacing.md },
  insightRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, alignItems: 'flex-start' },
  insightIcon: { fontSize: 14, marginTop: 1 },
  insightText: { ...Typography.caption, flex: 1, lineHeight: 17 },
  deepDiveBtn: { marginTop: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: 'rgba(123,47,247,0.1)', borderWidth: 1, borderColor: 'rgba(123,47,247,0.25)', borderRadius: Radii.md },
  deepDiveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.purple },
});
