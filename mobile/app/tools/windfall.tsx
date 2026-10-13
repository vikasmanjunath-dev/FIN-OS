import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { allocate, taxImpact, WINDFALL_TYPES, type WindfallContext, type WindfallType } from '@/lib/windfall';
import { loadWindfallContext, saveWindfall } from '@/lib/windfallStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const EMPTY: WindfallContext = { monthlyExpense: 0, efCurrent: 0, c80cGap: 0, creditDebt: 0, personalLoan: 0, homeLoanOut: 0, goalsSip: 0, homeEmi: 0 };

export default function WindfallScreen() {
  const { value: f, setValue: set } = usePersisted('finos_windfall_inputs_v1', { amount: '500000', type: 'bonus' as WindfallType, salary: '' });
  const [facts, setFacts] = useState<{ ctx: WindfallContext; salary: number; employerNps: number; basic: number; salaryFrom: string } | null>(null);
  useFocusEffect(useCallback(() => { loadWindfallContext().then(setFacts); }, []));

  const amount = Math.max(0, toNum(f.amount));
  const a = useMemo(() => allocate(amount, facts?.ctx ?? EMPTY), [amount, facts]);
  const wf = WINDFALL_TYPES.find(t => t.key === f.type) ?? WINDFALL_TYPES[0];
  const salary = toNum(f.salary) || facts?.salary || 0;
  const tax = useMemo(() => taxImpact(f.type, amount, salary, facts?.employerNps ?? 0, facts?.basic ?? 0), [f.type, amount, salary, facts]);
  useEffect(() => { if (amount > 0) saveWindfall(amount, f.type, a.totalAllocated).catch(() => {}); }, [amount, f.type, a.totalAllocated]);

  const shown = a.allocated.filter(s => s.allocated > 0);

  return (
    <TrackerScreen title="Windfall allocator" subtitle="A bonus, RSU vest, FD maturity or sale: where it should go first, in order.">
      <Card accent={Colors.teal}>
        <CalcField label="THE AMOUNT" prefix="₹" value={f.amount} onChange={v => set(p => ({ ...p, amount: v }))} placeholder="500000" />
        <Segmented label="WHAT IS IT" value={f.type} onChange={v => set(p => ({ ...p, type: v }))} options={WINDFALL_TYPES.map(t => ({ id: t.key, label: `${t.icon} ${t.label}` }))} />
        <Text style={[Typography.caption, { lineHeight: 17 }]}>{wf.taxNote}</Text>
      </Card>

      {a.assumedExpense && (
        <Card accent={Colors.gold}>
          <Text style={[Typography.caption, { lineHeight: 17 }]}>
            {`Your monthly spending is not recorded yet, so the emergency-fund step assumes ₹50,000 a month (a ${inr(a.efTarget)} target). Log some spending or set your monthly expense for a figure that fits you.`}
          </Text>
        </Card>
      )}

      <SectionLabel>{amount > 0 ? `WHERE ${inrShort(amount).toUpperCase()} SHOULD GO, IN ORDER` : 'ENTER AN AMOUNT'}</SectionLabel>
      {shown.map((s, i) => {
        const pct = amount > 0 ? Math.round((s.allocated / amount) * 100) : 0;
        return (
          <Card key={s.id}>
            <View style={st.head}>
              <Text style={st.icon}>{s.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{`${i + 1}. ${s.label}`}</Text>
                <Text style={Typography.caption}>{s.reason}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[st.amt, { color: s.color }]}>{inrShort(s.allocated)}</Text>
                <Text style={Typography.caption}>{`${pct}%`}</Text>
              </View>
            </View>
            <Bar pct={pct} color={s.color} />
            <Text style={[Typography.caption, { marginTop: 6 }]}>{`📍 ${s.vehicle}`}</Text>
          </Card>
        );
      })}

      <Card>
        <View style={{ flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' }}>
          <Tot label="WINDFALL" value={inr(amount)} />
          <Tot label="ALLOCATED" value={inr(a.totalAllocated)} color={Colors.teal} />
          <Tot label="UNALLOCATED" value={inr(a.remaining)} color={a.remaining > 0 ? Colors.gold : Colors.teal} />
        </View>
      </Card>

      {tax.applies && (
        <>
          <SectionLabel>{`TAX ON YOUR ${wf.label.toUpperCase()}`}</SectionLabel>
          <Card accent={Colors.red}>
            <CalcField label="YOUR ANNUAL GROSS SALARY" prefix="₹" value={f.salary} onChange={v => set(p => ({ ...p, salary: v }))}
              placeholder={facts?.salary ? String(Math.round(facts.salary)) : '1500000'}
              sub={f.salary ? undefined : facts?.salary ? (facts.salaryFrom === 'salary' ? 'Taken from your Salary structure.' : 'Estimated as your monthly income × 12.') : 'Needed to work out the tax.'} />
            {salary > 0 ? (
              <>
                <View style={{ flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' }}>
                  <Tot label="TAX NOW" value={inr(tax.before)} />
                  <Tot label="TAX WITH IT" value={inr(tax.after)} color={Colors.red} />
                  <Tot label="EXTRA TAX" value={inr(tax.onWindfall)} color={Colors.red} />
                </View>
                <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
                  {`New regime, on ${inr(salary)} less the ₹75,000 standard deduction and employer NPS. Surcharge is not included. Your employer usually deducts this as TDS, so the amount you receive is lower than the figure above.`}
                </Text>
              </>
            ) : <Text style={Typography.caption}>Enter your annual salary to see the extra tax.</Text>}
          </Card>
        </>
      )}

      <Collapsible title="Tax-saving moves, and how the order is chosen">
        <Bullet>The order is a rule of thumb: a safety net first, then debt that costs more than you can earn, then tax-saving room, then the home loan, then goals and long-term investing.</Bullet>
        <Bullet>80C and NPS steps help only if you use the old regime. In the new regime there is no deduction for them, so skip those steps and put the money into the next ones.</Bullet>
        <Bullet>ELSS or PPF can use whatever is left of the ₹1.5L 80C limit; NPS 80CCD(1B) adds ₹50,000 on top.</Bullet>
        <Bullet>Property sale: reinvesting the gain as section 54 / 54F allows, or in specified bonds within 6 months (54EC, up to ₹50L), can remove the long-term gain tax.</Bullet>
        <Bullet>Large FD maturities: spreading the reinvestment over two or three financial years can keep the interest in lower slabs.</Bullet>
        <Bullet>This ranks uses of money; it is not personalised investment advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Tot({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexGrow: 1 }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[st.tot, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginBottom: Spacing.sm },
  icon: { fontSize: 22 },
  title: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  amt: { fontSize: 16, fontWeight: '900' },
  tot: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
});
