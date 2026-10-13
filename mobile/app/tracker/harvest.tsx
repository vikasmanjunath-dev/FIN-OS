import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { analyse, lossWorth, parseNewPosition, taxYearStart, LTCG_EXEMPT, type Position } from '@/lib/taxHarvest';
import { loadHarvest, saveHarvest } from '@/lib/taxHarvestStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function TaxHarvestScreen() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [ltcgText, setLtcgText] = useState('');
  const [stcgText, setStcgText] = useState('');
  const [form, setForm] = useState({ name: '', qty: '', buy: '', cmp: '', date: '' });
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    loadHarvest().then(h => { setPositions(h.positions); setLtcgText(h.ltcg ? String(h.ltcg) : ''); setStcgText(h.stcg ? String(h.stcg) : ''); });
  }, []));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const ltcg = Math.max(0, toNum(ltcgText)), stcg = Math.max(0, toNum(stcgText));
  const a = useMemo(() => (positions ? analyse(positions, ltcg, stcg) : null), [positions, ltcg, stcg]);

  const persist = (p: Position[], l: number, s: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveHarvest(p, l, s).catch(() => {}); }, 400);
  };

  if (!positions || !a) return <TrackerScreen title="Tax harvesting" subtitle="Use losses to cut tax on gains."><Card><Text style={Typography.body}>Reading your holdings…</Text></Card></TrackerScreen>;

  const setL = (v: string) => { setLtcgText(v); persist(positions, Math.max(0, toNum(v)), stcg); };
  const setS = (v: string) => { setStcgText(v); persist(positions, ltcg, Math.max(0, toNum(v))); };
  const add = () => {
    const r = parseNewPosition(form);
    if ('error' in r) { setError(r.error); return; }
    setError('');
    const next = [...positions, r.position];
    setPositions(next);
    setForm({ name: '', qty: '', buy: '', cmp: '', date: '' });
    persist(next, ltcg, stcg);
  };
  const remove = (p: Position) => {
    const go = () => { const next = positions.filter(x => x.id !== p.id); setPositions(next); persist(next, ltcg, stcg); };
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${p.name}?`)) go(); return; }
    Alert.alert('Remove holding', `Remove ${p.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const y = taxYearStart();
  const yearLabel = `${y}-${String(y + 1).slice(-2)}`;
  const color = a.taxSaved > 0 ? Colors.teal : Colors.cyan;

  return (
    <TrackerScreen title="Tax harvesting" subtitle={`Book losses to cut tax on gains, and use the ₹1.25 L long-term exemption before the year ends (tax year ${yearLabel}). For listed equity and equity funds.`}>
      <Card accent={color}>
        <Text style={Typography.label}>ESTIMATED TAX SAVED BY BOOKING LOSSES</Text>
        <Text style={[s.hero, { color }]}>{inr(a.taxSaved)}</Text>
        <Text style={Typography.body}>
          {positions.length === 0 ? 'Add the holdings you own below to see what selling could do.'
            : ltcg === 0 && stcg === 0 ? 'Enter the gains you have already booked this year to see the saving.'
            : a.taxSaved > 0 ? 'Based on the gains you have booked and the losses on your holdings, with 4% cess.' : 'Your losses would not reduce tax with the gains entered.'}
        </Text>
        <View style={s.kpis}>
          <Kpi label="EXEMPTION USED" value={inrShort(Math.min(ltcg, LTCG_EXEMPT))} sub="of ₹1.25 L" />
          <Kpi label="HEADROOM LEFT" value={inrShort(a.headroom)} sub="tax-free LTCG" color={a.headroom > 0 ? Colors.gold : undefined} />
          <Kpi label="LTCG AFTER LOSSES" value={inrShort(a.netLTCG)} sub={`STCG ${inrShort(a.netSTCG)}`} />
        </View>
      </Card>

      <SectionLabel>GAINS ALREADY BOOKED THIS YEAR</SectionLabel>
      <Card>
        <CalcField label="LONG-TERM GAINS (LTCG)" prefix="₹" value={ltcgText} onChange={setL} sub="Held over 12 months, already sold this tax year." />
        <CalcField label="SHORT-TERM GAINS (STCG)" prefix="₹" value={stcgText} onChange={setS} sub="Held 12 months or less, already sold this tax year." />
      </Card>

      {positions.length > 0 && (
        <>
          <SectionLabel>LOSSES YOU COULD BOOK</SectionLabel>
          <Card>
            {a.losses.length === 0 ? <Text style={Typography.body}>None of your holdings is below its cost.</Text> : a.losses.map(p => (
              <View key={p.id} style={s.item}>
                <View style={s.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{p.name}</Text>
                    <Text style={Typography.caption}>{`${p.isLong ? 'Long-term' : 'Short-term'} · ${p.holdMonths} mo · ${p.qty} units`}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.amt, { color: Colors.red }]}>{`−${inr(p.absoluteGain)}`}</Text>
                    <Text style={Typography.caption}>{`${p.gainPct}%`}</Text>
                  </View>
                </View>
                <Text style={[Typography.caption, s.note]}>{`Cuts taxable ${p.isLong ? 'long-term' : 'short-term'} gain by ${inr(p.absoluteGain)}: worth up to ${inr(lossWorth(p))} in tax, and only on gains above the exemption.`}</Text>
              </View>
            ))}
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>Long-term losses offset long-term gains only. Short-term losses offset short-term gains first, then long-term. Unused losses can be carried forward 8 years if the return is filed on time.</Text>
          </Card>

          <SectionLabel>GAINS YOU COULD HARVEST TAX-FREE</SectionLabel>
          <Card>
            {a.headroom <= 0 ? <Text style={Typography.body}>The ₹1.25 L exemption is fully used this year.</Text>
              : a.gainHarvestCandidates.length === 0 ? <Text style={Typography.body}>No long-term gains on your holdings to harvest.</Text>
              : a.gainHarvestCandidates.map(p => (
                <View key={p.id} style={s.item}>
                  <View style={s.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{p.name}</Text>
                      <Text style={Typography.caption}>{`Long-term · ${p.holdMonths} mo · gain ${inr(p.gain)}`}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.amt, { color: Colors.teal }]}>{`+${inr(p.canHarvest)}`}</Text>
                      <Text style={Typography.caption}>harvestable</Text>
                    </View>
                  </View>
                  <Text style={[Typography.caption, s.note]}>{`Selling about ${p.harvestQty} units at ${inr(p.cmp)} uses exemption and raises your cost for a later sale. It does not save tax today.`}</Text>
                </View>
              ))}
            {a.gainHarvestAmount > 0 && <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>{`In total ${inr(a.gainHarvestAmount)} of gain fits inside this year's exemption.`}</Text>}
          </Card>
        </>
      )}

      <SectionLabel>YOUR HOLDINGS</SectionLabel>
      {positions.length === 0 && <Card><Text style={Typography.body}>No holdings yet. Add a real one below: nothing is filled in for you.</Text></Card>}
      {a.enriched.map(p => (
        <Card key={p.id}>
          <View style={s.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{p.name}</Text>
              <Text style={Typography.caption}>{`${p.qty} units · bought at ${inr(p.buyPrice)} · now ${inr(p.cmp)}`}</Text>
              <Text style={Typography.caption}>{`${p.isLong ? 'Long-term' : 'Short-term'} · ${p.holdMonths} months${p.purchaseDate ? ` · since ${p.purchaseDate}` : ''}`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.amt, { color: p.gain >= 0 ? Colors.teal : Colors.red }]}>{`${p.gain >= 0 ? '+' : '−'}${inr(Math.abs(p.gain))}`}</Text>
              <Text style={Typography.caption}>{`${p.gainPct}%`}</Text>
            </View>
            <TouchableOpacity onPress={() => remove(p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`}><Text style={s.del}>✕</Text></TouchableOpacity>
          </View>
        </Card>
      ))}

      <SectionLabel>ADD A HOLDING</SectionLabel>
      <Card>
        <CalcField label="NAME" text value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Stock or fund" maxLength={80} />
        <CalcField label="QUANTITY" value={form.qty} onChange={v => setForm({ ...form, qty: v })} />
        <CalcField label="BUY PRICE PER UNIT" prefix="₹" value={form.buy} onChange={v => setForm({ ...form, buy: v })} />
        <CalcField label="CURRENT PRICE PER UNIT" prefix="₹" value={form.cmp} onChange={v => setForm({ ...form, cmp: v })} sub="Type today's price: it is not fetched." />
        <CalcField label="ACQUISITION DATE" text value={form.date} onChange={v => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" maxLength={10} sub="The date you bought it. It decides long-term or short-term." />
        {error ? <Text style={[Typography.caption, { color: Colors.red, marginBottom: Spacing.sm }]} accessibilityRole="alert">{error}</Text> : null}
        <TouchableOpacity style={s.add} onPress={add} accessibilityRole="button"><Text style={s.addTxt}>＋ Add holding</Text></TouchableOpacity>
      </Card>

      <Collapsible title="Rules used, and what this leaves out">
        <Bullet>Listed equity and equity funds held over 12 months: gains above ₹1.25 L a year are taxed at 12.5%. Held 12 months or less: 20%. Both plus 4% cess.</Bullet>
        <Bullet>Surcharge (up to 15% on these gains), brokerage, STT and a loss carried from earlier years are not included, so the real saving can differ.</Bullet>
        <Bullet>India has no wash-sale rule written into the Income Tax Act, so selling and buying back is not barred by one. Costs apply, and an arrangement made only to avoid tax can be questioned.</Bullet>
        <Bullet>Debt funds bought after April 2023 are taxed at your slab whatever the holding period, so they are not part of this tool.</Bullet>
        <Bullet>Your prices and dates stay on this device. This is a planning estimate, not tax advice: check with a CA before you act.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ flexBasis: '30%', flexGrow: 1 }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.kpiVal, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', marginVertical: 4 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  kpiVal: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  item: { paddingVertical: Spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  amt: { fontSize: 14, fontWeight: '900' },
  note: { marginTop: 6, lineHeight: 17 },
  del: { color: Colors.red, fontSize: 18, padding: 6 },
  add: { borderWidth: 1, borderColor: Colors.teal + '66', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  addTxt: { color: Colors.teal, fontWeight: '800', fontSize: 14 },
});
