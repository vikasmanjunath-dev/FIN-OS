import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Stat, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Typography, Btn } from '@/constants/theme';
import { COINS, buildHolding, summarize, type CryptoHolding, type Prices } from '@/lib/crypto';
import { addHolding, loadCrypto, removeHolding, setPrice } from '@/lib/cryptoStorage';

export default function CryptoScreen() {
  const [holdings, setHoldings] = useState<CryptoHolding[]>([]);
  const [prices, setPrices] = useState<Prices>({});
  const [priceText, setPriceText] = useState<Record<string, string>>({});
  const [coin, setCoin] = useState('BTC');
  const [custom, setCustom] = useState('');
  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState('');
  const [cur, setCur] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = (r: { holdings: CryptoHolding[]; prices: Prices }) => { setHoldings(r.holdings); setPrices(r.prices); };
  useFocusEffect(useCallback(() => { loadCrypto().then(r => { apply(r); setPriceText(Object.fromEntries(Object.entries(r.prices).map(([k, v]) => [k, String(v)]))); }); }, []));
  const sum = useMemo(() => summarize(holdings, prices), [holdings, prices]);
  const n = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;
  const symbols = [...new Set(holdings.map(h => h.symbol))];

  const onPrice = (sym: string, v: string) => {
    setPriceText(p => ({ ...p, [sym]: v }));
    const x = n(v);
    if (x > 0) setPrice(sym, x).then(apply).catch(() => {});
  };
  const add = async () => {
    const symbol = coin === 'OTHER' ? custom : coin;
    const r = buildHolding({ symbol, quantity: n(qty), avgBuyPrice: n(avg) }, Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    if (!r.ok) return setError(r.error);
    setError(null);
    const out = await addHolding(r.holding, n(cur) > 0 ? n(cur) : undefined);
    apply(out);
    if (n(cur) > 0) setPriceText(p => ({ ...p, [r.holding.symbol]: String(n(cur)) }));
    setQty(''); setAvg(''); setCur(''); setCustom('');
  };
  const remove = (h: CryptoHolding) => {
    const go = async () => apply(await removeHolding(h.id));
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${h.symbol}?`)) go(); return; }
    Alert.alert('Remove holding', `Remove ${h.symbol} from your tracker?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  return (
    <TrackerScreen title="Crypto" subtitle="Holdings, profit and loss, and what India's 30% crypto tax would take if you sold today.">
      <Card accent={Colors.orange}>
        <Text style={Typography.label}>PORTFOLIO VALUE</Text>
        <Text style={s.hero}>{inr(sum.totalValue)}</Text>
        {sum.unpriced.length > 0 && <Text style={s.warn} accessibilityRole="alert">{`Enter a current price for ${sum.unpriced.join(', ')} below. Coins without a price are left out of the value and the gain, not counted as a loss.`}</Text>}
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          <Stat label="Invested" value={inrShort(sum.totalCost)} color={Colors.cyan} />
          <Stat label="Unrealised P&L" value={`${sum.totalGain >= 0 ? '+' : '-'}${inrShort(Math.abs(sum.totalGain))}`} color={sum.totalGain >= 0 ? Colors.teal : Colors.red} />
          <Stat label="Tax if sold" value={inrShort(sum.tax)} color={Colors.gold} />
        </View>
        <Text style={[Typography.caption, { marginTop: 6 }]}>{`Tax is 30% + 4% cess (31.2%) on each coin's gain only. A loss in one coin does not reduce the tax on another, and cannot be carried forward. If sold today the exchange would also deduct 1% TDS of ${inr(sum.tds)}, which counts toward the tax.`}</Text>
      </Card>

      {symbols.length > 0 && (
        <>
          <SectionLabel>CURRENT PRICES (₹ PER COIN)</SectionLabel>
          <Card>
            {symbols.map(sym => (
              <View key={sym} style={s.priceRow}>
                <Text style={s.sym}>{sym}</Text>
                <TextInput value={priceText[sym] ?? ''} onChangeText={v => onPrice(sym, v)} keyboardType="decimal-pad" placeholder="price in ₹" placeholderTextColor={Colors.textDim} style={s.input} accessibilityLabel={`Current price of ${sym}`} />
              </View>
            ))}
          </Card>
        </>
      )}

      {sum.rows.map(r => (
        <Card key={r.id}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{r.symbol} <Text style={Typography.caption}>{r.name && r.name !== r.symbol ? r.name : ''}</Text></Text>
              <Text style={Typography.caption}>{`${r.quantity} coins · avg ₹${(r.avgBuyPrice || 0).toLocaleString('en-IN')}`}</Text>
              {r.priced
                ? <Text style={[s.gain, { color: r.gain >= 0 ? Colors.teal : Colors.red }]}>{`${r.gain >= 0 ? '+' : '-'}${inr(Math.abs(r.gain))} (${r.gainPct >= 0 ? '+' : ''}${r.gainPct.toFixed(1)}%)`}</Text>
                : <Text style={s.gain}>Add a price above</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.val}>{r.priced ? inr(r.val) : '—'}</Text>
              {r.tax > 0 && <Text style={Typography.caption}>{`Tax ${inr(r.tax)}`}</Text>}
              {r.tds > 0 && <Text style={Typography.caption}>{`1% TDS if sold: ${inr(r.tds)}`}</Text>}
            </View>
            <TouchableOpacity onPress={() => remove(r)} accessibilityRole="button" accessibilityLabel={`Remove ${r.symbol}`} hitSlop={10}><Text style={s.del}>✕</Text></TouchableOpacity>
          </View>
        </Card>
      ))}

      <SectionLabel>ADD A HOLDING</SectionLabel>
      <Card>
        <Text style={s.lbl}>COIN</Text>
        <View style={s.chips}>
          {[...COINS.slice(0, 8).map(c => c.symbol), 'OTHER'].map(sym => (
            <TouchableOpacity key={sym} onPress={() => setCoin(sym)} style={[s.chip, coin === sym && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: coin === sym }}>
              <Text style={[s.chipTxt, coin === sym && { color: Colors.textPrimary }]}>{sym}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {coin === 'OTHER' && <Field label="SYMBOL" value={custom} onChange={setCustom} />}
        <Field label="QUANTITY HELD" value={qty} onChange={setQty} numeric />
        <Field label="AVERAGE BUY PRICE (₹)" value={avg} onChange={setAvg} numeric />
        <Field label="CURRENT PRICE (₹, OPTIONAL)" value={cur} onChange={setCur} numeric />
        {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
        <TouchableOpacity style={s.btn} onPress={add} accessibilityRole="button"><Text style={s.btnTxt}>Add</Text></TouchableOpacity>
      </Card>

      <Text style={[Typography.caption, { marginHorizontal: Spacing.md, marginBottom: Spacing.xl, lineHeight: 17 }]}>
        Prices are the ones you enter; FIN-OS does not fetch them. Tax rules (Finance Act 2022 onward): 30% plus cess on gains from virtual digital assets, no deduction except the cost of acquisition, 1% TDS on transfers above the threshold, losses neither set off nor carried forward. This is information, not tax advice.
      </Text>
    </TrackerScreen>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={{ marginTop: Spacing.sm }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.inputBox} accessibilityLabel={label} placeholderTextColor={Colors.textDim} autoCapitalize="characters" />
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  warn: { color: Colors.gold, fontSize: 12, lineHeight: 17, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 8 },
  sym: { width: 56, fontWeight: '900', color: Colors.textPrimary },
  input: { minHeight: 44, flex: 1, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  gain: { fontSize: 12, fontWeight: '800', marginTop: 2, color: Colors.textMuted },
  val: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  del: { color: Colors.textMuted, fontSize: 16, padding: 4 },
  lbl: { ...Typography.label, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: 'rgba(255,107,53,0.15)', borderColor: Colors.orange },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '800' },
  inputBox: { minHeight: 44, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15 },
  err: { color: Colors.red, fontSize: 12, marginTop: Spacing.sm },
  btn: { ...Btn.base, backgroundColor: Colors.orange, marginTop: Spacing.md },
  btnTxt: { ...Btn.text, color: '#000' },
});
