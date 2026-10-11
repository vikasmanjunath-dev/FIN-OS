import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { computeView, DEFAULT_INPUTS } from '@/lib/taxSavings';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function TaxSavingsScreen() {
  const { value: f, setValue: set, reset } = usePersisted('finos_tax_savings_inputs_v1', DEFAULT_INPUTS);
  const up = (patch: Partial<typeof DEFAULT_INPUTS>) => set(p => ({ ...p, ...patch }));
  const view = useMemo(() => computeView(f), [f]);
  const plan = view.plan;
  const tone = view.verdict ? (view.verdict.tone === 'good' ? Colors.teal : view.verdict.tone === 'warn' ? Colors.gold : Colors.cyan) : Colors.textMuted;

  return (
    <TrackerScreen title="Tax savings" subtitle="How much could deductions save you in FY 2025-26, and does the old regime beat the new one for you?">
      <Card accent={tone}>
        {!view.ok || !plan ? (
          <Text style={Typography.body}>Enter your annual income (₹1 lakh or more) to see what deductions could save.</Text>
        ) : (
          <>
            <View style={s.kpis}>
              <Kpi label={`CURRENT TAX (${plan.currentRegime.toUpperCase()} REGIME)`} value={inr(plan.current)} color={Colors.red} />
              <Kpi label="POTENTIAL SAVING" value={inr(plan.potential)} color={Colors.gold} />
              <Kpi label="AFTER OPTIMISING" value={inr(Math.max(0, plan.current - plan.potential))} color={Colors.teal} />
              <Kpi label="EFFECTIVE RATE" value={`${view.effectiveRate.toFixed(1)}%`} color={Colors.cyan} />
            </View>
            {view.verdict && <Text style={[Typography.caption, { lineHeight: 18, color: Colors.textPrimary, marginTop: Spacing.md }]}>{view.verdict.text}</Text>}
          </>
        )}
      </Card>

      {view.ok && plan && (
        <>
          <SectionLabel>DEDUCTION HEADROOM THIS FY · OLD REGIME ONLY</SectionLabel>
          <Card>
            {view.rows.map(r => (
              <View key={r.id} style={{ marginBottom: Spacing.md }}>
                <View style={s.rowHead}>
                  <Text style={[Typography.caption, { color: Colors.textMuted, flex: 1 }]}>{r.label}</Text>
                  <Text style={s.save}>
                    {r.kind === 'uncapped' ? 'Depends on interest' : r.kind === 'conditional' ? `Up to ${inr(r.taxSaved || 0)}` : `Save ${inr(r.taxSaved || 0)}`}
                  </Text>
                </View>
                <View style={s.track}><View style={[s.fill, { width: `${r.kind === 'uncapped' || !r.headroom || !r.maxDeduction ? 0 : Math.min(100, Math.round((r.headroom / r.maxDeduction) * 100))}%` }]} /></View>
                <Text style={s.note}>
                  {r.kind === 'uncapped' ? r.note : r.kind === 'conditional' ? `${r.note} · up to ${inr(r.headroom || 0)} deductible` : `${inr(r.headroom || 0)} headroom left · ${r.note}`}
                </Text>
              </View>
            ))}
            <Text style={s.note}>HRA and home-loan interest apply only if you pay rent or have a loan, so they are shown separately and are not added to the total.</Text>
          </Card>
        </>
      )}

      <SectionLabel>YOUR NUMBERS</SectionLabel>
      <Card>
        <CalcField label="ANNUAL INCOME (BEFORE TAX)" prefix="₹" value={f.income} onChange={v => up({ income: v })} />
        <CalcField label="80C ALREADY USED" sub="PPF, ELSS, LIC, EPF… leave blank to assume about 12% of income" prefix="₹" value={f.used80c} onChange={v => up({ used80c: v })} />
        <CalcField label="HEALTH INSURANCE ALREADY CLAIMED (80D)" prefix="₹" value={f.usedHealth} onChange={v => up({ usedHealth: v })} />
        <CalcField label="NPS ALREADY CLAIMED (80CCD(1B))" prefix="₹" value={f.usedNps} onChange={v => up({ usedNps: v })} />
        <Text onPress={reset} style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Reset</Text>
      </Card>

      <Collapsible title="How this is calculated — and what it leaves out">
        <Bullet>FY 2025-26 slabs, the standard deduction (₹75,000 new, ₹50,000 old), the Sec 87A rebate with marginal relief, and 4% cess. It is the same maths as the website's Tax Savings Tracker.</Bullet>
        <Bullet>80C, 80D and NPS deductions exist only in the old regime, so a saving is real only when the old regime would beat what the new regime already charges.</Bullet>
        <Bullet>Surcharge on income above ₹50L is not modelled. This is an estimate for planning, not tax advice or a return.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.kpi, { borderColor: color + '44' }]}>
      <Text style={[Typography.label, { color: Colors.textMuted, fontSize: 9 }]}>{label}</Text>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  kpi: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: Spacing.md },
  kpiVal: { fontSize: 18, fontWeight: '900', marginTop: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: Spacing.sm },
  save: { fontSize: 12, fontWeight: '800', color: Colors.gold },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: Colors.gold, borderRadius: 2 },
  note: { ...Typography.caption, fontSize: 11, lineHeight: 15, marginTop: 4 },
});
