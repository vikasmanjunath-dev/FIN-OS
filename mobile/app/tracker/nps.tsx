import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { validDate, NPS_RATES } from '@/lib/retirement';
import { TrackerScreen, Card, SectionLabel, Stat, Bar, MoneyField, NumberField, TextField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const SLABS = [0, 5, 10, 15, 20, 25, 30];

export default function NpsScreen() {
  const { data, computed, save } = useTrackers();
  const n = computed.retirement.nps;
  const alloc = data.npsEq + data.npsCorp + data.npsGsec;
  const hasPlan = data.npsTier1 > 0 || data.npsEmp + data.npsEr > 0;
  const dobKnown = !!data.npsDob;

  return (
    <TrackerScreen title="NPS" subtitle="National Pension System: your corpus, what it could be at 60, and the tax you save by contributing.">
      <Card accent={Colors.cyan}>
        <Text style={Typography.label}>NPS CORPUS (TIER 1 + TIER 2)</Text>
        <Text style={s.hero}>{inr(n.total)}</Text>
        {hasPlan && (
          <>
            <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
              <Stat label="Projected at 60" value={inrShort(n.projected)} color={Colors.cyan} />
              <Stat label="Lump sum (60%)" value={inrShort(n.lumpSum)} color={Colors.teal} />
              <Stat label="Annuity (40%)" value={inrShort(n.annuityCorpus)} color={Colors.purple} />
            </View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              {dobKnown ? `${n.yearsLeft} year${n.yearsLeft === 1 ? '' : 's'} to 60 (you are ${n.ageNow})` : 'Add your date of birth for a real timeline — assuming 30 years to go'} · expected return {(n.annualR * 100).toFixed(1)}% a year · Tier 1 only (Tier 2 can be withdrawn freely).
            </Text>
          </>
        )}
      </Card>

      {data.npsEmp + data.npsEr > 0 && (
        <Card accent={Colors.teal}>
          <Text style={Typography.label}>ESTIMATED TAX SAVED EVERY YEAR</Text>
          <Text style={[s.hero, { color: Colors.teal }]}>{inr(n.taxSaved)}</Text>
          <Text style={[Typography.caption, { lineHeight: 17 }]}>
            At your {data.npsSlab}% slab, using 80C (your first ₹1.5L), 80CCD(1B) (the next ₹50,000) and your employer's share. If PPF, ELSS or EPF already use your ₹1.5L, the true saving is lower — treat this as an upper estimate. Only applies under the old tax regime (employer share also counts in the new one).
          </Text>
        </Card>
      )}

      <SectionLabel>BALANCES</SectionLabel>
      <Card>
        <MoneyField icon="🏛️" label="Tier 1 balance" sub="The locked pension account" value={data.npsTier1} onCommit={v => save({ npsTier1: v })} />
        <MoneyField icon="🔓" label="Tier 2 balance" sub="Optional, withdraw any time" value={data.npsTier2} onCommit={v => save({ npsTier2: v })} />
      </Card>

      <SectionLabel>CONTRIBUTIONS & YOU</SectionLabel>
      <Card>
        <MoneyField icon="👤" label="You pay / month" value={data.npsEmp} onCommit={v => save({ npsEmp: v })} />
        <MoneyField icon="🏢" label="Employer pays / month" sub="Corporate NPS, if any" value={data.npsEr} onCommit={v => save({ npsEr: v })} />
        <TextField icon="🎂" label="Date of birth" sub="Sets years left to age 60" value={data.npsDob} placeholder="YYYY-MM-DD"
          validate={t => (validDate(t, { optional: true }) ? null : 'Use a real past date like 1992-04-18')} onCommit={v => save({ npsDob: v })} />
        <View style={{ paddingTop: Spacing.md }}>
          <Text style={s.lbl}>Your income-tax slab</Text>
          <View style={s.chips}>
            {SLABS.map(p => (
              <TouchableOpacity key={p} style={[s.chip, data.npsSlab === p && s.chipOn]} onPress={() => save({ npsSlab: p })} accessibilityRole="button" accessibilityState={{ selected: data.npsSlab === p }}>
                <Text style={[s.chipTxt, data.npsSlab === p && s.chipTxtOn]}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      <SectionLabel>ASSET ALLOCATION</SectionLabel>
      <Card>
        <NumberField icon="📈" label="Equity (E)" sub={`Assumed ${(NPS_RATES.E * 100).toFixed(1)}% a year`} value={data.npsEq} max={100} suffix="%" onCommit={v => save({ npsEq: v })} />
        <NumberField icon="🏦" label="Corporate bonds (C)" sub={`Assumed ${(NPS_RATES.C * 100).toFixed(1)}% a year`} value={data.npsCorp} max={100} suffix="%" onCommit={v => save({ npsCorp: v })} />
        <NumberField icon="🏛️" label="Government securities (G)" sub={`Assumed ${(NPS_RATES.G * 100).toFixed(1)}% a year`} value={data.npsGsec} max={100} suffix="%" onCommit={v => save({ npsGsec: v })} />
        <View style={{ paddingTop: Spacing.sm }}>
          <Bar pct={Math.min(100, alloc)} color={alloc === 100 ? Colors.teal : alloc > 100 ? Colors.red : Colors.gold} height={6} />
          <Text style={[Typography.caption, { marginTop: 6, color: alloc === 0 || alloc === 100 ? Colors.textMuted : Colors.gold }]}>
            {alloc === 0 ? 'Not set — using a blended 8.5% return' : alloc === 100 ? 'Allocation adds up to 100% ✓' : `Adds up to ${alloc}% — it should total 100%`}
          </Text>
        </View>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1, marginVertical: 4 },
  lbl: { ...Typography.body, fontWeight: '600', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.bg },
  chipOn: { borderColor: 'rgba(0,212,255,0.7)', backgroundColor: 'rgba(0,212,255,0.12)' },
  chipTxt: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  chipTxtOn: { color: Colors.cyan, fontWeight: '800' },
});
