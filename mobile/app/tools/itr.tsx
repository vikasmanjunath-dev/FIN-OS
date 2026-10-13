import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { compute } from '@/lib/itrSummary';
import { ITR_FIELDS, ITR_GROUPS, loadItr, loadSuggestions, saveItr, saveParentSenior, saveMetro } from '@/lib/itrStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function ItrScreen() {
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const [parentSenior, setParentSenior] = useState(false);
  const [metro, setMetro] = useState(true);
  const [sugg, setSugg] = useState<Record<string, number>>({});
  useFocusEffect(useCallback(() => { loadItr().then(d => { setVals(d.vals); setParentSenior(d.parentSenior); setMetro(d.metro); }); loadSuggestions().then(setSugg); }, []));

  const read = useCallback((k: string) => {
    if (k === 'finos_parent_senior') return parentSenior ? '1' : '0';
    if (k === 'finos_city_metro') return metro ? 'yes' : 'no';
    return vals ? vals[k] ?? null : null;
  }, [vals, parentSenior, metro]);
  const c = useMemo(() => (vals ? compute(read) : null), [vals, read]);

  if (!vals || !c) return <TrackerScreen title="ITR prep kit" subtitle="Your income, deductions and tax in one place."><Card><Text style={Typography.body}>Reading your figures…</Text></Card></TrackerScreen>;

  const set = (k: string, v: string) => { setVals(p => ({ ...(p || {}), [k]: v })); saveItr(k, v).catch(() => {}); };
  const open = Object.keys(sugg).filter(k => !(vals[k] && parseFloat(vals[k]) > 0));
  const applyAll = () => open.forEach(k => set(k, String(Math.round(sugg[k]))));
  const started = c.grossTotalIncome > 0;
  const pay = c.balanceTax > 0;
  const better = c.betterRegime === 'new' ? Colors.cyan : Colors.teal;

  return (
    <TrackerScreen title="ITR prep kit" subtitle="Everything you will need to file: income, deductions, tax in both regimes, TDS and what is left to pay or claim back.">
      {started ? (
        <Card accent={better}>
          <Text style={Typography.label}>{c.fy.toUpperCase()}</Text>
          <Text style={s.big}>{`${c.betterRegime === 'new' ? 'New' : 'Old'} regime: ${inr(c.liabilityFinal)}`}</Text>
          <Text style={Typography.caption}>{`Saves ${inr(c.savedByRegime)} against the ${c.betterRegime === 'new' ? 'old' : 'new'} regime on these figures.`}</Text>
          <View style={s.grid}>
            <Kpi label="GROSS TOTAL INCOME" value={inr(c.grossTotalIncome)} />
            <Kpi label="TDS PAID" value={inr(c.totalTDS)} />
            <Kpi label={pay ? 'STILL TO PAY' : 'REFUND DUE'} value={inr(Math.abs(c.balanceTax))} color={pay ? Colors.red : Colors.teal} />
          </View>
          {c.salaryBasis === 'CTC proxy — verify' && <Text style={[Typography.caption, { color: Colors.gold, marginTop: Spacing.sm, lineHeight: 17 }]}>Salary is taken from your CTC because the pay components are blank. CTC includes employer-side benefits that are not taxable salary, so enter the components below for a reliable figure.</Text>}
        </Card>
      ) : <Card><Text style={Typography.body}>Enter your salary below (or use the Salary structure screen) to see your tax and the refund or balance.</Text></Card>}

      {open.length > 0 && (
        <Card accent={Colors.gold}>
          <Text style={[Typography.body, { fontWeight: '800' }]}>{`${open.length} figure${open.length === 1 ? '' : 's'} can be filled from your other trackers`}</Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
            {open.map(k => `${ITR_FIELDS.find(f => f.key === k)?.label.replace(/ \(a year\)/, '') ?? k}: ${inr(sugg[k])}`).join(' · ')}
          </Text>
          <TouchableOpacity onPress={applyAll} style={{ marginTop: Spacing.sm }} accessibilityRole="button"><Text style={s.link}>Use these figures</Text></TouchableOpacity>
        </Card>
      )}

      {started && (
        <>
          <SectionLabel>HOW THE TAX COMES OUT</SectionLabel>
          <Card>
            <Row k="Salary" v={inr(c.grossSalary)} />
            <Row k="− HRA exemption (old regime)" v={inr(c.hraExempt)} />
            <Row k="+ Rental income after 30% deduction" v={inr(c.rentalTaxable)} />
            <Row k="+ FD interest, dividends, other" v={inr(c.fdInterest + c.dividendIncome + c.otherIncome)} />
            <Row k="= Gross total income" v={inr(c.grossTotalIncome)} bold />
          </Card>
          <View style={s.two}>
            {([['old', 'OLD REGIME', c.totalDeductionsOld, c.taxableOld, c.taxOld], ['new', 'NEW REGIME', c.totalDeductionsNew, c.taxableNew, c.taxNew]] as const).map(([id, name, ded, tax, t]) => (
              <View key={id} style={[s.reg, c.betterRegime === id && { borderColor: id === 'new' ? Colors.cyan : Colors.teal }]}>
                <Text style={[Typography.label, { fontSize: 9 }]}>{c.betterRegime === id ? `${name} · BETTER` : name}</Text>
                <Text style={s.regTax}>{inr(t)}</Text>
                <Text style={Typography.caption}>{`Deductions ${inr(ded)}`}</Text>
                <Text style={Typography.caption}>{`Taxable ${inr(tax)}`}</Text>
              </View>
            ))}
          </View>
          <Card>
            <Text style={Typography.label}>DEDUCTIONS COUNTED IN THE OLD REGIME</Text>
            <Row k="Standard deduction" v={inr(50000)} />
            <Row k={`80C (limit ₹1.5L, you have ${inr(c.raw80c)})`} v={inr(c.total80c)} />
            {c._80cItems.map((i: any) => <Row key={i.label} k={`   ${i.label}`} v={inr(i.val)} dim />)}
            <Row k="80CCD(1B) extra NPS" v={inr(c.extra80ccd1b)} />
            <Row k="80D health insurance" v={inr(c.total80D)} />
            <Row k="24(b) home-loan interest" v={inr(c.sec24b)} />
            <Row k="80E / 80TTA" v={inr(c.edu80E + c.sec80tta)} />
            <Row k="Employer NPS 80CCD(2)" v={inr(c.npsEmployerOld)} />
            <Row k="= Total" v={inr(c.totalDeductionsOld)} bold />
          </Card>
        </>
      )}

      {ITR_GROUPS.map(g => (
        <View key={g}>
          <SectionLabel>{g.toUpperCase()}</SectionLabel>
          <Card>
            {ITR_FIELDS.filter(f => f.group === g).map(f => (
              <CalcField key={f.key} label={f.label.toUpperCase()} prefix="₹" value={vals[f.key] ?? ''} onChange={v => set(f.key, v)} sub={f.sub}
                placeholder={sugg[f.key] ? `suggested ${Math.round(sugg[f.key])}` : '0'} />
            ))}
            {g === 'Salary' && <CheckRow label="I live in a metro city (50% of basic for HRA)" value={metro} onChange={v => { setMetro(v); saveMetro(v).catch(() => {}); }} />}
            {g === 'Other deductions' && <CheckRow label="My parents are senior citizens (₹50,000 limit)" value={parentSenior} onChange={v => { setParentSenior(v); saveParentSenior(v).catch(() => {}); }} />}
          </Card>
        </View>
      ))}

      <Collapsible title="What this is, and what it is not">
        <Bullet>A worksheet to gather and total your figures before you file. It does not file anything and is not a substitute for Form 26AS, your AIS or a chartered accountant.</Bullet>
        <Bullet>Tax uses the FY 2025-26 slabs with the section 87A rebate and 4% cess. Surcharge, capital gains (shares, mutual funds, property) and income from business or foreign sources are not included here; the Tax Planner covers surcharge and equity gains.</Bullet>
        <Bullet>Under the new regime only the ₹75,000 standard deduction and employer NPS are allowed. The old regime allows the full list above.</Bullet>
        <Bullet>The same figures are used by the website's ITR page, so what you enter here carries over once your trackers sync.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return <View style={{ flexGrow: 1, flexBasis: '30%' }}><Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text><Text style={[s.kpi, color ? { color } : null]}>{value}</Text></View>;
}
function Row({ k, v, bold, dim }: { k: string; v: string; bold?: boolean; dim?: boolean }) {
  return <View style={s.row}><Text style={[Typography.caption, dim && { color: Colors.textMuted }, bold && { fontWeight: '900', color: Colors.textPrimary }]}>{k}</Text><Text style={[s.rowV, dim && { color: Colors.textMuted, fontWeight: '600' }]}>{v}</Text></View>;
}

const s = StyleSheet.create({
  big: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  kpi: { fontSize: 16, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 8 },
  rowV: { fontSize: 12, fontWeight: '800', color: Colors.textPrimary },
  two: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  reg: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: Spacing.md, backgroundColor: Colors.surface },
  regTax: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
});
