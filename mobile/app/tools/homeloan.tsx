import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet } from '@/components/CalcUI';
import { compute, prepayScenarios, sanitise, ymText, HL_DEFAULTS } from '@/lib/homeLoan';
import { loadHomeLoanFields, saveHomeLoanField, saveAsMyHomeLoan, type HomeLoanFields } from '@/lib/homeLoanStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const num = (s: string) => { const v = parseFloat(s.replace(/,/g, '')); return Number.isFinite(v) ? v : undefined; };

export default function HomeLoanScreen() {
  const [f, setF] = useState<(HomeLoanFields & { incomeDefault: string }) | null>(null);
  const [saved, setSaved] = useState(false);
  useFocusEffect(useCallback(() => { loadHomeLoanFields().then(setF); setSaved(false); }, []));

  const p = useMemo(() => {
    if (!f) return null;
    const s = sanitise({ loanAmount: num(f.loanAmount), interestRate: num(f.interestRate), tenureYears: num(f.tenureYears), prepayAmount: num(f.prepayAmount), prepayYear: num(f.prepayYear) });
    const monthlyIncome = num(f.income) ?? num(f.incomeDefault) ?? 0;
    return { ...s, monthlyIncome, grossIncome: monthlyIncome * 12 };
  }, [f]);
  const c = useMemo(() => (p ? compute(p) : null), [p]);
  const scen = useMemo(() => (p ? prepayScenarios(p) : []), [p]);

  if (!f || !p || !c) return <TrackerScreen title="Home loan" subtitle="EMI, interest, tax deductions and what a prepayment saves."><Card><Text style={Typography.body}>Reading your loan…</Text></Card></TrackerScreen>;

  const set = (k: keyof HomeLoanFields, v: string) => { setF({ ...f, [k]: v }); setSaved(false); if (v.trim() !== '') saveHomeLoanField(k, v).catch(() => {}); };
  const prinPct = Math.round((p.loanAmount / c.totalCost) * 100);
  const tone = c.emiPct === null ? Colors.textMuted : c.affordable ? Colors.teal : Colors.red;
  const taxIfOld = Math.round(c.totalTaxDeduct * 0.30 * 1.04);

  return (
    <TrackerScreen title="Home loan" subtitle="EMI, total interest, tax deductions and what a prepayment saves.">
      <Card accent={Colors.cyan}>
        <Text style={Typography.label}>MONTHLY EMI</Text>
        <Text style={s.hero}>{inr(c.emi)}</Text>
        <Text style={[s.pct, { color: tone }]}>
          {c.emiPct === null ? 'Add your monthly income to check affordability' : `${c.emiPct}% of income · ${c.affordable ? '✓ within the 40% rule of thumb' : '⚠ above the 40% rule of thumb'}`}
        </Text>
        <View style={s.grid}>
          <Mini label="TOTAL INTEREST" value={inrShort(c.sched.totalInterest)} color={Colors.red} />
          <Mini label="TOTAL COST" value={inrShort(c.totalCost)} color={Colors.textPrimary} />
          <Mini label="YEAR-1 DEDUCTIONS" value={inr(c.totalTaxDeduct)} sub={`24(b) ${inrShort(c.sec24bDeduct)} + 80C ${inrShort(c.sec80cDeduct)}`} color={Colors.teal} />
          <Mini label="MAX AFFORDABLE LOAN" value={c.maxAffordLoan > 0 ? inrShort(c.maxAffordLoan) : '—'} sub="EMI at 40% of income" color={Colors.textPrimary} />
        </View>
        <View style={{ marginTop: Spacing.md }}>
          <Bar pct={prinPct} color={Colors.cyan} height={12} />
          <View style={s.legend}>
            <Text style={[Typography.caption, { color: Colors.cyan }]}>{`Principal ${prinPct}%`}</Text>
            <Text style={[Typography.caption, { color: Colors.red }]}>{`Interest ${100 - prinPct}%`}</Text>
          </View>
        </View>
      </Card>

      <SectionLabel>YOUR LOAN</SectionLabel>
      <Card>
        <CalcField label="LOAN AMOUNT" sub="The sanctioned amount, usually up to ~80% of the property value." prefix="₹" value={f.loanAmount} placeholder={String(HL_DEFAULTS.loanAmount)} onChange={v => set('loanAmount', v)} />
        <CalcField label="INTEREST RATE" sub="Your lender's current rate for you; floating rates change." suffix="% p.a." value={f.interestRate} placeholder={String(HL_DEFAULTS.interestRate)} onChange={v => set('interestRate', v)} />
        <CalcField label="TENURE" suffix="years" value={f.tenureYears} placeholder={String(HL_DEFAULTS.tenureYears)} onChange={v => set('tenureYears', v)} />
        <CalcField label="MONTHLY INCOME" sub={f.income === '' && f.incomeDefault ? 'Taken from your profile; type to override.' : 'Used for the affordability check.'} prefix="₹" value={f.income} placeholder={f.incomeDefault || '0'} onChange={v => set('income', v)} />
        <TouchableOpacity style={[s.save, saved && { borderColor: Colors.teal }]} disabled={saved} accessibilityRole="button" accessibilityLabel="Save as my home loan"
          onPress={async () => { await saveAsMyHomeLoan(p.loanAmount, p.interestRate, c); setSaved(true); }}>
          <Text style={s.saveTxt}>{saved ? '✓ Saved as your home loan' : `Save as my home loan (${inr(c.emi)} EMI)`}</Text>
          {!saved && <Text style={Typography.caption}>Fills the balance, rate and EMI used by Net Worth and Debt payoff.</Text>}
        </TouchableOpacity>
      </Card>

      <SectionLabel>WHAT A PREPAYMENT SAVES</SectionLabel>
      <Card accent={Colors.teal}>
        <CalcField label="PREPAYMENT AMOUNT" sub="One lump sum; your EMI stays the same and the loan ends sooner." prefix="₹" value={f.prepayAmount} placeholder={String(HL_DEFAULTS.prepayAmount)} onChange={v => set('prepayAmount', v)} />
        <CalcField label="AT THE END OF YEAR" sub="Earlier saves more." value={f.prepayYear} placeholder={String(HL_DEFAULTS.prepayYear)} onChange={v => set('prepayYear', v)} />
        <View style={s.grid}>
          <Mini label="NEW TENURE" value={ymText(c.prepay.newTenureMonths)} color={Colors.cyan} />
          <Mini label="TENURE SAVED" value={`-${ymText(Math.max(0, c.prepay.savedMonths))}`} color={Colors.teal} />
          <Mini label="INTEREST SAVED" value={inr(c.prepay.savedInterest)} color={Colors.teal} />
        </View>
      </Card>
      <Card>
        <Text style={[Typography.label, { marginBottom: Spacing.sm }]}>IF YOU PREPAID AT THE END OF YEAR 3</Text>
        {scen.map(r => (
          <View key={r.amount} style={s.row}>
            <Text style={[s.cell, { color: Colors.cyan, fontWeight: '800' }]}>{inrShort(r.amount)}</Text>
            <Text style={s.cell}>{ymText(r.newTenureMonths)}</Text>
            <Text style={[s.cell, { color: Colors.teal }]}>{`-${ymText(Math.max(0, r.savedMonths))}`}</Text>
            <Text style={[s.cell, { color: Colors.teal, fontWeight: '800' }]}>{inr(r.savedInterest)}</Text>
          </View>
        ))}
        <Text style={[Typography.caption, { marginTop: 6 }]}>Columns: amount · new tenure · tenure saved · interest saved.</Text>
      </Card>

      <Card>
        <Text style={s.tipHead}>💡 Tax and prepayment notes</Text>
        <Bullet>{`Year-1 deductions of ${inr(c.totalTaxDeduct)} are worth about ${inr(taxIfOld)} of tax at a 30% slab, and only under the old regime. In the new regime a self-occupied home loan gets no 24(b) or 80C relief.`}</Bullet>
        <Bullet>Banks may not charge a prepayment penalty on floating-rate home loans to individuals. Fixed-rate loans can carry one; check your agreement first.</Bullet>
        <Bullet>Interest is front-loaded: most of the early EMIs go to interest, so a prepayment in the first five years does the most.</Bullet>
        <Bullet>If your loan interest is already above ₹2L a year, the 24(b) deduction is capped at ₹2L, so prepaying lowers your interest without lowering that deduction.</Bullet>
      </Card>

      <Collapsible title="Year-by-year schedule">
        <View style={s.row}>
          <Text style={[s.cell, s.head]}>Year</Text><Text style={[s.cell, s.head]}>Interest</Text><Text style={[s.cell, s.head]}>Principal</Text><Text style={[s.cell, s.head]}>Balance</Text>
        </View>
        {c.sched.yearly.map(y => (
          <View key={y.year} style={s.row}>
            <Text style={s.cell}>{y.year}</Text>
            <Text style={[s.cell, { color: Colors.red }]}>{inrShort(y.interest)}</Text>
            <Text style={[s.cell, { color: Colors.cyan }]}>{inrShort(y.principal)}</Text>
            <Text style={s.cell}>{inrShort(y.balance)}</Text>
          </View>
        ))}
      </Collapsible>

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>EMI = P × r × (1+r)ⁿ / ((1+r)ⁿ − 1) with a monthly rate r and n monthly instalments, rounded to the rupee. Each month's interest is the balance times r; the rest of the EMI repays principal.</Bullet>
        <Bullet>The prepayment is applied once, at the end of the year you choose, and shortens the loan with the EMI unchanged. Reducing the EMI instead is not modelled.</Bullet>
        <Bullet>Rates are held fixed for the whole loan. Rate resets, processing fees, insurance and part-disbursement are not included.</Bullet>
        <Bullet>The 40% affordability figure is a rule of thumb, not your lender's rule. Lenders weigh your other EMIs, age and credit score as well.</Bullet>
        <Bullet>The website also shows a "PMAY-CLSS eligibility detected" banner. It is left out here because the income bands it quotes belong to a subsidy scheme that has ended; check the current PMAY-Urban guidelines if you are a first-time buyer.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Mini({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={s.mini}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.miniVal, { color }]}>{value}</Text>
      {sub ? <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 36, fontWeight: '900', color: Colors.cyan, marginVertical: 2 },
  pct: { fontSize: 12, fontWeight: '700', marginBottom: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  mini: { flexBasis: '46%', flexGrow: 1 },
  miniVal: { fontSize: 18, fontWeight: '900', marginVertical: 2 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  save: { borderWidth: 1, borderColor: Colors.cyan, borderRadius: 12, padding: Spacing.md, minHeight: 44 },
  saveTxt: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  cell: { flexGrow: 1, flexBasis: '22%', fontSize: 12, color: Colors.textPrimary },   // wraps to two lines of cells when text is large
  head: { color: Colors.textMuted, fontWeight: '800', fontSize: 10 },
  tipHead: { fontSize: 13, fontWeight: '800', color: Colors.cyan, marginBottom: Spacing.sm },
});
