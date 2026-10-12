import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, TwoLineChart } from '@/components/CalcUI';
import { compute, normalise, scenarios, advantagePct, milestones, LIMITS, STEPUP_DEFAULTS, type StepupParams } from '@/lib/sipStepup';
import { loadStepupFields, saveStepupField, saveStepupResults, type StepupFields } from '@/lib/sipStepupStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const blank = (s: string) => (s.trim() === '' ? undefined : parseFloat(s.replace(/,/g, '')));

export default function StepupScreen() {
  const [f, setF] = useState<StepupFields | null>(null);
  useFocusEffect(useCallback(() => { loadStepupFields().then(setF); }, []));

  const raw = useMemo(() => f && ({ baseSIP: blank(f.baseSIP), stepUpPct: blank(f.stepUpPct), years: blank(f.years), returnPct: blank(f.returnPct) }), [f]);
  const used = useMemo<StepupParams>(() => normalise(raw ?? STEPUP_DEFAULTS), [raw]);
  const res = useMemo(() => compute(used), [used]);
  const cards = useMemo(() => scenarios(used), [used]);
  const marks = useMemo(() => milestones(res.yearlyData), [res]);
  const pct = advantagePct(res);
  useEffect(() => { if (f) saveStepupResults(res).catch(() => {}); }, [f, res]);

  if (!f || !raw) return <TrackerScreen title="SIP step-up" subtitle="What raising your SIP every year does to the corpus."><Card><Text style={Typography.body}>Reading your plan…</Text></Card></TrackerScreen>;

  const set = (k: keyof StepupFields, v: string) => { setF({ ...f, [k]: v }); if (v.trim() !== '') saveStepupField(k, v).catch(() => {}); };
  const adjusted = (['baseSIP', 'stepUpPct', 'years', 'returnPct'] as const).filter(k => raw[k] !== undefined && Number.isFinite(raw[k]) && raw[k] !== used[k]);
  const label: Record<keyof StepupParams, string> = { baseSIP: 'Monthly SIP', stepUpPct: 'Step-up', years: 'Horizon', returnPct: 'Return' };
  const five = cards[0];

  return (
    <TrackerScreen title="SIP step-up" subtitle="What raising your SIP by a fixed % every year does to the corpus, against keeping it flat.">
      <Card accent={Colors.teal}>
        <View style={s.grid}>
          <Big label="STEP-UP CORPUS" value={inrShort(res.finalStep)} sub={`Final SIP ${inr(res.totalStepSIP)}/mo`} color={Colors.teal} />
          <Big label="FLAT SIP CORPUS" value={inrShort(res.finalFlat)} sub={`Same ${inr(used.baseSIP)}/mo throughout`} color={Colors.textPrimary} />
          <Big label="STEP-UP ADVANTAGE" value={`+${inrShort(res.advantage)}`} sub={`${pct}% more wealth`} color={Colors.cyan} />
          <Big label="EXTRA INVESTED" value={`+${inrShort(res.stepInvested - res.flatInvested)}`} sub="extra principal" color={Colors.gold} />
        </View>
      </Card>

      <SectionLabel>YOUR SIP</SectionLabel>
      <Card>
        <CalcField label="MONTHLY SIP (BASE)" sub="Starting amount; it rises by the step-up each year." prefix="₹" suffix="/mo" value={f.baseSIP} placeholder={String(STEPUP_DEFAULTS.baseSIP)} onChange={v => set('baseSIP', v)} />
        <CalcField label="ANNUAL STEP-UP" sub="A typical salary increment is 8–15%; redirect half or more of it." suffix="%" value={f.stepUpPct} placeholder={String(STEPUP_DEFAULTS.stepUpPct)} onChange={v => set('stepUpPct', v)} />
        <CalcField label="INVESTMENT HORIZON" suffix="years" value={f.years} placeholder={String(STEPUP_DEFAULTS.years)} onChange={v => set('years', v)} />
        <CalcField label="EXPECTED RETURN" sub="Long-term equity funds: roughly 10–14% a year. Not a promise." suffix="% p.a." value={f.returnPct} placeholder={String(STEPUP_DEFAULTS.returnPct)} onChange={v => set('returnPct', v)} />
        {adjusted.length > 0 && (
          <Text style={[Typography.caption, { color: Colors.gold }]}>
            {adjusted.map(k => `${label[k]} is limited to ${LIMITS[k][0]}–${LIMITS[k][1]}, so ${k === 'baseSIP' ? inr(used[k]) : used[k]} is used`).join('; ')}.
          </Text>
        )}
      </Card>

      <SectionLabel>CORPUS BY YEAR</SectionLabel>
      <Card>
        <TwoLineChart a={res.yearlyData.map(d => d.stepCorpus)} b={res.yearlyData.map(d => d.flatCorpus)} labels={res.yearlyData.map(d => `Y${d.year}`)}
          colorA={Colors.teal} colorB={Colors.textMuted} nameA="Step-up SIP" nameB="Flat SIP" />
        {marks.length > 0 && <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>{marks.map(m => `${m.label} in year ${m.year}`).join(' · ')}</Text>}
      </Card>

      <SectionLabel>{`IF YOU STEPPED UP BY… (${used.years} YEARS)`}</SectionLabel>
      <View style={s.scen}>
        {cards.map(c => (
          <View key={c.pct} style={[s.sc, c.selected && { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.08)' }]}>
            <Text style={[s.scPct, c.selected && { color: Colors.teal }]}>{`+${c.pct}%`}</Text>
            <Text style={s.scVal}>{inrShort(c.finalStep)}</Text>
            <Text style={Typography.caption}>{`vs ${inrShort(c.finalFlat)} flat`}</Text>
            <Text style={s.scAdv}>{`+${inrShort(c.advantage)} extra`}</Text>
          </View>
        ))}
      </View>

      <Card>
        <Text style={s.tipHead}>💡 The increment redirect rule</Text>
        <Bullet>Every April, when your salary is revised, raise the SIP by at least 10%.</Bullet>
        <Bullet>{`${inr(used.baseSIP)}/mo at +${used.stepUpPct}% a year reaches ${inr(res.totalStepSIP)}/mo by year ${used.years}: gradual, and you rarely feel it.`}</Bullet>
        <Bullet>{`The extra ${inrShort(res.advantage)} in wealth costs only ${inrShort(res.stepInvested - res.flatInvested)} of extra principal; compounding does the rest.`}</Bullet>
        <Bullet>{`Even a 5% step-up adds ${inrShort(five.advantage)} over a flat SIP on these numbers.`}</Bullet>
        <Bullet>Many fund platforms let you set the step-up on the SIP mandate itself, so it happens without you having to remember.</Bullet>
      </Card>

      <Collapsible title="Year by year">
        {res.yearlyData.map(d => (
          <View key={d.year} style={s.yr}>
            <Text style={[s.yrCell, { flex: 0.6 }]}>{`Yr ${d.year}`}</Text>
            <Text style={[s.yrCell, { color: Colors.teal }]}>{inr(d.sipStep)}</Text>
            <Text style={s.yrCell}>{inrShort(d.stepCorpus)}</Text>
            <Text style={[s.yrCell, { color: Colors.textMuted }]}>{inrShort(d.flatCorpus)}</Text>
          </View>
        ))}
        <Text style={[Typography.caption, { marginTop: 6 }]}>Columns: year · monthly SIP that year · step-up corpus · flat corpus.</Text>
      </Collapsible>

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>Each month the corpus grows by one month of the return and then the instalment is added (a month-end SIP). The SIP stays the same within a year and rises by the step-up at the start of the next.</Bullet>
        <Bullet>The return is a constant assumption. Real equity returns swing, and the corpus is before tax on gains, fund expenses and inflation.</Bullet>
        <Bullet>Limits, as on the website: SIP ₹500–₹2,00,000 a month, step-up 0–50%, horizon 1–40 years, return 0–100%. A field you leave blank uses the default.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Big({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={s.big}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.bigVal, { color }]}>{value}</Text>
      <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  big: { flexBasis: '46%', flexGrow: 1 },
  bigVal: { fontSize: 24, fontWeight: '900', marginVertical: 2 },
  scen: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  sc: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surface },
  scPct: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  scVal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
  scAdv: { fontSize: 11, fontWeight: '800', color: Colors.cyan, marginTop: 4 },
  tipHead: { fontSize: 13, fontWeight: '800', color: Colors.teal, marginBottom: Spacing.sm },
  yr: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  yrCell: { flex: 1, fontSize: 12, color: Colors.textPrimary },
});
