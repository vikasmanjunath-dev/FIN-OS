import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, MoneyField, inr } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const LEVEL_COLOR = { full: Colors.teal, almost: Colors.cyan, building: Colors.gold, critical: Colors.red, unknown: Colors.textMuted } as const;

const INSTRUMENTS = [
  { name: 'Savings account', ret: '3–4%', liq: 'Instant', best: 'First 1–2 months' },
  { name: 'Liquid mutual fund', ret: '6–7%', liq: '1 business day', best: 'Core 3–4 months' },
  { name: 'Ultra-short FD', ret: '7–8%', liq: '1–3 days', best: 'Months 5–6' },
];

export default function EmergencyScreen() {
  const { data, computed, save } = useTrackers();
  const e = computed.emergency;
  const color = LEVEL_COLOR[e.status.level];
  const known = e.monthlyExpense > 0;

  return (
    <TrackerScreen title="Emergency fund" subtitle="Cash you can reach in a day to cover job loss, illness or a big repair — measured in months of your spending.">
      <Card accent={color}>
        <Text style={[s.badge, { color, borderColor: color + '55', backgroundColor: color + '14' }]}>{e.status.label}</Text>
        <View style={s.row}>
          <Text style={[s.big, { color }]}>{known ? e.covered.toFixed(1) : '—'}</Text>
          <Text style={Typography.caption}>months covered · target {e.target}</Text>
        </View>
        <Bar pct={e.pct} color={color} height={10} />
        <View style={{ flexDirection: 'row', marginTop: Spacing.md }}>
          <Stat label="You have" value={inr(e.fund)} />
          <Stat label="Target" value={known ? inr(e.targetAmount) : '—'} />
          <Stat label={e.surplus > 0 ? 'Surplus' : 'Still needed'} value={known ? inr(e.surplus > 0 ? e.surplus : e.shortfall) : '—'} color={e.surplus > 0 ? Colors.teal : Colors.gold} />
        </View>
        {!known && (
          <TouchableOpacity onPress={() => router.push('/tracker/budget')}>
            <Text style={s.link}>Add your monthly spend in Budget to measure this →</Text>
          </TouchableOpacity>
        )}
      </Card>

      <SectionLabel>YOUR FUND</SectionLabel>
      <Card>
        <MoneyField icon="🛡️" label="Emergency fund balance" sub="Savings + liquid funds + short FDs set aside for this" value={data.emergencyFund} onCommit={v => save({ emergencyFund: v })} />
        <View style={{ paddingTop: Spacing.md }}>
          <Text style={s.fieldLabel}>Target cover</Text>
          <View style={s.seg}>
            {[3, 6, 12].map(m => (
              <TouchableOpacity key={m} style={[s.segBtn, e.target === m && s.segOn]} onPress={() => save({ emergencyTarget: m })} accessibilityRole="button" accessibilityState={{ selected: e.target === m }}>
                <Text style={[s.segTxt, e.target === m && s.segTxtOn]}>{m} months</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[Typography.caption, { marginTop: 6 }]}>6 months suits most salaried people; choose 12 if your income is irregular.</Text>
        </View>
      </Card>

      <SectionLabel>WHERE TO KEEP IT</SectionLabel>
      <Card>
        {INSTRUMENTS.map(i => (
          <View key={i.name} style={s.inst}>
            <View style={{ flex: 1 }}>
              <Text style={s.instName}>{i.name}</Text>
              <Text style={Typography.caption}>{i.best} · {i.liq}</Text>
            </View>
            <Text style={s.instRet}>{i.ret}</Text>
          </View>
        ))}
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 4, fontSize: 11, fontWeight: '800', overflow: 'hidden', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 6 },
  big: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  link: { color: Colors.cyan, fontSize: 12, fontWeight: '700', marginTop: Spacing.md },
  fieldLabel: { ...Typography.body, fontWeight: '600', marginBottom: 8 },
  seg: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 3, borderWidth: 1, borderColor: Colors.border },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radii.sm },
  segOn: { backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  segTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  segTxtOn: { color: Colors.cyan, fontWeight: '800' },
  inst: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  instName: { ...Typography.body, fontWeight: '600' },
  instRet: { color: Colors.teal, fontWeight: '800', fontSize: 13 },
});
