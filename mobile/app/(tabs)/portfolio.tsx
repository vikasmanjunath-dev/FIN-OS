import React, { useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHoldings, toView, HoldingView } from '@/hooks/useHoldings';
import { AddHoldingModal } from '@/components/AddHoldingModal';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const signed = (n: number) => (n >= 0 ? '+' : '−') + inr(Math.abs(n));

function HoldingRow({ h, onDelete }: { h: HoldingView; onDelete: () => void }) {
  const up = h.gain >= 0;
  const typeColor = h.type === 'ELSS' ? Colors.purple : h.type === 'MF' ? Colors.cyan : Colors.gold;

  return (
    <TouchableOpacity activeOpacity={0.8} onLongPress={onDelete} delayLongPress={450} style={styles.holdingRow}>
      <View style={styles.holdingLeft}>
        <View style={[styles.holdingType, { backgroundColor: typeColor + '18', borderColor: typeColor + '40' }]}>
          <Text style={[styles.holdingTypeTxt, { color: typeColor }]}>{h.type}</Text>
        </View>
        <Text style={styles.holdingName} numberOfLines={2}>{h.name}</Text>
        <Text style={styles.holdingUnits}>
          {+h.units.toFixed(3)} {h.type === 'Stock' ? 'shares' : 'units'} · {h.type === 'Stock' ? 'LTP' : 'NAV'} ₹{+(h.lastPrice ?? h.avgPrice).toFixed(2)}
          {!h.priced ? ' (cost)' : ''}
        </Text>
      </View>
      <View style={styles.holdingRight}>
        <Text style={styles.holdingCurrent}>{inr(h.current)}</Text>
        <Text style={[styles.holdingGain, { color: up ? Colors.teal : Colors.red }]}>
          {signed(h.gain)} ({up ? '+' : ''}{h.gainPct.toFixed(1)}%)
        </Text>
        <TouchableOpacity onPress={onDelete} hitSlop={10}><Text style={styles.removeTxt}>Remove</Text></TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

type Tab = 'holdings' | 'sip' | 'analysis';

function buildInsights(rows: HoldingView[], total: number) {
  const out: { icon: string; text: string; color: string }[] = [];
  const good = (text: string) => out.push({ icon: '✓', text, color: Colors.teal });
  const warn = (text: string) => out.push({ icon: '⚠️', text, color: Colors.gold });

  const top = [...rows].sort((a, b) => b.current - a.current)[0];
  if (top && total > 0) {
    const pct = (top.current / total) * 100;
    if (rows.length > 1 && pct > 35) warn(`${top.name} is ${pct.toFixed(0)}% of your portfolio — heavy concentration in one position.`);
  }
  if (rows.length < 5) warn(`Only ${rows.length} holding${rows.length === 1 ? '' : 's'} — spreading across more funds/sectors reduces single-name risk.`);
  else good(`${rows.length} holdings across your portfolio — reasonable spread.`);

  for (const r of rows.filter(r => r.priced && r.gainPct <= -5)) {
    warn(`${r.name} is ${r.gainPct.toFixed(1)}% below your cost — review if the thesis still holds.`);
  }
  if (rows.some(r => r.type === 'ELSS')) good('You hold an ELSS fund — contributions up to ₹1.5L/year qualify for 80C (old tax regime).');
  else warn('No ELSS holding — if you use the old tax regime, ELSS can use your ₹1.5L 80C limit.');

  const sipTotal = rows.reduce((s, r) => s + (r.sipMonthly || 0), 0);
  if (sipTotal > 0) good(`Monthly SIPs of ${inr(sipTotal)} keep you investing through market swings.`);
  else if (rows.some(r => r.type !== 'Stock')) warn('No SIP set on your funds — a monthly SIP builds discipline and averages your cost.');

  warn('This view tracks equity and mutual funds only — keep some debt/fixed income (PPF, FD, debt funds) for stability.');
  return out;
}

export default function PortfolioScreen() {
  const { holdings, loaded, pricing, priceError, addHolding, removeHolding, refreshPrices } = useHoldings();
  const [tab, setTab] = useState<Tab>('holdings');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => holdings.map(toView).sort((a, b) => b.current - a.current), [holdings]);
  const totalInvested = rows.reduce((s, h) => s + h.invested, 0);
  const totalCurrent = rows.reduce((s, h) => s + h.current, 0);
  const totalGain = totalCurrent - totalInvested;
  const gainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const allocMF = rows.filter(h => h.type !== 'Stock').reduce((s, h) => s + h.current, 0);
  const allocStock = totalCurrent - allocMF;
  const pct = (v: number) => (totalCurrent > 0 ? Math.round((v / totalCurrent) * 100) : 0);
  const sips = rows.filter(h => (h.sipMonthly || 0) > 0);
  const sipTotal = sips.reduce((s, h) => s + (h.sipMonthly || 0), 0);
  const insights = useMemo(() => buildInsights(rows, totalCurrent), [rows, totalCurrent]);
  const priceDate = holdings.find(h => h.priceDate)?.priceDate;

  const confirmRemove = (h: HoldingView) => {
    const go = () => removeHolding(h.id);
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${h.name}?`)) go(); return; }
    Alert.alert('Remove holding', `Remove ${h.name} from your portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={pricing} onRefresh={refreshPrices} tintColor={Colors.cyan} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={Typography.h2}>Portfolio</Text>
            <Text style={Typography.caption}>
              {!loaded ? 'Loading…'
                : pricing ? 'Refreshing live prices…'
                : priceError ? priceError
                : rows.length ? `Live prices${priceDate ? ` · ${priceDate}` : ''} · pull to refresh`
                : 'Add your first holding to get started'}
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)}>
            <Text style={styles.addBtnTxt}>＋ Add</Text>
          </TouchableOpacity>
        </View>

        {loaded && rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No holdings yet</Text>
            <Text style={styles.emptyText}>
              Add the stocks and mutual funds you own. FIN·OS fetches live prices and works out your value, returns, SIPs and insights on this device.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setAdding(true)}>
              <Text style={styles.emptyBtnTxt}>Add a holding</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/arya')}>
              <Text style={styles.emptyLink}>Or ask Arya how to start →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Summary Card ── */}
            <LinearGradient colors={['#0D1117', '#111827']} style={styles.summaryCard}>
              <View style={[styles.summaryBar, { backgroundColor: totalGain >= 0 ? Colors.teal : Colors.red }]} />
              <Text style={styles.summaryLabel}>CURRENT VALUE</Text>
              <Text style={styles.summaryValue}>{inr(totalCurrent)}</Text>
              <View style={styles.summaryRow}>
                <View>
                  <Text style={styles.summarySub}>Invested</Text>
                  <Text style={styles.summarySubValue}>{inr(totalInvested)}</Text>
                </View>
                <View>
                  <Text style={styles.summarySub}>P & L</Text>
                  <Text style={[styles.summarySubValue, { color: totalGain >= 0 ? Colors.teal : Colors.red }]}>{signed(totalGain)}</Text>
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
                <View style={[styles.allocFill, { flex: Math.max(allocMF, 0.0001), backgroundColor: Colors.cyan }]} />
                <View style={[styles.allocFill, { flex: Math.max(allocStock, 0.0001), backgroundColor: Colors.gold }]} />
              </View>
              <View style={styles.allocLegend}>
                <Text style={[styles.allocLegendDot, { color: Colors.cyan }]}>■ </Text>
                <Text style={styles.allocLegendLabel}>MF / ELSS</Text>
                <Text style={styles.allocLegendPct}>{pct(allocMF)}%</Text>
                <Text style={[styles.allocLegendDot, { color: Colors.gold, marginLeft: 12 }]}>■ </Text>
                <Text style={styles.allocLegendLabel}>Stocks</Text>
                <Text style={styles.allocLegendPct}>{pct(allocStock)}%</Text>
              </View>
            </View>

            {/* ── Tab Bar ── */}
            <View style={styles.tabRow}>
              {(['holdings', 'sip', 'analysis'] as Tab[]).map(t => (
                <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                  <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                    {t === 'sip' ? 'SIP' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'holdings' && (
              <View style={styles.holdingsList}>
                {rows.map(h => <HoldingRow key={h.id} h={h} onDelete={() => confirmRemove(h)} />)}
                <Text style={styles.hint}>Long-press a holding to remove it.</Text>
              </View>
            )}

            {tab === 'sip' && (
              <View style={styles.sipCard}>
                <Text style={styles.sipTitle}>Monthly SIP Summary</Text>
                {sips.length === 0 && (
                  <Text style={Typography.caption}>No SIPs recorded. Add a mutual fund with a monthly SIP amount and it will show here.</Text>
                )}
                {sips.map(s => (
                  <View key={s.id} style={styles.sipRow}>
                    <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                      <Text style={styles.sipFundName} numberOfLines={2}>{s.name}</Text>
                      <Text style={styles.sipDate}>Invested so far {inr(s.invested)}</Text>
                    </View>
                    <Text style={styles.sipAmount}>{inr(s.sipMonthly!)}/mo</Text>
                  </View>
                ))}
                {sips.length > 0 && (
                  <View style={styles.sipTotal}>
                    <Text style={styles.sipTotalLabel}>TOTAL MONTHLY SIP</Text>
                    <Text style={[styles.sipTotalValue, { color: Colors.purple }]}>{inr(sipTotal)}/mo</Text>
                  </View>
                )}
              </View>
            )}

            {tab === 'analysis' && (
              <View style={styles.analysisCard}>
                <Text style={styles.analysisTitle}>Portfolio Insights</Text>
                {insights.map((insight, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Text style={[styles.insightIcon, { color: insight.color }]}>{insight.icon}</Text>
                    <Text style={styles.insightText}>{insight.text}</Text>
                  </View>
                ))}
                <TouchableOpacity style={styles.deepDiveBtn} onPress={() => router.push('/arya')}>
                  <Text style={styles.deepDiveBtnText}>Discuss this with Arya AI →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AddHoldingModal visible={adding} onClose={() => setAdding(false)} onAdd={addHolding} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 80 },
  header: { padding: Spacing.lg, paddingTop: Spacing.xxl, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

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

  addBtn: { backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.35)', borderRadius: Radii.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  addBtnTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
  removeTxt: { color: Colors.textDim, fontSize: 10, marginTop: 6 },
  hint: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.xs },
  empty: { marginHorizontal: Spacing.lg, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl },
  emptyIcon: { fontSize: 36, marginBottom: Spacing.sm },
  emptyTitle: { ...Typography.h3, marginBottom: Spacing.sm },
  emptyText: { ...Typography.caption, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.lg },
  emptyBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.xl },
  emptyBtnTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  emptyLink: { color: Colors.purple, fontSize: 12, fontWeight: '700', marginTop: Spacing.md },
});
