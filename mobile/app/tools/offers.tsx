import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { compare } from '@/lib/offerCompare';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

interface OfferForm {
  name: string; ctc: string; variable: string; payout: string; basicPct: string;
  pfBasis: 'actual' | 'ceiling'; npsPct: string; joiningBonus: string; hike: string;
}
const blank = (name: string, over: Partial<OfferForm> = {}): OfferForm => ({
  name, ctc: '', variable: '', payout: '100', basicPct: '40', pfBasis: 'actual', npsPct: '', joiningBonus: '', hike: '8', ...over,
});
// Same starting examples as the website page
const DEFAULTS = {
  offers: [
    blank('Offer A', { ctc: '1800000' }),
    blank('Offer B', { ctc: '2000000', variable: '300000', payout: '80', pfBasis: 'ceiling', joiningBonus: '100000' }),
    blank('Offer C'),
  ] as OfferForm[],
  years: '5',
  oldDed: '150000',
};
const COLORS = [Colors.cyan, Colors.purple, Colors.gold];

export default function OffersScreen() {
  const { value: f, setValue: set, reset } = usePersisted('finos_offers_inputs_v1', DEFAULTS);
  const offers = f.offers.length === 3 ? f.offers : DEFAULTS.offers;
  const upOffer = (i: number, patch: Partial<OfferForm>) => set(p => ({ ...p, offers: (p.offers.length === 3 ? p.offers : DEFAULTS.offers).map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const live = useMemo(() => offers.map((o, i) => ({
    idx: i,
    name: o.name.trim() || `Offer ${'ABC'[i]}`,
    ctc: toNum(o.ctc), variable: toNum(o.variable), payout: o.payout === '' ? 0 : toNum(o.payout), basicPct: toNum(o.basicPct),
    pfBasis: o.pfBasis, npsPct: toNum(o.npsPct), joiningBonus: toNum(o.joiningBonus), hike: o.hike === '' ? 0 : toNum(o.hike),
  })).filter(o => o.ctc > 0), [offers]);
  const out = useMemo(() => compare(live, { years: toNum(f.years) || 5, oldDeductions: toNum(f.oldDed) }), [live, f.years, f.oldDed]);

  const R = out.results;
  const N = R[0]?.opts.years ?? 5;
  const best = (vals: number[]) => { const m = Math.max(...vals); return R.length > 1 && vals.filter(v => v === m).length === 1 ? vals.indexOf(m) : -1; };
  const nm = (i: number) => R[i].offer.name;
  const runnerUp = (vals: number[], w: number) => Math.max(...vals.filter((_, i) => i !== w));

  const rows: { label: string; vals: (number | string)[]; fmt: (v: any) => string; ranked?: boolean; hint?: string }[] = R.length ? [
    { label: 'Monthly in-hand (regular)', vals: R.map(r => r.monthlyInHand), fmt: inr, ranked: true },
    { label: 'In-hand as % of CTC', vals: R.map(r => r.takeHomeShare * 100), fmt: (v: number) => `${v.toFixed(1)}%` },
    { label: 'Tax regime that saves you more', vals: R.map(r => r.regime), fmt: (v: string) => (v === 'new' ? 'New' : 'Old') },
    { label: 'Year-1 income tax', vals: R.map(r => r.years[0].tax), fmt: inr },
    { label: 'Locked-in savings, year 1 (PF + NPS)', vals: R.map(r => r.years[0].locked), fmt: inr },
    { label: `Cash take-home over ${N} years`, vals: R.map(r => r.totals.takeHome), fmt: inrShort, ranked: true },
    { label: `Total value over ${N} years`, vals: R.map(r => r.totals.totalValue), fmt: inrShort, ranked: true, hint: 'cash + PF + NPS + gratuity' },
  ] : [];
  const maxTotal = Math.max(1, ...R.map(r => r.totals.totalValue));

  return (
    <TrackerScreen title="Job offer comparer" subtitle="CTC is not salary. See what each offer really puts in your hand — and what it quietly locks away.">
      <Card accent={R.length ? Colors.teal : Colors.textMuted}>
        {R.length === 0 && <Text style={Typography.body}>Enter at least one offer's CTC.</Text>}
        {R.length === 1 && (
          <Text style={[Typography.body, { lineHeight: 21 }]}>
            <Text style={{ fontWeight: '800' }}>{nm(0)}</Text> puts about <Text style={{ fontWeight: '800' }}>{inr(R[0].monthlyInHand)}</Text> in your hand every month — {(R[0].takeHomeShare * 100).toFixed(0)}% of its CTC. Add a second offer to compare.
          </Text>
        )}
        {R.length > 1 && (() => {
          const m = out.winnerMonthly, t = out.winnerTotal;
          const mGap = R[m].monthlyInHand - runnerUp(R.map(r => r.monthlyInHand), m);
          const tGap = R[t].totals.totalValue - runnerUp(R.map(r => r.totals.totalValue), t);
          return (
            <Text style={[Typography.body, { lineHeight: 21 }]}>
              {m === t ? (
                <><Text style={{ fontWeight: '800' }}>{nm(m)}</Text> wins on both counts: {inr(mGap)} more in hand every month and {inrShort(tGap)} more total value over {N} years.</>
              ) : (
                <><Text style={{ fontWeight: '800' }}>{nm(m)}</Text> puts more cash in your hand ({inr(mGap)}/month more), but <Text style={{ fontWeight: '800' }}>{nm(t)}</Text> is worth {inrShort(tGap)} more over {N} years once PF, NPS and gratuity are counted. Which matters more depends on whether you need the cash now.</>
              )}
            </Text>
          );
        })()}
      </Card>

      {R.length > 0 && (
        <>
          <Card>
            <View style={s.tr}>
              <Text style={[s.th, { flex: 1.5 }]}>Measure</Text>
              {R.map((r, i) => <Text key={i} style={[s.th, s.cell, { color: COLORS[live[i].idx] }]} numberOfLines={1}>{r.offer.name}</Text>)}
            </View>
            {rows.map(row => {
              const b = row.ranked ? best(row.vals as number[]) : -1;
              return (
                <View key={row.label} style={s.tr}>
                  <View style={{ flex: 1.5, paddingRight: 6 }}>
                    <Text style={s.rowLabel}>{row.label}</Text>
                    {row.hint ? <Text style={s.hint}>{row.hint}</Text> : null}
                  </View>
                  {row.vals.map((v, i) => <Text key={i} style={[s.cell, s.val, i === b && { color: Colors.teal, fontWeight: '900' }]}>{row.fmt(v)}</Text>)}
                </View>
              );
            })}
          </Card>

          <Card>
            <Text style={Typography.label}>{`WHERE THE ${N}-YEAR VALUE COMES FROM`}</Text>
            {R.map((r, i) => (
              <View key={i} style={{ marginTop: Spacing.md }}>
                <View style={s.barHead}>
                  <Text style={[s.rowLabel, { color: COLORS[live[i].idx] }]}>{r.offer.name}</Text>
                  <Text style={Typography.caption}>{inrShort(r.totals.totalValue)}</Text>
                </View>
                <View style={s.stack}>
                  <View style={{ flex: r.totals.takeHome, backgroundColor: COLORS[live[i].idx] }} />
                  <View style={{ flex: r.totals.locked, backgroundColor: 'rgba(148,163,184,0.6)' }} />
                  <View style={{ flex: r.totals.gratuity, backgroundColor: 'rgba(148,163,184,0.3)' }} />
                  <View style={{ flex: Math.max(0, maxTotal - r.totals.totalValue) }} />
                </View>
              </View>
            ))}
            <Text style={[Typography.caption, { marginTop: Spacing.md }]}>Coloured = cash take-home · dark grey = PF + NPS · light grey = gratuity accrued</Text>
          </Card>
        </>
      )}

      <SectionLabel>COMPARE OVER</SectionLabel>
      <Card>
        <View style={s.row}>
          <CalcField label="YEARS" value={f.years} onChange={v => set(p => ({ ...p, years: v }))} />
          <View style={{ width: Spacing.sm }} />
          <CalcField label="OLD-REGIME DEDUCTIONS / YR" prefix="₹" value={f.oldDed} onChange={v => set(p => ({ ...p, oldDed: v }))} />
        </View>
        <Text style={[Typography.caption, { lineHeight: 16 }]}>Each offer is taxed under whichever regime is cheaper for it. For the old regime, enter everything you'd actually claim — 80C including your PF, 80D, HRA exemption — the same for every offer. Professional tax is taken as ₹2,400 a year.</Text>
      </Card>

      {offers.map((o, i) => (
        <View key={i}>
          <SectionLabel>{i < 2 ? `OFFER ${'AB'[i]}` : 'OFFER C (OPTIONAL)'}</SectionLabel>
          <Card accent={COLORS[i]}>
            <CalcField label="COMPANY / LABEL" text value={o.name} onChange={v => upOffer(i, { name: v })} placeholder={`Offer ${'ABC'[i]}`} maxLength={30} />
            <CalcField label="ANNUAL CTC" prefix="₹" value={o.ctc} onChange={v => upOffer(i, { ctc: v })} placeholder="e.g. 1800000" />
            <View style={s.row}>
              <CalcField label="VARIABLE IN CTC" prefix="₹" value={o.variable} onChange={v => upOffer(i, { variable: v })} />
              <View style={{ width: Spacing.sm }} />
              <CalcField label="EXPECTED PAYOUT" suffix="%" value={o.payout} onChange={v => upOffer(i, { payout: v })} />
            </View>
            <View style={s.row}>
              <CalcField label="BASIC % OF FIXED" suffix="%" value={o.basicPct} onChange={v => upOffer(i, { basicPct: v })} />
              <View style={{ width: Spacing.sm }} />
              <CalcField label="EMPLOYER NPS" sub="% of basic" suffix="%" value={o.npsPct} onChange={v => upOffer(i, { npsPct: v })} />
            </View>
            <Segmented label="PF CALCULATED ON" value={o.pfBasis} onChange={v => upOffer(i, { pfBasis: v })}
              options={[{ id: 'actual', label: 'Actual basic (12%)' }, { id: 'ceiling', label: '₹15,000/month ceiling' }]} />
            <View style={s.row}>
              <CalcField label="JOINING BONUS" prefix="₹" value={o.joiningBonus} onChange={v => upOffer(i, { joiningBonus: v })} />
              <View style={{ width: Spacing.sm }} />
              <CalcField label="YEARLY HIKE" suffix="%" value={o.hike} onChange={v => upOffer(i, { hike: v })} />
            </View>
          </Card>
        </View>
      ))}
      <Text onPress={reset} style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: Spacing.lg }}>Reset to the example offers</Text>

      <Collapsible title="How this is calculated — and what it leaves out">
        <Bullet>Fixed pay = CTC − variable. Basic is the % of fixed you enter (40% is typical). Employer PF is 12% of basic (or of the ₹15,000/month ceiling, if you pick that), gratuity accrues at 4.81% of basic, and employer NPS is the % of basic you enter. These sit inside the CTC, so they reduce cash pay.</Bullet>
        <Bullet>Cash gross = fixed − employer PF − gratuity − employer NPS + the variable you expect to receive (+ joining bonus in year 1). Your own PF (12%) and professional tax come out of that, then income tax — new regime with the ₹75,000 standard deduction and Sec 87A rebate (nil tax up to ₹12L taxable), or old regime with your deductions, whichever is lower.</Bullet>
        <Bullet>Total value = cash take-home + your PF + employer PF + employer NPS + gratuity accrued. It is the fairer comparison if you value the retirement money; "monthly in-hand" is the fairer one if you need the cash now. Gratuity is only paid after five years of service.</Bullet>
        <Bullet>Hikes compound every year and tax is recalculated each year. Not modelled: surcharge above ₹50L, ESOPs/RSUs, relocation or notice-period costs, health insurance and perks, state-specific professional tax. Tax rules are FY 2025-26 as used across FIN-OS — verify before a decision. This is a planning aid, not financial advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  th: { ...Typography.label },
  cell: { flex: 1, textAlign: 'right' },
  rowLabel: { ...Typography.body, fontSize: 12, fontWeight: '700' },
  hint: { ...Typography.caption, fontSize: 10 },
  val: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  stack: { flexDirection: 'row', height: 14, borderRadius: Radii.full, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
});
