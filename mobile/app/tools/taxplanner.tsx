import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { compute } from '@/lib/taxPlanner';
import { PLANNER_DEFAULTS, PLANNER_KEY, loadPrefill, toParams, savePlannerResults, type PlannerFields } from '@/lib/taxPlannerStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function TaxPlannerScreen() {
  const { value: f, setValue: set, reset, loaded } = usePersisted<PlannerFields>(PLANNER_KEY, PLANNER_DEFAULTS);
  const [prefilled, setPrefilled] = useState<string[]>([]);

  // Fill only the fields the person has not touched, once their saved inputs have loaded.
  useEffect(() => {
    if (!loaded) return;
    loadPrefill().then(p => {
      const used: string[] = [];
      const patch: Partial<PlannerFields> = {};
      (['income', 'inv_80c', 'health_self'] as const).forEach(k => { if (!f[k] && p[k]) { patch[k] = p[k] as string; used.push(k); } });
      if (used.length) { set(prev => ({ ...prev, ...patch })); setPrefilled(used); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const params = useMemo(() => toParams(f), [f]);
  const r = useMemo(() => (params.income > 0 ? compute(params) : null), [params]);
  useEffect(() => { if (r) savePlannerResults(r).catch(() => {}); }, [r]);

  const up = (patch: Partial<PlannerFields>) => set(p => ({ ...p, ...patch }));
  const winner = r ? (r.best === 'new' ? Colors.cyan : Colors.teal) : Colors.textMuted;

  return (
    <TrackerScreen title="Tax planner" subtitle="Both regimes side by side for FY 2025-26: slabs, rebate, surcharge, HRA, deductions and capital gains.">
      <Card>
        <CalcField label="ANNUAL INCOME (GROSS SALARY)" prefix="₹" value={f.income} onChange={v => up({ income: v })} placeholder="1200000"
          sub={prefilled.includes('income') ? 'Filled in from your salary or income; change it if it is wrong.' : undefined} />
      </Card>

      {r ? (
        <>
          <View style={s.compare}>
            {([['new', 'NEW REGIME', r.newRegime], ['old', 'OLD REGIME', r.oldRegime]] as const).map(([id, name, x]) => (
              <View key={id} style={[s.reg, r.best === id && { borderColor: id === 'new' ? Colors.cyan : Colors.teal }]}>
                <Text style={[s.badge, { color: id === 'new' ? Colors.cyan : Colors.teal }]}>{r.best === id ? `${name} · BETTER` : name}</Text>
                <Text style={s.total}>{inr(x.total_tax)}</Text>
                <Text style={Typography.caption}>{`${x.effective_rate.toFixed(1)}% of income`}</Text>
                <Row k="Taxable income" v={inr(x.taxable)} />
                <Row k="Slab tax" v={inr(x.base_tax)} />
                {x.surcharge > 0 && <Row k="Surcharge" v={inr(x.surcharge)} />}
                <Row k="Cess (4%)" v={inr(x.cess)} />
                {(x.ltcg_tax > 0 || x.stcg_tax > 0) && <Row k="Capital gains tax" v={inr(x.ltcg_tax + x.stcg_tax)} />}
              </View>
            ))}
          </View>
          <Card accent={winner}>
            <Text style={[Typography.body, { fontWeight: '800', color: winner }]}>
              {r.saving === 0 ? 'Both regimes cost the same for you.' : `${r.best === 'new' ? 'New' : 'Old'} regime saves you ${inr(r.saving)} a year.`}
            </Text>
            <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
              {`Old-regime deductions counted: ${inr(r.oldRegime.deductions.total)} (standard ${inrShort(r.oldRegime.deductions.std)}${r.oldRegime.deductions.hra ? `, HRA ${inrShort(r.oldRegime.deductions.hra)}` : ''}${r.oldRegime.deductions.s80c ? `, 80C ${inrShort(r.oldRegime.deductions.s80c)}` : ''}${r.oldRegime.deductions.s80d ? `, 80D ${inrShort(r.oldRegime.deductions.s80d)}` : ''}${r.oldRegime.deductions.nps ? `, NPS ${inrShort(r.oldRegime.deductions.nps)}` : ''}${r.oldRegime.deductions.sec24b ? `, home-loan interest ${inrShort(r.oldRegime.deductions.sec24b)}` : ''}).`}
            </Text>
          </Card>

          {r.actions.length > 0 && (
            <>
              <SectionLabel>WHAT YOU COULD DO</SectionLabel>
              {r.actions.map((a: any, i: number) => (
                <Card key={i} accent={a.priority === 'high' ? Colors.red : a.priority === 'medium' ? Colors.gold : Colors.cyan}>
                  <Text style={[Typography.label, { fontSize: 9 }]}>{a.category.toUpperCase()}</Text>
                  <Text style={[Typography.body, { marginTop: 2, lineHeight: 19 }]}>{a.text}</Text>
                </Card>
              ))}
            </>
          )}
        </>
      ) : (
        <Card><Text style={Typography.body}>Enter your annual income to see both regimes.</Text></Card>
      )}

      <SectionLabel>SALARY AND HOUSING</SectionLabel>
      <Card>
        <CalcField label="BASIC AS % OF INCOME" suffix="%" value={f.basic_pct} onChange={v => up({ basic_pct: v })} placeholder="50" />
        <CalcField label="HRA YOU RECEIVE (A YEAR)" prefix="₹" value={f.hra_received} onChange={v => up({ hra_received: v })} sub="Leave blank to assume 40% of basic." />
        <CalcField label="RENT YOU PAY (A MONTH)" prefix="₹" value={f.monthly_rent} onChange={v => up({ monthly_rent: v })} />
        <Segmented label="CITY" value={f.city} onChange={v => up({ city: v })} options={[{ id: 'metro', label: 'Metro (50%)' }, { id: 'non_metro', label: 'Non-metro (40%)' }]} />
        <CalcField label="EMPLOYER NPS (A YEAR)" prefix="₹" value={f.employer_nps} onChange={v => up({ employer_nps: v })} sub="80CCD(2): allowed in both regimes, up to 14% of basic." />
      </Card>

      <SectionLabel>DEDUCTIONS (OLD REGIME)</SectionLabel>
      <Card>
        <CalcField label="80C INVESTED" prefix="₹" value={f.inv_80c} onChange={v => up({ inv_80c: v })} sub="PPF, ELSS, EPF, life insurance… up to ₹1.5L with home-loan principal." />
        <CalcField label="HOME-LOAN PRINCIPAL REPAID" prefix="₹" value={f.home_loan_pri} onChange={v => up({ home_loan_pri: v })} />
        <CalcField label="HOME-LOAN INTEREST PAID" prefix="₹" value={f.home_loan_int} onChange={v => up({ home_loan_int: v })} sub="Section 24(b): up to ₹2L for a self-occupied home." />
        <CalcField label="HEALTH PREMIUM: SELF AND FAMILY" prefix="₹" value={f.health_self} onChange={v => up({ health_self: v })}
          sub={prefilled.includes('health_self') ? 'Filled in from your insurance policies.' : '80D: up to ₹25,000.'} />
        <CalcField label="HEALTH PREMIUM: PARENTS" prefix="₹" value={f.health_parent} onChange={v => up({ health_parent: v })} />
        <CheckRow label="Parents are 60 or older (limit ₹50,000 each)" value={f.parents_senior} onChange={v => up({ parents_senior: v })} />
        <CalcField label="NPS (SELF) 80CCD(1B)" prefix="₹" value={f.nps_self} onChange={v => up({ nps_self: v })} sub="Extra deduction up to ₹50,000." />
        <CalcField label="OTHER DEDUCTIONS" prefix="₹" value={f.other_ded} onChange={v => up({ other_ded: v })} sub="80G, 80E, 80TTA… added as they are." />
      </Card>

      <SectionLabel>CAPITAL GAINS THIS YEAR</SectionLabel>
      <Card>
        <CalcField label="EQUITY LONG-TERM GAINS" prefix="₹" value={f.ltcg} onChange={v => up({ ltcg: v })} sub="₹1.25L is exempt, the rest is taxed at 12.5%." />
        <CalcField label="EQUITY SHORT-TERM GAINS" prefix="₹" value={f.stcg} onChange={v => up({ stcg: v })} sub="Taxed at 20%." />
        <Text style={s.reset} onPress={() => { reset(); setPrefilled([]); }} accessibilityRole="button">Reset all fields</Text>
      </Card>

      <TouchableOpacity onPress={() => router.push('/tools/itr')} accessibilityRole="button" accessibilityLabel="Open the ITR prep kit"
        style={{ borderWidth: 1, borderColor: Colors.cyan, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.textPrimary, fontWeight: '800', fontSize: 13 }}>ITR prep kit →</Text>
        <Text style={Typography.caption}>Gather every income and deduction figure for filing, and see what is left to pay or claim back.</Text>
      </TouchableOpacity>

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>New regime: ₹75,000 standard deduction and employer NPS only; slabs to 30% above ₹24L; section 87A makes tax nil up to ₹12L of taxable income, with marginal relief just above it.</Bullet>
        <Bullet>Old regime: ₹50,000 standard deduction plus HRA, 80C (with home-loan principal, up to ₹1.5L), 80D, 80CCD(1B), employer NPS, 24(b) and anything in other deductions; rebate nil up to ₹5L.</Bullet>
        <Bullet>Surcharge uses your taxable income: 10% above ₹50L, 15% above ₹1Cr, then 25% above ₹2Cr in the new regime and up to 37% in the old. Marginal relief at those thresholds is not modelled, and surcharge on capital gains is not capped.</Bullet>
        <Bullet>Capital gains are taxed separately at 12.5% above ₹1.25L (long-term) and 20% (short-term), plus 4% cess, the same in both regimes.</Bullet>
        <Bullet>Not covered: other income (interest, rent, business), TDS already paid, advance-tax interest, and the new-regime Form 10-IEA rules. Check a CA before filing.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <View style={s.row}><Text style={[Typography.caption, { flexShrink: 1 }]}>{k}</Text><Text style={s.rowV}>{v}</Text></View>;
}

const s = StyleSheet.create({
  compare: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  reg: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: Spacing.md, backgroundColor: Colors.surface },
  badge: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 6 },
  total: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary },
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 3, columnGap: 6 },
  rowV: { fontSize: 12, fontWeight: '800', color: Colors.textPrimary, marginLeft: 'auto' },
  reset: { color: Colors.cyan, fontWeight: '800', fontSize: 13, minHeight: 44, lineHeight: 44 },
});
