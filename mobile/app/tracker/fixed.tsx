import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Stat, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { INSTRUMENTS, buildEntry, calcEntry, safeTotals, upcomingMaturities, type FDEntry, type InstrumentId } from '@/lib/fixedIncome';
import { addFD, loadFD, removeFD } from '@/lib/fixedIncomeStorage';

const TYPES = Object.keys(INSTRUMENTS) as InstrumentId[];
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const FIXED_TERM = ['ppf', 'nsc', 'scss', 'sukanya'];

export default function FixedIncomeScreen() {
  const [list, setList] = useState<FDEntry[]>([]);
  const [type, setType] = useState<InstrumentId>('fd');
  const [label, setLabel] = useState('');
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [start, setStart] = useState(today());
  const [term, setTerm] = useState('12');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { loadFD().then(setList); }, []));
  const now = new Date();
  const t = useMemo(() => safeTotals(list, new Date()), [list]);
  const upcoming = useMemo(() => upcomingMaturities(list, new Date(), 24), [list]);
  const inst = INSTRUMENTS[type];
  const needsTerm = !FIXED_TERM.includes(type);
  const amountLabel = type === 'rd' ? 'MONTHLY DEPOSIT' : type === 'ppf' ? 'YEARLY DEPOSIT' : 'AMOUNT INVESTED';

  const add = async () => {
    const res = buildEntry({ type, label, bank, amount: parseFloat(amount.replace(/,/g, '')) || 0, rate: parseFloat(rate) || 0, startDate: start.trim(), termMonths: parseInt(term, 10) || 0, nominee: '' });
    if (!res.ok) return setError(res.error);
    setError(null);
    setList(await addFD(res.entry));
    setLabel(''); setBank(''); setAmount(''); setRate('');
  };
  const remove = (e: FDEntry) => {
    const go = async () => setList(await removeFD(e.id));
    const what = e.label || INSTRUMENTS[e.type]?.label || 'this investment';
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${what}?`)) go(); return; }
    Alert.alert('Remove investment', `Remove ${what} from your tracker?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  return (
    <TrackerScreen title="Deposits & fixed income" subtitle="FD, RD, NSC, SCSS, Sukanya, PPF, government bonds and post office deposits: what each is worth today and when it matures.">
      <Card accent={Colors.purple}>
        <Text style={Typography.label}>CURRENT VALUE</Text>
        <Text style={s.hero}>{inr(t.currentValue)}</Text>
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          <Stat label="Invested" value={inrShort(t.principal)} color={Colors.cyan} />
          <Stat label="Interest earned" value={inrShort(t.interest)} color={Colors.teal} />
          <Stat label="Yield so far" value={`${t.yld.toFixed(1)}%`} color={Colors.gold} />
        </View>
        {list.length === 0 && <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Nothing added yet. Add a deposit below and it is worked out from the rate and the dates.</Text>}
      </Card>

      {list.map(e => {
        const def = INSTRUMENTS[e.type];
        const m = calcEntry(e, now);
        return (
          <Card key={e.id}>
            <View style={s.head}>
              <Text style={s.icon}>{def?.icon || '💰'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{e.label || def?.label || e.type}</Text>
                <Text style={Typography.caption}>{(e.bank ? e.bank + ' · ' : '') + `${e.rate || def?.rate || '—'}% a year · matures ${fmtDate(m.maturityDate)}`}</Text>
              </View>
              <TouchableOpacity onPress={() => remove(e)} accessibilityRole="button" accessibilityLabel={`Remove ${e.label || def?.label}`} hitSlop={10}><Text style={s.del}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
              <Stat label="Value today" value={inrShort(m.currentValue)} color={Colors.textPrimary} />
              <Stat label="At maturity" value={inrShort(m.maturityValue)} color={Colors.teal} />
              <Stat label={e.type === 'scss' ? 'Income paid' : 'Interest'} value={inrShort(m.interestEarned)} color={Colors.gold} />
            </View>
            {e.type === 'scss' && m.quarterlyIncome ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Pays about ${inr(m.quarterlyIncome)} every quarter; it is paid out, not compounded.`}</Text> : null}
          </Card>
        );
      })}

      {upcoming.length > 0 && (
        <>
          <SectionLabel>MATURING IN THE NEXT 24 MONTHS</SectionLabel>
          <Card>
            {upcoming.map(({ entry, result }) => {
              const days = Math.ceil((result.maturityDate.getTime() - now.getTime()) / 86400000);
              const color = days <= 0 ? Colors.red : days <= 30 ? Colors.gold : days <= 90 ? Colors.cyan : Colors.teal;
              return (
                <View key={entry.id} style={s.matRow}>
                  <Text style={{ flex: 1, color: Colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{entry.label || INSTRUMENTS[entry.type]?.label}</Text>
                  <Text style={{ color: Colors.textPrimary, fontWeight: '800', marginRight: Spacing.sm }}>{inrShort(result.maturityValue)}</Text>
                  <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{days <= 0 ? 'MATURED' : `${days} days`}</Text>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionLabel>ADD AN INVESTMENT</SectionLabel>
      <Card>
        <Text style={s.lbl}>KIND</Text>
        <View style={s.chips}>
          {TYPES.map(id => (
            <TouchableOpacity key={id} onPress={() => setType(id)} style={[s.chip, type === id && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: type === id }}>
              <Text style={[s.chipTxt, type === id && s.chipTxtOn]}>{INSTRUMENTS[id].icon} {INSTRUMENTS[id].label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label="NAME (OPTIONAL)" value={label} onChange={setLabel} placeholder={inst.label} />
        <Field label="BANK OR POST OFFICE (OPTIONAL)" value={bank} onChange={setBank} placeholder="HDFC Bank" />
        <Field label={amountLabel} value={amount} onChange={setAmount} placeholder="100000" numeric prefix="₹" />
        <Field label="INTEREST RATE (% A YEAR)" value={rate} onChange={setRate} placeholder={inst.rate ? `${inst.rate} (the usual rate)` : '7.1'} numeric />
        <Field label="START DATE (YYYY-MM-DD)" value={start} onChange={setStart} placeholder="2025-04-01" />
        {needsTerm && <Field label="TERM (MONTHS)" value={term} onChange={setTerm} placeholder="12" numeric />}
        {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
        <TouchableOpacity style={s.btn} onPress={add} accessibilityRole="button"><Text style={s.btnTxt}>Add</Text></TouchableOpacity>
      </Card>

      <Text style={[Typography.caption, { marginHorizontal: Spacing.md, marginBottom: Spacing.xl, lineHeight: 17 }]}>
        Values are worked out from the rate and dates you enter, with the compounding each product normally uses. The real balance can differ slightly: check your passbook or statement. PPF, NSC and the other small-savings rates are revised every quarter.
      </Text>
    </TrackerScreen>
  );
}

function Field({ label, value, onChange, placeholder, numeric, prefix }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; prefix?: string }) {
  return (
    <View style={{ marginTop: Spacing.sm }}>
      <Text style={s.lbl}>{label}</Text>
      <View style={s.inputRow}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textDim} keyboardType={numeric ? 'decimal-pad' : 'default'}
          style={s.input} accessibilityLabel={label} autoCapitalize="none" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  icon: { fontSize: 22 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  del: { color: Colors.textMuted, fontSize: 16, padding: 4 },
  matRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  lbl: { ...Typography.label, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radii.md ?? 10, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: 'rgba(0,212,255,0.15)', borderColor: Colors.cyan },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTxtOn: { color: Colors.textPrimary },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10 },
  prefix: { color: Colors.textMuted, marginRight: 4 },
  input: { flex: 1, color: Colors.textPrimary, paddingVertical: 10, fontSize: 15 },
  err: { color: Colors.red, fontSize: 12, marginTop: Spacing.sm },
  btn: { marginTop: Spacing.md, backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
});
