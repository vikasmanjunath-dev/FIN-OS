import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Stat, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { addYears, buildHolding, summarize, calcPhysicalValue, calcSGBAnnualCoupon, calcSGBCurrentValue, type GoldType, type Holding } from '@/lib/gold';
import { addHolding, loadGold, removeHolding, setPrice } from '@/lib/goldStorage';

const TYPES: { id: GoldType; label: string }[] = [
  { id: 'physical', label: '🪙 Physical' }, { id: 'sgb', label: '📜 SGB' }, { id: 'etf', label: '📈 Gold ETF' }, { id: 'goldmf', label: '💰 Gold MF' },
];
const LABEL: Record<GoldType, string> = { physical: 'Physical gold', sgb: 'Sovereign Gold Bond', etf: 'Gold ETF', goldmf: 'Gold mutual fund' };

export default function GoldScreen() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [price, setPriceState] = useState(0);
  const [priceText, setPriceText] = useState('');
  const [type, setType] = useState<GoldType>('physical');
  const [f, setF] = useState({ name: '', grams: '', units: '', faceValue: '', nav: '', value: '', invested: '', issueDate: '', purchaseDate: '' });
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { loadGold().then(g => { setHoldings(g.holdings); setPriceState(g.price); setPriceText(g.price ? String(g.price) : ''); }); }, []));
  const sum = useMemo(() => summarize(holdings, price), [holdings, price]);
  const up = (p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p }));
  const n = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;

  const onPrice = (v: string) => {
    setPriceText(v);
    const x = n(v);
    if (x > 0) { setPriceState(x); setPrice(x).catch(() => {}); }
  };
  const add = async () => {
    const r = buildHolding({ type, name: f.name, grams: n(f.grams), units: n(f.units), faceValue: n(f.faceValue), nav: n(f.nav), currentValue: n(f.value), invested: n(f.invested), issueDate: f.issueDate.trim(), purchaseDate: f.purchaseDate.trim() },
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    if (!r.ok) return setError(r.error);
    setError(null);
    setHoldings(await addHolding(r.holding));
    setF({ name: '', grams: '', units: '', faceValue: '', nav: '', value: '', invested: '', issueDate: '', purchaseDate: '' });
  };
  const remove = (h: Holding) => {
    const go = async () => setHoldings(await removeHolding(h.id));
    const what = h.name || h.series || h.fundName || LABEL[h.type];
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${what}?`)) go(); return; }
    Alert.alert('Remove holding', `Remove ${what}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  return (
    <TrackerScreen title="Gold" subtitle="Physical gold, Sovereign Gold Bonds, gold ETFs and gold funds, valued at today's price.">
      <Card>
        <Text style={Typography.label}>TODAY'S GOLD PRICE (₹ PER GRAM)</Text>
        <View style={s.priceRow}>
          <Text style={s.prefix}>₹</Text>
          <TextInput value={priceText} onChangeText={onPrice} keyboardType="decimal-pad" placeholder="e.g. 9500" placeholderTextColor={Colors.textDim} style={s.priceInput} accessibilityLabel="Gold price per gram" />
          <Text style={s.prefix}>/gm</Text>
        </View>
        <Text style={[Typography.caption, { marginTop: 4 }]}>Used to value physical gold and SGBs. FIN-OS does not assume a price: type today's rate from your jeweller or MCX.</Text>
      </Card>

      <Card accent={Colors.gold}>
        <Text style={Typography.label}>TOTAL GOLD VALUE</Text>
        <Text style={s.hero}>{inr(sum.total)}</Text>
        {sum.needsPrice && <Text style={s.warn} accessibilityRole="alert">Enter today's price above. Physical gold and SGBs are not valued until you do, and this total leaves them out.</Text>}
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          {sum.physical > 0 && <Stat label="Physical" value={inrShort(sum.physical)} color={Colors.gold} />}
          {sum.sgb > 0 && <Stat label="SGB" value={inrShort(sum.sgb)} color={Colors.teal} />}
          {sum.etf > 0 && <Stat label="Gold ETF" value={inrShort(sum.etf)} color={Colors.cyan} />}
          {sum.mf > 0 && <Stat label="Gold MF" value={inrShort(sum.mf)} color={Colors.purple} />}
        </View>
        {sum.annualCoupon > 0 && <Text style={[Typography.caption, { marginTop: 6 }]}>{`SGB coupon: about ${inr(sum.annualCoupon)} a year (2.5% on the issue price, taxable as interest).`}</Text>}
      </Card>

      {holdings.map(h => {
        const val = h.type === 'physical' ? calcPhysicalValue(h.grams || 0, price) : h.type === 'sgb' ? calcSGBCurrentValue(h.units || 0, price)
          : h.type === 'etf' ? Math.round((h.units || 0) * (h.nav || 0)) : h.currentValue || 0;
        const needs = (h.type === 'physical' || h.type === 'sgb') && !price;
        const maturity = h.type === 'sgb' ? addYears(h.issueDate, 8) : null;
        return (
          <Card key={h.id}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={Typography.label}>{LABEL[h.type].toUpperCase()}</Text>
                <Text style={s.name}>{h.name || h.series || h.fundName || LABEL[h.type]}</Text>
                <Text style={Typography.caption}>
                  {h.type === 'physical' ? `${h.grams} g` : h.type === 'sgb' ? `${h.units} units · issue ₹${(h.faceValue || 0).toLocaleString('en-IN')}/gm · coupon ${inr(calcSGBAnnualCoupon(h.units || 0, h.faceValue || 0))}/yr${maturity ? ` · matures about ${maturity}` : ''}`
                    : h.type === 'etf' ? `${h.units} units × ₹${h.nav}` : 'Value as entered'}
                </Text>
              </View>
              <Text style={[s.val, needs && { color: Colors.textMuted, fontSize: 12 }]}>{needs ? 'Enter price' : inr(val)}</Text>
              <TouchableOpacity onPress={() => remove(h)} accessibilityRole="button" accessibilityLabel={`Remove ${h.name || h.series || h.fundName || LABEL[h.type]}`} hitSlop={10}><Text style={s.del}>✕</Text></TouchableOpacity>
            </View>
          </Card>
        );
      })}

      <SectionLabel>ADD A HOLDING</SectionLabel>
      <Card>
        <View style={s.chips}>
          {TYPES.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setType(t.id)} style={[s.chip, type === t.id && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: type === t.id }}>
              <Text style={[s.chipTxt, type === t.id && { color: Colors.textPrimary }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label={type === 'sgb' ? 'SERIES / TRANCHE' : type === 'goldmf' ? 'FUND NAME' : type === 'etf' ? 'ETF NAME' : 'DESCRIPTION (OPTIONAL)'} value={f.name} onChange={v => up({ name: v })} />
        {type === 'physical' && <Field label="WEIGHT (GRAMS)" value={f.grams} onChange={v => up({ grams: v })} numeric />}
        {(type === 'sgb' || type === 'etf') && <Field label={type === 'sgb' ? 'UNITS (GRAMS)' : 'UNITS HELD'} value={f.units} onChange={v => up({ units: v })} numeric />}
        {type === 'sgb' && <Field label="ISSUE PRICE (₹/GM)" value={f.faceValue} onChange={v => up({ faceValue: v })} numeric />}
        {type === 'etf' && <Field label="CURRENT NAV (₹)" value={f.nav} onChange={v => up({ nav: v })} numeric />}
        {type === 'goldmf' && <Field label="CURRENT VALUE (₹)" value={f.value} onChange={v => up({ value: v })} numeric />}
        {type === 'sgb' && <Field label="ORIGINAL ISSUE DATE (YYYY-MM-DD)" value={f.issueDate} onChange={v => up({ issueDate: v })} />}
        {type === 'sgb' && <Field label="YOUR PURCHASE DATE (YYYY-MM-DD)" value={f.purchaseDate} onChange={v => up({ purchaseDate: v })} />}
        {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
        <TouchableOpacity style={s.btn} onPress={add} accessibilityRole="button"><Text style={s.btnTxt}>Add</Text></TouchableOpacity>
      </Card>

      <Text style={[Typography.caption, { marginHorizontal: Spacing.md, marginBottom: Spacing.xl, lineHeight: 17 }]}>
        SGB: 2.5% a year coupon on the issue price, 8-year tenure; the redemption gain is exempt only in eligible cases, so check the conditions. Physical gold held more than 2 years: LTCG generally 12.5% without indexation (transfers after 23 July 2024). This is information, not tax advice.
      </Text>
    </TrackerScreen>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={{ marginTop: Spacing.sm }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.input} accessibilityLabel={label} placeholderTextColor={Colors.textDim} autoCapitalize="none" />
    </View>
  );
}

const s = StyleSheet.create({
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10 },
  prefix: { color: Colors.textMuted },
  priceInput: { minHeight: 44, flex: 1, minWidth: 0, color: Colors.textPrimary, fontSize: 18, fontWeight: '800', paddingVertical: 10, paddingHorizontal: 6 },
  hero: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  warn: { color: Colors.gold, fontSize: 12, lineHeight: 17, marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginVertical: 2 },
  val: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  del: { color: Colors.textMuted, fontSize: 16, padding: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: 'rgba(240,165,0,0.15)', borderColor: Colors.gold },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  lbl: { ...Typography.label, marginBottom: 4 },
  input: { minHeight: 44, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15 },
  err: { color: Colors.red, fontSize: 12, marginTop: Spacing.sm },
  btn: { minHeight: 44, justifyContent: 'center', marginTop: Spacing.md, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
});
