import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { ASSET_ITEMS, LIABILITY_ITEMS } from '@/lib/trackers';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, MoneyField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function NetWorthScreen() {
  const { data, computed, save } = useTrackers();
  const nw = computed.netWorth;
  const positive = nw.netWorth >= 0;
  const fireNote =
    nw.fireSource === 'expense' ? 'Based on your monthly spend'
    : nw.fireSource === 'bank' ? 'Based on spend from your linked accounts'
    : nw.fireSource === 'income-60%' ? 'Assuming you spend 60% of income — add your real spend in Budget'
    : 'Using a default ₹50,000/month — add your income and spend in Budget';

  return (
    <TrackerScreen title="Net worth" subtitle="Everything you own minus everything you owe. Updates your Dashboard and FIRE progress.">
      <Card accent={positive ? Colors.teal : Colors.red}>
        <Text style={Typography.label}>NET WORTH</Text>
        <Text style={[s.hero, { color: positive ? Colors.textPrimary : Colors.red }]} accessibilityLabel={`Net worth ${inr(nw.netWorth)}`}>
          {nw.netWorth < 0 ? '−' : ''}{inr(Math.abs(nw.netWorth))}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          <Stat label="Assets" value={inrShort(nw.totalAssets)} color={Colors.teal} />
          <Stat label="Liabilities" value={inrShort(nw.totalLiabilities)} color={nw.totalLiabilities > 0 ? Colors.red : undefined} />
        </View>
      </Card>

      {nw.assets.length > 0 && (
        <Card>
          <Text style={Typography.label}>ALLOCATION</Text>
          <View style={s.stack}>
            {nw.assets.map(a => <View key={a.field} style={{ flex: Math.max(a.pct, 0.5), backgroundColor: a.color }} />)}
          </View>
          {nw.assets.map(a => (
            <View key={a.field} style={s.legendRow}>
              <View style={[s.dot, { backgroundColor: a.color }]} />
              <Text style={s.legendLabel} numberOfLines={1}>{a.label}</Text>
              <Text style={s.legendPct}>{a.pct.toFixed(0)}%</Text>
            </View>
          ))}
        </Card>
      )}

      <Card accent={Colors.purple}>
        <Text style={Typography.label}>FIRE PROGRESS</Text>
        <View style={s.fireRow}>
          <Text style={[s.fireValue, { color: Colors.purple }]}>{nw.firePercent.toFixed(1)}%</Text>
          <Text style={Typography.caption}>of {inrShort(nw.fireCorpus)} target</Text>
        </View>
        <Bar pct={nw.firePercent} color={Colors.purple} height={10} />
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
          FIRE target = 25× yearly spend (the 4% rule) — {inrShort(nw.fireMonthlyExpense)}/month. {fireNote}.
        </Text>
      </Card>

      <SectionLabel>ASSETS</SectionLabel>
      <Card>
        {ASSET_ITEMS.filter(i => i.editable || i.route || i.field === 'portfolio' || Number(data[i.field]) > 0).map(i => (
          <View key={i.field}>
            <MoneyField
              icon={i.icon}
              label={i.label}
              sub={i.hint}
              value={Number(data[i.field]) || 0}
              readOnly={!i.editable}
              onCommit={v => save({ [i.field]: v })}
            />
            {(i.route || i.field === 'portfolio') && (
              <TouchableOpacity onPress={() => router.navigate((i.route ?? '/(tabs)/portfolio') as any)} style={s.linkRow}>
                <Text style={s.link}>{i.field === 'portfolio' ? 'Manage holdings in Portfolio' : `Open ${i.label.split(' ')[0]} tracker`} →</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </Card>

      <SectionLabel>LIABILITIES</SectionLabel>
      <Card>
        {LIABILITY_ITEMS.map(i => (
          <MoneyField key={i.field} icon={i.icon} label={i.label} sub="Outstanding amount" value={Number(data[i.field]) || 0} onCommit={v => save({ [i.field]: v })} />
        ))}
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', letterSpacing: -1, marginVertical: 4 },
  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginVertical: Spacing.sm, gap: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendLabel: { ...Typography.caption, flex: 1, color: Colors.textPrimary },
  legendPct: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  fireRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 6 },
  fireValue: { fontSize: 28, fontWeight: '900' },
  linkRow: { paddingVertical: 8 },
  link: { color: Colors.cyan, fontSize: 12, fontWeight: '700' },
});
