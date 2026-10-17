import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, Collapsible, Bullet } from '@/components/CalcUI';
import { compute, hraBreakdown, tips } from '@/lib/salary';
import {
  loadSalaryFields, toInputs, saveSalaryField, saveSalaryCity, saveSalaryRegime, saveSalaryResults, applyTakeHomeAsIncome, type SalaryFields,
} from '@/lib/salaryStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const PURPLE_INK = Colors.purpleInk;

type NumKey = 'ctc' | 'basic' | 'hraRcvd' | 'lta' | 'special' | 'npsEr' | 'rentPaid';

export default function SalaryScreen() {
  const [f, setF] = useState<SalaryFields | null>(null);
  const [income, setIncome] = useState(0);
  const [applied, setApplied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    loadSalaryFields().then(setF);
    AsyncStorage.getItem('finos_monthly_income').then(v => setIncome(parseFloat(v ?? '') || 0));
    setApplied(false);
  }, []));

  const c = useMemo(() => (f ? compute(toInputs(f)) : null), [f]);
  const hra = useMemo(() => (c ? hraBreakdown(c) : null), [c]);
  const list = useMemo(() => (c ? tips(c) : []), [c]);
  const started = !!c && (c.basic > 0 || c.ctc > 0);

  if (!f || !c || !hra) {
    return <TrackerScreen title="Salary structure" subtitle="Your CTC, HRA exemption, take-home and ways to restructure for less tax."><Card><Text style={Typography.body}>Reading your salary…</Text></Card></TrackerScreen>;
  }

  const edit = (k: NumKey, v: string) => {
    const next = { ...f, [k]: v };
    setF(next);
    setApplied(false);
    saveSalaryField(k, v).catch(() => {});
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveSalaryResults(next).catch(() => {}); }, 500);
  };
  const setCity = (v: 'metro' | 'non-metro') => { const next = { ...f, isMetro: v === 'metro' }; setF(next); setApplied(false); saveSalaryCity(next.isMetro).catch(() => {}); saveSalaryResults(next).catch(() => {}); };
  const setRegime = (v: 'new' | 'old') => { const next = { ...f, regime: v }; setF(next); setApplied(false); saveSalaryRegime(v).catch(() => {}); saveSalaryResults(next).catch(() => {}); };

  const apply = async () => {
    await saveSalaryResults(f);
    await applyTakeHomeAsIncome(c.takeHomeMo);
    setIncome(c.takeHomeMo);
    setApplied(true);
  };

  return (
    <TrackerScreen title="Salary structure" subtitle="Your CTC, HRA exemption, take-home and ways to restructure for less tax (FY 2025-26).">
      <Card accent={Colors.purple}>
        <Text style={Typography.label}>MONTHLY TAKE-HOME</Text>
        <Text style={s.hero}>{started ? `${inr(c.takeHomeMo)}/mo` : '—'}</Text>
        <Text style={Typography.caption}>
          {started ? `Gross ${inr(c.grossSalary / 12)}/mo · tax ${inr(c.taxChosen)}/yr (${c.regime} regime) · PF ${inr(c.pfEmp)}/yr` : 'Enter your CTC breakup below.'}
        </Text>
        {started && (
          <View style={s.pills}>
            {([['new', 'NEW REGIME', c.taxNew], ['old', 'OLD REGIME', c.taxOld]] as const).map(([id, name, tax]) => (
              <View key={id} style={[s.pill, c.betterRegime === id && { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.08)' }]}>
                <Text style={[Typography.label, { fontSize: 9 }]}>{name}</Text>
                <Text style={[s.pillVal, c.betterRegime === id && { color: Colors.teal }]}>{inr(tax)}</Text>
                {c.betterRegime === id && <Text style={s.better}>BETTER ✓</Text>}
              </View>
            ))}
          </View>
        )}
        {started && c.takeHomeMo > 0 && (
          <TouchableOpacity style={[s.apply, applied && { borderColor: Colors.teal }]} onPress={apply} disabled={applied} accessibilityRole="button"
            accessibilityLabel="Use take-home as my monthly income">
            <Text style={s.applyTxt}>{applied ? `✓ Monthly income set to ${inr(c.takeHomeMo)}` : `Use ${inr(c.takeHomeMo)} as my monthly income`}</Text>
            {!applied && <Text style={s.applySub}>{income > 0 ? `Budget currently uses ${inr(income)}` : 'Budget has no income set yet'}</Text>}
          </TouchableOpacity>
        )}
      </Card>

      {started && (
        <>
          <View style={s.stats}>
            <Stat label="ANNUAL CTC" value={inrShort(c.ctc)} sub="cost to company" color={PURPLE_INK} />
            <Stat label="GROSS SALARY" value={inrShort(c.grossSalary)} sub="before deductions" color={Colors.cyan} />
            <Stat label="HRA EXEMPT" value={inrShort(c.hraExempt)} sub="Sec 10(13A)" color={Colors.teal} />
            <Stat label="PF (EMPLOYEE)" value={inrShort(c.pfEmp)} sub="12% of basic" color={Colors.gold} />
          </View>
          {c.ctc > 0 && c.grossSalary > c.ctc && (
            <Card accent={Colors.gold}><Text style={Typography.caption}>{`Basic + HRA + LTA + special (${inr(c.grossSalary)}) is more than the CTC you entered (${inr(c.ctc)}). One of the figures is probably off.`}</Text></Card>
          )}
        </>
      )}

      <SectionLabel>CTC BREAKUP (ANNUAL ₹)</SectionLabel>
      <Card>
        <CalcField label="TOTAL CTC" prefix="₹" value={f.ctc} onChange={v => edit('ctc', v)} placeholder="1200000" />
        <CalcField label="BASIC SALARY" sub="Typically 40–50% of CTC. Drives PF, HRA and gratuity." prefix="₹" value={f.basic} onChange={v => edit('basic', v)} placeholder="480000" />
        <CalcField label="HRA FROM EMPLOYER" sub="Typically 50% of basic (metro) or 40% (non-metro)." prefix="₹" value={f.hraRcvd} onChange={v => edit('hraRcvd', v)} placeholder="240000" />
        <CalcField label="LTA" sub="Leave Travel Allowance: tax-free twice in a 4-year block." prefix="₹" value={f.lta} onChange={v => edit('lta', v)} placeholder="50000" />
        <CalcField label="SPECIAL ALLOWANCE" sub="Fully taxable; the balancing figure in most pay slips." prefix="₹" value={f.special} onChange={v => edit('special', v)} placeholder="200000" />
        <CalcField label="EMPLOYER NPS (ANNUAL)" sub="80CCD(2): deductible up to 10% of basic, on top of 80C." prefix="₹" value={f.npsEr} onChange={v => edit('npsEr', v)} />
      </Card>
      <SectionLabel>HOUSING AND REGIME</SectionLabel>
      <Card>
        <CalcField label="ACTUAL RENT PAID (ANNUAL)" prefix="₹" value={f.rentPaid} onChange={v => edit('rentPaid', v)} />
        <Segmented label="CITY" value={f.isMetro ? 'metro' : 'non-metro'} onChange={setCity}
          options={[{ id: 'metro', label: 'Metro (50% of basic)' }, { id: 'non-metro', label: 'Non-metro (40%)' }]} />
        <Segmented label="TAX REGIME FOR TAKE-HOME" value={f.regime} onChange={setRegime}
          options={[{ id: 'new', label: 'New regime' }, { id: 'old', label: 'Old regime' }]} />
      </Card>

      {started && (
        <>
          <SectionLabel>HRA EXEMPTION · THE THREE-WAY MINIMUM</SectionLabel>
          <Card accent={Colors.teal}>
            <Text style={s.big}>{inr(hra.exempt)}</Text>
            <Text style={Typography.caption}>{`of ${inr(c.hraRcvd)} HRA received · ${inr(hra.taxable)} stays taxable`}</Text>
            {hra.legs.map(l => (
              <View key={l.id} style={[s.leg, l.isMin && { borderColor: Colors.teal + '66', backgroundColor: 'rgba(34,211,166,0.07)' }]}>
                <Text style={[s.legTxt, !l.isMin && { color: Colors.textMuted }]}>{`${l.id} — ${l.label}`}</Text>
                <Text style={[s.legVal, l.isMin && { color: Colors.teal }]}>{inr(l.value)}</Text>
              </View>
            ))}
            {c.regime === 'new' && <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>HRA is exempt only under the old regime; your take-home is shown on the new regime, where all of it is taxable.</Text>}
          </Card>

          <SectionLabel>RESTRUCTURING IDEAS · EACH ESTIMATED ON ITS OWN</SectionLabel>
          {list.length === 0 ? (
            <Card><Text style={Typography.body}>Nothing obvious to change in this structure.</Text></Card>
          ) : list.map(t => (
            <Card key={t.id} accent={t.id === 'regime' || t.id === 'stay' ? Colors.purple : undefined}>
              <View style={s.tipHead}>
                <Text style={[s.tipTitle, { flex: 1 }]}>{`${t.icon} ${t.title}`}</Text>
                <Text style={s.tipSave}>{`~${inr(t.saving)}/yr`}</Text>
              </View>
              <Text style={[Typography.caption, { color: Colors.textMuted, lineHeight: 18 }]}>{t.action}</Text>
            </Card>
          ))}
          <Card>
            <Text style={Typography.caption}>These savings are rough estimates (about 30% slab plus cess) to start a conversation with HR, not tax advice. They are deliberately not added together: several overlap, and some only apply under the old regime.</Text>
          </Card>
        </>
      )}

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>Gross = basic + HRA + LTA + special allowance. Old regime: minus HRA exemption, ₹50,000 standard deduction, ₹2,400 professional tax, your PF (80C, up to ₹1.5L) and employer NPS (80CCD(2), up to 10% of basic). New regime: minus ₹75,000 and employer NPS.</Bullet>
        <Bullet>Tax uses the FY 2025-26 slabs with the section 87A rebate (nil to ₹12L in the new regime, with marginal relief) and 4% cess. Surcharge above ₹50L is not modelled.</Bullet>
        <Bullet>Take-home = gross − your PF − professional tax − tax in the regime you chose. Employer PF, gratuity, bonuses, variable pay, other deductions and TDS timing are not included.</Bullet>
        <Bullet>Unlike the website, opening this screen never changes your monthly income. Tap the button above to use take-home as the income your Budget runs on.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={s.stat}>
      <Text style={[Typography.label, { fontSize: 9 }]}>{label}</Text>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', color: PURPLE_INK, marginVertical: 4 },
  pills: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  pill: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm, alignItems: 'center' },
  pillVal: { fontSize: 16, fontWeight: '900', color: Colors.textMuted, marginTop: 2 },
  better: { fontSize: 9, fontWeight: '900', color: Colors.teal, marginTop: 2 },
  apply: { marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.cyan, borderRadius: 12, padding: Spacing.md, minHeight: 44 },
  applyTxt: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  applySub: { ...Typography.caption, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm, backgroundColor: Colors.surface },
  statVal: { fontSize: 18, fontWeight: '900', marginVertical: 2 },
  big: { fontSize: 28, fontWeight: '900', color: Colors.teal },
  leg: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm, marginTop: Spacing.sm },
  legTxt: { flex: 1, fontSize: 12, color: Colors.textPrimary },
  legVal: { fontSize: 14, fontWeight: '900', color: Colors.textMuted },
  tipHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: 6 },
  tipTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  tipSave: { fontSize: 14, fontWeight: '900', color: Colors.teal },
});
