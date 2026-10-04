import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet, TwoLineChart, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { simulate, breakEven } from '@/lib/prepayInvest';
import { Colors, Spacing, Typography } from '@/constants/theme';

const DEFAULTS = {
  loan: '5000000', rate: '8.5', years: '20', monthly: '20000', lump: '0', ret: '12',
  invType: 'equity' as 'equity' | 'debt', slab: '0', claim24b: false,
};
const SLABS = ['0', '5', '10', '15', '20', '25', '30'];
const yrs = (months: number) => { const y = Math.floor(months / 12), m = months % 12; return `${y}y${m ? ` ${m}m` : ''}`; };
const A = Colors.cyan, B = Colors.purple;

export default function PrepayScreen() {
  const { value: f, setValue: set, reset } = usePersisted('finos_prepay_inputs_v1', DEFAULTS);
  const up = (patch: Partial<typeof DEFAULTS>) => set(p => ({ ...p, ...patch }));

  const params = useMemo(() => ({
    loan: toNum(f.loan), rate: toNum(f.rate), years: toNum(f.years), monthly: toNum(f.monthly), lump: toNum(f.lump),
    ret: toNum(f.ret), invType: f.invType, slab: toNum(f.slab), claim24b: f.claim24b,
  }), [f]);
  const r = useMemo(() => simulate(params), [params]);
  const be = useMemo(() => (r.valid ? breakEven(params) : null), [r, params]);

  const verdictColor = !r.valid ? Colors.textMuted : r.winner === 'prepay' ? A : r.winner === 'invest' ? B : Colors.gold;

  return (
    <TrackerScreen title="Prepay loan or invest?" subtitle="Same cash every month, two choices — which one leaves you richer when the loan would have ended?">
      <Card accent={verdictColor}>
        {!r.valid ? (
          <Text style={Typography.body}>{r.reason === 'loan' ? 'Enter a loan amount.' : 'Enter an extra monthly amount or a lump sum.'}</Text>
        ) : (
          <>
            <Text style={[s.verdict, { color: verdictColor }]}>
              {r.winner === 'tie' ? 'Too close to call' : `${r.winner === 'prepay' ? 'Prepaying' : 'Investing'} wins by ${inrShort(Math.abs(r.diff))}`}
            </Text>
            <Text style={[Typography.caption, { lineHeight: 17, marginTop: 4, color: Colors.textPrimary }]}>
              {r.winner === 'tie'
                ? 'The two end within 0.2% of each other — choose on risk and liquidity.'
                : r.winner === 'prepay'
                  ? `Prepaying is a guaranteed ${r.effectiveLoanRate.toFixed(2)}%${f.claim24b ? ' after Sec 24(b) relief' : ''} on every rupee; your assumed ${params.ret}% does not beat that once tax on the gains is counted.`
                  : `Your assumed ${params.ret}% return beats the loan, but it is not guaranteed.`}
            </Text>
            <View style={s.two}>
              <View style={[s.box, { borderColor: A + '55' }]}>
                <Text style={[Typography.label, { color: A }]}>PREPAY THE LOAN</Text>
                <Text style={s.big}>{inrShort(r.finalA)}</Text>
                <Text style={s.small}>Loan-free in {yrs(r.closeMonthA)} (vs {yrs(r.months)})</Text>
                <Text style={s.small}>Interest paid {inrShort(r.interestA)}</Text>
              </View>
              <View style={[s.box, { borderColor: B + '55' }]}>
                <Text style={[Typography.label, { color: B }]}>INVEST INSTEAD</Text>
                <Text style={s.big}>{inrShort(r.finalB)}</Text>
                <Text style={s.small}>Loan runs {yrs(r.months)}</Text>
                <Text style={s.small}>Interest paid {inrShort(r.interestB)}</Text>
              </View>
            </View>
            <Text style={[Typography.caption, { lineHeight: 17, color: Colors.textPrimary }]}>
              {be === null
                ? 'Investing would not catch up with prepaying even at a 40% return.'
                : `Break-even: ${be.toFixed(1)}% a year. Investing only comes out ahead if your portfolio reliably earns more than that — and prepaying earns you ${r.effectiveLoanRate.toFixed(2)}% with no market risk. EMI today: ${inr(r.emi)}.`}
            </Text>
          </>
        )}
      </Card>

      {r.valid && (
        <Card>
          <Text style={Typography.label}>NET POSITION OVER TIME (INVESTMENTS − LOAN OUTSTANDING)</Text>
          <View style={{ marginTop: Spacing.sm }}>
            <TwoLineChart a={r.series.map(p => p.a)} b={r.series.map(p => p.b)} labels={r.series.map(p => `Y${p.year}`)}
              colorA={A} colorB={B} nameA="Prepay" nameB="Invest" />
          </View>
        </Card>
      )}

      <SectionLabel>YOUR NUMBERS</SectionLabel>
      <Card>
        <CalcField label="LOAN OUTSTANDING" prefix="₹" value={f.loan} onChange={v => up({ loan: v })} />
        <View style={s.row}>
          <CalcField label="LOAN RATE" suffix="% p.a." value={f.rate} onChange={v => up({ rate: v })} />
          <View style={{ width: Spacing.sm }} />
          <CalcField label="REMAINING TENURE" suffix="years" value={f.years} onChange={v => up({ years: v })} />
        </View>
        <CalcField label="EXTRA CASH EVERY MONTH" prefix="₹" value={f.monthly} onChange={v => up({ monthly: v })} />
        <CalcField label="ONE-TIME LUMP SUM" sub="Bonus, maturity or windfall" prefix="₹" value={f.lump} onChange={v => up({ lump: v })} />
        <CalcField label="EXPECTED INVESTMENT RETURN" suffix="% p.a." value={f.ret} onChange={v => up({ ret: v })} />
        <Segmented label="YOU'D INVEST IN" value={f.invType} onChange={v => up({ invType: v })}
          options={[{ id: 'equity', label: 'Equity mutual funds' }, { id: 'debt', label: 'Debt funds / FD' }]} />
        <Segmented label="YOUR TAX SLAB" value={f.slab} onChange={v => up({ slab: v })}
          options={SLABS.map(x => ({ id: x, label: `${x}%` }))} />
        <CheckRow label="I claim the Sec 24(b) home-loan interest deduction (old regime, self-occupied, up to ₹2L a year) — this makes the loan cheaper, so prepaying is worth less." value={f.claim24b} onChange={v => up({ claim24b: v })} />
        <Text onPress={reset} style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Reset to defaults</Text>
      </Card>

      <Collapsible title="How this is calculated — and what it can't tell you">
        <Bullet>Both strategies spend the same cash every month (EMI + your extra). Prepay puts the extra into the loan, so it closes early and the whole EMI + extra is invested afterwards. Invest keeps the loan on its normal EMI and invests the extra from day one.</Bullet>
        <Bullet>Prepaying is a guaranteed return equal to your loan rate (after tax relief, if you claim 24(b)). Investment returns are an assumption — equities can be down for years. Break-even is the return you must reliably beat.</Bullet>
        <Bullet>Gains tax is charged once at the end: equity LTCG 12.5% above the ₹1.25L exemption, debt/FD gains at your slab, plus 4% cess. Returns compound monthly at the annual rate ÷ 12.</Bullet>
        <Bullet>Sec 24(b) relief is a monthly tax saving on interest up to ₹2L a year, and is invested too. It is not available under the new tax regime.</Bullet>
        <Bullet>Not modelled: prepayment charges (none on floating-rate loans per RBI), rate resets, income changes, and the value of liquidity. Keep an emergency fund before prepaying. This is a planning aid, not financial advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  verdict: { fontSize: 22, fontWeight: '900' },
  row: { flexDirection: 'row' },
  two: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.md },
  box: { flex: 1, borderWidth: 1, borderRadius: 12, padding: Spacing.md },
  big: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  small: { ...Typography.caption, lineHeight: 16 },
});
