import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { compute, status, premiumEstimate } from '@/lib/lifeCover';
import { COVER_FIELDS_DEFAULT, COVER_KEY, loadCoverPrefill, saveCoverResults, type CoverFields } from '@/lib/lifeCoverStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function LifeCoverScreen() {
  const { value: f, setValue: set, loaded } = usePersisted<CoverFields>(COVER_KEY, COVER_FIELDS_DEFAULT);
  const [filled, setFilled] = useState<string[]>([]);

  useEffect(() => {
    if (!loaded) return;
    loadCoverPrefill().then(p => {
      const patch: Partial<CoverFields> = {}; const used: string[] = [];
      (['annualIncome', 'monthlyNeed', 'existingCover', 'totalLiab'] as const).forEach(k => { if (!f[k] && p[k]) { patch[k] = p[k] as string; used.push(k); } });
      if (used.length) { set(prev => ({ ...prev, ...patch })); setFilled(used); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const inputs = useMemo(() => ({
    annualIncome: toNum(f.annualIncome), currentAge: toNum(f.currentAge) || 30, retireAge: toNum(f.retireAge) || 60, monthlyNeed: toNum(f.monthlyNeed),
    needYears: toNum(f.needYears) || 25, existingCover: toNum(f.existingCover), totalLiab: toNum(f.totalLiab), discountRate: toNum(f.discountRate) || 6, inflationRate: toNum(f.inflationRate) || 6,
  }), [f]);
  const ready = inputs.annualIncome > 0 || inputs.monthlyNeed > 0;
  const c = useMemo(() => compute(inputs), [inputs]);
  const st = status(c.coverageRatio);
  const prem = useMemo(() => premiumEstimate(c.withLiab, inputs.currentAge, inputs.annualIncome), [c, inputs]);
  useEffect(() => { if (ready) saveCoverResults(c).catch(() => {}); }, [c, ready]);

  const tone = st.tone === 'good' ? Colors.teal : st.tone === 'warn' ? Colors.gold : Colors.red;
  const up = (p: Partial<CoverFields>) => set(prev => ({ ...prev, ...p }));
  const note = (k: string) => (filled.includes(k) ? 'Filled in from what you track; change it if it is wrong.' : undefined);

  return (
    <TrackerScreen title="Life cover needed" subtitle="How much term cover your family would need, by two standard methods, against what you already have.">
      <Card accent={ready ? tone : undefined}>
        {ready ? (
          <>
            <Text style={[s.status, { color: tone }]}>{`${st.icon} ${st.label}`}</Text>
            <Text style={Typography.caption}>{`You have ${c.coverageRatio}% of the recommended cover`}</Text>
            <View style={s.grid}>
              <Big label="RECOMMENDED" value={inrShort(c.withLiab)} color={Colors.cyan} />
              <Big label="YOU HAVE" value={inrShort(c.existingCover)} color={Colors.textPrimary} />
              <Big label="ADDITIONAL NEEDED" value={inrShort(c.coverGap)} color={c.coverGap > 0 ? Colors.red : Colors.teal} />
            </View>
            <View style={{ marginTop: Spacing.md }}><Bar pct={Math.min(100, c.coverageRatio)} color={tone} height={8} /></View>
          </>
        ) : <Text style={Typography.body}>Enter your annual income or your family's monthly need to see the cover you need.</Text>}
      </Card>

      {ready && (
        <>
          <SectionLabel>HOW IT ADDS UP</SectionLabel>
          <Card>
            <Line k="Human life value (method 1)" d={`Today's value of ${c.yearsToRetire} working years of income at ${Math.max(0, inputs.discountRate - inputs.inflationRate).toFixed(1)}% real return`} v={inr(c.hlv)} />
            <Line k="Income replacement (method 2)" d={`The corpus that pays ${inr(inputs.monthlyNeed)} a month at a 4% withdrawal rate`} v={inr(c.irCorpus)} />
            <Line k="+ Outstanding debts" d="Loans your family would inherit" v={inr(c.totalLiab)} />
            <Line k="= Recommended cover" d="The larger of the two methods, plus debts" v={inr(c.withLiab)} bold />
            <Line k="− Cover you already have" d="Term, ULIP and group life policies" v={inr(c.existingCover)} />
            <Line k="= Additional cover needed" d={c.coverGap > 0 ? 'Buy a pure term plan for this amount' : 'You are covered on these numbers'} v={inr(c.coverGap)} bold color={c.coverGap > 0 ? Colors.red : Colors.teal} />
          </Card>
          <Card>
            <Text style={Typography.label}>ROUGH PREMIUM, FOR ILLUSTRATION</Text>
            <Text style={s.prem}>{`about ${inr(prem.annual)} a year (${inr(prem.monthly)} a month)`}</Text>
            <Text style={[Typography.caption, { lineHeight: 17 }]}>
              {`For ${prem.crores} crore of pure term cover at about age ${prem.atAge}${prem.pctOfIncome !== null ? `, roughly ${prem.pctOfIncome}% of your income` : ''}. This comes from a rough age table, not from any insurer; real quotes depend on age, health, smoking and the term. Get quotes before you decide.`}
            </Text>
          </Card>
        </>
      )}

      <SectionLabel>YOUR DETAILS</SectionLabel>
      <Card>
        <CalcField label="ANNUAL INCOME" prefix="₹" value={f.annualIncome} onChange={v => up({ annualIncome: v })} sub={note('annualIncome') ?? 'Gross salary or total yearly income.'} />
        <CalcField label="CURRENT AGE" suffix="years" value={f.currentAge} onChange={v => up({ currentAge: v })} />
        <CalcField label="RETIREMENT AGE" suffix="years" value={f.retireAge} onChange={v => up({ retireAge: v })} />
        <CalcField label="FAMILY'S MONTHLY NEED" prefix="₹" value={f.monthlyNeed} onChange={v => up({ monthlyNeed: v })} sub={note('monthlyNeed') ?? 'About 75% of today\'s monthly spending is a common starting point.'} />
        <CalcField label="YEARS THE FAMILY NEEDS IT" suffix="years" value={f.needYears} onChange={v => up({ needYears: v })} />
        <CalcField label="LIFE COVER YOU ALREADY HAVE" prefix="₹" value={f.existingCover} onChange={v => up({ existingCover: v })} sub={note('existingCover') ?? 'Sum assured of term, ULIP and group life policies.'} />
        <CalcField label="DEBTS OUTSTANDING" prefix="₹" value={f.totalLiab} onChange={v => up({ totalLiab: v })} sub={note('totalLiab') ?? 'Home, car and personal loans, card balances.'} />
        <CalcField label="DISCOUNT RATE" suffix="% a year" value={f.discountRate} onChange={v => up({ discountRate: v })} sub="What a safe corpus could earn." />
        <CalcField label="INFLATION" suffix="% a year" value={f.inflationRate} onChange={v => up({ inflationRate: v })} />
      </Card>

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>Human life value is the present value of the income you would earn until retirement, discounted at the real return (discount rate less inflation); when the two rates are equal it is simply income × years.</Bullet>
        <Bullet>Income replacement is the corpus that would pay the family's monthly need at a 4% withdrawal rate. The recommendation is the larger of the two, plus debts, less existing cover.</Bullet>
        <Bullet>It does not count savings, investments, a spouse's income or children's education goals, which would lower or raise the need. Treat it as a starting point; many planners use 10–20 times annual income.</Bullet>
        <Bullet>Buy pure term cover, not a plan that mixes insurance and investment. Tax treatment of premiums and claims depends on your regime and the policy.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Big({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '30%' }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.big, { color }]}>{value}</Text>
    </View>
  );
}
function Line({ k, d, v, bold, color }: { k: string; d: string; v: string; bold?: boolean; color?: string }) {
  return (
    <View style={[s.line, bold && { borderTopWidth: 1, borderTopColor: Colors.borderMed }]}>
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={[Typography.body, { fontWeight: bold ? '900' : '600' }, color ? { color } : null]}>{k}</Text>
        <Text style={Typography.caption}>{d}</Text>
      </View>
      <Text style={[s.val, color ? { color } : null]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  status: { fontSize: 20, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  big: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  val: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  prem: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginVertical: 4 },
});
