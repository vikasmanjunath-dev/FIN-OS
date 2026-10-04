import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { INSTRUMENTS, SmallSavingsType, SavingsAccount, accountProjection, validDate, isoDay } from '@/lib/retirement';
import { TrackerScreen, Card, SectionLabel, Stat, MoneyField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const TYPES = Object.keys(INSTRUMENTS) as SmallSavingsType[];

export default function PpfScreen() {
  const { data, computed, save } = useTrackers();
  const accounts = data.ppfAccounts;
  const t = computed.retirement.savings;

  const [type, setType] = useState<SmallSavingsType>('PPF');
  const [nick, setNick] = useState('');
  const [bal, setBal] = useState('');
  const [dep, setDep] = useState('');
  const [open, setOpen] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inst = INSTRUMENTS[type];

  const add = () => {
    const b = parseFloat(bal.replace(/,/g, '')) || 0, d = parseFloat(dep.replace(/,/g, '')) || 0;
    if (!b && !d) return setError('Enter at least a balance or an annual deposit.');
    if (b < 0 || d < 0) return setError('Amounts cannot be negative.');
    if (inst.maxAmt && d > inst.maxAmt) return setError(`${type} allows at most ₹${inst.maxAmt.toLocaleString('en-IN')} a year.`);
    if (!validDate(open, { optional: true })) return setError('Opening date should be a real past date like 2019-04-01 (or leave it blank).');
    setError(null);
    const id = Math.max(Date.now(), ...accounts.map(a => Number(a.id) || 0).filter(Number.isFinite)) + 1; // numeric, like the website
    save({ ppfAccounts: [...accounts, { id, type, nickname: nick.trim().slice(0, 40), currentBalance: b, annualDeposit: d, openDate: open.trim() }] });
    setNick(''); setBal(''); setDep(''); setOpen('');
  };

  const update = (id: SavingsAccount['id'], patch: Partial<SavingsAccount>) =>
    save({ ppfAccounts: accounts.map(a => (a.id === id ? { ...a, ...patch } : a)) });

  const remove = (a: SavingsAccount) => {
    const go = () => save({ ppfAccounts: accounts.filter(x => x.id !== a.id) });
    const what = a.nickname || INSTRUMENTS[a.type].name;
    if (Platform.OS === 'web') { if (window.confirm(`Delete ${what}?`)) go(); return; }
    Alert.alert('Delete account', `Delete ${what}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const now = new Date();
  const projected = accounts.reduce((sum, a) => sum + accountProjection(a, now).projected, 0);

  return (
    <TrackerScreen title="PPF & small savings" subtitle="PPF, Sukanya, NSC, Senior Citizens and Kisan Vikas Patra: balances, maturity projections and your 80C deposits.">
      <Card accent={Colors.cyan}>
        <Text style={Typography.label}>TOTAL SMALL SAVINGS</Text>
        <Text style={s.hero}>{inr(t.total)}</Text>
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          <Stat label="80C eligible / yr" value={inr(Math.min(t.c80c, 150000))} color={Colors.teal} />
          <Stat label="Deposits / yr" value={inrShort(t.annualDeposits)} color={Colors.gold} />
          <Stat label="At maturity" value={accounts.length ? inrShort(projected) : '—'} color={Colors.cyan} />
        </View>
        {t.c80c > 150000 && <Text style={s.warn}>Your deposits add up to more than the ₹1.5L 80C limit — the extra earns interest but no tax deduction.</Text>}
      </Card>

      {accounts.map(a => {
        const meta = INSTRUMENTS[a.type];
        const p = accountProjection(a, now);
        return (
          <Card key={String(a.id)} accent={meta.color}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{a.nickname || meta.name}</Text>
                <Text style={Typography.caption}>{a.type} · {meta.rate}% · {meta.taxFree ? 'tax-free' : 'interest is taxable'} · matures {p.maturityYear}</Text>
              </View>
              <Text style={[s.proj, { color: meta.color }]}>{inrShort(p.projected)}</Text>
            </View>
            <Text style={[Typography.caption, { marginBottom: 2 }]}>{p.yearsLeft} year{p.yearsLeft === 1 ? '' : 's'} left · projected gain {inrShort(p.gain)}</Text>
            <MoneyField label="Current balance" value={a.currentBalance} onCommit={v => update(a.id, { currentBalance: v })} />
            <MoneyField label="Deposit each year" sub={meta.maxAmt ? `Max ₹${meta.maxAmt.toLocaleString('en-IN')}` : undefined} value={a.annualDeposit} onCommit={v => update(a.id, { annualDeposit: meta.maxAmt ? Math.min(v, meta.maxAmt) : v })} />
            <TouchableOpacity onPress={() => remove(a)} style={{ paddingTop: Spacing.sm }}><Text style={s.del}>Delete account</Text></TouchableOpacity>
          </Card>
        );
      })}

      <SectionLabel>ADD AN ACCOUNT</SectionLabel>
      <Card>
        <View style={s.chips}>
          {TYPES.map(k => (
            <TouchableOpacity key={k} style={[s.chip, type === k && { borderColor: INSTRUMENTS[k].color + 'BB', backgroundColor: INSTRUMENTS[k].color + '22' }]} onPress={() => setType(k)} accessibilityRole="button" accessibilityState={{ selected: type === k }}>
              <Text style={[s.chipTxt, type === k && { color: INSTRUMENTS[k].color, fontWeight: '800' }]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[Typography.caption, { marginTop: 8, lineHeight: 17 }]}>
          {inst.name} · {inst.rate}% a year, compounded {inst.compounding} · {inst.maxYrs}-year term · {inst.c80c ? 'counts for 80C' : 'no 80C benefit'}
        </Text>
        <Text style={s.lbl}>NICKNAME (OPTIONAL)</Text>
        <TextInput style={s.input} value={nick} onChangeText={setNick} placeholder="e.g. My PPF at SBI" placeholderTextColor={Colors.textDim} maxLength={40} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>BALANCE (₹)</Text>
            <TextInput style={s.input} value={bal} onChangeText={setBal} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>DEPOSIT / YEAR (₹)</Text>
            <TextInput style={s.input} value={dep} onChangeText={setDep} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
        </View>
        <Text style={s.lbl}>OPENED ON (OPTIONAL)</Text>
        <TextInput style={s.input} value={open} onChangeText={setOpen} placeholder={`YYYY-MM-DD, e.g. ${isoDay(new Date(Date.now() - 5 * 365 * 864e5))}`} placeholderTextColor={Colors.textDim} autoCapitalize="none" />
        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <TouchableOpacity style={s.addBtn} onPress={add} accessibilityRole="button"><Text style={s.addTxt}>Add account</Text></TouchableOpacity>
      </Card>

      <SectionLabel>CURRENT RATES</SectionLabel>
      <Card>
        {TYPES.map(k => (
          <View key={k} style={s.rateRow}>
            <Text style={[s.rateK, { color: INSTRUMENTS[k].color }]}>{k}</Text>
            <Text style={s.rateV}>{INSTRUMENTS[k].rate}%</Text>
            <Text style={[Typography.caption, { width: 92, textAlign: 'right' }]}>{INSTRUMENTS[k].c80c ? '80C' : '—'} {INSTRUMENTS[k].taxFree ? '· EEE' : ''}</Text>
          </View>
        ))}
        <Text style={[Typography.caption, { marginTop: 8, lineHeight: 16 }]}>Government rates are reset every quarter — these are the website's current figures.</Text>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1, marginTop: 4 },
  warn: { color: Colors.gold, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  name: { ...Typography.body, fontWeight: '700' },
  proj: { fontSize: 16, fontWeight: '900', marginLeft: Spacing.sm },
  del: { color: Colors.red, fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.bg },
  chipTxt: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  addBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md },
  addTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  rateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rateK: { width: 52, fontWeight: '800', fontSize: 13 },
  rateV: { flex: 1, color: Colors.textPrimary, fontWeight: '700', fontSize: 13 },
});
