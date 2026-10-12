import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { LOAN_TYPES, calcEMI, plan, monthsToText, type DebtLoan, type LoanKey } from '@/lib/debt';
import { loadDebtInputs, saveDebtField, saveDebtResults, type DebtInputs } from '@/lib/debtStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const text = (r: { paidOff: boolean; months: number }) => (r.paidOff ? monthsToText(r.months) : 'Not amortizing');
const when = (r: { paidOff: boolean; months: number }) => {
  if (!r.paidOff) return 'No payoff at the entered payment';
  const d = new Date(); d.setMonth(d.getMonth() + r.months);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export default function DebtScreen() {
  const [f, setF] = useState<DebtInputs | null>(null);
  useFocusEffect(useCallback(() => { loadDebtInputs().then(setF); }, []));

  const loans: DebtLoan[] = useMemo(() => {
    if (!f) return [];
    return LOAN_TYPES.flatMap(t => {
      const x = f[t.key];
      const balance = toNum(x.balance), rate = toNum(x.rate), emi = toNum(x.emi);
      return x.on && balance > 0 && rate > 0 && emi > 0 ? [{ key: t.key, label: t.label, icon: t.icon, balance, rate, emi }] : [];
    });
  }, [f]);
  const extra = f ? toNum(f.extra) : 0;
  const p = useMemo(() => (loans.length ? plan(loans, extra) : null), [loans, extra]);
  useEffect(() => { if (p) saveDebtResults(p).catch(() => {}); }, [p]);

  if (!f) return <TrackerScreen title="Debt payoff" subtitle="Avalanche or snowball: which order clears your loans cheapest?"><Card><Text style={Typography.body}>Reading your loans…</Text></Card></TrackerScreen>;

  const set = (loan: LoanKey, patch: Partial<DebtInputs[LoanKey]>, save?: ['balance' | 'rate' | 'emi', string]) => {
    setF(prev => (prev ? { ...prev, [loan]: { ...prev[loan], ...patch } } : prev));
    if (save) saveDebtField(save[0], loan, save[1]).catch(() => {});
  };

  return (
    <TrackerScreen title="Debt payoff" subtitle="Avalanche or snowball: which order clears your loans cheapest, and what an extra payment does to the home loan.">
      {!p ? (
        <Card><Text style={Typography.body}>Switch on a loan below and give its balance, rate and EMI. Balances already in your Net Worth tracker are filled in.</Text></Card>
      ) : (
        <>
          <Card accent={Colors.red}>
            <View style={s.strip}>
              <Kpi label="TOTAL DEBT" value={inrShort(p.totalBalance)} color={Colors.red} />
              <Kpi label="MIN-ONLY INTEREST" value={inrShort(p.minOnly.totalInterest)} color={Colors.textPrimary} />
              <Kpi label="MIN-ONLY PAYOFF" value={text(p.minOnly)} color={Colors.textPrimary} />
              <Kpi label="EXTRA / MONTH" value={extra > 0 ? inrShort(extra) : '₹0'} color={Colors.teal} />
            </View>
          </Card>

          <SectionLabel>{extra > 0 ? `STRATEGY COMPARISON (WITH ${inrShort(extra).toUpperCase()}/MO EXTRA)` : 'STRATEGY COMPARISON (MINIMUM PAYMENTS ONLY)'}</SectionLabel>
          {([
            { id: 'avalanche', name: '🏔️ Avalanche', sub: 'Highest interest rate first', r: p.avalanche, saved: p.avSaved, order: p.avalancheOrder, win: p.avWins },
            { id: 'snowball', name: '⛄ Snowball', sub: 'Smallest balance first', r: p.snowball, saved: p.swSaved, order: p.snowballOrder, win: !p.avWins },
          ] as const).map(c => (
            <Card key={c.id} accent={c.win ? Colors.teal : undefined}>
              {c.win && <Text style={s.badge}>⭐ RECOMMENDED</Text>}
              <Text style={s.name}>{c.name}</Text>
              <Text style={Typography.caption}>{c.sub}</Text>
              <Row k="Total interest" v={inr(c.r.totalInterest)} color={Colors.red} />
              <Row k="Time to debt-free" v={text(c.r)} />
              <Row k="Free by" v={when(c.r)} />
              {c.saved > 0 && <Text style={s.save}>{`Saves ${inr(c.saved)} vs minimum payments only`}</Text>}
              <Text style={[Typography.caption, { marginTop: 6 }]}>{`Payoff order: ${c.order.map(l => `${l.icon} ${l.label}`).join(' → ')}`}</Text>
            </Card>
          ))}
          {p.avSaved !== p.swSaved && (
            <Card>
              <Text style={[Typography.caption, { color: Colors.textPrimary, lineHeight: 18 }]}>
                {p.avWins
                  ? `Avalanche saves ${inr(p.avSaved - p.swSaved)} more interest than Snowball. Choose Snowball only if you need quick motivation from clearing small loans fast.`
                  : 'Snowball is marginally better here: your loan rates are close enough that the faster payoffs outweigh the maths.'}
              </Text>
            </Card>
          )}

          {p.homePrepay && (
            <>
              <SectionLabel>🏠 HOME LOAN PREPAYMENT IMPACT</SectionLabel>
              <Card>
                <View style={s.two}>
                  <View style={s.box}><Text style={Typography.label}>WITHOUT EXTRA</Text><Text style={s.big}>{text(p.homePrepay.std)}</Text><Text style={s.small}>{`Interest ${inr(p.homePrepay.std.interest)}`}</Text><Text style={s.small}>{`Free: ${when(p.homePrepay.std)}`}</Text></View>
                  <View style={[s.box, { borderColor: Colors.teal + '66' }]}><Text style={Typography.label}>{`WITH ${inrShort(extra).toUpperCase()}/MO`}</Text><Text style={s.big}>{text(p.homePrepay.prep)}</Text><Text style={s.small}>{`Interest ${inr(p.homePrepay.prep.interest)}`}</Text><Text style={s.small}>{`Free: ${when(p.homePrepay.prep)}`}</Text></View>
                </View>
                <Text style={[Typography.caption, { color: Colors.textPrimary, lineHeight: 18 }]}>
                  {`You save ${inr(p.homePrepay.interestSaved)} in interest and become debt-free ${monthsToText(p.homePrepay.monthsSaved)} earlier.`}
                </Text>
              </Card>
            </>
          )}
        </>
      )}

      <SectionLabel>YOUR LOANS</SectionLabel>
      {LOAN_TYPES.map(t => {
        const x = f[t.key];
        return (
          <Card key={t.key}>
            <TouchableOpacity style={s.head} onPress={() => set(t.key, { on: !x.on })} accessibilityRole="switch" accessibilityState={{ checked: x.on }} accessibilityLabel={`Include ${t.label}`}>
              <Text style={s.icon}>{t.icon}</Text>
              <Text style={[s.name, { flex: 1 }]}>{t.label}</Text>
              <View style={[s.sw, x.on && s.swOn]}><View style={[s.knob, x.on && s.knobOn]} /></View>
            </TouchableOpacity>
            {x.on && (
              <View style={{ marginTop: Spacing.md }}>
                <CalcField label="OUTSTANDING BALANCE" prefix="₹" value={x.balance} onChange={v => set(t.key, { balance: v }, ['balance', v])} />
                <CalcField label="INTEREST RATE" suffix="% p.a." placeholder={String(t.defaultRate)} value={x.rate} onChange={v => set(t.key, { rate: v }, ['rate', v])} />
                <CalcField label="MONTHLY EMI / MINIMUM PAYMENT" prefix="₹" value={x.emi} onChange={v => set(t.key, { emi: v }, ['emi', v])} />
                <TouchableOpacity onPress={() => {
                  const e = calcEMI(toNum(x.balance), toNum(x.rate) || t.defaultRate, t.defaultTenure);
                  if (e > 0) set(t.key, { emi: String(e), rate: x.rate || String(t.defaultRate) }, ['emi', String(e)]);
                }} accessibilityRole="button"><Text style={s.link}>{`Compute EMI (assumes ${t.defaultTenure} months at ${x.rate || t.defaultRate}%)`}</Text></TouchableOpacity>
              </View>
            )}
          </Card>
        );
      })}
      <Card>
        <CalcField label="EXTRA PAYMENT EVERY MONTH" sub="Beyond all your EMIs" prefix="₹" value={f.extra} onChange={v => { setF({ ...f, extra: v }); saveDebtField('extra', null, v).catch(() => {}); }} />
      </Card>

      <Collapsible title="How this is worked out">
        <Bullet>Every loan is paid its EMI each month. The extra amount, plus the EMI of any loan that gets cleared, goes to the next loan in the order of the strategy.</Bullet>
        <Bullet>Avalanche clears the highest rate first, which minimises interest. Snowball clears the smallest balance first, which gives quick wins. If an EMI is lower than a month's interest, that loan never amortises and the plan says so.</Bullet>
        <Bullet>Rates are held fixed, and prepayment charges and rate resets are not modelled. Month counts are capped at 50 years.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.kpi}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
    </View>
  );
}
function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return <View style={s.row}><Text style={Typography.caption}>{k}</Text><Text style={[s.rowVal, color ? { color } : null]}>{v}</Text></View>;
}

const s = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  kpi: { flexBasis: '47%', flexGrow: 1 },
  kpiVal: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  badge: { color: Colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowVal: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  save: { color: Colors.teal, fontSize: 12, fontWeight: '800', marginTop: 6 },
  two: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  box: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm },
  big: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, marginVertical: 3 },
  small: { ...Typography.caption, fontSize: 11 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  icon: { fontSize: 20 },
  sw: { width: 44, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', padding: 3 },
  swOn: { backgroundColor: Colors.teal },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: { marginLeft: 18 },
  link: { color: Colors.cyan, fontSize: 12, fontWeight: '800', marginTop: 2 },
});
